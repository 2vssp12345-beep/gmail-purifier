import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // 1. Validate the Supabase JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authorization header missing' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Create a user-context client to validate the JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Service role client for database operations (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Parse request body
    const { rescan } = await req.json().catch(() => ({ rescan: false }));

    // 3. Get Google OAuth token from our stored tokens table
    const { data: tokenRow, error: tokenError } = await supabase
      .from('user_oauth_tokens')
      .select('access_token, refresh_token')
      .eq('user_id', userId)
      .single();

    if (tokenError || !tokenRow?.refresh_token) {
      return new Response(JSON.stringify({ 
        error: 'No Google OAuth token found. Please sign out and sign in again to grant Gmail access.' 
      }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Refresh the Google access token using the stored refresh token
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    let accessToken: string | null = tokenRow.access_token;

    if (googleClientId && googleClientSecret && tokenRow.refresh_token) {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: googleClientId,
          client_secret: googleClientSecret,
          refresh_token: tokenRow.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        accessToken = tokenData.access_token;
        // Update stored access token
        await supabase.from('user_oauth_tokens').update({
          access_token: accessToken,
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);
      }
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ 
        error: 'Failed to obtain Google access token. Please sign in again.' 
      }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. If rescan, delete old scan data
    if (rescan) {
      await supabase.from('email_metadata').delete().eq('user_id', userId);
      await supabase.from('sender_summary').delete().eq('user_id', userId);
      await supabase.from('scan_history').delete().eq('user_id', userId);
    }

    // 6. Create scan record
    const { data: scan, error: scanError } = await supabase
      .from('scan_history')
      .insert({
        user_id: userId,
        status: 'in_progress',
      })
      .select()
      .single();

    if (scanError) {
      return new Response(JSON.stringify({ error: 'Failed to create scan' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const scanId = scan.id;

    // 7. Process in background
    (async () => {
      try {
        let pageToken = '';
        let processedMessages = 0;
        const allMessages: any[] = [];

        // Fetch message list
        do {
          const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500${pageToken ? `&pageToken=${pageToken}` : ''}`;
          const listRes = await fetch(listUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const listData = await listRes.json();

          if (listData.messages) {
            allMessages.push(...listData.messages);
          }
          pageToken = listData.nextPageToken || '';
        } while (pageToken && allMessages.length < 10000);

        // Process messages in batches
        const batchSize = 50;
        const emailRows: any[] = [];

        for (let i = 0; i < allMessages.length; i += batchSize) {
          const batch = allMessages.slice(i, i + batchSize);

          const batchResults = await Promise.all(
            batch.map(async (msg: any) => {
              try {
                const msgRes = await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe`,
                  { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                if (!msgRes.ok) return null;
                return await msgRes.json();
              } catch {
                return null;
              }
            })
          );

          for (const msgData of batchResults) {
            if (!msgData) continue;

            const headers = msgData.payload?.headers || [];
            const fromHeader = headers.find((h: any) => h.name === 'From')?.value || '';
            const subjectHeader = headers.find((h: any) => h.name === 'Subject')?.value || '';
            const unsubHeader = headers.find((h: any) => h.name === 'List-Unsubscribe')?.value || '';

            const emailMatch = fromHeader.match(/<(.+?)>/) || [null, fromHeader];
            const senderEmail = (emailMatch[1] || fromHeader).trim().toLowerCase();

            const isRead = !(msgData.labelIds || []).includes('UNREAD');

            emailRows.push({
              scan_id: scanId,
              user_id: userId,
              message_id: msgData.id,
              sender: senderEmail,
              subject: subjectHeader || null,
              received_at: new Date(parseInt(msgData.internalDate)).toISOString(),
              size_bytes: parseInt(msgData.sizeEstimate) || 0,
              is_read: isRead,
              has_unsubscribe: !!unsubHeader,
              unsubscribe_link: unsubHeader || null,
            });
          }

          processedMessages = Math.min(i + batchSize, allMessages.length);
        }

        // Insert email metadata in batches
        for (let i = 0; i < emailRows.length; i += 500) {
          const batch = emailRows.slice(i, i + 500);
          await supabase.from('email_metadata').insert(batch);
        }

        // Compute sender summaries
        const senderMap = new Map<string, any>();
        emailRows.forEach((e) => {
          const existing = senderMap.get(e.sender);
          if (existing) {
            existing.total_emails++;
            if (!e.is_read) existing.unopened_count++;
            existing.total_size += e.size_bytes;
            if (e.has_unsubscribe) existing.has_unsubscribe = true;
          } else {
            senderMap.set(e.sender, {
              scan_id: scanId,
              user_id: userId,
              sender: e.sender,
              total_emails: 1,
              unopened_count: e.is_read ? 0 : 1,
              total_size: e.size_bytes,
              has_unsubscribe: e.has_unsubscribe,
            });
          }
        });

        const summaryRows = Array.from(senderMap.values()).map((s) => ({
          ...s,
          unopened_pct: s.total_emails > 0
            ? Math.round((s.unopened_count / s.total_emails) * 10000) / 100
            : 0,
        }));

        for (let i = 0; i < summaryRows.length; i += 500) {
          await supabase.from('sender_summary').insert(summaryRows.slice(i, i + 500));
        }

        // Compute stats
        const deletableSenders = summaryRows.filter(s => s.unopened_pct >= 75);
        const deletableMails = deletableSenders.reduce((sum, s) => sum + s.total_emails, 0);
        const recoverableSpace = deletableSenders.reduce((sum, s) => sum + s.total_size, 0);
        const totalSpace = summaryRows.reduce((sum, s) => sum + s.total_size, 0);

        // Update scan as completed
        await supabase.from('scan_history').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          total_emails: emailRows.length,
          total_senders: summaryRows.length,
          space_scanned: totalSpace,
          deletable_senders: deletableSenders.length,
          deletable_emails: deletableMails,
          space_recoverable: recoverableSpace,
        }).eq('id', scanId);

      } catch (err) {
        console.error('Scan error:', err);
        await supabase.from('scan_history').update({
          status: 'failed',
        }).eq('id', scanId);
      }
    })();

    return new Response(JSON.stringify({ scan_id: scanId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
