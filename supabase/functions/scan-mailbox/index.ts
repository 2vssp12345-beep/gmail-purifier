import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')!;
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body - get provider tokens passed from frontend
    const body = await req.json().catch(() => ({}));
    const { rescan = false, provider_token, provider_refresh_token } = body;

    // Use provider_token from frontend session as primary source
    let accessToken: string | null = provider_token || null;
    const refreshToken: string | null = provider_refresh_token || null;

    // If we have a refresh token but no access token, refresh it
    if (!accessToken && refreshToken) {
      const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
      const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

      if (googleClientId && googleClientSecret) {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: googleClientId,
            client_secret: googleClientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
        });
        const tokenData = await tokenRes.json();
        accessToken = tokenData.access_token || null;
      }
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ 
        error: 'Could not obtain Google access token. Please sign out and sign in again to grant Gmail access.' 
      }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify Google identity exists
    const identities = user.identities || [];
    const googleIdentity = identities.find((i: any) => i.provider === 'google');
    if (!googleIdentity) {
      return new Response(JSON.stringify({ error: 'No Google account linked' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If rescan, delete old scan data for this user
    if (rescan) {
      await supabase.from('email_metadata').delete().eq('user_id', user.id);
      await supabase.from('sender_summary').delete().eq('user_id', user.id);
      await supabase.from('scan_history').delete().eq('user_id', user.id);
    }

    // Create scan record
    const { data: scan, error: scanError } = await supabase
      .from('scan_history')
      .insert({
        user_id: user.id,
        status: 'in_progress',
        progress: 0,
        progress_message: 'Starting scan...',
      })
      .select()
      .single();

    if (scanError) {
      return new Response(JSON.stringify({ error: 'Failed to create scan' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const scanId = scan.id;

    // Process in background
    (async () => {
      try {
        let pageToken = '';
        let totalMessages = 0;
        let processedMessages = 0;
        const allMessages: any[] = [];

        await updateProgress(supabase, scanId, 5, 'Fetching message list...');

        do {
          const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=500${pageToken ? `&pageToken=${pageToken}` : ''}`;
          const listRes = await fetch(listUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const listData = await listRes.json();

          if (listData.messages) {
            allMessages.push(...listData.messages);
          }
          totalMessages = listData.resultSizeEstimate || allMessages.length;
          pageToken = listData.nextPageToken || '';
        } while (pageToken && allMessages.length < 10000);

        await updateProgress(supabase, scanId, 10, `Found ${allMessages.length} messages. Processing...`);

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
            const senderName = fromHeader.replace(/<.*>/, '').trim().replace(/"/g, '') || null;

            const isRead = !(msgData.labelIds || []).includes('UNREAD');

            emailRows.push({
              scan_id: scanId,
              user_id: user.id,
              email_id: msgData.id,
              sender_name: senderName,
              sender_email: senderEmail,
              subject: subjectHeader || null,
              received_date: new Date(parseInt(msgData.internalDate)).toISOString(),
              size_bytes: parseInt(msgData.sizeEstimate) || 0,
              is_opened: isRead,
              has_unsubscribe_link: !!unsubHeader,
              unsubscribe_url: unsubHeader || null,
            });
          }

          processedMessages = Math.min(i + batchSize, allMessages.length);
          const progress = Math.round(10 + (processedMessages / allMessages.length) * 70);
          await updateProgress(supabase, scanId, progress, 
            `Processed ${processedMessages}/${allMessages.length} messages...`);
        }

        await updateProgress(supabase, scanId, 85, 'Storing email metadata...');
        
        for (let i = 0; i < emailRows.length; i += 500) {
          const batch = emailRows.slice(i, i + 500);
          await supabase.from('email_metadata').insert(batch);
        }

        await updateProgress(supabase, scanId, 90, 'Computing sender summaries...');

        const senderMap = new Map<string, any>();
        emailRows.forEach((e) => {
          const existing = senderMap.get(e.sender_email);
          if (existing) {
            existing.total_emails++;
            if (!e.is_opened) existing.unopened_count++;
            existing.total_size_bytes += e.size_bytes;
            if (e.has_unsubscribe_link) existing.has_unsubscribe_link = true;
            if (!existing.sender_name && e.sender_name) existing.sender_name = e.sender_name;
          } else {
            senderMap.set(e.sender_email, {
              scan_id: scanId,
              user_id: user.id,
              sender_name: e.sender_name,
              sender_email: e.sender_email,
              total_emails: 1,
              unopened_count: e.is_opened ? 0 : 1,
              total_size_bytes: e.size_bytes,
              has_unsubscribe_link: e.has_unsubscribe_link,
            });
          }
        });

        const summaryRows = Array.from(senderMap.values()).map((s) => ({
          ...s,
          unopened_percentage: s.total_emails > 0 
            ? Math.round((s.unopened_count / s.total_emails) * 10000) / 100 
            : 0,
        }));

        for (let i = 0; i < summaryRows.length; i += 500) {
          await supabase.from('sender_summary').insert(summaryRows.slice(i, i + 500));
        }

        const deletableSenders = summaryRows.filter(s => s.unopened_percentage >= 75);
        const deletableMails = deletableSenders.reduce((sum, s) => sum + s.total_emails, 0);
        const recoverableSpace = deletableSenders.reduce((sum, s) => sum + s.total_size_bytes, 0);

        await supabase.from('scan_history').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          progress: 100,
          progress_message: 'Scan complete!',
          total_emails_scanned: emailRows.length,
          deletable_senders: deletableSenders.length,
          deletable_mails: deletableMails,
          recoverable_space: recoverableSpace,
        }).eq('id', scanId);

      } catch (err) {
        console.error('Scan error:', err);
        await supabase.from('scan_history').update({
          status: 'failed',
          progress_message: `Scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
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

async function updateProgress(supabase: any, scanId: string, progress: number, message: string) {
  await supabase.from('scan_history').update({
    progress,
    progress_message: message,
  }).eq('id', scanId);
}
