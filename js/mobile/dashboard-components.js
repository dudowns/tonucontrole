/* ==========================================================================
   TONUCONTROLE - MODULAR MOBILE DASHBOARD COMPONENTS
   Clean Fintech UI Architecture (Light-first #F8F9FA / #FFFFFF / #6C3DD1)
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

    // Paleta limpa focada em roxo, lilás e verde semântico (para Donut Chart)
    var DONUT_PALETTE = [
        '#6C3DD1',
        '#9575CD',
        '#2E7D32',
        '#B39DDB',
        '#66BB6A',
        '#512DA8',
        '#D1C4E9',
        '#81C784'
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
            greetingEl.textContent = 'Olá, ' + firstName;
        }

        var monthEl = document.getElementById('selectedMonth');
        if (monthEl && state.monthLabel) {
            monthEl.textContent = state.monthLabel;
            monthEl.classList.toggle('is-offset', state.isCurrentMonth === false);
        }

        var avatarEl = document.getElementById('topbarAvatar');
        if (avatarEl && state.avatarInitial) {
            avatarEl.textContent = String(state.avatarInitial).charAt(0).toUpperCase();
        }
    }

    /**
     * 2. HeroCard Component (Único bloco com fundo sólido #6C3DD1)
     * Injeta dados dinâmicos calculados a partir das transações pagas do mês:
     * @param {Object} data - { balance, income, expense, pendingBillsAmount, isHidden, formatCurrency }
     */
    function renderHeroCard(data) {
        var fmt = data.formatCurrency;
        var mask = function (v) { return data.isHidden ? '••••••' : v; };

        return (
            '<section class="clean-hero-card" aria-label="Saldo Operacional">' +
                '<div class="clean-hero-top">' +
                    '<span class="clean-hero-label">Saldo Operacional</span>' +
                    '<button type="button" class="clean-hero-eye-btn" data-privacy-toggle data-action="toggle-balance" ' +
                        'title="' + (data.isHidden ? 'Mostrar Saldo' : 'Ocultar Saldo') + '" ' +
                        'aria-label="Alternar visibilidade do saldo">' +
                        '<i class="fas ' + (data.isHidden ? 'fa-eye-slash' : 'fa-eye') + '" data-privacy-icon></i>' +
                    '</button>' +
                '</div>' +
                '<div class="clean-hero-balance tabular-nums" id="heroBalanceVal" data-sensitive>' +
                    mask(fmt(data.balance)) +
                '</div>' +
                '<div class="clean-hero-columns">' +
                    '<div class="clean-hero-col">' +
                        '<div class="clean-hero-col-head">' +
                            '<span class="clean-hero-arrow income" aria-hidden="true"><i class="fas fa-arrow-up"></i></span>' +
                            '<span class="clean-hero-col-label">Entradas</span>' +
                        '</div>' +
                        '<span class="clean-hero-col-val tabular-nums" id="heroIncomeVal" data-sensitive>' +
                            mask(fmt(data.income)) +
                        '</span>' +
                    '</div>' +
                    '<div class="clean-hero-col">' +
                        '<div class="clean-hero-col-head">' +
                            '<span class="clean-hero-arrow expense" aria-hidden="true"><i class="fas fa-arrow-down"></i></span>' +
                            '<span class="clean-hero-col-label">Saídas</span>' +
                        '</div>' +
                        '<span class="clean-hero-col-val tabular-nums" id="heroExpenseVal" data-sensitive>' +
                            mask(fmt(data.expense)) +
                        '</span>' +
                        (data.pendingBillsAmount > 0
                            ? '<span class="clean-hero-pending-note">A vencer: ' + mask(fmt(data.pendingBillsAmount)) + '</span>'
                            : '') +
                    '</div>' +
                '</div>' +
            '</section>'
        );
    }

    /**
     * 3. QuickActions Component
     * Linha horizontal de ações rápidas limpas (sem fundo de card, apenas ícone e texto).
     */
    function renderQuickActions() {
        return (
            '<nav class="clean-quick-actions" aria-label="Ações Rápidas">' +
                '<button type="button" class="clean-quick-btn" data-action="quick-add" data-type="expense">' +
                    '<span class="clean-quick-icon expense"><i class="fas fa-arrow-down"></i></span>' +
                    '<span class="clean-quick-label">Nova Despesa</span>' +
                '</button>' +
                '<button type="button" class="clean-quick-btn" data-action="quick-add" data-type="income">' +
                    '<span class="clean-quick-icon income"><i class="fas fa-arrow-up"></i></span>' +
                    '<span class="clean-quick-label">Nova Receita</span>' +
                '</button>' +
                '<a href="bills.html" class="clean-quick-btn">' +
                    '<span class="clean-quick-icon bills"><i class="fas fa-file-invoice-dollar"></i></span>' +
                    '<span class="clean-quick-label">Contas</span>' +
                '</a>' +
                '<a href="investments.html" class="clean-quick-btn">' +
                    '<span class="clean-quick-icon invest"><i class="fas fa-chart-line"></i></span>' +
                    '<span class="clean-quick-label">Investir</span>' +
                '</a>' +
            '</nav>'
        );
    }

    /**
     * 4. SummaryCards Component
     * Dois cards brancos lado a lado: "Contas Pendentes" e "Proventos do Mês".
     * Injeta dados dinâmicos da API/estado (`allBills` e `allDividends`):
     * @param {Object} data - { pendingBillsAmount, pendingBillsCount, displayMonthDivs, monthPendingDivs, isHidden, formatCurrency }
     */
    function renderSummaryCards(data) {
        var fmt = data.formatCurrency;
        var mask = function (v) { return data.isHidden ? '••••••' : v; };
        var billsStatusClass = data.pendingBillsCount > 0 ? 'has-pending' : 'is-clear';

        return (
            '<section class="clean-summary-grid" aria-label="Resumo do Mês">' +
                '<a href="bills.html" class="clean-summary-card">' +
                    '<div class="clean-summary-head">' +
                        '<span class="clean-summary-icon warning" aria-hidden="true"><i class="fas fa-exclamation-triangle"></i></span>' +
                        '<span class="clean-summary-label">Contas Pendentes</span>' +
                    '</div>' +
                    '<div class="clean-summary-value tabular-nums ' + billsStatusClass + '" data-sensitive>' +
                        mask(fmt(data.pendingBillsAmount)) +
                    '</div>' +
                    '<div class="clean-summary-sub">' +
                        (data.pendingBillsCount > 0
                            ? data.pendingBillsCount + (data.pendingBillsCount === 1 ? ' conta em aberto' : ' contas em aberto')
                            : 'Nenhuma conta pendente') +
                    '</div>' +
                '</a>' +
                '<a href="investments.html" class="clean-summary-card">' +
                    '<div class="clean-summary-head">' +
                        '<span class="clean-summary-icon brand" aria-hidden="true"><i class="fas fa-coins"></i></span>' +
                        '<span class="clean-summary-label">Proventos do Mês</span>' +
                    '</div>' +
                    '<div class="clean-summary-value tabular-nums brand" data-sensitive>' +
                        mask(fmt(data.displayMonthDivs)) +
                    '</div>' +
                    '<div class="clean-summary-sub">' +
                        (data.monthPendingDivs > 0
                            ? 'A receber: ' + mask(fmt(data.monthPendingDivs))
                            : 'Dividendos e JCP') +
                    '</div>' +
                '</a>' +
            '</section>'
        );
    }

    /**
     * 5. GoalProgressCard Component (Nova Funcionalidade)
     * Card horizontal fino exibindo o progresso da meta principal do usuário.
     * Injeta dados dinâmicos da tabela `goals` + patrimônio sincronizado:
     * @param {Object} data - { goals, cachedEquity, monthlyDividends, selectedYear, sanitizeString }
     */
    function computePrimaryGoalSummary(data) {
        var goals = Array.isArray(data.goals) ? data.goals : [];
        var year = data.selectedYear || new Date().getFullYear();

        if (goals.length === 0) {
            return {
                label: 'Meta ' + year + ': 0% concluído',
                percent: 0,
                hasGoals: false
            };
        }

        // Prioriza metas ativas (não concluídas); se todas estiverem concluídas, usa a primeira
        var activeGoals = goals.filter(function (g) { return !g.completed; });
        var candidates = activeGoals.length > 0 ? activeGoals : goals;

        // Tenta encontrar uma meta cujo título ou prazo corresponda ao ano selecionado, ou a primeira relevante
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
            label: safeTitle + ': ' + pct + '% concluído',
            percent: pct,
            hasGoals: true
        };
    }

    function renderGoalProgressCard(data) {
        var summary = computePrimaryGoalSummary(data);
        return (
            '<a href="goals.html" class="clean-goal-card" aria-label="' + summary.label + '">' +
                '<div class="clean-goal-top">' +
                    '<span class="clean-goal-title">' +
                        '<i class="fas fa-bullseye" aria-hidden="true"></i> ' +
                        '<span>' + summary.label + '</span>' +
                    '</span>' +
                    '<span class="clean-goal-action">' +
                        (summary.hasGoals ? 'Ver metas' : 'Criar meta') +
                        ' <i class="fas fa-chevron-right" aria-hidden="true"></i>' +
                    '</span>' +
                '</div>' +
                '<div class="clean-goal-track" role="progressbar" aria-valuenow="' + summary.percent + '" aria-valuemin="0" aria-valuemax="100">' +
                    '<div class="clean-goal-fill" data-goal-progress="' + summary.percent + '"></div>' +
                '</div>' +
            '</a>'
        );
    }

    /**
     * 6. ExpensesDonutChart Component
     * Gráfico de rosca (Chart.js) com paleta roxo/lilás/verde e legenda posicionada à DIREITA.
     * Injeta dados dinâmicos das despesas pagas do mês agrupadas por categoria:
     * @param {Object} data - { sortedCategories, totalExpensesAmount, isHidden, formatCurrency, sanitizeString }
     */
    function buildDonutCategoriesWithPalette(sortedCategories) {
        var list = Array.isArray(sortedCategories) ? sortedCategories : [];
        // Agrupa em top 5 categorias + "Outros" para manter legenda lateral limpa e legível
        var topItems = list.slice(0, 5);
        var tailItems = list.slice(5);
        var items = topItems.map(function (item, idx) {
            return {
                id: item.id,
                name: stripEmojis(item.name || 'Categoria') || 'Categoria',
                amount: item.amount,
                paletteColor: item.id === 'outros' ? '#CBD5E1' : DONUT_PALETTE[idx % DONUT_PALETTE.length]
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
                    paletteColor: '#CBD5E1'
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
                '<section class="clean-chart-card" aria-label="Gastos por Categoria">' +
                    '<div class="clean-card-header">' +
                        '<h2 class="clean-card-title">Gastos por Categoria</h2>' +
                    '</div>' +
                    '<div class="clean-chart-empty">' +
                        '<i class="fas fa-chart-pie" aria-hidden="true"></i>' +
                        '<span>Nenhuma despesa paga neste mês</span>' +
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
            '<section class="clean-chart-card" aria-label="Gastos por Categoria">' +
                '<div class="clean-card-header">' +
                    '<h2 class="clean-card-title">Gastos por Categoria</h2>' +
                    '<span class="clean-chart-total tabular-nums" data-sensitive>' + mask(fmt(total)) + '</span>' +
                '</div>' +
                '<div class="clean-donut-layout">' +
                    '<div class="clean-donut-canvas-wrap">' +
                        '<canvas id="mobileChartCanvas" aria-label="Gráfico de gastos por categoria"></canvas>' +
                    '</div>' +
                    '<ul class="clean-donut-legend" aria-label="Legenda de categorias">' +
                        legendHtml +
                    '</ul>' +
                '</div>' +
            '</section>'
        );
    }

    /**
     * 7. TransactionList Component
     * Exibe as 3 últimas transações pagas, ícone circular cinza claro à esquerda,
     * nome e data embaixo, valor à direita (+ verde / - laranja).
     * Injeta dados dinâmicos de `allTransactions`:
     * @param {Object} data - { transactions, categories, isHidden, formatCurrency, formatDate, sanitizeString, cleanDescription }
     */
    function renderTransactionList(data) {
        var list = Array.isArray(data.transactions) ? data.transactions.slice(0, 3) : [];
        var cats = Array.isArray(data.categories) ? data.categories : [];
        var fmt = data.formatCurrency;
        var fmtDate = data.formatDate;
        var mask = function (v) { return data.isHidden ? '••••' : v; };

        if (list.length === 0) {
            return (
                '<div class="clean-tx-empty">' +
                    '<span class="clean-tx-empty-icon"><i class="fas fa-receipt"></i></span>' +
                    '<p>Nenhuma transação registrada neste mês</p>' +
                '</div>'
            );
        }

        return '<div class="clean-tx-card">' + list.map(function (t) {
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

            return (
                '<a href="transactions.html" class="clean-tx-row">' +
                    '<div class="clean-tx-left">' +
                        '<span class="clean-tx-icon-circle" aria-hidden="true">' +
                            '<i class="fas ' + icon + '"></i>' +
                        '</span>' +
                        '<div class="clean-tx-meta">' +
                            '<strong class="clean-tx-name">' + safeDesc + '</strong>' +
                            '<small class="clean-tx-date">' + fmtDate(t.date) + '</small>' +
                        '</div>' +
                    '</div>' +
                    '<span class="clean-tx-amount tabular-nums ' + (isIncome ? 'income' : 'expense') + '" data-sensitive>' +
                        (isIncome ? '+ ' : '- ') + mask(fmt(Math.abs(Number(t.amount) || 0))) +
                    '</span>' +
                '</a>'
            );
        }).join('') + '</div>';
    }

    /**
     * Aplica propriedades visuais dinâmicas via CSSOM (CSP-safe, sem inline style="").
     */
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
        renderQuickActions: renderQuickActions,
        renderSummaryCards: renderSummaryCards,
        renderGoalProgressCard: renderGoalProgressCard,
        buildDonutCategoriesWithPalette: buildDonutCategoriesWithPalette,
        renderExpensesDonutCard: renderExpensesDonutCard,
        renderTransactionList: renderTransactionList,
        hydrateDynamicStyles: hydrateDynamicStyles
    };
})(window, document);
