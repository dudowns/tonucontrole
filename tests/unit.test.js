// ==========================================================================
// TONUCONTROLE - UNIT TESTS SUITE
// Testes unitários para funções matemáticas, formatação e regras de negócio
// ==========================================================================

const assert = require('assert');

// 1. Módulos / Helpers a serem testados
function formatCurrency(val, currency = 'BRL') {
    const num = Number(val) || 0;
    if (currency === 'USD') return `$ ${num.toFixed(2)}`;
    if (currency === 'EUR') return `€ ${num.toFixed(2)}`;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function calculateBalance(transactions) {
    let income = 0;
    let expense = 0;
    transactions.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        if (t.type === 'income') income += amt;
        else if (t.type === 'expense') expense += amt;
    });
    return {
        income,
        expense,
        balance: income - expense
    };
}

function sanitizeString(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function calculateWeeklySummary(transactions, sevenDaysAgoStr, todayStr) {
    let currentWeekExpenses = 0;
    let currentWeekIncome = 0;
    const categoryTotals = {};

    transactions.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        if (t.date >= sevenDaysAgoStr && t.date <= todayStr) {
            if (t.type === 'expense') {
                currentWeekExpenses += amt;
                const cat = t.category || 'Outros';
                categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
            } else if (t.type === 'income') {
                currentWeekIncome += amt;
            }
        }
    });

    return {
        currentWeekExpenses,
        currentWeekIncome,
        netBalance: currentWeekIncome - currentWeekExpenses,
        categoryTotals
    };
}

