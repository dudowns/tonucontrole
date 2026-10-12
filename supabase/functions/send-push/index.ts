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
    const rawText = await req.text();
    let body: any = {};
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      body = {};
    }

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

    const pushOptions = {
      TTL: 86400,
      urgency: 'high',
      headers: {
        'Urgency': 'high',
        'X-WNS-PRIORITY': '1',
        'X-WNS-Type': 'wns/toast'
      }
    };

    const results = { sent: 0, failed: 0, removed: 0, subsFound: 0 };

    // Helper para envio seguro de notificação por usuário com filtro de preferências
    async function sendPushToUser(userId: string, payloadObj: PushPayload, category?: string, requiredDayBefore?: number) {
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', userId);

      if (!subs || subs.length === 0) return;

      const payloadStr = JSON.stringify({
        title: payloadObj.title,
        body: payloadObj.body || '',
        url: payloadObj.url || 'pages/dashboard.html',
        icon: payloadObj.icon || '/icons/icon-192x192.png',
        tag: payloadObj.tag || 'general-push'
      });

      // Gravar no histórico notification_log antes do envio (falhas não bloqueiam push)
      try {
        await supabase.from('notification_log').insert({
          user_id: userId,
          title: payloadObj.title,
          body: payloadObj.body || '',
          type: category || 'general',
          url: payloadObj.url || 'pages/dashboard.html',
          icon: payloadObj.icon || '/icons/icon-192x192.png'
        });
      } catch (logErr) {
        console.warn('[send-push] Falha ao gravar notification_log:', logErr);
      }

      for (const sub of subs) {
        // Se o usuário desmarcou esta categoria no app, pula o envio
        const prefs = sub.preferences || {};
        if (category && prefs[category] === false) {
          continue;
        }

        // Validação de preferência de dias antes (remind_days_before)
        if (requiredDayBefore !== undefined) {
          const allowedDays = Array.isArray(prefs.remind_days_before)
            ? prefs.remind_days_before
            : [0, 1, 2, 3];
          if (!allowedDays.includes(requiredDayBefore)) {
            continue;
          }
        }

        results.subsFound++;

        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            payloadStr,
            pushOptions
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

    // ========================================================
    // CASO 0: Atualização de Preferências de Push Granulares
    // ========================================================
    if (body.mode === 'save-preferences' && body.user_id) {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('push_subscriptions')
        .update({
          preferences: body.preferences || {},
          updated_at: nowIso
        })
        .eq('user_id', body.user_id)
        .select();

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ 
          ok: true, 
          mode: 'save-preferences', 
          updatedCount: data?.length || 0,
          user_id: body.user_id,
          preferences: body.preferences 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ========================================================
    // CASO 1: Envio Direto / Teste Personalizado
    // ========================================================
    if (body.title) {
      const targetUserId = body.user_id;

      let query = supabase.from('push_subscriptions').select('*');
      if (targetUserId) {
        query = query.eq('user_id', targetUserId);
      }

      const { data: subs, error } = await query;
      if (error) throw error;

      results.subsFound = subs?.length || 0;

      if (subs && subs.length > 0) {
        const payloadStr = JSON.stringify({
          title: body.title,
          body: body.body || '',
          url: body.url || 'pages/dashboard.html',
          icon: body.icon || '/icons/icon-192x192.png',
          tag: body.tag || 'test-push'
        });

        for (const sub of subs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: sub.keys },
              payloadStr,
              pushOptions
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

    // ========================================================
    // CASO 2: Varredura Automática Completa (Cron das 08h)
    // ========================================================
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Data daqui a 3 dias para proventos previstos
    const in3DaysDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const in3DaysStr = in3DaysDate.toISOString().split('T')[0];

    // --------------------------------------------------------
    // A) Contas em atraso e Próximas ao Vencimento
    // --------------------------------------------------------
    // A.1) Contas já vencidas (data anterior a hoje)
    const { data: overdueBills } = await supabase
      .from('transactions')
      .select('id, user_id, description, amount, date')
      .eq('is_bill', true)
      .eq('paid', false)
      .lt('date', today);

    if (overdueBills && overdueBills.length > 0) {
      const billsByUser = new Map<string, typeof overdueBills>();
      for (const b of overdueBills) {
        if (!billsByUser.has(b.user_id)) billsByUser.set(b.user_id, []);
        billsByUser.get(b.user_id)!.push(b);
      }

      for (const [userId, userBills] of billsByUser) {
        const count = userBills.length;
        const total = userBills.reduce((s, b) => s + Number(b.amount || 0), 0);
        await sendPushToUser(userId, {
          title: `⚠️ ${count} conta(s) em atraso`,
          body: `Total de R$ ${total.toFixed(2).replace('.', ',')} pendente(s).`,
          url: 'pages/bills.html',
          icon: '/icons/icon-192x192.png',
          tag: 'bills-overdue'
        }, 'bills');
      }
    }

    // A.2) Contas que vencem hoje ou nos próximos dias (0 a 7 dias)
    const in7DaysDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in7DaysStr = in7DaysDate.toISOString().split('T')[0];

    const { data: upcomingBills } = await supabase
      .from('transactions')
      .select('id, user_id, description, amount, date')
      .eq('is_bill', true)
      .eq('paid', false)
      .gte('date', today)
      .lte('date', in7DaysStr);

    if (upcomingBills && upcomingBills.length > 0) {
      for (const b of upcomingBills) {
        const diffDays = Math.round((new Date(b.date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24));
        const dayLabel = diffDays === 0 ? 'hoje' : (diffDays === 1 ? '1 dia' : `${diffDays} dias`);
        const title = diffDays === 0
          ? `📅 Vence hoje: ${b.description || 'Conta a pagar'}`
          : `📅 Vence em ${diffDays} dia(s): ${b.description || 'Conta a pagar'}`;
        const amountFormatted = Math.abs(Number(b.amount || 0)).toFixed(2).replace('.', ',');
        const dateFormatted = b.date.split('-').reverse().join('/');

        await sendPushToUser(b.user_id, {
          title,
          body: `Valor de R$ ${amountFormatted} (${dayLabel} - ${dateFormatted}).`,
          url: 'pages/bills.html',
          icon: '/icons/icon-192x192.png',
          tag: `bill-due-${b.id}-${diffDays}d`
        }, 'bills', diffDays);
      }
    }

    // --------------------------------------------------------
    // B) Proventos Creditados Hoje
    // --------------------------------------------------------
    const { data: creditedDividends } = await supabase
      .from('dividends')
      .select('id, user_id, ticker, total_value, net_value, type, quantity')
      .eq('date', today);

    if (creditedDividends && creditedDividends.length > 0) {
      const divsByUser = new Map<string, typeof creditedDividends>();
      for (const d of creditedDividends) {
        if (!divsByUser.has(d.user_id)) divsByUser.set(d.user_id, []);
        divsByUser.get(d.user_id)!.push(d);
      }

      for (const [userId, userDivs] of divsByUser) {
        const totalCredited = userDivs.reduce((s, d) => s + Number(d.net_value || d.total_value || 0), 0);
        const tickers = [...new Set(userDivs.map(d => d.ticker))].join(', ');
        await sendPushToUser(userId, {
          title: `💰 Provento creditado hoje!`,
          body: `R$ ${totalCredited.toFixed(2).replace('.', ',')} recebido (${tickers}).`,
          url: 'pages/investments.html',
          icon: '/icons/icon-192x192.png',
          tag: `dividends-credited-${today}`
        }, 'dividends_credited');
      }
    }

    // --------------------------------------------------------
    // C) Proventos Previstos (1 a 3 dias - usando date_com se existir)
    // --------------------------------------------------------
    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

    const { data: upcomingDividends } = await supabase
      .from('dividends')
      .select('id, user_id, ticker, total_value, net_value, date, date_com');

    if (upcomingDividends && upcomingDividends.length > 0) {
      const filteredDividends = upcomingDividends.filter(d => {
        const effectiveDate = d.date_com || d.date;
        return effectiveDate >= tomorrowStr && effectiveDate <= in3DaysStr;
      });

      if (filteredDividends.length > 0) {
        const upcomingByUser = new Map<string, typeof filteredDividends>();
        for (const d of filteredDividends) {
          if (!upcomingByUser.has(d.user_id)) upcomingByUser.set(d.user_id, []);
          upcomingByUser.get(d.user_id)!.push(d);
        }

        for (const [userId, userDivs] of upcomingByUser) {
          const totalUpcoming = userDivs.reduce((s, d) => s + Number(d.net_value || d.total_value || 0), 0);
          const count = userDivs.length;
          await sendPushToUser(userId, {
            title: `📅 ${count} provento(s) previsto(s)`,
            body: `Previsão de R$ ${totalUpcoming.toFixed(2).replace('.', ',')} nos próximos 3 dias.`,
            url: 'pages/investments.html',
            icon: '/icons/icon-192x192.png',
            tag: `dividends-upcoming-${today}`
          }, 'dividends_upcoming');
        }
      }
    }

    // --------------------------------------------------------
    // D) Metas Atingidas (100% batidas)
    // --------------------------------------------------------
    const { data: goals } = await supabase
      .from('goals')
      .select('id, user_id, title, target_amount, current_amount, completed')
      .gte('current_amount', 0);

    if (goals && goals.length > 0) {
      // Metas que atingiram o valor alvo
      const completedGoals = goals.filter(g => Number(g.current_amount) >= Number(g.target_amount) && Number(g.target_amount) > 0);
      for (const g of completedGoals) {
        await sendPushToUser(g.user_id, {
          title: `🎯 Meta Alcançada: ${g.title}!`,
          body: `Parabéns! Você atingiu 100% do objetivo de R$ ${Number(g.target_amount).toFixed(2).replace('.', ',')}.`,
          url: 'pages/goals.html',
          icon: '/icons/icon-192x192.png',
          tag: `goal-completed-${g.id}`
        }, 'goals');
      }
    }

    // --------------------------------------------------------
    // E) Orçamento Estourado (Gastos do mês > Limite)
    // --------------------------------------------------------
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1 a 12
    const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;

    const [budgetsRes, txCategoriesRes] = await Promise.all([
      supabase.from('monthly_budgets').select('id, user_id, category_id, budget_limit, categories(name)').eq('year', currentYear).eq('month', currentMonth),
      supabase.from('transactions').select('category_id, user_id, amount').eq('type', 'expense').gte('date', startOfMonth).lte('date', today)
    ]);

    const budgets = budgetsRes.data || [];
    const txs = txCategoriesRes.data || [];

    if (budgets.length > 0 && txs.length > 0) {
      for (const b of budgets) {
        const catSpent = txs
          .filter(t => t.user_id === b.user_id && t.category_id === b.category_id)
          .reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);

        const limit = Number(b.budget_limit || 0);
        if (limit > 0 && catSpent > limit) {
          const catName = (b as any).categories?.name || 'Categoria';
          const excesso = catSpent - limit;
          await sendPushToUser(b.user_id, {
            title: `🚨 Orçamento Estourado: ${catName}`,
            body: `Você gastou R$ ${catSpent.toFixed(2).replace('.', ',')} (Teto: R$ ${limit.toFixed(2).replace('.', ',')}). Excedeu em R$ ${excesso.toFixed(2).replace('.', ',')}!`,
            url: 'pages/settings.html',
            icon: '/icons/icon-192x192.png',
            tag: `budget-exceeded-${b.id}`
          }, 'budgets');
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
