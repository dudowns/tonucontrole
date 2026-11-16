/* ==========================================================================
   TONUCONTROLE - MODULAR MOBILE DASHBOARD COMPONENTS
   Modern Fintech UI Architecture (Light + Deep Slate Dark Mode)
   Zero global scope collision: IIFE exposing window.TonuDashboardComponents
   ========================================================================== */
(function (window, document) {
    'use strict';

    function escapeHtml(val, sanitizeFn) {
        var str = String(val === null || val === undefined ? '' : val);
        if (typeof sanitizeFn === 'function') {
            return sanitizeFn(str);
        }
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function stripEmojis(text) {
        return String(text || '')
            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, '')
            .trim();
    }

    function formatCompactBrl(value) {
        var num = Math.abs(Number(value) || 0);
        if (num >= 1000000) {
            return 'R$ ' + (num / 1000000).toFixed(1).replace('.', ',') + 'M';
        }
        if (num >= 1000) {
            return 'R$ ' + (num / 1000).toFixed(1).replace('.', ',') + 'k';
        }
        return 'R$ ' + Math.round(num);
    }

    function formatShortDayMonth(isoOrDate) {
        var s = String(isoOrDate || '').substring(0, 10);
        var parts = s.split('-');
        if (parts.length === 3 && parts[2] && parts[1]) {
            return parts[2] + '/' + parts[1];
        }
        return '';
    }

    // Paleta vibrante para o Gráfico de Rosca (alinhada ao mockup)
    var DONUT_PALETTE = [
        '#F97316',
        '#2563EB',
        '#7C3AED',
        '#16A34A',
        '#06B6D4',
        '#EC4899',
        '#EAB308',
        '#8B5CF6'
    ];

    /**
     * 1. Header Component
     * Injeta dados dinâmicos do usuário autenticado e estado do mês selecionado.
     * @param {Object} state - { userName, monthLabel, isCurrentMonth, avatarInitial }
     */
    function updateHeader(state) {
        state = state || {};
        var greetingEl = document.getElementById('greetingText');
        if (greetingEl && state.userName) {
            var firstName = String(state.userName).trim().split(/\s+/)[0] || 'Usuário';
            greetingEl.textContent = 'Olá, ' + firstName + '!';
        }

        var monthLabelEl = document.getElementById('selectedMonthLabel');
        var monthBtnEl = document.getElementById('selectedMonth');
        if (state.monthLabel) {
            if (monthLabelEl) {
                monthLabelEl.textContent = state.monthLabel;
            } else if (monthBtnEl) {
                monthBtnEl.textContent = state.monthLabel;
            }
            if (monthBtnEl) {
                monthBtnEl.classList.toggle('is-offset', state.isCurrentMonth === false);
            }
        }

        var avatarEl = document.getElementById('topbarAvatar');
        if (avatarEl && state.avatarInitial) {
            avatarEl.textContent = String(state.avatarInitial).charAt(0).toUpperCase();
        }
    }

    /**
     * 2. HeroCard Component ("Saldo do Mês")
     * Injeta dados dinâmicos calculados a partir das transações pagas do mês:
     * @param {Object} data - { balance, income, expense, pendingBillsAmount, pendingBillsCount, momDeltaPct, isHidden, formatCurrency }
     */
    function renderHeroCard(data) {
        var fmt = data.formatCurrency;
        var mask = function (v) { return data.isHidden ? '••••••' : v; };
        var billsCount = Number(data.pendingBillsCount) || 0;
        var pendingAmt = Number(data.pendingBillsAmount) || 0;

        var momHtml = '';
        if (typeof data.momDeltaPct === 'number' && Number.isFinite(data.momDeltaPct)) {
            var isUp = data.momDeltaPct >= 0;
            var sign = isUp ? '+' : '';
            var formattedPct = sign + data.momDeltaPct.toFixed(1).replace('.', ',') + '%';
            momHtml =
                '<div class="clean-hero-mom ' + (isUp ? 'is-up' : 'is-down') + '" data-sensitive>' +
                    '<span class="clean-hero-mom-pct">' +
                        '<i class="fas ' + (isUp ? 'fa-arrow-trend-up fa-chart-line' : 'fa-arrow-trend-down fa-chart-line') + '" aria-hidden="true"></i> ' +
                        (data.isHidden ? '••••' : formattedPct) +
                    '</span>' +
                    '<span class="clean-hero-mom-label"> vs. mês anterior</span>' +
                '</div>';
        } else {
            momHtml = '<div class="clean-hero-mom is-neutral"><span class="clean-hero-mom-label">Saldo líquido pago no período</span></div>';
        }

        var footerBillsHtml = pendingAmt > 0
            ? '<i class="far fa-calendar-check" aria-hidden="true"></i> Contas a vencer: <strong data-sensitive>' + mask(fmt(pendingAmt)) + '</strong>' +
              (billsCount > 0 ? ' <span>(' + billsCount + ')</span>' : '')
            : '<i class="far fa-calendar-check" aria-hidden="true"></i> Nenhuma conta pendente neste mês';

        return (
            '<section class="clean-hero-card" aria-label="Saldo do Mês">' +
                '<div class="clean-hero-art" aria-hidden="true">' +
                    '<svg viewBox="0 0 120 76" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<rect x="12" y="50" width="12" height="22" rx="3" fill="currentColor" opacity="0.22"/>' +
                        '<rect x="30" y="42" width="12" height="30" rx="3" fill="currentColor" opacity="0.28"/>' +
                        '<rect x="48" y="34" width="12" height="38" rx="3" fill="currentColor" opacity="0.34"/>' +
                        '<rect x="66" y="25" width="12" height="47" rx="3" fill="currentColor" opacity="0.42"/>' +
                        '<rect x="84" y="16" width="12" height="56" rx="3" fill="currentColor" opacity="0.52"/>' +
                        '<path d="M10 47 L46 32 L72 22 L106 8" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.72"/>' +
                        '<path d="M97 6 L108 7 L104 18" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.78"/>' +
                    '</svg>' +
                '</div>' +

                '<div class="clean-hero-top">' +
                    '<span class="clean-hero-label"><i class="fas fa-eye" aria-hidden="true"></i> Saldo do Mês</span>' +
                    '<button type="button" class="clean-hero-eye-btn" data-privacy-toggle data-action="toggle-balance" ' +
                        'title="' + (data.isHidden ? 'Mostrar Saldo' : 'Ocultar Saldo') + '" ' +
                        'aria-label="Alternar visibilidade do saldo">' +
                        '<i class="fas ' + (data.isHidden ? 'fa-eye' : 'fa-eye-slash') + '" data-privacy-icon></i>' +
                    '</button>' +
                '</div>' +

                '<div class="clean-hero-balance tabular-nums" id="heroBalanceVal" data-sensitive>' +
                    mask(fmt(data.balance)) +
                '</div>' +

                momHtml +

                '<div class="clean-hero-columns">' +
                    '<div class="clean-hero-col">' +
                        '<span class="clean-hero-arrow income" aria-hidden="true"><i class="fas fa-arrow-down"></i></span>' +
                        '<div class="clean-hero-col-text">' +
                            '<span class="clean-hero-col-label">Entradas</span>' +
                            '<span class="clean-hero-col-val tabular-nums" id="heroIncomeVal" data-sensitive>' +
                                mask(fmt(data.income)) +
                            '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="clean-hero-col">' +
                        '<span class="clean-hero-arrow expense" aria-hidden="true"><i class="fas fa-arrow-up"></i></span>' +
                        '<div class="clean-hero-col-text">' +
                            '<span class="clean-hero-col-label">Saídas</span>' +
                            '<span class="clean-hero-col-val tabular-nums" id="heroExpenseVal" data-sensitive>' +
                                mask(fmt(data.expense)) +
                            '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                '<div class="clean-hero-footer">' + footerBillsHtml + '</div>' +
            '</section>'
        );
    }

    /**
     * 3. SummaryCards Component (Contas Pendentes & Proventos do Mês)
     * @param {Object} data - { pendingBillsAmount, pendingBillsCount, displayMonthDivs, monthPendingDivs, isHidden, formatCurrency }
     */
    function renderSummaryCards(data) {
        var fmt = data.formatCurrency;
        var mask = function (v) { return data.isHidden ? '••••••' : v; };
        var billsCount = Number(data.pendingBillsCount) || 0;

        return (
            '<section class="clean-summary-grid" aria-label="Resumo do Mês">' +
                '<a href="bills.html" class="clean-summary-card is-bills">' +
                    '<div class="clean-summary-head">' +
                        '<span class="clean-summary-icon warning" aria-hidden="true"><i class="fas fa-bell"></i></span>' +
                        '<span class="clean-summary-label">Contas Pendentes</span>' +
                    '</div>' +
                    '<div class="clean-summary-body">' +
                        '<div class="clean-summary-vals">' +
                            '<div class="clean-summary-value tabular-nums" data-sensitive>' +
                                mask(fmt(data.pendingBillsAmount)) +
                            '</div>' +
                            '<div class="clean-summary-sub">' +
                                (billsCount > 0
                                    ? billsCount + (billsCount === 1 ? ' conta em aberto' : ' contas em aberto')
                                    : 'Sem pendências') +
                            '</div>' +
                        '</div>' +
                        '<span class="clean-summary-arrow warning" aria-hidden="true"><i class="fas fa-arrow-right"></i></span>' +
                    '</div>' +
                '</a>' +
                '<a href="investments.html" class="clean-summary-card is-dividends">' +
                    '<div class="clean-summary-head">' +
                        '<span class="clean-summary-icon income" aria-hidden="true"><i class="fas fa-coins"></i></span>' +
                        '<span class="clean-summary-label">Proventos do Mês</span>' +
                    '</div>' +
                    '<div class="clean-summary-body">' +
                        '<div class="clean-summary-vals">' +
                            '<div class="clean-summary-value tabular-nums" data-sensitive>' +
                                mask(fmt(data.displayMonthDivs)) +
                            '</div>' +
                            '<div class="clean-summary-sub">' +
                                (data.monthPendingDivs > 0
                                    ? '+ ' + mask(fmt(data.monthPendingDivs)) + ' a receber'
                                    : 'Dividendos e JCP') +
                            '</div>' +
                        '</div>' +
                        '<span class="clean-summary-arrow income" aria-hidden="true"><i class="fas fa-arrow-right"></i></span>' +
                    '</div>' +
                '</a>' +
            '</section>'
        );
    }

    /**
     * 4. GoalProgressCard Component ("Minha Meta Principal")
     * @param {Object} data - { goals, cachedEquity, monthlyDividends, selectedYear, isHidden, formatCurrency, sanitizeString }
     */
    function computePrimaryGoalSummary(data) {
        var goals = Array.isArray(data.goals) ? data.goals : [];
        var year = data.selectedYear || new Date().getFullYear();

        if (goals.length === 0) {
            return {
                title: 'Construir meu patrimônio',
                percent: 0,
                current: 0,
                target: 0,
                hasGoals: false
            };
        }

        var activeGoals = goals.filter(function (g) { return !g.completed; });
        var candidates = activeGoals.length > 0 ? activeGoals : goals;

        var primary = candidates.find(function (g) {
            var title = String(g.title || g.name || '');
            var deadline = String(g.deadline || g.target_date || '');
            return title.includes(String(year)) || deadline.startsWith(String(year));
        }) || candidates[0];

        var rawType = String(primary.type || primary.goal_type || primary.category || '').toLowerCase().trim();
        var current = Number(primary.current_amount || primary.current || 0);
        var target = Number(primary.target_amount || primary.target || 0);

        if (rawType === 'wealth' || rawType === 'net_worth' || rawType === 'patrimonio') {
            if (Number(data.cachedEquity) > 0) current = Number(data.cachedEquity);
        } else if (rawType === 'dividends' || rawType === 'proventos') {
            if (Number(data.monthlyDividends) >= 0) current = Number(data.monthlyDividends);
        }

        var pct = 0;
        if (primary.completed) {
            pct = 100;
        } else if (target > 0) {
            pct = Math.max(0, Math.min(100, Math.round((current / target) * 100)));
        }

        var rawTitle = stripEmojis(primary.title || primary.name || ('Meta ' + year));
        var safeTitle = escapeHtml(rawTitle || ('Meta ' + year), data.sanitizeString);

        return {
            title: safeTitle,
            percent: pct,
            current: current,
            target: target,
            hasGoals: true
        };
    }

    function renderGoalProgressCard(data) {
        var summary = computePrimaryGoalSummary(data);
        var fmt = typeof data.formatCurrency === 'function'
            ? data.formatCurrency
            : function (v) { return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','); };
        var mask = function (v) { return data.isHidden ? '••••••' : v; };

        var footerAmounts = summary.hasGoals
            ? '<span class="clean-goal-meta-item" data-sensitive><i class="fas fa-bullseye" aria-hidden="true"></i> ' + mask(fmt(summary.target)) + '</span>' +
              '<span class="clean-goal-meta-sep" aria-hidden="true">|</span>' +
              '<span class="clean-goal-meta-item is-current" data-sensitive>' + mask(fmt(summary.current)) + '</span>'
            : '<span class="clean-goal-meta-item">Toque para definir sua primeira meta</span>';

        return (
            '<a href="goals.html" class="clean-goal-card" aria-label="Minha Meta Principal: ' + summary.title + ' (' + summary.percent + '%)">' +
                '<div class="clean-goal-head">' +
                    '<div class="clean-goal-head-left">' +
                        '<span class="clean-goal-trophy" aria-hidden="true"><i class="fas fa-trophy"></i></span>' +
                        '<div class="clean-goal-headings">' +
                            '<strong class="clean-goal-heading">Minha Meta Principal</strong>' +
                            '<span class="clean-goal-subtitle">' + summary.title + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<span class="clean-goal-action">' +
                        (summary.hasGoals ? 'Ver metas' : 'Criar meta') +
                        ' <i class="fas fa-arrow-right" aria-hidden="true"></i>' +
                    '</span>' +
                '</div>' +

                '<div class="clean-goal-body">' +
                    '<div class="clean-goal-progress-col">' +
                        '<div class="clean-goal-percent-row">' +
                            '<span class="clean-goal-percent tabular-nums">' + summary.percent + '%</span>' +
                            '<div class="clean-goal-track" role="progressbar" aria-valuenow="' + summary.percent + '" aria-valuemin="0" aria-valuemax="100">' +
                                '<div class="clean-goal-fill" data-goal-progress="' + summary.percent + '"></div>' +
                            '</div>' +
                        '</div>' +
                        '<div class="clean-goal-amounts tabular-nums">' + footerAmounts + '</div>' +
                    '</div>' +
                    '<div class="clean-goal-target-art" aria-hidden="true">' +
                        '<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                            '<circle cx="30" cy="34" r="22" fill="#EA580C"/>' +
                            '<circle cx="30" cy="34" r="16" fill="#FFFFFF"/>' +
                            '<circle cx="30" cy="34" r="10.5" fill="#EA580C"/>' +
                            '<circle cx="30" cy="34" r="5" fill="#FACC15"/>' +
                            '<path d="M30 34 L50 14" stroke="#475569" stroke-width="2.5" stroke-linecap="round"/>' +
                            '<path d="M47 11 L53 11 L53 17 L47 17 Z" fill="#F97316"/>' +
                        '</svg>' +
                    '</div>' +
                '</div>' +
            '</a>'
        );
    }

    /**
     * 5. ExpensesDonutChart Component (Compacto com Total ao Centro + Legenda à Direita)
     */
    function buildDonutCategoriesWithPalette(sortedCategories) {
        var list = Array.isArray(sortedCategories) ? sortedCategories : [];
        var topItems = list.slice(0, 4);
        var tailItems = list.slice(4);
        var items = topItems.map(function (item, idx) {
            return {
                id: item.id,
                name: stripEmojis(item.name || 'Categoria') || 'Categoria',
                amount: item.amount,
                paletteColor: item.id === 'outros' ? '#94A3B8' : DONUT_PALETTE[idx % DONUT_PALETTE.length]
            };
        });

        if (tailItems.length > 0) {
            var tailSum = tailItems.reduce(function (s, x) { return s + (Number(x.amount) || 0); }, 0);
            var existingOutros = items.find(function (x) { return x.id === 'outros'; });
            if (existingOutros) {
                existingOutros.amount += tailSum;
            } else if (tailSum > 0) {
                items.push({
                    id: 'outros',
                    name: 'Outros',
                    amount: tailSum,
                    paletteColor: '#94A3B8'
                });
            }
        }
        return items;
    }

    function renderExpensesDonutCard(data) {
        var items = buildDonutCategoriesWithPalette(data.sortedCategories);
        var total = Number(data.totalExpensesAmount) || 0;
        var fmt = data.formatCurrency;
        var mask = function (v) { return data.isHidden ? '••••' : v; };

        if (items.length === 0 || total <= 0) {
            return (
                '<section class="clean-chart-card clean-bento-card" aria-label="Gastos por Categoria">' +
                    '<div class="clean-bento-head">' +
                        '<h2 class="clean-bento-title"><i class="fas fa-chart-pie" aria-hidden="true"></i> Gastos por Categoria</h2>' +
                    '</div>' +
                    '<div class="clean-chart-empty">' +
                        '<i class="fas fa-chart-pie" aria-hidden="true"></i>' +
                        '<span>Sem despesas pagas</span>' +
                    '</div>' +
                '</section>'
            );
        }

        var legendHtml = items.map(function (item) {
            var pct = total > 0 ? Math.round((item.amount / total) * 100) : 0;
            var safeName = escapeHtml(item.name, data.sanitizeString);
            return (
                '<li class="clean-legend-item">' +
                    '<span class="clean-legend-dot" data-dot-color="' + item.paletteColor + '"></span>' +
                    '<span class="clean-legend-name">' + safeName + '</span>' +
                    '<span class="clean-legend-meta tabular-nums">' + pct + '%</span>' +
                '</li>'
            );
        }).join('');

        return (
            '<section class="clean-chart-card clean-bento-card" aria-label="Gastos por Categoria">' +
                '<div class="clean-bento-head">' +
                    '<h2 class="clean-bento-title"><i class="fas fa-chart-pie" aria-hidden="true"></i> Gastos por Categoria</h2>' +
                    '<span class="clean-chart-total tabular-nums" data-sensitive>' + mask(fmt(total)) + '</span>' +
                '</div>' +
                '<div class="clean-donut-layout">' +
                    '<div class="clean-donut-canvas-wrap">' +
                        '<canvas id="mobileChartCanvas" aria-label="Gráfico de gastos por categoria"></canvas>' +
                        '<div class="clean-donut-center" aria-hidden="true">' +
                            '<strong class="tabular-nums" data-sensitive>' + mask(formatCompactBrl(total)) + '</strong>' +
                            '<span>Total</span>' +
                        '</div>' +
                    '</div>' +
                    '<ul class="clean-donut-legend" aria-label="Legenda de categorias">' +
                        legendHtml +
                    '</ul>' +
                '</div>' +
            '</section>'
        );
    }

    /**
     * 6. TransactionList Component (Últimas 3 transações pagas em largura total)
     */
    function renderTransactionList(data) {
        var list = Array.isArray(data.transactions) ? data.transactions.slice(0, 3) : [];
        var cats = Array.isArray(data.categories) ? data.categories : [];
        var fmt = data.formatCurrency;
        var mask = function (v) { return data.isHidden ? '••••' : v; };

        if (list.length === 0) {
            return (
                '<div class="clean-tx-empty">' +
                    '<span class="clean-tx-empty-icon"><i class="fas fa-receipt"></i></span>' +
                    '<p>Nenhuma transação paga neste mês</p>' +
                '</div>'
            );
        }

        return '<div class="clean-tx-list">' + list.map(function (t) {
            var isIncome = t.type === 'income';
            var cat = null;
            if (t.category_id && cats.length > 0) {
                cat = cats.find(function (c) { return c.id === t.category_id; });
            }
            if (!cat && t.categories && typeof t.categories === 'object') {
                cat = t.categories;
            }
            var style = (typeof window.getBackendCategoryStyle === 'function')
                ? window.getBackendCategoryStyle(t.category || t.description, cat)
                : { icon: cat?.icon || (isIncome ? 'fa-arrow-up' : 'fa-shopping-bag') };

            var icon = cat?.icon || style.icon || (isIncome ? 'fa-arrow-up' : 'fa-tag');
            var rawDesc = typeof data.cleanDescription === 'function'
                ? data.cleanDescription(t.description)
                : (t.description || 'Transação');
            var safeDesc = escapeHtml(rawDesc, data.sanitizeString);
            var dateStr = (typeof data.formatDate === 'function' ? data.formatDate(t.date) : '') || formatShortDayMonth(t.date);
            var catLabel = stripEmojis(cat?.name || t.category || '');
            var subMeta = catLabel ? (dateStr + ' • ' + escapeHtml(catLabel, data.sanitizeString)) : dateStr;

            return (
                '<a href="transactions.html" class="clean-tx-row">' +
                    '<div class="clean-tx-left">' +
                        '<span class="clean-tx-icon-circle ' + (isIncome ? 'is-income' : 'is-expense') + '" aria-hidden="true">' +
                            '<i class="fas ' + icon + '"></i>' +
                        '</span>' +
                        '<div class="clean-tx-meta">' +
                            '<strong class="clean-tx-name">' + safeDesc + '</strong>' +
                            '<small class="clean-tx-date">' + subMeta + '</small>' +
                        '</div>' +
                    '</div>' +
                    '<span class="clean-tx-amount tabular-nums ' + (isIncome ? 'income' : 'expense') + '" data-sensitive>' +
                        (isIncome ? '+ ' : '- ') + mask(fmt(Math.abs(Number(t.amount) || 0))) +
                    '</span>' +
                '</a>'
            );
        }).join('') + '</div>';
    }

    function hydrateDynamicStyles(rootEl) {
        var scope = rootEl || document;
        scope.querySelectorAll('[data-goal-progress]').forEach(function (el) {
            var pct = Math.max(0, Math.min(100, Number(el.getAttribute('data-goal-progress')) || 0));
            el.style.width = pct + '%';
        });
        scope.querySelectorAll('[data-dot-color]').forEach(function (el) {
            var col = el.getAttribute('data-dot-color');
            if (col) el.style.backgroundColor = col;
        });
    }

    window.TonuDashboardComponents = {
        DONUT_PALETTE: DONUT_PALETTE,
        updateHeader: updateHeader,
        renderHeroCard: renderHeroCard,
        renderSummaryCards: renderSummaryCards,
        renderGoalProgressCard: renderGoalProgressCard,
        buildDonutCategoriesWithPalette: buildDonutCategoriesWithPalette,
        renderExpensesDonutCard: renderExpensesDonutCard,
        renderTransactionList: renderTransactionList,
        hydrateDynamicStyles: hydrateDynamicStyles
    };
})(window, document);