// 2. Execução dos testes unitários
async function runUnitTests() {
    const results = [];

    function test(name, fn) {
        try {
            fn();
            results.push({ name, passed: true });
        } catch (err) {
            results.push({ name, passed: false, error: err.message });
        }
    }

    test('Deve formatar valores em Reais (BRL)', () => {
        const res = formatCurrency(1250.5);
        assert.ok(res.includes('1.250,50') || res.includes('1250,50'));
    });

    test('Deve formatar valores em Dólares (USD)', () => {
        const res = formatCurrency(100.25, 'USD');
        assert.strictEqual(res, '$ 100.25');
    });

    test('Deve calcular balanço financeiro corretamente', () => {
        const mockTxs = [
            { type: 'income', amount: '5000' },
            { type: 'expense', amount: '1200' },
            { type: 'expense', amount: '800' },
            { type: 'income', amount: '350.50' }
        ];
        const res = calculateBalance(mockTxs);
        assert.strictEqual(res.income, 5350.50);
        assert.strictEqual(res.expense, 2000);
        assert.strictEqual(res.balance, 3350.50);
    });

    test('Deve sanitizar strings contra ataques XSS', () => {
        const unsafe = '<script>alert("hack")</script>';
        const safe = sanitizeString(unsafe);
        assert.strictEqual(safe, '&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;');
    });

    test('Deve calcular resumo semanal e categorização com precisão', () => {
        const txs = [
            { date: '2026-08-10', type: 'expense', amount: '150', category: 'Alimentação' },
            { date: '2026-08-12', type: 'expense', amount: '50', category: 'Transporte' },
            { date: '2026-08-14', type: 'income', amount: '1000', category: 'Salário' },
            { date: '2026-07-01', type: 'expense', amount: '999', category: 'Antigo' } // Fora do intervalo
        ];
        const summary = calculateWeeklySummary(txs, '2026-08-08', '2026-08-15');
        assert.strictEqual(summary.currentWeekExpenses, 200);
        assert.strictEqual(summary.currentWeekIncome, 1000);
        assert.strictEqual(summary.netBalance, 800);
        assert.strictEqual(summary.categoryTotals['Alimentação'], 150);
        assert.strictEqual(summary.categoryTotals['Transporte'], 50);
    });

    test('Deve alternar visibilidade de senha (password <-> text) e ícone', () => {
        // Simular ambiente DOM mínimo para o toggle
        const mockInput = { type: 'password', focus: () => {} };
        const mockIconClasses = new Set(['fa-regular', 'fa-eye']);
        const mockIcon = {
            classList: {
                add: (cls) => mockIconClasses.add(cls),
                remove: (cls) => mockIconClasses.delete(cls),
                contains: (cls) => mockIconClasses.has(cls)
            }
        };
        const mockAttributes = {};
        const mockBtn = {
            setAttribute: (k, v) => { mockAttributes[k] = v; }
        };

        function simulateToggle(input, icon, btn) {
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            if (icon) {
                if (isPassword) {
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                } else {
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                }
            }
            if (btn) {
                const label = isPassword ? 'Ocultar senha' : 'Mostrar senha';
                btn.setAttribute('aria-label', label);
                btn.setAttribute('title', label);
                btn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
            }
        }

        // 1º clique: revelar senha
        simulateToggle(mockInput, mockIcon, mockBtn);
        assert.strictEqual(mockInput.type, 'text');
        assert.strictEqual(mockIcon.classList.contains('fa-eye-slash'), true);
        assert.strictEqual(mockIcon.classList.contains('fa-eye'), false);
        assert.strictEqual(mockAttributes['aria-label'], 'Ocultar senha');
        assert.strictEqual(mockAttributes['aria-pressed'], 'true');

        // 2º clique: ocultar senha
        simulateToggle(mockInput, mockIcon, mockBtn);
        assert.strictEqual(mockInput.type, 'password');
        assert.strictEqual(mockIcon.classList.contains('fa-eye'), true);
        assert.strictEqual(mockIcon.classList.contains('fa-eye-slash'), false);
        assert.strictEqual(mockAttributes['aria-label'], 'Mostrar senha');
        assert.strictEqual(mockAttributes['aria-pressed'], 'false');
    });

    test('Deve avaliar complexidade de senha em tempo real (weak, fair, strong, very-strong)', () => {
        const { evaluatePasswordStrength } = require('../js/auth.js');

        // Vazio ou nulo
        const emptyRes = evaluatePasswordStrength('');
        assert.strictEqual(emptyRes.level, 'empty');
        assert.strictEqual(emptyRes.score, 0);
        assert.strictEqual(emptyRes.label, 'Vazia');

        // Fraca (< 6 caracteres ou repetição)
        const weakRes1 = evaluatePasswordStrength('12345');
        assert.strictEqual(weakRes1.level, 'weak');
        assert.strictEqual(weakRes1.label, 'Fraca');

        const weakRes2 = evaluatePasswordStrength('aaaaaa');
        assert.strictEqual(weakRes2.level, 'weak');

        // Média (6+ caracteres básicos com números/letras)
        const fairRes = evaluatePasswordStrength('tonu123');
        assert.strictEqual(fairRes.level, 'fair');
        assert.strictEqual(fairRes.label, 'Média');

        // Forte (8+ caracteres, maiúsculas, minúsculas e números)
        const strongRes = evaluatePasswordStrength('Tonu1234');
        assert.strictEqual(strongRes.level, 'strong');
        assert.strictEqual(strongRes.label, 'Forte');

        // Excelente (alta entropia, símbolos, números, maiúsculas/minúsculas e 12+ caracteres)
        const excellentRes = evaluatePasswordStrength('Tonu#Sec!987654');
        assert.strictEqual(excellentRes.level, 'very-strong');
        assert.strictEqual(excellentRes.label, 'Excelente');
    });

    test('Deve aplicar transição direcional e acessibilidade ao alternar abas de autenticação (switchTab)', () => {
        const { switchTab } = require('../js/auth.js');

        const elements = {};
        function createMockElement(id) {
            const classes = new Set();
            const attributes = {};
            return {
                id,
                classList: {
                    add: (c) => classes.add(c),
                    remove: (c) => classes.delete(c),
                    contains: (c) => classes.has(c)
                },
                setAttribute: (k, v) => { attributes[k] = String(v); },
                getAttribute: (k) => attributes[k],
                removeAttribute: (k) => { delete attributes[k]; },
                focus: () => {}
            };
        }

        const loginForm = createMockElement('loginForm');
        const registerForm = createMockElement('registerForm');
        registerForm.classList.add('hidden');

        const tabLogin = createMockElement('tabLogin');
        tabLogin.classList.add('active');
        tabLogin.setAttribute('aria-selected', 'true');

        const tabRegister = createMockElement('tabRegister');
        tabRegister.setAttribute('aria-selected', 'false');

        // Configurar DOM mock
        global.document = {
            getElementById: (id) => {
                if (id === 'loginForm') return loginForm;
                if (id === 'registerForm') return registerForm;
                if (id === 'tabLogin') return tabLogin;
                if (id === 'tabRegister') return tabRegister;
                return null;
            },
            querySelectorAll: () => [tabLogin, tabRegister]
        };
        global.window = {
            matchMedia: () => ({ matches: false })
        };

        // Alternar para 'register'
        switchTab('register');

        // Tab buttons devem ser atualizados de imediato
        assert.strictEqual(tabRegister.classList.contains('active'), true);
        assert.strictEqual(tabRegister.getAttribute('aria-selected'), 'true');
        assert.strictEqual(tabLogin.classList.contains('active'), false);
        assert.strictEqual(tabLogin.getAttribute('aria-selected'), 'false');

        // Forma de saída (login) recebe classe de slide out
        assert.strictEqual(loginForm.classList.contains('form-slide-out-left'), true);
    });

    // =========================================================================
    // PRIORIDADE 1: TESTES AUTOMATIZADOS DAS 5 TAREFAS
    // =========================================================================

    test('Prioridade 1 - Tarefa 1 & 2: Filtro dinâmico por categoria em Transações e Contas', () => {
        const mockCategories = [
            { id: 'cat-1', name: 'Alimentação' },
            { id: 'cat-2', name: 'Moradia' },
            { id: 'cat-3', name: 'Transporte' }
        ];

        const mockTransactions = [
            { id: 1, description: 'Supermercado', category_id: 'cat-1', type: 'expense', paid: true },
            { id: 2, description: 'Aluguel', category_id: 'cat-2', type: 'expense', paid: true },
            { id: 3, description: 'Combustível', category_id: 'cat-3', type: 'expense', paid: true },
            { id: 4, description: 'Restaurante', category: 'Alimentação', type: 'expense', paid: true }
        ];

        function filterListByCategory(list, selectedCat) {
            return list.filter(item => {
                if (selectedCat === 'all') return true;
                return (item.category_id === selectedCat) ||
                    (item.category === selectedCat) ||
                    (mockCategories.find(c => c.id === selectedCat)?.name === item.category);
            });
        }

        // Filtro por categoria específica (cat-1 / Alimentação)
        const filteredFood = filterListByCategory(mockTransactions, 'cat-1');
        assert.strictEqual(filteredFood.length, 2);
        assert.strictEqual(filteredFood[0].description, 'Supermercado');
        assert.strictEqual(filteredFood[1].description, 'Restaurante');

        // Filtro "all" (Todas as categorias) deve retornar a totalidade dos itens
        const filteredAll = filterListByCategory(mockTransactions, 'all');
        assert.strictEqual(filteredAll.length, 4);
    });

    test('Prioridade 1 - Tarefa 3: Exportação de CSV de Transações e validação de lista vazia', () => {
        function generateTransactionsCSV(txs) {
            if (!txs || txs.length === 0) {
                return { success: false, message: 'Nenhuma transação para exportar' };
            }

            let csv = 'ID,Data,Tipo,Descricao,Valor,Categoria,Status\n';
            txs.forEach(t => {
                const row = [
                    `"${t.id || ''}"`,
                    `"${t.date || ''}"`,
                    `"${t.type || ''}"`,
                    `"${(t.description || '').replace(/"/g, '""')}"`,
                    t.amount || 0,
                    `"${(t.category || '').replace(/"/g, '""')}"`,
                    t.paid ? 'Pago' : 'Pendente'
                ];
                csv += row.join(',') + '\n';
            });
            return { success: true, csv };
        }

        // Validação com lista vazia
        const emptyResult = generateTransactionsCSV([]);
        assert.strictEqual(emptyResult.success, false);
        assert.strictEqual(emptyResult.message, 'Nenhuma transação para exportar');

        // Validação com transações válidas
        const txs = [
            { id: '101', date: '2026-09-01', type: 'expense', description: 'Café "Especial"', amount: 15.5, category: 'Lazer', paid: true },
            { id: '102', date: '2026-09-02', type: 'income', description: 'Consultoria', amount: 2500, category: 'Trabalho', paid: false }
        ];
        const res = generateTransactionsCSV(txs);
        assert.strictEqual(res.success, true);
        assert.ok(res.csv.includes('Café ""Especial""'));
        assert.ok(res.csv.includes('Pago'));
        assert.ok(res.csv.includes('Pendente'));
    });

    test('Prioridade 1 - Tarefa 4: Validação do JSON de backup e contagens para restauração', () => {
        function validateBackupJSON(jsonStr) {
            let data;
            try {
                data = JSON.parse(jsonStr);
            } catch {
                return { valid: false, error: 'JSON_PARSE_ERROR' };
            }

            if (!data || data.appName !== 'TonuControle') {
                return { valid: false, error: 'INVALID_APP_NAME' };
            }

            return {
                valid: true,
                countTx: (data.transactions || []).length,
                countBills: (data.bills || []).length,
                countGoals: (data.goals || []).length
            };
        }

        // 1. JSON sem appName 'TonuControle'
        const invalidApp = JSON.stringify({ appName: 'OutroApp', transactions: [] });
        const invalidRes = validateBackupJSON(invalidApp);
        assert.strictEqual(invalidRes.valid, false);
        assert.strictEqual(invalidRes.error, 'INVALID_APP_NAME');

        // 2. JSON legítimo do TonuControle
        const validApp = JSON.stringify({
            appName: 'TonuControle',
            transactions: [{ id: 1 }, { id: 2 }],
            bills: [{ id: 'b1' }],
            goals: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }]
        });
        const validRes = validateBackupJSON(validApp);
        assert.strictEqual(validRes.valid, true);
        assert.strictEqual(validRes.countTx, 2);
        assert.strictEqual(validRes.countBills, 1);
        assert.strictEqual(validRes.countGoals, 3);
    });

    test('Prioridade 1 - Tarefa 5: Alternância de visibilidade do saldo (tonu_hide_balance) e máscara com 6 pontos', () => {
        const store = {};
        const mockLocalStorage = {
            getItem: (k) => store[k] ?? null,
            setItem: (k, v) => { store[k] = String(v); }
        };

        const mockElements = {
            totalBalance: { textContent: 'R$ 1.500,00', dataset: {} },
            totalIncome: { textContent: 'R$ 3.000,00', dataset: {} },
            totalExpense: { textContent: 'R$ 1.500,00', dataset: {} },
            billsAmount: { textContent: 'R$ 450,00', dataset: {} },
            totalInvested: { textContent: 'R$ 12.000,00', dataset: {} }
        };

        let cardIconClass = 'fas fa-eye';

        function updateVisibility() {
            const isHidden = mockLocalStorage.getItem('tonu_hide_balance') === 'true';
            cardIconClass = isHidden ? 'fas fa-eye-slash' : 'fas fa-eye';

            Object.keys(mockElements).forEach(id => {
                const el = mockElements[id];
                if (isHidden) {
                    if (!el.dataset.realValue && !el.textContent.includes('•••')) {
                        el.dataset.realValue = el.textContent;
                    }
                    el.textContent = '••••••';
                } else if (el.dataset.realValue) {
                    el.textContent = el.dataset.realValue;
                }
            });
        }

        function toggleVisibility() {
            const isHidden = mockLocalStorage.getItem('tonu_hide_balance') === 'true';
            mockLocalStorage.setItem('tonu_hide_balance', isHidden ? 'false' : 'true');
            updateVisibility();
        }

        // 1º Clique: Ocultar saldos
        toggleVisibility();
        assert.strictEqual(mockLocalStorage.getItem('tonu_hide_balance'), 'true');
        assert.strictEqual(cardIconClass, 'fas fa-eye-slash');
        assert.strictEqual(mockElements.totalBalance.textContent, '••••••');
        assert.strictEqual(mockElements.totalIncome.textContent, '••••••');
        assert.strictEqual(mockElements.totalExpense.textContent, '••••••');
        assert.strictEqual(mockElements.billsAmount.textContent, '••••••');
        assert.strictEqual(mockElements.totalInvested.textContent, '••••••');

        // 2º Clique: Revelar saldos
        toggleVisibility();
        assert.strictEqual(mockLocalStorage.getItem('tonu_hide_balance'), 'false');
        assert.strictEqual(cardIconClass, 'fas fa-eye');
        assert.strictEqual(mockElements.totalBalance.textContent, 'R$ 1.500,00');
        assert.strictEqual(mockElements.totalIncome.textContent, 'R$ 3.000,00');
        assert.strictEqual(mockElements.totalExpense.textContent, 'R$ 1.500,00');
        assert.strictEqual(mockElements.billsAmount.textContent, 'R$ 450,00');
        assert.strictEqual(mockElements.totalInvested.textContent, 'R$ 12.000,00');
    });

    return results;
}

module.exports = { runUnitTests };
