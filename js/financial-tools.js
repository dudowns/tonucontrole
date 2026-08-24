// ==========================================================================
// TONUCONTROLE - FINANCIAL TOOLS & INTELLIGENCE SUITE
// Módulos unificados: Orçamentos, Fluxo de Caixa, Relatórios,
// Gerenciador de Categorias, Importador Bancário (OFX/CSV) e Backup JSON.
// ==========================================================================

(function () {
    'use strict';

    // ==========================================================================
    // 1. ORÇAMENTOS E LIMITES POR CATEGORIA (TonuBudget)
    // ==========================================================================
    class TonuBudgetManager {
        constructor() {
            this.storagePrefix = 'tonu_budget_limits_';
        }

        getBudgets(userId) {
            try {
                const raw = localStorage.getItem(this.storagePrefix + userId);
                return raw ? JSON.parse(raw) : {};
            } catch (e) {
                return {};
            }
        }

        setCategoryBudget(userId, categoryId, limitAmount) {
            const budgets = this.getBudgets(userId);
            if (limitAmount > 0) {
                budgets[categoryId] = parseFloat(limitAmount);
            } else {
                delete budgets[categoryId];
            }
            localStorage.setItem(this.storagePrefix + userId, JSON.stringify(budgets));
        }

        calculateCategoryProgress(userId, transactions, categories, targetMonth = null) {
            const now = new Date();
            const monthPrefix = targetMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const budgets = this.getBudgets(userId);
            const results = [];

            categories.filter(c => c.type === 'expense').forEach(cat => {
                const limit = budgets[cat.id] || 0;
                const spent = transactions
                    .filter(t => t.type === 'expense' && t.category_id === cat.id && t.date && t.date.startsWith(monthPrefix))
                    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

                const percentage = limit > 0 ? (spent / limit) * 100 : 0;

                results.push({
                    categoryId: cat.id,
                    name: cat.name,
                    icon: cat.icon || 'fa-tag',
                    color: cat.color || '#6c5ce7',
                    limit: limit,
                    spent: spent,
                    remaining: Math.max(0, limit - spent),
                    percentage: Math.min(percentage, 100),
                    isExceeded: limit > 0 && spent > limit,
                    isWarning: limit > 0 && percentage >= 80 && spent <= limit
                });
            });

            return results;
        }

        async openBudgetModal() {
            try {
                const { data: { user } } = await window.supabaseClient.auth.getUser();
                if (!user) return;

                const [txRes, catRes] = await Promise.all([
                    window.supabaseClient.from('transactions').select('*').eq('user_id', user.id),
                    window.supabaseClient.from('categories').select('*').eq('user_id', user.id)
                ]);

                this.showBudgetModal(user.id, catRes.data || [], txRes.data || []);
            } catch (e) {
                console.error('❌ Erro ao abrir modal de orçamentos:', e);
            }
        }

        showBudgetModal(userId, categories, transactions, onSaveCallback) {
            let modal = document.getElementById('tonuBudgetModal');
            if (modal) modal.remove();

            const budgets = this.getBudgets(userId);
            const expenseCategories = categories.filter(c => c.type === 'expense');
            const progressList = this.calculateCategoryProgress(userId, transactions, categories);

            const totalBudget = Object.values(budgets).reduce((sum, val) => sum + val, 0);
            const totalSpent = progressList.reduce((sum, p) => sum + p.spent, 0);

            const modalHtml = `
            <div id="tonuBudgetModal" style="position:fixed; inset:0; background:rgba(15,23,42,0.8); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(6px); font-family:'Inter',sans-serif;">
                <div style="background:#ffffff; border-radius:20px; max-width:620px; width:100%; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 25px 50px -12px rgba(0,0,0,0.3); border:1px solid #e2e8f0; overflow:hidden;">
                    <div style="padding:20px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0 0 4px 0;">
                                <i class="fas fa-wallet" style="color:#6c5ce7; margin-right:8px;"></i> Orçamentos & Tetos de Gastos
                            </h3>
                            <p style="font-size:12px; color:#64748b; margin:0;">Defina limites mensais por categoria para controlar suas despesas.</p>
                        </div>
                        <button onclick="document.getElementById('tonuBudgetModal').remove()" style="background:none; border:none; font-size:22px; cursor:pointer; color:#94a3b8;">&times;</button>
                    </div>

                    <div style="padding:14px 24px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; font-size:13px;">
                        <div>
                            <span style="color:#64748b;">Orçamento Total:</span>
                            <strong style="color:#0f172a; margin-left:4px;">${window.formatCurrency ? window.formatCurrency(totalBudget) : 'R$ ' + totalBudget.toFixed(2)}</strong>
                        </div>
                        <div>
                            <span style="color:#64748b;">Gasto Real:</span>
                            <strong style="color:${totalSpent > totalBudget && totalBudget > 0 ? '#ff7675' : '#00b894'}; margin-left:4px;">
                                ${window.formatCurrency ? window.formatCurrency(totalSpent) : 'R$ ' + totalSpent.toFixed(2)}
                            </strong>
                        </div>
                    </div>

                    <div style="flex:1; overflow-y:auto; padding:16px 24px; max-height:420px; display:flex; flex-direction:column; gap:12px;">
                        ${expenseCategories.map(cat => {
                const prog = progressList.find(p => p.categoryId === cat.id) || { limit: 0, spent: 0, percentage: 0 };
                const barColor = prog.isExceeded ? '#ff7675' : (prog.isWarning ? '#fdcb6e' : '#00b894');

                return `
                            <div style="padding:12px 16px; background:#ffffff; border:1px solid #e2e8f0; border-radius:14px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <div style="width:32px; height:32px; border-radius:8px; background:${cat.color || '#6c5ce7'}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:14px;">
                                            <i class="fas ${cat.icon || 'fa-tag'}"></i>
                                        </div>
                                        <div>
                                            <strong style="font-size:13px; color:#0f172a;">${cat.name}</strong>
                                            <div style="font-size:11px; color:#64748b;">
                                                Gasto atual: ${window.formatCurrency ? window.formatCurrency(prog.spent) : 'R$ ' + prog.spent.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <span style="font-size:12px; color:#64748b;">Teto R$:</span>
                                        <input type="number" step="10" min="0" id="budget_input_${cat.id}" value="${prog.limit || ''}" placeholder="Sem limite" style="width:110px; padding:6px 10px; border-radius:8px; border:1px solid #cbd5e1; font-size:13px; font-weight:600; text-align:right;">
                                    </div>
                                </div>
                                ${prog.limit > 0 ? `
                                <div style="width:100%; height:6px; background:#e2e8f0; border-radius:99px; overflow:hidden;">
                                    <div style="width:${prog.percentage}%; height:100%; background:${barColor}; border-radius:99px; transition:width 0.3s;"></div>
                                </div>
                                <div style="display:flex; justify-content:space-between; font-size:10px; color:#94a3b8; margin-top:4px;">
                                    <span>${prog.percentage.toFixed(0)}% consumido</span>
                                    <span>${prog.isExceeded ? '⚠️ Estourado em ' + (window.formatCurrency ? window.formatCurrency(prog.spent - prog.limit) : '') : 'Restante: ' + (window.formatCurrency ? window.formatCurrency(prog.remaining) : '')}</span>
                                </div>
                                ` : ''}
                            </div>
                            `;
            }).join('')}
                    </div>

                    <div style="padding:16px 24px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:12px; background:#f8fafc;">
                        <button class="btn btn-outline btn-sm" onclick="document.getElementById('tonuBudgetModal').remove()">Fechar</button>
                        <button class="btn btn-primary btn-sm" onclick="TonuBudget.saveBudgetsFromModal('${userId}', ${JSON.stringify(expenseCategories).replace(/"/g, '&quot;')})">
                            <i class="fas fa-save"></i> Salvar Orçamentos
                        </button>
                    </div>
                </div>
            </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            this.currentSaveCallback = onSaveCallback;
        }

        saveBudgetsFromModal(userId, categories) {
            categories.forEach(cat => {
                const input = document.getElementById(`budget_input_${cat.id}`);
                if (input) {
                    const val = parseFloat(input.value) || 0;
                    this.setCategoryBudget(userId, cat.id, val);
                }
            });

            if (window.showToast) {
                window.showToast('Orçamentos atualizados com sucesso! 🎯', 'success');
            }

            const modal = document.getElementById('tonuBudgetModal');
            if (modal) modal.remove();

            if (this.currentSaveCallback) {
                this.currentSaveCallback();
            }
        }
    }

    // ==========================================================================
    // 2. PROJEÇÃO DE FLUXO DE CAIXA (TonuCashFlow)
    // ==========================================================================
    class TonuCashFlowManager {
        calculateProjection(currentBalance, transactions, bills, daysAhead = 30) {
            const today = new Date();
            const dailyPoints = [];
            let runningBalance = currentBalance;

            for (let i = 0; i <= daysAhead; i++) {
                const targetDate = new Date(today);
                targetDate.setDate(today.getDate() + i);
                const dateStr = targetDate.toISOString().split('T')[0];

                const dayBills = bills.filter(b => b.due_date === dateStr && !b.paid);
                let dayIncome = 0;
                let dayExpense = 0;

                dayBills.forEach(b => {
                    if (b.type === 'income') dayIncome += Number(b.amount || 0);
                    else dayExpense += Number(b.amount || 0);
                });

                if (i > 0) {
                    runningBalance = runningBalance + dayIncome - dayExpense;
                }

                dailyPoints.push({
                    date: dateStr,
                    dayLabel: `${targetDate.getDate()}/${targetDate.getMonth() + 1}`,
                    balance: runningBalance,
                    dayIncome,
                    dayExpense,
                    isNegative: runningBalance < 0
                });
            }

            const minBalancePoint = dailyPoints.reduce((min, p) => p.balance < min.balance ? p : min, dailyPoints[0]);
            const finalBalance = dailyPoints[dailyPoints.length - 1].balance;

            return {
                dailyPoints,
                currentBalance,
                finalBalance,
                minBalance: minBalancePoint.balance,
                minBalanceDate: minBalancePoint.date,
                hasNegativeRisk: dailyPoints.some(p => p.balance < 0)
            };
        }

        showCashFlowModal(currentBalance, transactions, bills) {
            let modal = document.getElementById('tonuCashFlowModal');
            if (modal) modal.remove();

            const projection = this.calculateProjection(currentBalance, transactions, bills, 30);

            const modalHtml = `
            <div id="tonuCashFlowModal" style="position:fixed; inset:0; background:rgba(15,23,42,0.8); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(6px); font-family:'Inter',sans-serif;">
                <div style="background:#ffffff; border-radius:20px; max-width:700px; width:100%; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 25px 50px -12px rgba(0,0,0,0.3); border:1px solid #e2e8f0; overflow:hidden;">
                    
                    <div style="padding:20px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0 0 4px 0;">
                                <i class="fas fa-chart-line" style="color:#0984e3; margin-right:8px;"></i> Projeção de Fluxo de Caixa (30 Dias)
                            </h3>
                            <p style="font-size:12px; color:#64748b; margin:0;">Simulação de saldo futuro considerando contas a vencer e receitas previstas.</p>
                        </div>
                        <button onclick="document.getElementById('tonuCashFlowModal').remove()" style="background:none; border:none; font-size:22px; cursor:pointer; color:#94a3b8;">&times;</button>
                    </div>

                    <div style="padding:16px 24px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:grid; grid-template-columns:repeat(3, 1fr); gap:12px;">
                        <div style="background:#ffffff; padding:12px 14px; border-radius:12px; border:1px solid #e2e8f0;">
                            <div style="font-size:11px; color:#64748b; margin-bottom:2px;">Saldo Atual</div>
                            <div style="font-size:16px; font-weight:700; color:#0f172a;">${window.formatCurrency ? window.formatCurrency(projection.currentBalance) : 'R$ ' + projection.currentBalance.toFixed(2)}</div>
                        </div>
                        <div style="background:#ffffff; padding:12px 14px; border-radius:12px; border:1px solid #e2e8f0;">
                            <div style="font-size:11px; color:#64748b; margin-bottom:2px;">Saldo em 30 Dias</div>
                            <div style="font-size:16px; font-weight:700; color:${projection.finalBalance >= 0 ? '#00b894' : '#ff7675'};">
                                ${window.formatCurrency ? window.formatCurrency(projection.finalBalance) : 'R$ ' + projection.finalBalance.toFixed(2)}
                            </div>
                        </div>
                        <div style="background:#ffffff; padding:12px 14px; border-radius:12px; border:1px solid #e2e8f0;">
                            <div style="font-size:11px; color:#64748b; margin-bottom:2px;">Menor Saldo Previsto</div>
                            <div style="font-size:16px; font-weight:700; color:${projection.minBalance >= 0 ? '#0984e3' : '#e17055'};">
                                ${window.formatCurrency ? window.formatCurrency(projection.minBalance) : 'R$ ' + projection.minBalance.toFixed(2)}
                            </div>
                        </div>
                    </div>

                    ${projection.hasNegativeRisk ? `
                    <div style="margin:12px 24px 0 24px; padding:10px 14px; background:#fdeaea; border-left:4px solid #ff7675; border-radius:8px; font-size:12px; color:#c0392b;">
                        <strong>⚠️ Alerta de Saldo Negativo:</strong> Suas contas programadas ultrapassam o saldo em alguns dias. Considere antecipar receitas ou renegociar vencimentos.
                    </div>
                    ` : ''}

                    <div style="flex:1; overflow-y:auto; padding:16px 24px; max-height:360px;">
                        <h4 style="font-size:13px; font-weight:700; color:#0f172a; margin-bottom:10px;">Evolução Prevista Dia a Dia</h4>
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            ${projection.dailyPoints.filter((p, i) => i === 0 || p.dayIncome > 0 || p.dayExpense > 0 || i === projection.dailyPoints.length - 1).map(p => `
                                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; font-size:12px;">
                                    <span style="font-weight:600; color:#0f172a; width:80px;">${p.dayLabel}</span>
                                    <div style="flex:1; display:flex; gap:12px; font-size:11px;">
                                        ${p.dayIncome > 0 ? `<span style="color:#00b894;">+ ${window.formatCurrency ? window.formatCurrency(p.dayIncome) : p.dayIncome}</span>` : ''}
                                        ${p.dayExpense > 0 ? `<span style="color:#ff7675;">- ${window.formatCurrency ? window.formatCurrency(p.dayExpense) : p.dayExpense}</span>` : ''}
                                    </div>
                                    <span style="font-weight:700; color:${p.balance >= 0 ? '#0f172a' : '#ff7675'};">
                                        Saldo: ${window.formatCurrency ? window.formatCurrency(p.balance) : 'R$ ' + p.balance.toFixed(2)}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div style="padding:14px 24px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; background:#f8fafc;">
                        <button class="btn btn-outline btn-sm" onclick="document.getElementById('tonuCashFlowModal').remove()">Fechar</button>
                    </div>
                </div>
            </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
    }

    // ==========================================================================
    // 3. RESUMO SEMANAL E RELATÓRIOS (TonuWeeklyReport)
    // ==========================================================================
    class TonuWeeklyReportManager {
        async generateWeeklyData() {
            if (!window.supabaseClient) throw new Error('Cliente Supabase indisponível.');

            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) throw new Error('Usuário não autenticado.');

            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];

            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(now.getDate() - 6);
            sevenDaysAgo.setHours(0, 0, 0, 0);
            const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

            const fourteenDaysAgo = new Date(now);
            fourteenDaysAgo.setDate(now.getDate() - 13);
            fourteenDaysAgo.setHours(0, 0, 0, 0);
            const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0];

            const { data: transactions, error } = await supabaseClient
                .from('transactions')
                .select('*')
                .eq('user_id', user.id)
                .gte('date', fourteenDaysAgoStr)
                .lte('date', todayStr)
                .order('date', { ascending: false });

            if (error) throw error;

            const { data: categories } = await supabaseClient
                .from('categories')
                .select('*')
                .eq('user_id', user.id);

            const catMap = {};
            (categories || []).forEach(c => { catMap[c.id] = c; });

            const in7Days = new Date(now);
            in7Days.setDate(now.getDate() + 7);
            const in7DaysStr = in7Days.toISOString().split('T')[0];

            const { data: upcomingBills } = await supabaseClient
                .from('bills')
                .select('*')
                .eq('user_id', user.id)
                .eq('paid', false)
                .gte('due_date', todayStr)
                .lte('due_date', in7DaysStr)
                .order('due_date', { ascending: true });

            let currentWeekExpenses = 0;
            let currentWeekIncome = 0;
            let previousWeekExpenses = 0;
            let previousWeekIncome = 0;

            const categoryTotals = {};
            const dailyExpenses = {};

            for (let i = 0; i < 7; i++) {
                const d = new Date(sevenDaysAgo);
                d.setDate(sevenDaysAgo.getDate() + i);
                const key = d.toISOString().split('T')[0];
                dailyExpenses[key] = 0;
            }

            (transactions || []).forEach(t => {
                const tDate = t.date;
                const amt = parseFloat(t.amount) || 0;

                if (tDate >= sevenDaysAgoStr) {
                    if (t.type === 'expense') {
                        currentWeekExpenses += amt;
                        dailyExpenses[tDate] = (dailyExpenses[tDate] || 0) + amt;

                        const cat = catMap[t.category_id] ? catMap[t.category_id].name : (t.category || 'Outros');
                        categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
                    } else if (t.type === 'income') {
                        currentWeekIncome += amt;
                    }
                } else if (tDate >= fourteenDaysAgoStr) {
                    if (t.type === 'expense') {
                        previousWeekExpenses += amt;
                    } else if (t.type === 'income') {
                        previousWeekIncome += amt;
                    }
                }
            });

            let expenseDiffPercent = 0;
            if (previousWeekExpenses > 0) {
                expenseDiffPercent = ((currentWeekExpenses - previousWeekExpenses) / previousWeekExpenses) * 100;
            }

            const topCategories = Object.entries(categoryTotals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([name, total]) => ({
                    name,
                    total,
                    percent: currentWeekExpenses > 0 ? (total / currentWeekExpenses) * 100 : 0
                }));

            return {
                userEmail: user.email,
                userName: user.user_metadata?.full_name || user.email.split('@')[0],
                startDate: sevenDaysAgoStr,
                endDate: todayStr,
                currentWeekExpenses,
                currentWeekIncome,
                netBalance: currentWeekIncome - currentWeekExpenses,
                previousWeekExpenses,
                expenseDiffPercent,
                topCategories,
                dailyExpenses,
                upcomingBills: upcomingBills || []
            };
        }

        async showWeeklySummaryModal() {
            try {
                if (typeof showToast === 'function') showToast('📊 Calculando resumo semanal...', 'info');
                const data = await this.generateWeeklyData();
                this.renderModal(data);
            } catch (e) {
                console.error('❌ Erro ao gerar resumo semanal:', e);
                if (typeof showToast === 'function') showToast('Erro ao carregar resumo semanal.', 'error');
            }
        }

        renderModal(data) {
            let existingModal = document.getElementById('weeklySummaryModal');
            if (existingModal) existingModal.remove();

            const fmt = (val) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const isEconomy = data.expenseDiffPercent <= 0;
            const diffIcon = isEconomy ? 'fa-arrow-down' : 'fa-arrow-up';
            const diffText = Math.abs(data.expenseDiffPercent).toFixed(1) + '% em relação à semana anterior';

            let topCatsHtml = '';
            data.topCategories.forEach(cat => {
                topCatsHtml += `
                    <div style="margin-bottom: 8px;">
                        <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600; margin-bottom:3px;">
                            <span>${cat.name}</span>
                            <span>${fmt(cat.total)} (${cat.percent.toFixed(0)}%)</span>
                        </div>
                        <div style="height:6px; background:#f1f5f9; border-radius:4px; overflow:hidden;">
                            <div style="height:100%; width:${cat.percent}%; background:#6c5ce7; border-radius:4px;"></div>
                        </div>
                    </div>
                `;
            });

            if (!topCatsHtml) {
                topCatsHtml = '<p style="font-size:13px; color:#94a3b8;">Nenhum gasto registrado nesta semana.</p>';
            }

            let billsHtml = '';
            if (data.upcomingBills.length > 0) {
                data.upcomingBills.forEach(b => {
                    const dateFormatted = b.due_date ? b.due_date.split('-').reverse().join('/') : '';
                    billsHtml += `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#fff8e6; border:1px solid #ffeaa7; border-radius:8px; margin-bottom:6px; font-size:13px;">
                            <div>
                                <strong>${b.description || b.name}</strong>
                                <span style="font-size:11px; color:#d63031; display:block;">Vence em ${dateFormatted}</span>
                            </div>
                            <span style="font-weight:700; color:#d63031;">${fmt(b.amount)}</span>
                        </div>
                    `;
                });
            } else {
                billsHtml = '<p style="font-size:13px; color:#00b894; margin:0;"><i class="fas fa-check-circle"></i> Nenhuma conta pendente para os próximos 7 dias!</p>';
            }

            const modalHtml = `
            <div id="weeklySummaryModal" style="position:fixed; inset:0; background:rgba(15,23,42,0.65); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(4px);">
                <div style="background:#ffffff; border-radius:18px; max-width:540px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 20px 40px rgba(0,0,0,0.25); border:1px solid #e2e8f0; animation:slideUp 0.3s ease;">
                    <div style="padding:20px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; background:linear-gradient(135deg, #f8fafc, #f1f5f9); border-radius:18px 18px 0 0;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:40px; height:40px; border-radius:10px; background:#6c5ce7; color:white; display:flex; align-items:center; justify-content:center; font-size:18px;">
                                <i class="fas fa-envelope-open-text"></i>
                            </div>
                            <div>
                                <h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">Resumo Semanal de Gastos</h3>
                                <p style="margin:2px 0 0 0; font-size:12px; color:#64748b;">Relatório consolidado dos últimos 7 dias</p>
                            </div>
                        </div>
                        <button onclick="document.getElementById('weeklySummaryModal').remove()" style="background:none; border:none; font-size:20px; color:#94a3b8; cursor:pointer;">&times;</button>
                    </div>

                    <div style="padding:20px; display:flex; flex-direction:column; gap:16px;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                            <div style="background:#fff5f5; border:1px solid #fed7d7; border-radius:12px; padding:12px;">
                                <span style="font-size:11px; font-weight:700; color:#c53030; text-transform:uppercase;">Total de Despesas</span>
                                <div style="font-size:20px; font-weight:800; color:#e53e3e; margin-top:4px;">${fmt(data.currentWeekExpenses)}</div>
                                <div style="font-size:11px; color:#742a2a; margin-top:4px; display:flex; align-items:center; gap:4px;">
                                    <i class="fas ${diffIcon}"></i> ${diffText}
                                </div>
                            </div>
                            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:12px;">
                                <span style="font-size:11px; font-weight:700; color:#15803d; text-transform:uppercase;">Total de Receitas</span>
                                <div style="font-size:20px; font-weight:800; color:#16a34a; margin-top:4px;">${fmt(data.currentWeekIncome)}</div>
                                <div style="font-size:11px; color:#166534; margin-top:4px;">
                                    Saldo: <strong>${fmt(data.netBalance)}</strong>
                                </div>
                            </div>
                        </div>

                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
                            <h4 style="margin:0 0 10px 0; font-size:13px; font-weight:700; color:#334155;"><i class="fas fa-chart-pie" style="color:#6c5ce7;"></i> Maiores Gastos por Categoria</h4>
                            ${topCatsHtml}
                        </div>

                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
                            <h4 style="margin:0 0 10px 0; font-size:13px; font-weight:700; color:#334155;"><i class="fas fa-calendar-check" style="color:#e67e22;"></i> Contas a Vencer nos Próximos 7 Dias</h4>
                            ${billsHtml}
                        </div>
                    </div>

                    <div style="padding:16px 20px; border-top:1px solid #f1f5f9; display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; background:#f8fafc; border-radius:0 0 18px 18px;">
                        <button class="btn btn-outline btn-sm" onclick="TonuWeeklyReport.copyWeeklySummary()">
                            <i class="fas fa-copy"></i> Copiar Texto
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="TonuWeeklyReport.sendWeeklyEmail()">
                            <i class="fas fa-paper-plane"></i> Enviar por E-mail
                        </button>
                    </div>
                </div>
            </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        formatTextSummary(data) {
            const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            let text = `📊 *RESUMO SEMANAL TONUCONTROLE*\n`;
            text += `📅 Período: ${data.startDate.split('-').reverse().join('/')} a ${data.endDate.split('-').reverse().join('/')}\n\n`;
            text += `💸 Despesas da semana: ${fmt(data.currentWeekExpenses)}\n`;
            text += `💰 Receitas da semana: ${fmt(data.currentWeekIncome)}\n`;
            text += `⚖️ Saldo líquido: ${fmt(data.netBalance)}\n\n`;

            if (data.topCategories.length > 0) {
                text += `🏆 *Maiores Categorias:*\n`;
                data.topCategories.forEach(c => {
                    text += `• ${c.name}: ${fmt(c.total)} (${c.percent.toFixed(0)}%)\n`;
                });
                text += `\n`;
            }

            if (data.upcomingBills.length > 0) {
                text += `🔔 *Contas a vencer nos próximos 7 dias:*\n`;
                data.upcomingBills.forEach(b => {
                    const dt = b.due_date ? b.due_date.split('-').reverse().join('/') : '';
                    text += `• ${b.description || b.name} - ${fmt(b.amount)} (Vence: ${dt})\n`;
                });
            } else {
                text += `✅ Nenhuma conta a vencer nos próximos 7 dias!\n`;
            }

            text += `\nGerado automaticamente pelo TonuControle.`;
            return text;
        }

        async copyWeeklySummary() {
            try {
                const data = await this.generateWeeklyData();
                const text = this.formatTextSummary(data);
                await navigator.clipboard.writeText(text);
                if (typeof showToast === 'function') showToast('Resumo copiado para a área de transferência! 📋', 'success');
            } catch (err) {
                if (typeof showToast === 'function') showToast('Erro ao copiar resumo.', 'error');
            }
        }

        async sendWeeklyEmail() {
            try {
                const data = await this.generateWeeklyData();
                const subject = encodeURIComponent(`📊 Resumo Semanal TonuControle (${data.startDate.split('-').reverse().join('/')} a ${data.endDate.split('-').reverse().join('/')})`);
                const body = encodeURIComponent(this.formatTextSummary(data));

                window.location.href = `mailto:${data.userEmail}?subject=${subject}&body=${body}`;
                if (typeof showToast === 'function') showToast('Abrindo aplicativo de e-mail... 📧', 'info');
            } catch (err) {
                if (typeof showToast === 'function') showToast('Erro ao preparar e-mail.', 'error');
            }
        }
    }

    // ==========================================================================
    // 4. GERENCIADOR DE CATEGORIAS (TonuCategoryManager)
    // ==========================================================================
    class TonuCategoryManager {
        constructor() {
            this.iconList = [
                'fa-utensils', 'fa-shopping-cart', 'fa-home', 'fa-car', 'fa-heartbeat',
                'fa-gamepad', 'fa-book', 'fa-credit-card', 'fa-money-bill-wave', 'fa-tag',
                'fa-plane', 'fa-coffee', 'fa-film', 'fa-music', 'fa-dumbbell',
                'fa-gift', 'fa-graduation-cap', 'fa-laptop', 'fa-paw', 'fa-shield-alt'
            ];

            this.colorList = [
                '#FF7675', '#FDCB6E', '#00B894', '#0984E3', '#6C5CE7',
                '#E17055', '#E84393', '#00CEC9', '#2D3436', '#636E72'
            ];
        }

        async showManagerModal(onUpdatedCallback) {
            let modal = document.getElementById('tonuCategoriesModal');
            if (modal) modal.remove();

            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (!user) return;

            const { data: categories } = await window.supabaseClient
                .from('categories')
                .select('*')
                .eq('user_id', user.id)
                .order('name');

            const cats = categories || [];

            const modalHtml = `
            <div id="tonuCategoriesModal" style="position:fixed; inset:0; background:rgba(15,23,42,0.8); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(6px); font-family:'Inter',sans-serif;">
                <div style="background:#ffffff; border-radius:20px; max-width:640px; width:100%; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 25px 50px -12px rgba(0,0,0,0.3); border:1px solid #e2e8f0; overflow:hidden;">
                    
                    <div style="padding:20px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0 0 4px 0;">
                                <i class="fas fa-tags" style="color:#6c5ce7; margin-right:8px;"></i> Gerenciar Categorias
                            </h3>
                            <p style="font-size:12px; color:#64748b; margin:0;">Crie ou personalize suas categorias com cores e ícones exclusivos.</p>
                        </div>
                        <button onclick="document.getElementById('tonuCategoriesModal').remove()" style="background:none; border:none; font-size:22px; cursor:pointer; color:#94a3b8;">&times;</button>
                    </div>

                    <div style="padding:14px 24px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:13px; color:#64748b;">${cats.length} categorias cadastradas</span>
                        <button class="btn btn-primary btn-sm" onclick="TonuCategoryManager.showEditModal(null, '${user.id}')">
                            <i class="fas fa-plus"></i> Nova Categoria
                        </button>
                    </div>

                    <div style="flex:1; overflow-y:auto; padding:16px 24px; max-height:420px; display:flex; flex-direction:column; gap:8px;">
                        ${cats.map(c => `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px;">
                                <div style="display:flex; align-items:center; gap:12px;">
                                    <div style="width:36px; height:36px; border-radius:10px; background:${c.color || '#6c5ce7'}; color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:15px;">
                                        <i class="fas ${c.icon || 'fa-tag'}"></i>
                                    </div>
                                    <div>
                                        <strong style="font-size:13px; color:#0f172a;">${c.name}</strong>
                                        <div style="font-size:11px; color:#64748b;">
                                            ${c.type === 'income' ? '🟢 Receita' : '🔴 Despesa'}
                                        </div>
                                    </div>
                                </div>
                                <div style="display:flex; gap:6px;">
                                    <button class="btn btn-ghost btn-icon-sm" onclick="TonuCategoryManager.showEditModal('${c.id}', '${user.id}', '${c.name.replace(/'/g, "\\'")}', '${c.type}', '${c.icon}', '${c.color}')" title="Editar">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-danger btn-icon-sm" onclick="TonuCategoryManager.deleteCategory('${c.id}', '${user.id}')" title="Excluir">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div style="padding:14px 24px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; background:#f8fafc;">
                        <button class="btn btn-outline btn-sm" onclick="document.getElementById('tonuCategoriesModal').remove()">Fechar</button>
                    </div>
                </div>
            </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            this.currentUpdateCallback = onUpdatedCallback;
        }

        static showEditModal(id, userId, name = '', type = 'expense', icon = 'fa-tag', color = '#6c5ce7') {
            let editModal = document.getElementById('categoryEditSubModal');
            if (editModal) editModal.remove();

            const isEdit = !!id;
            const instance = window.TonuCategoryManagerInstance;

            const modalHtml = `
            <div id="categoryEditSubModal" style="position:fixed; inset:0; background:rgba(15,23,42,0.85); z-index:9999999; display:flex; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(6px); font-family:'Inter',sans-serif;">
                <div style="background:#ffffff; border-radius:20px; max-width:440px; width:100%; padding:24px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.3); border:1px solid #e2e8f0;">
                    <h3 style="font-size:17px; font-weight:800; color:#0f172a; margin:0 0 16px 0;">
                        ${isEdit ? 'Editar Categoria' : 'Nova Categoria'}
                    </h3>

                    <div style="display:flex; flex-direction:column; gap:14px;">
                        <div>
                            <label style="font-size:12px; font-weight:600; color:#64748b; display:block; margin-bottom:4px;">Nome da Categoria</label>
                            <input type="text" id="catEditName" value="${name}" placeholder="Ex: Mercado, Viagem..." style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid #cbd5e1; font-size:14px;">
                        </div>

                        <div>
                            <label style="font-size:12px; font-weight:600; color:#64748b; display:block; margin-bottom:4px;">Tipo</label>
                            <select id="catEditType" style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid #cbd5e1; font-size:14px;">
                                <option value="expense" ${type === 'expense' ? 'selected' : ''}>🔴 Despesa</option>
                                <option value="income" ${type === 'income' ? 'selected' : ''}>🟢 Receita</option>
                            </select>
                        </div>

                        <div>
                            <label style="font-size:12px; font-weight:600; color:#64748b; display:block; margin-bottom:6px;">Escolha a Cor</label>
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                ${instance.colorList.map(c => `
                                    <span onclick="document.querySelectorAll('.cat-color-choice').forEach(e=>e.style.outline='none'); this.style.outline='3px solid #0f172a'; document.getElementById('catEditSelectedColor').value='${c}';" class="cat-color-choice" style="width:28px; height:28px; border-radius:50%; background:${c}; cursor:pointer; display:inline-block; ${c === color ? 'outline:3px solid #0f172a;' : ''}"></span>
                                `).join('')}
                            </div>
                            <input type="hidden" id="catEditSelectedColor" value="${color}">
                        </div>

                        <div>
                            <label style="font-size:12px; font-weight:600; color:#64748b; display:block; margin-bottom:6px;">Escolha o Ícone</label>
                            <div style="display:flex; gap:8px; flex-wrap:wrap; max-height:100px; overflow-y:auto; padding:4px;">
                                ${instance.iconList.map(ic => `
                                    <button type="button" onclick="document.querySelectorAll('.cat-icon-choice').forEach(e=>e.style.borderColor='#cbd5e1'); this.style.borderColor='#6c5ce7'; this.style.background='#f0edff'; document.getElementById('catEditSelectedIcon').value='${ic}';" class="cat-icon-choice" style="width:34px; height:34px; border-radius:8px; border:1px solid ${ic === icon ? '#6c5ce7' : '#cbd5e1'}; background:${ic === icon ? '#f0edff' : '#ffffff'}; color:#0f172a; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px;">
                                        <i class="fas ${ic}"></i>
                                    </button>
                                `).join('')}
                            </div>
                            <input type="hidden" id="catEditSelectedIcon" value="${icon}">
                        </div>
                    </div>

                    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                        <button class="btn btn-outline btn-sm" onclick="document.getElementById('categoryEditSubModal').remove()">Cancelar</button>
                        <button class="btn btn-primary btn-sm" onclick="TonuCategoryManager.saveCategory('${id || ''}', '${userId}')">
                            <i class="fas fa-save"></i> Salvar
                        </button>
                    </div>
                </div>
            </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        static async saveCategory(id, userId) {
            const name = document.getElementById('catEditName')?.value?.trim();
            const type = document.getElementById('catEditType')?.value || 'expense';
            const color = document.getElementById('catEditSelectedColor')?.value || '#6c5ce7';
            const icon = document.getElementById('catEditSelectedIcon')?.value || 'fa-tag';

            if (!name) {
                if (window.showToast) window.showToast('Digite um nome para a categoria.', 'warning');
                return;
            }

            try {
                if (id) {
                    await window.supabaseClient
                        .from('categories')
                        .update({ name, type, color, icon })
                        .eq('id', id)
                        .eq('user_id', userId);
                } else {
                    await window.supabaseClient
                        .from('categories')
                        .insert([{ user_id: userId, name, type, color, icon }]);
                }

                if (window.showToast) {
                    window.showToast(`Categoria ${id ? 'atualizada' : 'criada'} com sucesso! 🎉`, 'success');
                }

                document.getElementById('categoryEditSubModal')?.remove();
                window.TonuCategoryManagerInstance.showManagerModal(window.TonuCategoryManagerInstance.currentUpdateCallback);

                if (window.TonuCategoryManagerInstance.currentUpdateCallback) {
                    window.TonuCategoryManagerInstance.currentUpdateCallback();
                }
            } catch (e) {
                console.error('❌ Erro ao salvar categoria:', e);
                if (window.showToast) window.showToast('Erro ao salvar categoria.', 'error');
            }
        }

        static async deleteCategory(id, userId) {
            if (!confirm('Excluir esta categoria?')) return;

            try {
                await window.supabaseClient
                    .from('categories')
                    .delete()
                    .eq('id', id)
                    .eq('user_id', userId);

                if (window.showToast) window.showToast('Categoria excluída! 🗑️', 'success');
                window.TonuCategoryManagerInstance.showManagerModal(window.TonuCategoryManagerInstance.currentUpdateCallback);

                if (window.TonuCategoryManagerInstance.currentUpdateCallback) {
                    window.TonuCategoryManagerInstance.currentUpdateCallback();
                }
            } catch (e) {
                console.error('❌ Erro ao deletar categoria:', e);
            }
        }
    }

    // ==========================================================================
    // 5. IMPORTADOR BANCÁRIO (TonuBankImporter)
    // ==========================================================================
    class TonuBankImporter {
        constructor() {
            this.parsedTransactions = [];
        }

        selectAndImportFile(onSuccessCallback) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv, .ofx, .txt';
            input.style.display = 'none';

            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const fileName = file.name.toLowerCase();
                const text = await file.text();

                if (fileName.endsWith('.ofx')) {
                    this.parseOFX(text);
                } else {
                    this.parseCSV(text);
                }

                if (this.parsedTransactions.length === 0) {
                    if (window.showToast) window.showToast('Nenhuma transação válida encontrada no arquivo.', 'warning');
                    return;
                }

                this.showImportPreviewModal(file.name, onSuccessCallback);
            };

            document.body.appendChild(input);
            input.click();
            setTimeout(() => input.remove(), 1000);
        }

        parseOFX(ofxText) {
            this.parsedTransactions = [];
            const regex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
            let match;

            while ((match = regex.exec(ofxText)) !== null) {
                const block = match[1];
                const dateMatch = /<DTPOSTED>(\d{4})(\d{2})(\d{2})/i.exec(block);
                const amountMatch = /<TRNAMT>([\d\.\-]+)/i.exec(block);
                const memoMatch = /<MEMO>(.*)/i.exec(block);
                const nameMatch = /<NAME>(.*)/i.exec(block);

                if (dateMatch && amountMatch) {
                    const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
                    const rawAmount = parseFloat(amountMatch[1].replace(',', '.'));
                    const description = (nameMatch ? nameMatch[1].trim() : (memoMatch ? memoMatch[1].trim() : 'Transação Importada'));

                    const isIncome = rawAmount > 0;
                    const amount = Math.abs(rawAmount);

                    this.parsedTransactions.push({
                        date: date,
                        description: this.cleanDescription(description),
                        amount: amount,
                        type: isIncome ? 'income' : 'expense',
                        selected: true
                    });
                }
            }
        }

        parseCSV(csvText) {
            this.parsedTransactions = [];
            const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
            if (lines.length < 2) return;

            const firstLine = lines[0];
            const delimiter = firstLine.includes(';') ? ';' : ',';
            const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/["']/g, ''));

            let dateIdx = headers.findIndex(h => h.includes('data') || h.includes('date'));
            let descIdx = headers.findIndex(h => h.includes('desc') || h.includes('título') || h.includes('historico') || h.includes('memo') || h.includes('estabelecimento'));
            let amountIdx = headers.findIndex(h => h.includes('valor') || h.includes('amount') || h.includes('val'));

            if (dateIdx === -1) dateIdx = 0;
            if (descIdx === -1) descIdx = 1;
            if (amountIdx === -1) amountIdx = 2;

            for (let i = 1; i < lines.length; i++) {
                const row = this.parseCSVLine(lines[i], delimiter);
                if (row.length <= Math.max(dateIdx, descIdx, amountIdx)) continue;

                let rawDate = row[dateIdx]?.trim().replace(/["']/g, '');
                let description = row[descIdx]?.trim().replace(/["']/g, '') || 'Lançamento Importado';
                let rawAmountStr = row[amountIdx]?.trim().replace(/["'R$\s]/g, '');

                if (!rawDate || !rawAmountStr) continue;

                let formattedDate = rawDate;
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
                    const parts = rawDate.split('/');
                    formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                } else if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
                    formattedDate = rawDate.substring(0, 10);
                }

                let numAmount;
                if (rawAmountStr.includes(',') && rawAmountStr.includes('.')) {
                    rawAmountStr = rawAmountStr.replace(/\./g, '').replace(',', '.');
                } else if (rawAmountStr.includes(',')) {
                    rawAmountStr = rawAmountStr.replace(',', '.');
                }

                numAmount = parseFloat(rawAmountStr);
                if (isNaN(numAmount)) continue;

                const isIncome = numAmount > 0;
                const amount = Math.abs(numAmount);

                this.parsedTransactions.push({
                    date: formattedDate,
                    description: this.cleanDescription(description),
                    amount: amount,
                    type: isIncome ? 'income' : 'expense',
                    selected: true
                });
            }
        }

        parseCSVLine(text, delimiter) {
            const pattern = new RegExp(
                `(\\s*"((?:[^"]|"")*)"\\s*|\\s*([^"${delimiter}]*)\\s*)(${delimiter}|$)`,
                'g'
            );
            const matches = [];
            let match;
            while ((match = pattern.exec(text)) !== null) {
                let value = match[2] !== undefined ? match[2].replace(/""/g, '"') : match[3];
                matches.push(value);
                if (match[4] === '') break;
            }
            return matches;
        }

        cleanDescription(desc) {
            if (!desc) return 'Transação';
            return desc.replace(/[\n\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        }

        showImportPreviewModal(fileName, onSuccessCallback) {
            let modal = document.getElementById('importPreviewModal');
            if (modal) modal.remove();

            const total = this.parsedTransactions.length;
            const totalExpense = this.parsedTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
            const totalIncome = this.parsedTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);

            const modalHtml = `
            <div id="importPreviewModal" style="position:fixed; inset:0; background:rgba(15,23,42,0.8); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(6px); font-family:'Inter',sans-serif;">
                <div style="background:#ffffff; border-radius:20px; max-width:680px; width:100%; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 25px 50px -12px rgba(0,0,0,0.3); border:1px solid #e2e8f0; overflow:hidden;">
                    
                    <div style="padding:20px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0 0 4px 0;">
                                <i class="fas fa-file-import" style="color:#6c5ce7; margin-right:8px;"></i> Importar Extrato Bancário
                            </h3>
                            <p style="font-size:12px; color:#64748b; margin:0;">Arquivo: <strong>${fileName}</strong> (${total} transações identificadas)</p>
                        </div>
                        <button onclick="document.getElementById('importPreviewModal').remove()" style="background:none; border:none; font-size:22px; cursor:pointer; color:#94a3b8;">&times;</button>
                    </div>

                    <div style="padding:12px 24px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; gap:16px; font-size:13px;">
                        <span style="color:#00b894; font-weight:600;"><i class="fas fa-arrow-down"></i> Entradas: ${window.formatCurrency ? window.formatCurrency(totalIncome) : 'R$ ' + totalIncome.toFixed(2)}</span>
                        <span style="color:#ff7675; font-weight:600;"><i class="fas fa-arrow-up"></i> Saídas: ${window.formatCurrency ? window.formatCurrency(totalExpense) : 'R$ ' + totalExpense.toFixed(2)}</span>
                    </div>

                    <div style="flex:1; overflow-y:auto; padding:16px 24px; max-height:400px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:12px;">
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                <input type="checkbox" id="selectAllImports" checked onchange="TonuBankImporter.toggleSelectAll(this.checked)">
                                <strong>Selecionar todas</strong>
                            </label>
                        </div>
                        <div id="importListContainer" style="display:flex; flex-direction:column; gap:8px;">
                            ${this.parsedTransactions.map((t, idx) => `
                                <div style="display:flex; align-items:center; gap:12px; padding:10px 14px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px;">
                                    <input type="checkbox" data-idx="${idx}" ${t.selected ? 'checked' : ''} onchange="TonuBankImporter.toggleItem(${idx}, this.checked)">
                                    <div style="flex:1;">
                                        <div style="font-weight:600; font-size:13px; color:#0f172a;">${t.description}</div>
                                        <div style="font-size:11px; color:#64748b;">${t.date}</div>
                                    </div>
                                    <div style="font-weight:700; font-size:14px; color:${t.type === 'income' ? '#00b894' : '#ff7675'};">
                                        ${t.type === 'income' ? '+' : '-'} ${window.formatCurrency ? window.formatCurrency(t.amount) : 'R$ ' + t.amount.toFixed(2)}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div style="padding:16px 24px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:12px; background:#f8fafc;">
                        <button class="btn btn-outline btn-sm" onclick="document.getElementById('importPreviewModal').remove()">Cancelar</button>
                        <button class="btn btn-primary btn-sm" id="btnConfirmImport" onclick="TonuBankImporter.executeImport()">
                            <i class="fas fa-check"></i> Confirmar e Salvar Transações
                        </button>
                    </div>
                </div>
            </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            this.currentSuccessCallback = onSuccessCallback;
        }

        static toggleSelectAll(checked) {
            const checkboxes = document.querySelectorAll('#importListContainer input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = checked;
                const idx = parseInt(cb.getAttribute('data-idx'), 10);
                if (window.TonuBankImporterInstance.parsedTransactions[idx]) {
                    window.TonuBankImporterInstance.parsedTransactions[idx].selected = checked;
                }
            });
        }

        static toggleItem(idx, checked) {
            if (window.TonuBankImporterInstance.parsedTransactions[idx]) {
                window.TonuBankImporterInstance.parsedTransactions[idx].selected = checked;
            }
        }

        static async executeImport() {
            const instance = window.TonuBankImporterInstance;
            const toImport = instance.parsedTransactions.filter(t => t.selected);

            if (toImport.length === 0) {
                if (window.showToast) window.showToast('Nenhuma transação selecionada para importação.', 'warning');
                return;
            }

            const btn = document.getElementById('btnConfirmImport');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...';
            }

            try {
                const { data: { user } } = await window.supabaseClient.auth.getUser();
                if (!user) throw new Error('Usuário não autenticado.');

                let defaultCatId = null;
                const { data: cats } = await window.supabaseClient
                    .from('categories')
                    .select('id')
                    .eq('user_id', user.id)
                    .limit(1);

                if (cats && cats.length > 0) {
                    defaultCatId = cats[0].id;
                }

                const records = toImport.map(t => ({
                    user_id: user.id,
                    description: t.description,
                    amount: t.amount,
                    type: t.type,
                    date: t.date,
                    paid: true,
                    category_id: defaultCatId
                }));

                const { error } = await window.supabaseClient
                    .from('transactions')
                    .insert(records);

                if (error) throw error;

                if (window.showToast) {
                    window.showToast(`🎉 ${toImport.length} transações importadas com sucesso!`, 'success');
                }

                const modal = document.getElementById('importPreviewModal');
                if (modal) modal.remove();

                if (instance.currentSuccessCallback) {
                    instance.currentSuccessCallback();
                } else if (window.loadTransactions) {
                    window.loadTransactions();
                }

            } catch (err) {
                console.error('❌ Erro na importação:', err);
                if (window.showToast) window.showToast('Erro ao salvar transações importadas.', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-check"></i> Tentar Novamente';
                }
            }
        }
    }

    // ==========================================================================
    // 6. BACKUP INTEGRAL JSON (TonuBackup)
    // ==========================================================================
    class TonuBackupManager {
        async exportFullJsonBackup() {
            try {
                if (window.showToast) window.showToast('Gerando backup completo dos dados...', 'info');

                const { data: { user } } = await window.supabaseClient.auth.getUser();
                if (!user) throw new Error('Usuário não autenticado');

                const [
                    { data: profile },
                    { data: categories },
                    { data: transactions },
                    { data: bills },
                    { data: goals },
                    { data: investments }
                ] = await Promise.all([
                    window.supabaseClient.from('profiles').select('*').eq('id', user.id).single(),
                    window.supabaseClient.from('categories').select('*').eq('user_id', user.id),
                    window.supabaseClient.from('transactions').select('*').eq('user_id', user.id),
                    window.supabaseClient.from('bills').select('*').eq('user_id', user.id),
                    window.supabaseClient.from('goals').select('*').eq('user_id', user.id),
                    window.supabaseClient.from('investments').select('*').eq('user_id', user.id)
                ]);

                const budgets = localStorage.getItem('tonu_budget_limits_' + user.id) || '{}';

                const backupData = {
                    version: '2.0.0',
                    appName: 'TonuControle',
                    exportedAt: new Date().toISOString(),
                    user: {
                        id: user.id,
                        email: user.email
                    },
                    profile: profile || null,
                    budgets: JSON.parse(budgets),
                    categories: categories || [],
                    transactions: transactions || [],
                    bills: bills || [],
                    goals: goals || [],
                    investments: investments || []
                };

                const jsonStr = JSON.stringify(backupData, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const dateStr = new Date().toISOString().split('T')[0];
                a.href = url;
                a.download = `tonucontrole-backup-${dateStr}.json`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    a.remove();
                    URL.revokeObjectURL(url);
                }, 1000);

                if (window.showToast) {
                    window.showToast('Backup JSON exportado com sucesso! 📦', 'success');
                }
            } catch (err) {
                console.error('❌ Erro ao exportar backup:', err);
                if (window.showToast) window.showToast('Erro ao exportar backup.', 'error');
            }
        }

        exportFullBackup() {
            return this.exportFullJsonBackup();
        }

        selectAndRestoreBackup(onSuccessCallback) {
            return this.importFullJsonBackup(onSuccessCallback);
        }

        importFullJsonBackup(onSuccessCallback) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json, application/json';
            input.style.display = 'none';

            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const data = JSON.parse(text);

                    if (!data.appName || (!data.transactions && !data.categories)) {
                        throw new Error('Arquivo de backup inválido ou incompatível.');
                    }

                    const countTx = (data.transactions || []).length;
                    const countBills = (data.bills || []).length;
                    const countGoals = (data.goals || []).length;

                    const confirmed = confirm(
                        `Deseja restaurar este backup?\n\n` +
                        `• ${countTx} Transações\n` +
                        `• ${countBills} Contas\n` +
                        `• ${countGoals} Metas\n\n` +
                        `Data do backup: ${data.exportedAt ? new Date(data.exportedAt).toLocaleDateString() : 'N/A'}`
                    );

                    if (!confirmed) return;

                    if (window.showToast) window.showToast('Restaurando dados...', 'info');

                    const { data: { user } } = await window.supabaseClient.auth.getUser();
                    if (!user) throw new Error('Usuário não autenticado.');

                    if (data.transactions && data.transactions.length > 0) {
                        const txToInsert = data.transactions.map(t => {
                            const { id, ...rest } = t;
                            return { ...rest, user_id: user.id };
                        });
                        await window.supabaseClient.from('transactions').insert(txToInsert);
                    }

                    if (data.budgets) {
                        localStorage.setItem('tonu_budget_limits_' + user.id, JSON.stringify(data.budgets));
                    }

                    if (window.showToast) {
                        window.showToast('Backup restaurado com sucesso! 🎉', 'success');
                    }

                    setTimeout(() => {
                        if (onSuccessCallback) onSuccessCallback();
                        else window.location.reload();
                    }, 1000);

                } catch (err) {
                    console.error('❌ Erro na importação do backup:', err);
                    if (window.showToast) window.showToast('Falha ao restaurar backup: ' + err.message, 'error');
                }
            };

            document.body.appendChild(input);
            input.click();
            setTimeout(() => input.remove(), 1000);
        }
    }

    // ==========================================================================
    // INSTANCIAÇÃO GLOBAL
    // ==========================================================================
    window.TonuBudget = new TonuBudgetManager();
    window.TonuCashFlow = new TonuCashFlowManager();
    window.TonuWeeklyReport = new TonuWeeklyReportManager();
    window.TonuCategoryManagerInstance = new TonuCategoryManager();
    window.TonuCategoryManager = TonuCategoryManager;
    window.TonuBankImporterInstance = new TonuBankImporter();
    window.TonuBankImporter = TonuBankImporter;
    window.TonuBackupInstance = new TonuBackupManager();
    window.TonuBackup = window.TonuBackupInstance;

    console.log('⚡ TonuControle Financial Intelligence Suite unificada com sucesso!');
})();
