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

// Helper para obter datas formatadas no fuso horário do Brasil (America/Sao_Paulo / UTC-3)
function getBrazilDateStr(offsetDays = 0): string {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const todayStr = formatter.format(d); // Retorna "YYYY-MM-DD"
  if (offsetDays === 0) return todayStr;
  const [y, m, day] = todayStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, day + offsetDays));
  return target.toISOString().split('T')[0];
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
    async function sendPushToUser(
      userId: string, 
      payloadObj: PushPayload, 
      category?: string, 
      requiredDayBefore?: number,
      cachedSubs?: any[]
    ) {
      let subs = cachedSubs;
      if (!subs) {
        const { data: fetchedSubs } = await supabase
          .from('push_subscriptions')
          .select('*')
          .eq('user_id', userId);
        subs = fetchedSubs || [];
      }

      if (!subs || subs.length === 0) return;

      // a) INSERT em notification_log (read_at=null, dismissed_at=null) antes do envio
      try {
        await supabase.from('notification_log').insert({
          user_id: userId,
          title: payloadObj.title,
          body: payloadObj.body || '',
          type: category || 'general',
          url: payloadObj.url || 'pages/dashboard.html',
          icon: payloadObj.icon || '/icons/icon-192x192.png',
          read_at: null,
          dismissed_at: null
        });
      } catch (logErr) {
        console.warn('[send-push] Falha ao gravar notification_log:', logErr);
      }

      // b) COUNT de unread no notification_log para o usuário
      let badgeCount = 1;
      try {
        const { count, error: countErr } = await supabase
          .from('notification_log')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .is('read_at', null)
          .is('dismissed_at', null);

        if (!countErr && typeof count === 'number' && count > 0) {
          badgeCount = count;
        }
      } catch (countEx) {
        console.warn('[send-push] Falha ao calcular unread count:', countEx);
      }

      // c) Montar payload com badgeCount correto
      const payloadStr = JSON.stringify({
        title: payloadObj.title,
        body: payloadObj.body || '',
        url: payloadObj.url || 'pages/dashboard.html',
        icon: payloadObj.icon || '/icons/icon-192x192.png',
        tag: payloadObj.tag || 'general-push',
        badgeCount: badgeCount
      });

      for (const sub of subs) {
        // Se o usuário desmarcou esta categoria no app, pula o envio
        const prefs = sub.preferences || {};
        if (category && prefs[category] === false) {
          continue;
        }

        // Se for conta em atraso e usuário desmarcou remind_overdue
        if (category === 'bills' && requiredDayBefore === undefined && prefs.remind_overdue === false) {
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
          console.warn(`[send-push] Falha no envio para endpoint ${sub.endpoint?.slice(0, 30)}...:`, pushErr?.message || pushErr);
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
        // a) INSERT em notification_log (read_at=null, dismissed_at=null)
        if (targetUserId) {
          try {
            await supabase.from('notification_log').insert({
              user_id: targetUserId,
              title: body.title,
              body: body.body || '',
              type: body.tag || 'direct',
              url: body.url || 'pages/dashboard.html',
              icon: body.icon || '/icons/icon-192x192.png',
              read_at: null,
              dismissed_at: null
            });
          } catch (logErr) {
            console.warn('[send-push] Falha ao gravar notification_log em direct push:', logErr);
          }
        }

        // b) COUNT de unread no notification_log para o usuário
        let badgeCount = 1;
        if (targetUserId) {
          try {
            const { count, error: countErr } = await supabase
              .from('notification_log')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', targetUserId)
              .is('read_at', null)
              .is('dismissed_at', null);

            if (!countErr && typeof count === 'number' && count > 0) {
              badgeCount = count;
            }
          } catch (countEx) {
            console.warn('[send-push] Falha ao calcular unread count em direct push:', countEx);
          }
        }

        // c) Enviar push com badgeCount correto
        const payloadStr = JSON.stringify({
          title: body.title,
          body: body.body || '',
          url: body.url || 'pages/dashboard.html',
          icon: body.icon || '/icons/icon-192x192.png',
          tag: body.tag || 'test-push',
          badgeCount: badgeCount
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
    // CASO 2: Modo Exclusivo de Verificação de Contas ('check-bills')
    // Chamado pelo Cron do Supabase às 08:00
    // ========================================================
    if (body.mode === 'check-bills') {
      const todayBr = getBrazilDateStr(0);
      const in7DaysBr = getBrazilDateStr(7);
      console.log(`[send-push] [check-bills] 🚀 Iniciando verificação de contas. Hoje (Brasil): ${todayBr}, Limite: ${in7DaysBr}`);

      // 1. Buscar todas as push_subscriptions ativas no banco
      const { data: allSubs, error: subsErr } = await supabase
        .from('push_subscriptions')
        .select('*');

      if (subsErr) {
        console.error('[send-push] [check-bills] ❌ Erro ao buscar push_subscriptions:', subsErr);
        throw subsErr;
      }

      const activeSubs = allSubs || [];
      const subsByUser = new Map<string, any[]>();
      for (const s of activeSubs) {
        if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
        subsByUser.get(s.user_id)!.push(s);
      }

      console.log(`[send-push] [check-bills] 👥 Usuários com push ativo: ${subsByUser.size} (Total de subscriptions: ${activeSubs.length})`);

      if (subsByUser.size === 0) {
        console.log('[send-push] [check-bills] ℹ️ Nenhuma subscription ativa encontrada no sistema. Finalizando.');
        return new Response(
          JSON.stringify({ 
            ok: true, 
            mode: 'check-bills', 
            today: todayBr, 
            message: 'Nenhuma subscription ativa encontrada.',
            results 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      const targetUserIds = Array.from(subsByUser.keys());

      // 2. Buscar contas pendentes apenas para os usuários com push ativo
      // Cobertura completa: is_bill = true e paid != true (paid = false ou paid IS NULL)
      const { data: rawBills, error: billsErr } = await supabase
        .from('transactions')
        .select('id, user_id, description, amount, date, due_date, paid, is_bill')
        .in('user_id', targetUserIds)
        .eq('is_bill', true)
        .or('paid.eq.false,paid.is.null');

      if (billsErr) {
        console.error('[send-push] [check-bills] ❌ Erro ao consultar contas pendentes:', billsErr);
        throw billsErr;
      }

      const bills = rawBills || [];
      console.log(`[send-push] [check-bills] 📋 Total de contas pendentes encontradas: ${bills.length}`);

      // 3. Classificar contas por atrasadas e a vencer (hoje até 7 dias)
      const overdueByUser = new Map<string, any[]>();
      const upcomingBills: Array<{ bill: any; diffDays: number }> = [];

      for (const b of bills) {
        const effectiveDateStr = String(b.due_date || b.date || '').slice(0, 10);
        if (!effectiveDateStr) continue;

        if (effectiveDateStr < todayBr) {
          if (!overdueByUser.has(b.user_id)) overdueByUser.set(b.user_id, []);
          overdueByUser.get(b.user_id)!.push(b);
        } else if (effectiveDateStr <= in7DaysBr) {
          const [y1, m1, d1] = effectiveDateStr.split('-').map(Number);
          const [y0, m0, d0] = todayBr.split('-').map(Number);
          const diffDays = Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y0, m0 - 1, d0)) / (1000 * 60 * 60 * 24));
          upcomingBills.push({ bill: b, diffDays });
        }
      }

      console.log(`[send-push] [check-bills] ⚠️ Contas atrasadas: ${overdueByUser.size} usuário(s) afetado(s). 📅 Contas a vencer: ${upcomingBills.length}`);

      // 4. Envio de Notificações de Contas Atrasadas (agrupadas por usuário)
      for (const [userId, userBills] of overdueByUser) {
        const userSubs = subsByUser.get(userId) || [];
        const count = userBills.length;
        const total = userBills.reduce((s, b) => s + Math.abs(Number(b.amount || 0)), 0);
        console.log(`[send-push] [check-bills] Disparando alerta de atraso para usuário ${userId}: ${count} conta(s), R$ ${total.toFixed(2)}`);

        await sendPushToUser(userId, {
          title: `⚠️ ${count} conta(s) em atraso`,
          body: `Total de R$ ${total.toFixed(2).replace('.', ',')} pendente(s).`,
          url: 'pages/bills.html',
          icon: '/icons/icon-192x192.png',
          tag: `bills-overdue-${todayBr}`
        }, 'bills', undefined, userSubs);
      }

      // 5. Envio de Notificações de Contas Próximas ao Vencimento
      for (const { bill, diffDays } of upcomingBills) {
        const userSubs = subsByUser.get(bill.user_id) || [];
        const dayLabel = diffDays === 0 ? 'hoje' : (diffDays === 1 ? 'amanhã' : `em ${diffDays} dias`);
        const title = diffDays === 0
          ? `📅 Vence hoje: ${bill.description || 'Conta a pagar'}`
          : `📅 Vence ${dayLabel}: ${bill.description || 'Conta a pagar'}`;
        const amountFormatted = Math.abs(Number(bill.amount || 0)).toFixed(2).replace('.', ',');
        const effectiveDateStr = String(bill.due_date || bill.date || '').slice(0, 10);
        const dateFormatted = effectiveDateStr.split('-').reverse().join('/');

        console.log(`[send-push] [check-bills] Disparando alerta de conta a vencer (${dayLabel}) para usuário ${bill.user_id}: ${bill.description}`);

        await sendPushToUser(bill.user_id, {
          title,
          body: `Valor: R$ ${amountFormatted} (${dayLabel} - ${dateFormatted}).`,
          url: 'pages/bills.html',
          icon: '/icons/icon-192x192.png',
          tag: `bill-due-${bill.id}-${diffDays}d`
        }, 'bills', diffDays, userSubs);
      }

      console.log(`[send-push] [check-bills] ✅ Concluído. Enviados: ${results.sent}, Falhas: ${results.failed}, Subs Encontradas: ${results.subsFound}`);

      return new Response(
        JSON.stringify({ 
          ok: true, 
          mode: 'check-bills', 
          today: todayBr,
          usersWithSubs: subsByUser.size,
          activeSubsCount: activeSubs.length,
          overdueUsersCount: overdueByUser.size,
          upcomingBillsCount: upcomingBills.length,
          results 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ========================================================
    // CASO 3: Varredura Automática Completa (Geral / Full Check)
    // ========================================================
    const today = getBrazilDateStr(0);
    const in3DaysStr = getBrazilDateStr(3);
    const in7DaysStr = getBrazilDateStr(7);

    // --------------------------------------------------------
    // A) Contas em atraso e Próximas ao Vencimento
    // --------------------------------------------------------
    const { data: overdueBills } = await supabase
      .from('transactions')
      .select('id, user_id, description, amount, date, due_date')
      .eq('is_bill', true)
      .or('paid.eq.false,paid.is.null');

    if (overdueBills && overdueBills.length > 0) {
      const overdueByUser = new Map<string, typeof overdueBills>();
      for (const b of overdueBills) {
        const d = String(b.due_date || b.date || '').slice(0, 10);
        if (d && d < today) {
          if (!overdueByUser.has(b.user_id)) overdueByUser.set(b.user_id, []);
          overdueByUser.get(b.user_id)!.push(b);
        }
      }

      for (const [userId, userBills] of overdueByUser) {
        const count = userBills.length;
        const total = userBills.reduce((s, b) => s + Math.abs(Number(b.amount || 0)), 0);
        await sendPushToUser(userId, {
          title: `⚠️ ${count} conta(s) em atraso`,
          body: `Total de R$ ${total.toFixed(2).replace('.', ',')} pendente(s).`,
          url: 'pages/bills.html',
          icon: '/icons/icon-192x192.png',
          tag: `bills-overdue-${today}`
        }, 'bills');
      }
    }

    // A.2) Contas que vencem hoje ou nos próximos dias (0 a 7 dias)
    const { data: upcomingBills } = await supabase
      .from('transactions')
      .select('id, user_id, description, amount, date, due_date')
      .eq('is_bill', true)
      .or('paid.eq.false,paid.is.null');

    if (upcomingBills && upcomingBills.length > 0) {
      for (const b of upcomingBills) {
        const effectiveDateStr = String(b.due_date || b.date || '').slice(0, 10);
        if (!effectiveDateStr || effectiveDateStr < today || effectiveDateStr > in7DaysStr) continue;

        const [y1, m1, d1] = effectiveDateStr.split('-').map(Number);
        const [y0, m0, d0] = today.split('-').map(Number);
        const diffDays = Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y0, m0 - 1, d0)) / (1000 * 60 * 60 * 24));

        const dayLabel = diffDays === 0 ? 'hoje' : (diffDays === 1 ? '1 dia' : `${diffDays} dias`);
        const title = diffDays === 0
          ? `📅 Vence hoje: ${b.description || 'Conta a pagar'}`
          : `📅 Vence em ${diffDays} dia(s): ${b.description || 'Conta a pagar'}`;
        const amountFormatted = Math.abs(Number(b.amount || 0)).toFixed(2).replace('.', ',');
        const dateFormatted = effectiveDateStr.split('-').reverse().join('/');

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
    try {
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
    } catch (divErr) {
      console.warn('[send-push] Aviso ao processar proventos creditados:', divErr);
    }

    // --------------------------------------------------------
    // C) Proventos Previstos (1 a 3 dias - usando date_com se existir)
    // --------------------------------------------------------
    try {
      const tomorrowStr = getBrazilDateStr(1);
      const { data: upcomingDividends } = await supabase
        .from('dividends')
        .select('id, user_id, ticker, total_value, net_value, date, date_com');

      if (upcomingDividends && upcomingDividends.length > 0) {
        const filteredDividends = upcomingDividends.filter(d => {
          const effectiveDate = d.date || d.date_com;
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
    } catch (upDivErr) {
      console.warn('[send-push] Aviso ao processar proventos previstos:', upDivErr);
    }

    // --------------------------------------------------------
    // D) Metas Atingidas (100% batidas)
    // --------------------------------------------------------
    try {
      const { data: goals } = await supabase
        .from('goals')
        .select('id, user_id, title, target_amount, current_amount, completed')
        .gte('current_amount', 0);

      if (goals && goals.length > 0) {
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
    } catch (goalsErr) {
      console.warn('[send-push] Aviso ao processar metas:', goalsErr);
    }

    // --------------------------------------------------------
    // E) Orçamento Estourado (Gastos do mês > Limite)
    // --------------------------------------------------------
    try {
      const [yearStr, monthStr] = today.split('-');
      const currentYear = Number(yearStr);
      const currentMonth = Number(monthStr);
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
    } catch (budgetErr) {
      console.warn('[send-push] Aviso ao processar orçamentos:', budgetErr);
    }

    return new Response(
      JSON.stringify({ ok: true, ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (err: any) {
    console.error('[send-push] Erro Geral:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
