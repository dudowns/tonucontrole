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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidEmail = Deno.env.get('VAPID_EMAIL') || 'mailto:admin@tonucontrole.app';

    if (!supabaseUrl || !supabaseServiceKey || !vapidPublic || !vapidPrivate) {
      throw new Error('Variáveis de ambiente faltando: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY');
    }

    webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Modo 1: envio direcionado (payload no body)
    const body = await req.json().catch(() => ({}));
    
    // Modo 2: se body vazio, fazer varredura de contas vencendo hoje
    let notificationsToSend: { user_id: string; payload: PushPayload }[] = [];

    if (body.title && body.user_id) {
      // Envio direcionado
      notificationsToSend.push({
        user_id: body.user_id,
        payload: {
          title: body.title,
          body: body.body,
          url: body.url,
          icon: body.icon || '/icons/icon-192x192.png',
          tag: body.tag
        }
      });
    } else if (body.mode === 'check-bills' || Object.keys(body).length === 0) {
      // Varredura: buscar contas vencendo hoje
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
        for (const [user_id, userBills] of grouped) {
          const count = userBills.length;
          const total = userBills.reduce((s, b) => s + Number(b.amount || 0), 0);
          notificationsToSend.push({
            user_id,
            payload: {
              title: `⚠️ ${count} conta(s) em atraso`,
              body: `Total de R$ ${total.toFixed(2).replace('.', ',')} pendente(s). Toque para ver.`,
              url: '/pages/bills.html',
              icon: '/icons/icon-192x192.png',
              tag: 'bills-overdue'
            }
          });
        }
      }
    }

    // Enviar para cada usuário
    const results = { sent: 0, failed: 0, removed: 0 };

    for (const { user_id, payload } of notificationsToSend) {
      const { data: subs, error } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', user_id);

      if (error || !subs) continue;

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys
            },
            JSON.stringify(payload)
          );
          results.sent++;
        } catch (pushErr: any) {
          console.error(`[Push] Erro ao enviar para ${sub.endpoint}:`, pushErr.message);
          results.failed++;
          // Subscription morta (410 Gone)
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

  } catch (err: any) {
    console.error('[send-push] Erro:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
