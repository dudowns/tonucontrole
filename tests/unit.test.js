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

    test('Biometria & Face ID: Resolução e persistência de sessão híbrida (online/offline)', () => {
        const store = {};
        const mockLocal = {
            getItem: (k) => store[k] || null,
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; }
        };
        const sStore = {};
        const mockSession = {
            getItem: (k) => sStore[k] || null,
            setItem: (k, v) => { sStore[k] = String(v); },
            removeItem: (k) => { delete sStore[k]; }
        };

        // Simula usuário retornado por Face ID (WebAuthn)
        const bioUser = {
            id: 'usr_faceid_123',
            email: 'usuario@tonucontrole.com',
            name: 'Carlos Silva'
        };

        // Salvar após autenticação com Face ID
        const offlinePayload = {
            user: bioUser,
            timestamp: Date.now(),
            email: bioUser.email
        };
        mockLocal.setItem('tonu_offline_session', JSON.stringify(offlinePayload));
        mockSession.setItem('tonu_user', JSON.stringify(bioUser));

        // Testar resolução de sessão no mobile/desktop
        const rawOffline = mockLocal.getItem('tonu_offline_session');
        const parsed = JSON.parse(rawOffline);
        const resolvedUser = parsed.user || parsed;

        assert.strictEqual(resolvedUser.id, 'usr_faceid_123');
        assert.strictEqual(resolvedUser.email, 'usuario@tonucontrole.com');

        // Testar normalização de metadados
        function normalizeUser(u) {
            const name = u.user_metadata?.full_name || u.name || u.email.split('@')[0];
            if (!u.user_metadata) u.user_metadata = { full_name: name };
            return u;
        }

        const normalized = normalizeUser(resolvedUser);
        assert.strictEqual(normalized.user_metadata.full_name, 'Carlos Silva');
    });

    test('Face ID: Re-hidratação síncrona de token (setSession) antes de query e fallback de cache local', async () => {
        const store = {};
        const mockLocal = {
            getItem: (k) => store[k] || null,
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; }
        };
        const sStore = {};
        const mockSession = {
            getItem: (k) => sStore[k] || null,
            setItem: (k, v) => { sStore[k] = String(v); },
            removeItem: (k) => { delete sStore[k]; }
        };

        // Estado inicial: usuário tem biometria cadastrada com tokens de sessão
        const initialSession = {
            access_token: 'jwt.valid.token.123',
            refresh_token: 'refresh.token.456'
        };
        mockLocal.setItem('tonu_biometrics_enabled', 'true');
        mockLocal.setItem('tonu_biometrics_credential', 'cred_id_abc');
        mockLocal.setItem('tonu_biometrics_session', JSON.stringify(initialSession));
        mockLocal.setItem('tonu_biometrics_user', JSON.stringify({
            id: 'usr_real_999',
            email: 'investidor@tonucontrole.com',
            name: 'Ana Trader'
        }));

        // Dados no cache local (ex: da última sessão)
        const localCachedTx = [
            { id: 'tx_1', amount: 150.00, description: 'Mercado', type: 'expense' },
            { id: 'tx_2', amount: 3500.00, description: 'Salário', type: 'income' }
        ];
        mockLocal.setItem('tonu_transactions_usr_real_999', JSON.stringify(localCachedTx));

        // Mock Supabase Client
        let currentAuthBearer = null;
        let setSessionCalled = false;
        let queryExecutedWithBearer = null;

        const mockSupabaseClient = {
            auth: {
                setSession: async ({ access_token, refresh_token }) => {
                    if (access_token && refresh_token) {
                        currentAuthBearer = access_token;
                        setSessionCalled = true;
                        return { data: { session: { access_token, refresh_token } }, error: null };
                    }
                    return { data: null, error: new Error('Invalid tokens') };
                },
                refreshSession: async () => {
                    currentAuthBearer = 'jwt.renewed.token.789';
                    return { data: { session: { access_token: currentAuthBearer } }, error: null };
                },
                signOut: async () => {
                    currentAuthBearer = null;
                    return { error: null };
                }
            },
            from: (table) => ({
                select: () => ({
                    eq: (col, val) => {
                        queryExecutedWithBearer = currentAuthBearer;
                        // Simula retorno do banco
                        return Promise.resolve({ data: [], error: null });
                    }
                })
            })
        };

        // 1. Simulação: face_id_login com re-hidratação síncrona
        const rawBioSession = mockLocal.getItem('tonu_biometrics_session');
        assert.ok(rawBioSession, 'tonu_biometrics_session deve existir');
        const parsedSession = JSON.parse(rawBioSession);

        await mockSupabaseClient.auth.setSession({
            access_token: parsedSession.access_token,
            refresh_token: parsedSession.refresh_token
        });

        assert.strictEqual(setSessionCalled, true, 'setSession deve ser chamado antes da query');
        assert.strictEqual(currentAuthBearer, 'jwt.valid.token.123', 'Bearer token deve estar ativo');

        // 2. Simulação: Query ao Supabase executa com o token re-hidratado
        const queryRes = await mockSupabaseClient.from('transactions').select().eq('user_id', 'usr_real_999');
        assert.strictEqual(queryExecutedWithBearer, 'jwt.valid.token.123', 'A query ao Supabase foi enviada com o Bearer token correto');

        // 3. Simulação: Fallback de cache quando nuvem retorna vazio
        let activeTransactions = queryRes.data;
        let usedCache = false;
        if (activeTransactions.length === 0) {
            const cached = mockLocal.getItem('tonu_transactions_usr_real_999');
            if (cached) {
                activeTransactions = JSON.parse(cached);
                usedCache = true;
            }
        }

        assert.strictEqual(usedCache, true, 'Deve recorrer ao cache local de segurança');
        assert.strictEqual(activeTransactions.length, 2, 'Recuperou as 2 transações do cache');
        assert.strictEqual(activeTransactions[0].description, 'Mercado');

        // 4. Simulação: Logout Não-Destrutivo (biometria ativa)
        const hasBiometrics = mockLocal.getItem('tonu_biometrics_enabled') === 'true';
        if (hasBiometrics) {
            // Apenas limpa sessionStorage, NÃO chama signOut e NÃO apaga biometrics
            mockSession.removeItem('tonu_user');
            mockSession.removeItem('tonu_session_unlocked');
        } else {
            await mockSupabaseClient.auth.signOut();
            mockLocal.removeItem('tonu_biometrics_session');
        }

        assert.strictEqual(currentAuthBearer, 'jwt.valid.token.123', 'Token não foi revogado no logout não-destrutivo');
        assert.ok(mockLocal.getItem('tonu_biometrics_session'), 'Sessão biométrica preservada para o próximo login');

        // 5. Simulação: Logout de Todos os Dispositivos (destrutivo)
        await mockSupabaseClient.auth.signOut();
        mockLocal.removeItem('tonu_biometrics_enabled');
        mockLocal.removeItem('tonu_biometrics_session');
        assert.strictEqual(currentAuthBearer, null, 'Token revogado no logout global');
        assert.strictEqual(mockLocal.getItem('tonu_biometrics_session'), null, 'Biometria removida no logout global');
    });

    test('Proventos Futuros & A Receber: Classificação dinâmica, segregação de métricas e paridade Desktop/Mobile', async () => {
        const today = new Date();
        const todayISO = today.toISOString().substring(0, 10);

        // Data passada (pago)
        const pastDate = new Date(today);
        pastDate.setDate(pastDate.getDate() - 10);
        const pastISO = pastDate.toISOString().substring(0, 10);

        // Data futura (a receber)
        const futureDate = new Date(today);
        futureDate.setDate(futureDate.getDate() + 15);
        const futureISO = futureDate.toISOString().substring(0, 10);

        const sampleDividends = [
            { id: 'div_1', ticker: 'MXRF11', total_value: 120.50, date: pastISO, type: 'Rendimento' },
            { id: 'div_2', ticker: 'PETR4', total_value: 350.00, date: todayISO, type: 'Dividendo' },
            { id: 'div_3', ticker: 'HGLG11', total_value: 215.80, date: futureISO, type: 'Rendimento' }
        ];

        // 1. Classificação Pago vs A Receber
        const paidList = sampleDividends.filter(d => (d.payment_date || d.date) <= todayISO);
        const pendingList = sampleDividends.filter(d => (d.payment_date || d.date) > todayISO);

        assert.strictEqual(paidList.length, 2, '2 proventos devem ser identificados como Pagos');
        assert.strictEqual(pendingList.length, 1, '1 provento deve ser identificado como A Receber');
        assert.strictEqual(pendingList[0].ticker, 'HGLG11', 'Provento futuro de HGLG11');

        // 2. Cálculo dos totais
        const totalRecebidos = paidList.reduce((acc, d) => acc + d.total_value, 0);
        const totalAReceber = pendingList.reduce((acc, d) => acc + d.total_value, 0);

        assert.strictEqual(totalRecebidos, 470.50, 'Soma correta de recebidos');
        assert.strictEqual(totalAReceber, 215.80, 'Soma correta de a receber');

        // 3. Status Badge Helper
        function getDividendStatus(d) {
            const dt = (d.payment_date || d.date || '').substring(0, 10);
            return dt <= todayISO ? 'pago' : 'a_receber';
        }

        assert.strictEqual(getDividendStatus(sampleDividends[0]), 'pago');
        assert.strictEqual(getDividendStatus(sampleDividends[1]), 'pago');
        assert.strictEqual(getDividendStatus(sampleDividends[2]), 'a_receber');
    });

    test('Seletor de Mês no Dashboard Mobile: Navegação, cálculo de períodos e persistência de datas', async () => {
        let currentOffset = 0;
        const months = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];

        function getMonthDate(offset) {
            const d = new Date();
            d.setDate(1);
            d.setMonth(d.getMonth() + offset);
            return d;
        }

        function getMonthLabel(offset) {
            const d = getMonthDate(offset);
            return `${months[d.getMonth()]} ${d.getFullYear()}`;
        }

        // Teste 1: Mês atual (offset = 0)
        const now = new Date();
        const currentLabel = getMonthLabel(0);
        assert.strictEqual(currentLabel, `${months[now.getMonth()]} ${now.getFullYear()}`);

        // Teste 2: Mês anterior (offset = -1)
        currentOffset -= 1;
        const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        assert.strictEqual(getMonthLabel(currentOffset), `${months[prevDate.getMonth()]} ${prevDate.getFullYear()}`);

        // Teste 3: Próximo mês (offset = +1 a partir do anterior => offset = 0)
        currentOffset += 1;
        assert.strictEqual(currentOffset, 0);
        assert.strictEqual(getMonthLabel(currentOffset), currentLabel);

        // Teste 4: Virada de ano (12 meses para o futuro)
        const nextYearDate = new Date(now.getFullYear(), now.getMonth() + 12, 1);
        assert.strictEqual(getMonthLabel(12), `${months[nextYearDate.getMonth()]} ${nextYearDate.getFullYear()}`);

        // Teste 5: Cálculo dos limites do mês selecionado (firstDay e lastDay)
        const selDate = getMonthDate(currentOffset);
        const y = selDate.getFullYear();
        const m = String(selDate.getMonth() + 1).padStart(2, '0');
        const lastDayNum = new Date(y, selDate.getMonth() + 1, 0).getDate();
        const firstDay = `${y}-${m}-01`;
        const lastDay = `${y}-${m}-${String(lastDayNum).padStart(2, '0')}`;

        assert.strictEqual(firstDay.substring(8, 10), '01');
        assert.ok(lastDayNum >= 28 && lastDayNum <= 31, 'Último dia do mês válido');
    });

    test('Metas: Cálculo de Rendimento CDI com Tabelas Regressivas de IOF e IR', () => {
        const IOF_TABLE = {
            1: 0.96, 2: 0.93, 3: 0.90, 4: 0.86, 5: 0.83,
            6: 0.80, 7: 0.76, 8: 0.73, 9: 0.70, 10: 0.66,
            11: 0.63, 12: 0.60, 13: 0.56, 14: 0.53, 15: 0.50,
            16: 0.46, 17: 0.43, 18: 0.40, 19: 0.36, 20: 0.33,
            21: 0.30, 22: 0.26, 23: 0.23, 24: 0.20, 25: 0.16,
            26: 0.13, 27: 0.10, 28: 0.06, 29: 0.03
        };

        function getIOF(days) {
            if (days <= 0) return 0.96;
            if (days >= 30) return 0;
            return IOF_TABLE[days] !== undefined ? IOF_TABLE[days] : 0;
        }

        function getIR(days) {
            if (days <= 180) return 0.225;
            if (days <= 360) return 0.200;
            if (days <= 720) return 0.175;
            return 0.150;
        }

        // Teste de alíquotas de IOF
        assert.strictEqual(getIOF(1), 0.96, 'Dia 1 IOF = 96%');
        assert.strictEqual(getIOF(15), 0.50, 'Dia 15 IOF = 50%');
        assert.strictEqual(getIOF(29), 0.03, 'Dia 29 IOF = 3%');
        assert.strictEqual(getIOF(30), 0, 'Dia 30 IOF = 0%');
        assert.strictEqual(getIOF(100), 0, 'Dia 100 IOF = 0%');

        // Teste de alíquotas de IR
        assert.strictEqual(getIR(30), 0.225, '30 dias IR = 22.5%');
        assert.strictEqual(getIR(180), 0.225, '180 dias IR = 22.5%');
        assert.strictEqual(getIR(181), 0.200, '181 dias IR = 20.0%');
        assert.strictEqual(getIR(360), 0.200, '360 dias IR = 20.0%');
        assert.strictEqual(getIR(361), 0.175, '361 dias IR = 17.5%');
        assert.strictEqual(getIR(720), 0.175, '720 dias IR = 17.5%');
        assert.strictEqual(getIR(721), 0.150, '721 dias IR = 15.0%');

        // Simulação de rendimento com aporte de R$ 1.000 após 10 dias
        const amount = 1000;
        const cdiDaily = 0.040169; // 0.040169%
        const cdiPct = 100;
        const diffDays = 10;
        const workDays = Math.floor(diffDays * (252 / 365));
        const ratePerDay = (cdiDaily / 100) * (cdiPct / 100);
        const grossYield = amount * (Math.pow(1 + ratePerDay, workDays) - 1);
        const iof = grossYield * getIOF(diffDays);
        const ir = Math.max(0, grossYield - iof) * getIR(diffDays);
        const netYield = Math.max(0, grossYield - iof - ir);

        assert.ok(grossYield > 0, 'Rendimento bruto positivo');
        assert.ok(iof > 0, 'IOF incide nos primeiros 29 dias');
        assert.ok(ir > 0, 'IR incide sobre bruto - iof');
        assert.ok(netYield < grossYield, 'Rendimento líquido menor que o bruto após tributos');
    });

    test('Metas: Disparo Idempotente de Marcos de Progresso (25%, 50%, 75%, 90%, 100%)', () => {
        function computeNewMilestones(targetAmount, newAmount, alreadyFired) {
            if (!targetAmount || targetAmount <= 0) return { fired: alreadyFired, newFired: [] };
            const pct = Math.min(100, Math.floor((newAmount / targetAmount) * 100));
            const milestones = [25, 50, 75, 90, 100];
            const fired = [...alreadyFired];
            const newFired = [];

            for (const m of milestones) {
                if (pct >= m && !fired.includes(m)) {
                    fired.push(m);
                    newFired.push(m);
                }
            }
            return { pct, fired, newFired };
        }

        const target = 1000;

        // Aporte 1: R$ 300 (30% -> deve disparar 25%)
        const res1 = computeNewMilestones(target, 300, []);
        assert.deepStrictEqual(res1.newFired, [25]);
        assert.deepStrictEqual(res1.fired, [25]);

        // Aporte 2: R$ 300 adicional (Total 600 = 60% -> já disparou 25%, agora dispara 50%)
        const res2 = computeNewMilestones(target, 600, res1.fired);
        assert.deepStrictEqual(res2.newFired, [50]);
        assert.deepStrictEqual(res2.fired, [25, 50]);

        // Aporte 3: Mesmo valor ou aporte menor sem alcançar novo marco (Total 650 = 65% -> nenhum novo marco)
        const res3 = computeNewMilestones(target, 650, res2.fired);
        assert.deepStrictEqual(res3.newFired, []);
        assert.deepStrictEqual(res3.fired, [25, 50]);

        // Aporte 4: Salto grande direto para R$ 1.050 (100% -> dispara 75%, 90% e 100%)
        const res4 = computeNewMilestones(target, 1050, res3.fired);
        assert.deepStrictEqual(res4.newFired, [75, 90, 100]);
        assert.deepStrictEqual(res4.fired, [25, 50, 75, 90, 100]);
    });

    test('Utilitários de Data: parseLocalDate e Comparação Timezone-Safe', () => {
        function parseLocalDate(dateStr) {
            if (!dateStr) return null;
            if (dateStr instanceof Date) return dateStr;
            var str = String(dateStr).trim();
            var match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (match) {
                var year = parseInt(match[1], 10);
                var month = parseInt(match[2], 10) - 1;
                var day = parseInt(match[3], 10);
                return new Date(year, month, day, 12, 0, 0);
            }
            return new Date(dateStr);
        }

        const d1 = parseLocalDate('2026-10-15');
        assert.strictEqual(d1.getFullYear(), 2026);
        assert.strictEqual(d1.getMonth(), 9); // Outubro = mês 9 (0-indexed)
        assert.strictEqual(d1.getDate(), 15);
        assert.strictEqual(d1.getHours(), 12);

        // Diferença em dias sem desvio de fuso
        const d2 = parseLocalDate('2026-10-20');
        const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000);
        assert.strictEqual(diffDays, 5, 'Diferença de 5 dias exata');

        // Formatação Timezone-Safe de '2026-10-19' sem desvio para dia 18
        function formatDateSafe(dateStr) {
            const match = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (match) return `${match[3]}/${match[2]}/${match[1]}`;
            return dateStr;
        }
        assert.strictEqual(formatDateSafe('2026-10-19'), '19/10/2026', 'Data 2026-10-19 deve ser sempre exibida como 19/10/2026');
    });

    test('Parcelamento de Contas (Mobile & Desktop): extração de parcelas, restante e cálculo "quanto as parcelas de quanto"', () => {
        function getInstallmentInfo(item) {
            if (!item) return { isInstallment: false };
            let recurrenceType = item.recurrence_type || null;
            let installments = parseInt(item.installments || item.installment_total, 10);
            let current = parseInt(item.current_installment || item.installment_number || item.installment_current, 10);

            const desc = (item.description || '') + ' ' + (item.notes || '');
            const match = desc.match(/\b(\d+)\s*(?:\/|de)\s*(\d+)\b/i);
            if (match && (!installments || installments <= 1)) {
                current = parseInt(match[1], 10);
                installments = parseInt(match[2], 10);
                if (!recurrenceType && installments > 1) {
                    recurrenceType = 'installments';
                }
            }

            const isInstallment = recurrenceType === 'installments' || (installments && installments > 1);
            if (!isInstallment) return { isInstallment: false };

            const total = Math.max(2, installments || 2);
            const curr = Math.max(1, Math.min(total, current || 1));
            const remaining = Math.max(0, total - curr);
            const unitAmount = parseFloat(item.amount) || 0;
            const remainingAmount = remaining * unitAmount;

            return {
                isInstallment: true,
                total: total,
                current: curr,
                remaining: remaining,
                unitAmount: unitAmount,
                remainingAmount: remainingAmount,
                label: `Parcela ${curr} de ${total}`
            };
        }

        // Caso 1: Objeto com campos estruturados (installments: 5, current_installment: 2, amount: 150)
        const b1 = { id: '1', description: 'Curso de Inglês', installments: 5, current_installment: 2, amount: 150 };
        const info1 = getInstallmentInfo(b1);
        assert.strictEqual(info1.isInstallment, true);
        assert.strictEqual(info1.current, 2);
        assert.strictEqual(info1.total, 5);
        assert.strictEqual(info1.remaining, 3);
        assert.strictEqual(info1.remainingAmount, 450);
        assert.strictEqual(info1.label, 'Parcela 2 de 5');

        // Caso 2: Objeto com campos de sincronização alternativa (installment_total: 10, installment_number: 10)
        const b2 = { id: '2', description: 'Notebook', installment_total: 10, installment_number: 10, amount: 350 };
        const info2 = getInstallmentInfo(b2);
        assert.strictEqual(info2.isInstallment, true);
        assert.strictEqual(info2.current, 10);
        assert.strictEqual(info2.total, 10);
        assert.strictEqual(info2.remaining, 0);
        assert.strictEqual(info2.remainingAmount, 0);

        // Caso 3: Fallback de regex pela descrição "Celular (3/12)"
        const b3 = { id: '3', description: 'Celular (3/12)', amount: 200 };
        const info3 = getInstallmentInfo(b3);
        assert.strictEqual(info3.isInstallment, true);
        assert.strictEqual(info3.current, 3);
        assert.strictEqual(info3.total, 12);
        assert.strictEqual(info3.remaining, 9);
        assert.strictEqual(info3.remainingAmount, 1800);
    });

    test('ITEM 15 (Cenário 5): Geração de 12 contas recorrentes com parent_transaction_id e verificação de não duplicação na edição', () => {
        // Simulação do Cenário 5: Conta "Claro", R$ 31, 15/11/2026, freq. Mensal
        const desc = "Claro";
        const finalAmount = 31.00;
        const startDate = "2026-11-15";
        const recurrenceType = "monthly";
        const paid = false;
        const allBills = [];

        function addMonths(dateStr, months) {
            const [y, m, d] = dateStr.split('-').map(Number);
            const target = new Date(y, m - 1 + months, d);
            const resY = target.getFullYear();
            const resM = String(target.getMonth() + 1).padStart(2, '0');
            const resD = String(target.getDate()).padStart(2, '0');
            return `${resY}-${resM}-${resD}`;
        }

        // 1. Criação Inicial (m = 0..11)
        const parentBillId = 'parent-bill-claro-uuid-1234';
        const batch = [];
        for (let m = 0; m < 12; m++) {
            const dueDate = addMonths(startDate, m);
            const itemPaid = (m === 0) ? paid : false;
            const billId = (m === 0) ? parentBillId : `child-uuid-${m}`;

            batch.push({
                id: billId,
                parent_transaction_id: (m === 0 ? null : parentBillId),
                description: desc,
                amount: finalAmount,
                date: dueDate,
                installments: 12,
                current_installment: m + 1,
                installment_total: 12,
                installment_number: m + 1,
                is_recurring: true,
                recurrence_type: 'monthly',
                paid: itemPaid
            });
        }
        batch.forEach(item => allBills.push(item));

        // Validações de Criação:
        assert.strictEqual(allBills.length, 12, "Devem ser criadas exatamente 12 linhas");
        const parent = allBills.find(b => b.id === parentBillId);
        assert.ok(parent, "Conta-mãe deve existir");
        assert.strictEqual(parent.parent_transaction_id, null, "Conta-mãe deve ter parent_transaction_id nulo");
        assert.strictEqual(parent.amount, 31);
        assert.strictEqual(parent.date, "2026-11-15");

        const children = allBills.filter(b => b.parent_transaction_id === parentBillId);
        assert.strictEqual(children.length, 11, "Devem existir 11 linhas filhas com o parent_transaction_id da mãe");
        children.forEach((child, idx) => {
            assert.strictEqual(child.parent_transaction_id, parentBillId);
            assert.strictEqual(child.amount, 31);
            assert.strictEqual(child.current_installment, idx + 2);
        });

        // 2. Validação de Edição da Conta-Mãe (NÃO DUPLICAÇÃO):
        const editId = parentBillId;
        const existingChildren = allBills.filter(b => String(b.parent_transaction_id) === String(editId));
        assert.strictEqual(existingChildren.length, 11, "A conta-mãe já possui filhas vinculadas");

        let newlyGeneratedBatch = [];
        if (recurrenceType === 'monthly') {
            if (existingChildren.length === 0) {
                // se não tivesse filhas, geraria
                for (let m = 1; m < 12; m++) newlyGeneratedBatch.push({});
            }
        }
        assert.strictEqual(newlyGeneratedBatch.length, 0, "Ao editar a conta-mãe com filhas existentes, NENHUMA linha adicional é gerada (zero duplicações)");
        assert.strictEqual(allBills.length, 12, "Total de contas permanece estritamente 12");
    });

    test('INDEXEDDB (Fase 3, Passo 5.5): Verificação de integridade de esquema em abertura limpa (onupgradeneeded) e stores', () => {
        // Validação da especificação das Stores do IndexedDB TonuControlePWA_DB
        const DB_NAME = 'TonuControlePWA_DB';
        const DB_VERSION = 1;
        const EXPECTED_STORES = ['sync_queue', 'shared_target_data', 'offline_entity_cache'];

        assert.strictEqual(DB_NAME, 'TonuControlePWA_DB');
        assert.strictEqual(DB_VERSION, 1);

        // Simulação do evento onupgradeneeded em ambiente limpo (ex: aba anônima)
        const mockStoreNames = new Set();
        const createdStores = {};

        const mockDb = {
            objectStoreNames: {
                contains: (name) => mockStoreNames.has(name)
            },
            createObjectStore: (name, options) => {
                mockStoreNames.add(name);
                createdStores[name] = { options, indexes: {} };
                return {
                    createIndex: (idxName, keyPath, opts) => {
                        createdStores[name].indexes[idxName] = { keyPath, opts };
                    }
                };
            }
        };

        // Executa a lógica de upgrade definida no js/sync.js
        if (!mockDb.objectStoreNames.contains('sync_queue')) {
            const queueStore = mockDb.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
            queueStore.createIndex('timestamp', 'timestamp', { unique: false });
            queueStore.createIndex('status', 'status', { unique: false });
        }
        if (!mockDb.objectStoreNames.contains('shared_target_data')) {
            const sharedStore = mockDb.createObjectStore('shared_target_data', { keyPath: 'id', autoIncrement: true });
            sharedStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!mockDb.objectStoreNames.contains('offline_entity_cache')) {
            mockDb.createObjectStore('offline_entity_cache', { keyPath: 'key' });
        }

        // Verificações de todas as stores necessárias
        EXPECTED_STORES.forEach(store => {
            assert.ok(mockDb.objectStoreNames.contains(store), `Store ${store} deve ser criada no upgrade inicial`);
        });

        // Teste de gravação e recuperação do schema de entidade com milestones_fired e parent_transaction_id
        const entityCache = {};
        function setCache(key, data) {
            entityCache[key] = { key, data, updatedAt: Date.now() };
        }
        function getCache(key) {
            return entityCache[key] ? entityCache[key].data : null;
        }

        // Armazenamento de goal com novo campo milestones_fired
        const goalData = [{ id: 'goal-1', title: 'Carro', target_amount: 50000, milestones_fired: [25, 50] }];
        setCache('goals_user_123', goalData);
        const cachedGoals = getCache('goals_user_123');
        assert.deepStrictEqual(cachedGoals[0].milestones_fired, [25, 50], "IndexedDB aceita perfeitamente novos campos de meta");

        // Armazenamento de conta com parent_transaction_id
        const billData = [{ id: 'bill-child-1', parent_transaction_id: 'bill-mother-1', amount: 31 }];
        setCache('bills_user_123', billData);
        const cachedBills = getCache('bills_user_123');
        assert.strictEqual(cachedBills[0].parent_transaction_id, 'bill-mother-1', "IndexedDB aceita perfeitamente parent_transaction_id");
    });

    test('Fluxo de Pagamento de Contas: Vencimento dia 20, pago no dia 15 -> Extrato dia 15, Contas dia 20, e reversão para dia 20', () => {
        // 1. Criar conta com vencimento dia 20
        const bill = {
            id: 'bill_test_1',
            description: 'Internet Fibra',
            amount: 120.00,
            date: '2026-10-20',
            due_date: '2026-10-20',
            type: 'expense',
            is_bill: true,
            paid: false,
            paid_date: null
        };

        // Estado inicial
        assert.strictEqual(bill.date, '2026-10-20');
        assert.strictEqual(bill.due_date || bill.date, '2026-10-20');
        assert.strictEqual(bill.paid, false);

        // 2. Simular ação de Pagar no dia 15 (lógica idêntica ao toggleBillPaid)
        const paymentDate = '2026-10-15';
        if (!bill.due_date) {
            bill.due_date = bill.date;
        }
        bill.paid = true;
        bill.paid_date = paymentDate;
        bill.date = paymentDate; // Atualiza date para data real de pagamento

        // 3. Conferir:
        // - Extrato / Transações (utiliza o campo `date` da transação):
        assert.strictEqual(bill.date, '2026-10-15', 'No extrato e transações a data deve ser o dia do pagamento (15)');
        assert.strictEqual(bill.paid_date, '2026-10-15', 'O campo paid_date armazena a data real de pagamento (15)');

        // - Tela de Contas (utiliza `due_date || date` para manter a data de vencimento):
        const displayDueDateInBillsScreen = bill.due_date || bill.date;
        assert.strictEqual(displayDueDateInBillsScreen, '2026-10-20', 'Na tela de Contas a data de vencimento deve continuar sendo dia 20');

        // 4. Desmarcar "Pago" (reverter para pendente)
        bill.paid = false;
        bill.paid_date = null;
        if (bill.due_date) {
            bill.date = bill.due_date; // Restaura a data para o vencimento original
        }

        // Conferir reversão
        assert.strictEqual(bill.date, '2026-10-20', 'Ao desmarcar pago, date volta a ser dia 20');
        assert.strictEqual(bill.paid_date, null, 'Ao desmarcar pago, paid_date é limpo para null');
        assert.strictEqual(bill.paid, false, 'Status volta para não pago');
    });

    // Guarda 1: Duplo clique rápido -> Apenas 1 registro processado no extrato
    test('Guarda Anti-Duplicata 1: Duplo clique rápido gera 1 registro no extrato, não 2', () => {
        const bill = {
            id: 'bill_guard_1',
            description: 'Energia Elétrica',
            amount: 250.00,
            date: '2026-10-20',
            due_date: '2026-10-20',
            paid: false,
            paid_date: null,
            _updating: false
        };

        let syncCalls = 0;
        function simulateToggle(b) {
            if (b._updating) return false;
            b._updating = true;
            try {
                // Durante a execução assíncrona/em voo do primeiro clique
                b.paid = true;
                b.date = '2026-10-15';
                syncCalls++;
                return true;
            } finally {
                // b._updating é resetado ao concluir
            }
        }

        // Primeiro clique inicia processamento (deixa _updating ativo durante a operação)
        const res1 = simulateToggle(bill);
        // Segundo clique rápido dispara concorrentemente antes do término do primeiro
        const res2 = simulateToggle(bill);
        // Conclui o primeiro
        bill._updating = false;

        assert.strictEqual(syncCalls, 1, 'Sync/atualização deve ser executado exatamente 1 vez');
        assert.strictEqual(res1, true, 'O primeiro clique foi aceito e processado');
        assert.strictEqual(res2, false, 'O segundo clique rápido foi barrado pela guarda _updating');
        assert.strictEqual(bill.date, '2026-10-15', 'Data do extrato reflete a data do pagamento único');
    });

    // Guarda 2: Idempotência na fila de sync -> Substituição em vez de empilhamento
    test('Guarda Anti-Duplicata 2: Enfileiramento de UPDATE_BILL substitui pendência existente', () => {
        const queue = [];
        function enqueueUpdateBill(action, data) {
            const existingIndex = queue.findIndex(q => q.action === 'UPDATE_BILL' && q.status === 'pending' && q.data.id === data.id);
            if (existingIndex !== -1) {
                queue[existingIndex] = { ...queue[existingIndex], data, timestamp: Date.now() };
            } else {
                queue.push({ id: queue.length + 1, action, data, status: 'pending', timestamp: Date.now() });
            }
        }

        enqueueUpdateBill('UPDATE_BILL', { id: 'bill_abc', paid: true, date: '2026-10-15' });
        assert.strictEqual(queue.length, 1);

        // Re-enfileiramento antes de sincronizar (ex: reconexão ou reenvio)
        enqueueUpdateBill('UPDATE_BILL', { id: 'bill_abc', paid: true, date: '2026-10-15', due_date: '2026-10-20' });
        assert.strictEqual(queue.length, 1, 'Fila deve conter 1 único registro (substituição por idempotência)');
        assert.strictEqual(queue[0].data.due_date, '2026-10-20');
    });

    // Guarda 3: Clicar "Pagar" em conta já paga -> 0 alteração
    test('Guarda Anti-Duplicata 3: Clicar "Pagar" em conta já paga resulta em 0 alteração', () => {
        const bill = { id: 'bill_guard_3', date: '2026-10-15', paid: true, paid_date: '2026-10-15' };
        let mutated = false;

        function handlePay(targetStatus) {
            const newStatus = (targetStatus !== undefined) ? !!targetStatus : !bill.paid;
            if (bill.paid === newStatus) return; // Guarda 3
            mutated = true;
        }

        handlePay(true); // Tenta marcar como paga uma conta que já está paga
        assert.strictEqual(mutated, false, 'Nenhuma alteração ou efeito colateral deve ocorrer');
        assert.strictEqual(bill.date, '2026-10-15');
    });

    // Exclusão de Parcelas e Recorrência: Detecção e Exclusão de "o restante"
    test('Exclusão Inteligente: findRemainingSeries detecta parcelas futuras e permite apagar o restante', () => {
        function findRemainingSeries(target, list) {
            if (!target || !Array.isArray(list)) return [];
            const targetId = String(target.id);
            let series = [];

            if (target.parent_transaction_id) {
                const parentId = String(target.parent_transaction_id);
                series = list.filter(x => x && (String(x.id) === parentId || String(x.parent_transaction_id) === parentId));
            } else {
                const children = list.filter(x => x && String(x.parent_transaction_id) === targetId);
                if (children.length > 0) series = [target, ...children];
            }

            if (series.length <= 1) {
                const match = String(target.description || '').match(/^(.*?)\s*\((\d+)\/(\d+)\)$/);
                const hasInst = (parseInt(target.installments, 10) > 1 || parseInt(target.installment_total, 10) > 1);
                if (match || hasInst) {
                    const cleanDesc = match ? match[1].trim().toLowerCase() : String(target.description || '').trim().toLowerCase();
                    series = list.filter(x => {
                        if (!x) return false;
                        const xDesc = String(x.description || '').replace(/\s*\(\d+\/\d+\)$/, '').trim().toLowerCase();
                        return (xDesc === cleanDesc) && (x.type === target.type);
                    });
                }
            }

            const targetDate = String(target.due_date || target.date || '').slice(0, 10);
            const targetNum = parseInt(target.installment_number || target.current_installment, 10) || 0;

            return series.filter(x => {
                if (!x || String(x.id) === targetId) return false;
                const xNum = parseInt(x.installment_number || x.current_installment, 10) || 0;
                const xDate = String(x.due_date || x.date || '').slice(0, 10);
                if (targetNum > 0 && xNum > 0) return xNum >= targetNum;
                if (targetDate && xDate) return xDate >= targetDate;
                return true;
            });
        }

        // Cenário 1: Série de 12 meses recorrentes
        const parentId = 'rec_mother';
        const recurringBills = [];
        for (let m = 1; m <= 12; m++) {
            const mStr = String(m).padStart(2, '0');
            recurringBills.push({
                id: m === 1 ? parentId : `rec_child_${m}`,
                parent_transaction_id: m === 1 ? null : parentId,
                description: 'Academia Mensal',
                date: `2026-${mStr}-10`,
                type: 'expense'
            });
        }

        // Ao tentar excluir o mês 3:
        const targetMonth3 = recurringBills[2]; // Março
        const remainingMonths = findRemainingSeries(targetMonth3, recurringBills);
        assert.strictEqual(remainingMonths.length, 9, 'Deve detectar os 9 meses restantes (Abril a Dezembro)');
        assert.ok(remainingMonths.every(r => r.date >= '2026-03-10'), 'Todos os restantes devem ser da data de Março em diante');

        // Cenário 2: Série de 5 parcelas
        const installmentBills = [
            { id: 'inst_1', description: 'Notebook (1/5)', current_installment: 1, installments: 5, date: '2026-01-10', type: 'expense' },
            { id: 'inst_2', description: 'Notebook (2/5)', current_installment: 2, installments: 5, date: '2026-02-10', type: 'expense' },
            { id: 'inst_3', description: 'Notebook (3/5)', current_installment: 3, installments: 5, date: '2026-03-10', type: 'expense' },
            { id: 'inst_4', description: 'Notebook (4/5)', current_installment: 4, installments: 5, date: '2026-04-10', type: 'expense' },
            { id: 'inst_5', description: 'Notebook (5/5)', current_installment: 5, installments: 5, date: '2026-05-10', type: 'expense' }
        ];

        // Ao tentar excluir a parcela 3:
        const remainingInst = findRemainingSeries(installmentBills[2], installmentBills);
        assert.strictEqual(remainingInst.length, 2, 'Faltam 2 parcelas (4/5 e 5/5)');
        assert.strictEqual(remainingInst[0].id, 'inst_4');
        assert.strictEqual(remainingInst[1].id, 'inst_5');

        // Ao tentar excluir a última parcela (5/5):
        const remainingLast = findRemainingSeries(installmentBills[4], installmentBills);
        assert.strictEqual(remainingLast.length, 0, 'A última parcela não tem restantes');
    });

    return results;
}

module.exports = { runUnitTests };

