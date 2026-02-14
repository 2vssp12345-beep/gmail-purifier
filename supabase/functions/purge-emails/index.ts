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

    const authHeader = req.headers.get('Authorization')!;
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { scan_id, senders } = await req.json();
    
    if (!scan_id || !senders || !Array.isArray(senders)) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Google access token
    const refreshToken = user.app_metadata?.provider_refresh_token || 
                          user.user_metadata?.provider_refresh_token;
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!refreshToken || !googleClientId || !googleClientSecret) {
      return new Response(JSON.stringify({ error: 'Auth token expired. Please sign in again.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Failed to refresh Google token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalMailsDeleted = 0;
    let totalSpaceRecovered = 0;
    let sendersDeleted = 0;

    for (const senderAction of senders) {
      const { sender_email, action, unsubscribe } = senderAction;

      if (action === 'skip' && !unsubscribe) continue;

      // Get emails for this sender from our stored metadata
      const { data: emails } = await supabase
        .from('email_metadata')
        .select('*')
        .eq('scan_id', scan_id)
        .eq('user_id', user.id)
        .eq('sender_email', sender_email)
        .order('received_date', { ascending: false });

      if (!emails || emails.length === 0) continue;

      let emailsToDelete: typeof emails = [];

      if (action === 'delete_all') {
        emailsToDelete = emails;
      } else if (action === 'retain_latest') {
        emailsToDelete = emails.slice(1); // Keep first (latest)
      } else if (action === 'retain_1_in_15') {
        emailsToDelete = emails.filter((_, i) => i % 15 !== 0);
      }

      // Batch trash emails via Gmail API
      if (emailsToDelete.length > 0) {
        const messageIds = emailsToDelete.map(e => e.email_id);
        
        // Gmail batch modify - trash
        for (let i = 0; i < messageIds.length; i += 1000) {
          const batch = messageIds.slice(i, i + 1000);
          await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ids: batch,
              addLabelIds: ['TRASH'],
            }),
          });
        }

        const spaceRecovered = emailsToDelete.reduce((sum, e) => sum + e.size_bytes, 0);
        totalMailsDeleted += emailsToDelete.length;
        totalSpaceRecovered += spaceRecovered;
        sendersDeleted++;
      }

      // Handle unsubscribe
      if (unsubscribe) {
        const latestEmail = emails[0];
        if (latestEmail?.unsubscribe_url) {
          await attemptUnsubscribe(latestEmail.unsubscribe_url, accessToken);
        }
      }

      // Remove sender from sender_summary (mark as processed)
      if (action !== 'skip') {
        await supabase.from('sender_summary')
          .delete()
          .eq('scan_id', scan_id)
          .eq('sender_email', sender_email);
      }
    }

    // Update scan history
    const { data: currentScan } = await supabase
      .from('scan_history')
      .select('senders_deleted, mails_deleted, space_recovered')
      .eq('id', scan_id)
      .single();

    if (currentScan) {
      await supabase.from('scan_history').update({
        senders_deleted: currentScan.senders_deleted + sendersDeleted,
        mails_deleted: currentScan.mails_deleted + totalMailsDeleted,
        space_recovered: currentScan.space_recovered + totalSpaceRecovered,
      }).eq('id', scan_id);
    }

    return new Response(JSON.stringify({
      senders_deleted: sendersDeleted,
      mails_deleted: totalMailsDeleted,
      space_recovered: totalSpaceRecovered,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Purge error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function attemptUnsubscribe(unsubUrl: string, accessToken: string) {
  try {
    // Handle mailto: style unsubscribe
    if (unsubUrl.includes('mailto:')) {
      const email = unsubUrl.match(/mailto:([^?>,\s]+)/)?.[1];
      if (email) {
        // Send unsubscribe email via Gmail
        const raw = btoa(
          `To: ${email}\r\nSubject: Unsubscribe\r\nContent-Type: text/plain\r\n\r\nPlease unsubscribe me from this mailing list.`
        ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
        });
      }
      return;
    }

    // Handle HTTP unsubscribe link
    const cleanUrl = unsubUrl.replace(/[<>]/g, '').split(',')[0].trim();
    if (cleanUrl.startsWith('http')) {
      await fetch(cleanUrl, { method: 'POST' }).catch(() => {
        // Try GET as fallback
        return fetch(cleanUrl, { method: 'GET' });
      });
    }
  } catch (err) {
    console.error('Unsubscribe failed for:', unsubUrl, err);
  }
}
