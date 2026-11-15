// ============================================
// TONUCONTROLE — MODO DEMONSTRAÇÃO: DADOS DE EXEMPLO
// Dataset realista (BRL) usado apenas quando o modo demo está ativo.
// Nenhuma credencial externa é necessária.
// ============================================

(function () {
    'use strict';

    const DEMO_USER_ID = 'demo-user-tonu-0001';

    const DEMO_USER = {
        id: DEMO_USER_ID,
        email: 'marina.alves@demo.tonucontrole.app',
        user_metadata: {
            full_name: 'Marina Alves',
            avatar_url: ''
        },
        app_metadata: { provider: 'demo' },
        created_at: '2024-03-11T12:00:00.000Z',
        aud: 'authenticated',
        role: 'authenticated'
    };

    function pad(n) {
        return String(n).padStart(2, '0');
    }

    function isoDate(monthsAgo, day) {
        const base = new Date();
        const d = new Date(base.getFullYear(), base.getMonth() - monthsAgo, day, 12, 0, 0);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function isoStamp(monthsAgo, day, hour) {
        return `${isoDate(monthsAgo, day)}T${pad(hour || 9)}:24:00.000Z`;
    }

    function daysFromNow(days) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    const CATEGORIES = [
        { id: 'cat_alimentacao', name: 'Alimentação', type: 'expense', icon: 'fa-utensils', color: '#FF6B6B' },
        { id: 'cat_transporte', name: 'Transporte', type: 'expense', icon: 'fa-car', color: '#FDCB6E' },
        { id: 'cat_moradia', name: 'Moradia', type: 'expense', icon: 'fa-home', color: '#E17055' },
        { id: 'cat_contas', name: 'Contas Básicas', type: 'expense', icon: 'fa-bolt', color: '#0984E3' },
        { id: 'cat_comunicacao', name: 'Comunicação', type: 'expense', icon: 'fa-wifi', color: '#636E72' },
        { id: 'cat_saude', name: 'Saúde', type: 'expense', icon: 'fa-heartbeat', color: '#FF6B6B' },
        { id: 'cat_lazer', name: 'Lazer', type: 'expense', icon: 'fa-gamepad', color: '#A29BFE' },
        { id: 'cat_educacao', name: 'Educação', type: 'expense', icon: 'fa-book', color: '#0984E3' },
        { id: 'cat_cartao', name: 'Cartão de Crédito', type: 'expense', icon: 'fa-credit-card', color: '#E17055' },
        { id: 'cat_investimentos', name: 'Investimentos', type: 'both', icon: 'fa-chart-line', color: '#00CEC9' },
        { id: 'cat_salario', name: 'Salário', type: 'income', icon: 'fa-money-bill-wave', color: '#00B894' },
        { id: 'cat_bico', name: 'Renda Extra', type: 'income', icon: 'fa-gift', color: '#00B894' },
        { id: 'cat_outros', name: 'Outros', type: 'expense', icon: 'fa-tag', color: '#B2BEC3' }
    ];

    // [descrição, valor, categoria, dia do mês, pago]
    const MONTHLY_EXPENSES = [
        ['Aluguel do apartamento', 2350.00, 'cat_moradia', 5, true],
        ['Supermercado Pão de Açúcar', 486.90, 'cat_alimentacao', 7, true],
        ['Energia elétrica — Enel', 218.45, 'cat_contas', 9, true],
        ['Internet fibra 500MB', 119.90, 'cat_comunicacao', 10, true],
        ['Uber e 99', 89.70, 'cat_transporte', 11, true],
        ['Farmácia São Paulo', 128.35, 'cat_saude', 12, true],
        ['Netflix + Spotify', 77.80, 'cat_lazer', 13, true],
        ['Academia Smart Fit', 129.00, 'cat_lazer', 14, true],
        ['Restaurante japonês', 187.50, 'cat_alimentacao', 16, true],
        ['Combustível Shell', 320.00, 'cat_transporte', 17, true],
        ['iFood e cafeterias', 94.80, 'cat_alimentacao', 19, true],
        ['Aporte Tesouro Selic 2029', 700.00, 'cat_investimentos', 20, true],
        ['Curso de inglês', 249.00, 'cat_educacao', 21, true],
        ['Água e esgoto — Sabesp', 89.20, 'cat_contas', 22, true]
    ];

    // Contas a pagar do mês corrente (type=expense + is_bill)
    const CURRENT_BILLS = [
        ['Fatura Nubank', 1842.30, 'cat_cartao', 20],
        ['Condomínio', 640.00, 'cat_moradia', 12],
        ['IPTU — parcela 11/12', 187.00, 'cat_contas', 25]
    ];

    const INVESTMENT_OPERATIONS = [
        ['Tesouro Selic 2029', 'Tesouro', 1, 14500.00, 13, 5],
        ['MXRF11', 'FIIs', 300, 10.10, 13, 12],
        ['MXRF11', 'FIIs', 200, 10.25, 7, 15],
        ['ITUB4', 'Ações', 150, 28.90, 12, 8],
        ['ITUB4', 'Ações', 150, 31.00, 8, 14],
        ['ITUB4', 'Ações', 100, 33.20, 4, 18],
        ['PETR4', 'Ações', 100, 31.50, 11, 11],
        ['PETR4', 'Ações', 100, 34.00, 7, 20],
        ['PETR4', 'Ações', 100, 36.20, 3, 16],
        ['HGLG11', 'FIIs', 40, 157.00, 11, 22],
        ['HGLG11', 'FIIs', 20, 160.00, 5, 10],
        ['VALE3', 'Ações', 80, 58.40, 9, 26],
        ['VALE3', 'Ações', 40, 61.10, 2, 7]
    ];

    const DIVIDEND_ROWS = [
        // [ticker, tipo, quantidade, valorUnitário, mesesAtras, diaPagamento]
        ['MXRF11', 'Rendimento', 500, 0.10, 2, 15],
        ['ITUB4', 'Dividendo', 400, 0.42, 2, 28],
        ['HGLG11', 'Rendimento', 60, 1.10, 2, 14],
        ['PETR4', 'JCP', 300, 0.58, 2, 27],
        ['MXRF11', 'Rendimento', 500, 0.10, 1, 15],
        ['ITUB4', 'Dividendo', 400, 0.45, 1, 28],
        ['HGLG11', 'Rendimento', 60, 1.15, 1, 14],
        ['VALE3', 'Dividendo', 120, 1.20, 1, 22],
        ['MXRF11', 'Rendimento', 500, 0.10, 0, 15],
        ['ITUB4', 'Dividendo', 400, 0.48, 0, 20]
    ];

    const GOALS = [
        {
            id: 'demo-goal-1',
            title: 'Reserva de emergência',
            type: 'financial',
            category: 'emergency',
            target_amount: 30000,
            current_amount: 18400,
            completed: false,
            cdi_percent: 100,
            target_year: new Date().getFullYear(),
            created_at: isoStamp(8, 3, 10)
        },
        {
            id: 'demo-goal-2',
            title: 'Viagem para o Japão',
            type: 'financial',
            category: 'travel',
            target_amount: 12000,
            current_amount: 4250,
            completed: false,
            cdi_percent: 100,
            target_year: new Date().getFullYear(),
            created_at: isoStamp(5, 12, 10)
        },
        {
            id: 'demo-goal-3',
            title: 'Renda passiva de R$ 1.000/mês',
            type: 'dividends',
            category: 'investments',
            target_amount: 1000,
            current_amount: 0,
            completed: false,
            target_year: new Date().getFullYear(),
            created_at: isoStamp(10, 4, 10)
        },
        {
            id: 'demo-goal-4',
            title: 'Patrimônio de R$ 100 mil',
            type: 'wealth',
            category: 'investments',
            target_amount: 100000,
            current_amount: 0,
            completed: false,
            target_year: new Date().getFullYear(),
            created_at: isoStamp(12, 2, 10)
        },
        {
            id: 'demo-goal-5',
            title: 'Quitar o cartão de crédito',
            type: 'project',
            category: 'other',
            target_amount: 1,
            current_amount: 1,
            completed: true,
            target_year: new Date().getFullYear(),
            created_at: isoStamp(6, 8, 10)
        },
        {
            id: 'demo-goal-6',
            title: 'Ler 12 livros no ano',
            type: 'project',
            category: 'education',
            target_amount: 1,
            current_amount: 0,
            completed: false,
            target_year: new Date().getFullYear(),
            created_at: isoStamp(6, 8, 10)
        }
    ];

    function buildTransactions(userId) {
        const rows = [];
        let seq = 0;

        // 3 meses fechados + mês corrente (permite navegar entre meses no app)
        for (let monthsAgo = 2; monthsAgo >= 0; monthsAgo--) {
            const isCurrent = monthsAgo === 0;

            rows.push({
                id: `demo-tx-sal-${monthsAgo}`,
                user_id: userId,
                description: 'Salário — Studio Aurora',
                amount: 8450.00,
                type: 'income',
                category: 'Salário',
                category_id: 'cat_salario',
                date: isoDate(monthsAgo, 5),
                due_date: isoDate(monthsAgo, 5),
                created_at: isoStamp(monthsAgo, 5, 8),
                paid: true,
                paid_date: isoDate(monthsAgo, 5),
                is_bill: false
            });

            if (!isCurrent) {
                rows.push({
                    id: `demo-tx-free-${monthsAgo}`,
                    user_id: userId,
                    description: 'Projeto freelance — landing page',
                    amount: 1850.00,
                    type: 'income',
                    category: 'Renda Extra',
                    category_id: 'cat_bico',
                    date: isoDate(monthsAgo, 18),
                    created_at: isoStamp(monthsAgo, 18, 15),
                    paid: true,
                    paid_date: isoDate(monthsAgo, 18),
                    is_bill: false
                });
            }

            MONTHLY_EXPENSES.forEach((item, idx) => {
                const [desc, amount, catId, day] = item;
                const cat = CATEGORIES.find(c => c.id === catId);
                // No mês corrente, deixa as compras do fim do mês ainda pendentes
                const paid = !(isCurrent && day > new Date().getDate());
                rows.push({
                    id: `demo-tx-${monthsAgo}-${seq++}-${idx}`,
                    user_id: userId,
                    description: desc,
                    amount,
                    type: 'expense',
                    category: cat ? cat.name : 'Outros',
                    category_id: catId,
                    date: isoDate(monthsAgo, Math.min(day, 28)),
                    due_date: isoDate(monthsAgo, Math.min(day, 28)),
                    created_at: isoStamp(monthsAgo, Math.min(day, 28), 19),
                    paid,
                    paid_date: paid ? isoDate(monthsAgo, Math.min(day, 28)) : null,
                    is_bill: false
                });
            });

            if (isCurrent) {
                CURRENT_BILLS.forEach((bill, idx) => {
                    const [desc, amount, catId, day] = bill;
                    const cat = CATEGORIES.find(c => c.id === catId);
                    rows.push({
                        id: `demo-bill-${idx}`,
                        user_id: userId,
                        description: desc,
                        amount,
                        type: 'expense',
                        category: cat ? cat.name : 'Outros',
                        category_id: catId,
                        date: isoDate(0, Math.min(day, 28)),
                        due_date: isoDate(0, Math.min(day, 28)),
                        created_at: isoStamp(0, 2, 9),
                        paid: false,
                        paid_date: null,
                        is_bill: true,
                        installment_total: idx === 2 ? 12 : 1,
                        installment_current: idx === 2 ? 11 : 1
                    });
                });

                // Conta do próximo mês já lançada (planejamento)
                rows.push({
                    id: 'demo-bill-next-1',
                    user_id: userId,
                    description: 'Fatura Nubank (próximo ciclo)',
                    amount: 640.00,
                    type: 'expense',
                    category: 'Cartão de Crédito',
                    category_id: 'cat_cartao',
                    date: daysFromNow(32),
                    due_date: daysFromNow(32),
                    created_at: isoStamp(0, 2, 9),
                    paid: false,
                    paid_date: null,
                    is_bill: true,
                    installment_total: 1,
                    installment_current: 1
                });
            }
        }

        return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    function buildInvestments(userId) {
        return INVESTMENT_OPERATIONS.map((op, idx) => {
            const [ticker, assetClass, quantity, unitPrice, monthsAgo, day] = op;
            const date = isoDate(monthsAgo, day);
            return {
                id: `demo-inv-${idx + 1}`,
                user_id: userId,
                ticker,
                asset_class: assetClass,
                type: 'Compra',
                quantity,
                unit_price: unitPrice,
                total_value: Number((quantity * unitPrice).toFixed(2)),
                date,
                created_at: isoStamp(monthsAgo, day, 11)
            };
        });
    }

    function buildDividends(userId) {
        return DIVIDEND_ROWS.map((row, idx) => {
            const [ticker, type, quantity, unitValue, monthsAgo, day] = row;
            const total = Number((quantity * unitValue).toFixed(2));
            const date = isoDate(monthsAgo, day);
            return {
                id: `demo-div-${idx + 1}`,
                user_id: userId,
                ticker,
                type,
                quantity,
                unit_value: unitValue,
                total_value: total,
                amount: total,
                date,
                payment_date: date,
                created_at: isoStamp(monthsAgo, day, 10)
            };
        });
    }

    function buildDataset(userId) {
        const uid = userId || DEMO_USER_ID;
        return {
            profiles: [{
                id: uid,
                full_name: 'Marina Alves',
                avatar_url: '',
                currency: 'BRL',
                monthly_income: 8450,
                created_at: '2024-03-11T12:00:00.000Z',
                updated_at: new Date().toISOString()
            }],
            categories: CATEGORIES.map(c => Object.assign({}, c, {
                user_id: null,
                is_default: true,
                created_at: '2024-03-11T12:00:00.000Z'
            })),
            transactions: buildTransactions(uid),
            investments: buildInvestments(uid),
            dividends: buildDividends(uid),
            corporate_events: [],
            portfolio_snapshots: [{
                id: 'demo-snap-1',
                user_id: uid,
                total_equity: 62480.35,
                total_invested: 55100.00,
                date: new Date().toISOString().slice(0, 10),
                created_at: new Date().toISOString()
            }],
            user_stats: [{
                id: 'demo-stats-1',
                user_id: uid,
                patrimony: 62480.35,
                updated_at: new Date().toISOString()
            }],
            goals: GOALS.map(g => Object.assign({}, g, { user_id: uid })),
            goal_deposits: [
                { id: 'demo-dep-1', user_id: uid, goal_id: 'demo-goal-1', amount: 1200, deposit_date: isoDate(2, 6), created_at: isoStamp(2, 6, 10) },
                { id: 'demo-dep-2', user_id: uid, goal_id: 'demo-goal-1', amount: 1200, deposit_date: isoDate(1, 6), created_at: isoStamp(1, 6, 10) },
                { id: 'demo-dep-3', user_id: uid, goal_id: 'demo-goal-2', amount: 800, deposit_date: isoDate(1, 18), created_at: isoStamp(1, 18, 10) },
                { id: 'demo-dep-4', user_id: uid, goal_id: 'demo-goal-2', amount: 650, deposit_date: isoDate(0, 4), created_at: isoStamp(0, 4, 10) }
            ],
            asset_quotes: [
                { id: 'q-itub4', ticker: 'ITUB4', price: 36.42, change: 1.24, change_value: 0.45, previous_close: 35.97, updated_at: new Date().toISOString() },
                { id: 'q-petr4', ticker: 'PETR4', price: 38.15, change: -0.82, change_value: -0.32, previous_close: 38.47, updated_at: new Date().toISOString() },
                { id: 'q-mxrf11', ticker: 'MXRF11', price: 10.38, change: 0.29, change_value: 0.03, previous_close: 10.35, updated_at: new Date().toISOString() },
                { id: 'q-hglg11', ticker: 'HGLG11', price: 161.20, change: 0.61, change_value: 0.98, previous_close: 160.22, updated_at: new Date().toISOString() },
                { id: 'q-vale3', ticker: 'VALE3', price: 61.80, change: -1.05, change_value: -0.66, previous_close: 62.46, updated_at: new Date().toISOString() },
                { id: 'q-tesouro', ticker: 'Tesouro Selic 2029', price: 15230.00, change: 0.08, change_value: 12.40, previous_close: 15217.60, updated_at: new Date().toISOString() }
            ],
            bills: buildTransactions(uid).filter(t => t.is_bill),
            notification_log: [],
            push_subscriptions: []
        };
    }

    function buildAiInsights() {
        return [
            { type: 'warning', text: 'Alimentação somou R$ 863 em deliveries e cafeterias — 24% acima da sua média de 3 meses.' },
            { type: 'success', text: 'Você guardou R$ 1.850 este mês entre aportes e metas: 22% da renda líquida.' },
            { type: 'info', text: 'Seus proventos cobrem 6% das despesas fixas. Aumentar MXRF11 em 200 cotas chega a 9%.' }
        ];
    }

    window.TonuDemoData = {
        userId: DEMO_USER_ID,
        user: DEMO_USER,
        categories: CATEGORIES,
        buildDataset: buildDataset,
        buildAiInsights: buildAiInsights
    };
})();
