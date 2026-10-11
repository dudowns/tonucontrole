import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import webpush from 'https://esm.sh/web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('TONU_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('TONU_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidEmail = Deno.env.get('VAPID_EMAIL') || 'mailto:admin@tonucontrole.app';

    if (!supabaseUrl || !supabaseServiceKey || !vapidPublic || !vapidPrivate) {
      throw new Error('Configurações faltando: URL, SERVICE_KEY ou VAPID KEYS.');
    }

    webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results = { sent: 0, failed: 0, removed: 0, subsFound: 0 };

    // CASO 1: Teste com título fornecido
    if (body.title) {
      const payload = JSON.stringify({
        title: body.title,
        body: body.body || '',
        url: body.url || '/pages/dashboard.html',
        icon: body.icon || '/icons/icon-192x192.png',
        tag: body.tag || 'test-push'
      });

      // Se passou user_id, filtra por ele. Se não passou, envia para todas as subs ativas!
      let query = supabase.from('push_subscriptions').select('*');
      if (body.user_id) {
        query = query.eq('user_id', body.user_id);
      }

      const { data: subs, error } = await query;
      if (error) throw error;

      results.subsFound = subs?.length || 0;

      if (subs && subs.length > 0) {
        for (const sub of subs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: sub.keys },
              payload
            );
            results.sent++;
          } catch (pushErr: any) {
            results.failed++;
            if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
              await supabase.from('push_subscriptions').delete().eq('id', sub.id);
              results.removed++;
            }
          }
        }
      }

      return new Response(
        JSON.stringify({ ok: true, ...results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // CASO 2: Varredura automática (cron / check-bills)
    const today = new Date().toISOString().split('T')[0];
    const { data: bills } = await supabase
      .from('transactions')
      .select('id, user_id, description, amount, date')
      .eq('is_bill', true)
      .eq('paid', false)
      .lte('date', today);

    if (bills && bills.length > 0) {
      const grouped = new Map<string, typeof bills>();
      for (const b of bills) {
        if (!grouped.has(b.user_id)) grouped.set(b.user_id, []);
        grouped.get(b.user_id)!.push(b);
      }

      for (const [userId, userBills] of grouped) {
        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('*')
          .eq('user_id', userId);

        results.subsFound += subs?.length || 0;

        if (subs && subs.length > 0) {
          const payload = JSON.stringify({
            title: `⚠️ ${userBills.length} conta(s) em atraso`,
            body: `Total de R$ ${userBills.reduce((s, b) => s + Number(b.amount || 0), 0).toFixed(2).replace('.', ',')} pendente(s).`,
            url: '/pages/bills.html',
            icon: '/icons/icon-192x192.png',
            tag: 'bills-overdue'
          });

          for (const sub of subs) {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: sub.keys },
                payload
              );
              results.sent++;
            } catch (pushErr: any) {
              results.failed++;
              if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
                await supabase.from('push_subscriptions').delete().eq('id', sub.id);
                results.removed++;
              }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (err: any) {
    console.error('[send-push] Erro:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
