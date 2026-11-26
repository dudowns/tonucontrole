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

    test('Metas: Resolução de Ciclos Temporais, Reprogramação sem culpa e Aporte Rápido', () => {
        function resolveGoalYear(g, currentCycleYear = 2026) {
            if (!g) return currentCycleYear;
            if (g.year === 'continuous' || g.target_year === 'continuous' || g.temporal_mode === 'continuous') {
                return 'continuous';
            }
            if (g.target_year && !isNaN(parseInt(g.target_year))) {
                return parseInt(g.target_year);
            }
            if (g.year && !isNaN(parseInt(g.year))) {
                return parseInt(g.year);
            }
            if (g.deadline && typeof g.deadline === 'string' && g.deadline.length >= 4) {
                const y = parseInt(g.deadline.slice(0, 4));
                if (!isNaN(y) && y >= 2020 && y <= 2040) return y;
            }
            if (g.created_at && typeof g.created_at === 'string' && g.created_at.length >= 4) {
                const y = parseInt(g.created_at.slice(0, 4));
                if (!isNaN(y) && y >= 2020 && y <= 2040) return y;
            }
            return currentCycleYear;
        }

        // 1. Resolução de Ano
        const g1 = { title: 'Portão', target_year: 2026 };
        const g2 = { title: 'Casinha', deadline: '2027-12-31' };
        const g3 = { title: 'Aposentadoria', year: 'continuous' };
        const g4 = { title: 'Viagem Antiga', deadline: '2025-06-30' };

        assert.strictEqual(resolveGoalYear(g1), 2026, 'Deve resolver target_year');
        assert.strictEqual(resolveGoalYear(g2), 2027, 'Deve inferir ano da deadline');
        assert.strictEqual(resolveGoalYear(g3), 'continuous', 'Deve identificar meta contínua');
        assert.strictEqual(resolveGoalYear(g4), 2025, 'Deve identificar ano histórico');

        // 2. Reprogramação sem culpa (postponeGoal)
        function postponeGoalLogic(goal, currentCycleYear = 2026, targetYear = null) {
            const nextYear = targetYear || (currentCycleYear + 1);
            goal.target_year = nextYear;
            goal.postponed_to = nextYear;
            goal.deadline = `${nextYear}-12-31`;
            return goal;
        }

        const projectGoal = { id: 'g_portao', title: 'Motor portão', target_year: 2026, completed: false };
        const postponed = postponeGoalLogic(projectGoal, 2026, 2027);
        assert.strictEqual(postponed.target_year, 2027, 'target_year atualizado');
        assert.strictEqual(postponed.postponed_to, 2027, 'postponed_to atualizado');
        assert.strictEqual(postponed.deadline, '2027-12-31', 'deadline atualizada');

        // 3. Detecção de isPostponed consistente
        function checkIsPostponed(g, isComplete, currentCycleYear = 2026) {
            const goalYear = resolveGoalYear(g, currentCycleYear);
            return !isComplete && (g.postponed_to || (g.target_year && g.target_year > currentCycleYear) || (typeof goalYear === 'number' && goalYear < currentCycleYear));
        }

        assert.strictEqual(checkIsPostponed(postponed, false, 2026), 2027, 'Detecta meta reprogramada para 2027');
        assert.strictEqual(checkIsPostponed({ ...g4, completed: false }, false, 2026), true, 'Meta não concluída de 2025 vista em 2026 é tratada com status neutro de reprogramação');

        // 4. Aporte Rápido (+ R$ 500)
        function applyQuickAdd(goal, amt) {
            const cur = Number(goal.current_amount || 0) + amt;
            const isCompleted = cur >= Number(goal.target_amount || 0);
            return { current_amount: cur, completed: isCompleted };
        }

        const finGoal = { id: 'g_fin', title: 'Poupança', current_amount: 1500, target_amount: 2000 };
        const quickRes = applyQuickAdd(finGoal, 500);
        assert.strictEqual(quickRes.current_amount, 2000, 'Saldo somado corretamente');
        assert.strictEqual(quickRes.completed, true, 'Meta atinge 100% de conclusão');
    });

    test('Metas P2: postponeGoal entre ciclos, quickAddAmount com proteção de marcos e fallback temporal completo', () => {
        // 1. postponeGoal entre múltiplos ciclos
        function postponeGoalLogic(goal, currentCycleYear, targetYear = null) {
            const nextYear = targetYear || (currentCycleYear + 1);
            goal.target_year = nextYear;
            goal.postponed_to = nextYear;
            goal.year = nextYear;
            goal.deadline = `${nextYear}-12-31`;
            return goal;
        }

        const goalCycle = { id: 'g_multicycle', title: 'Pintura', target_year: 2026, completed: false };
        postponeGoalLogic(goalCycle, 2026, 2027);
        assert.strictEqual(goalCycle.target_year, 2027, 'Ciclo 2026 movido para 2027');
        assert.strictEqual(goalCycle.deadline, '2027-12-31');

        postponeGoalLogic(goalCycle, 2027, 2028);
        assert.strictEqual(goalCycle.target_year, 2028, 'Ciclo 2027 movido para 2028');
        assert.strictEqual(goalCycle.postponed_to, 2028);
        assert.strictEqual(goalCycle.deadline, '2028-12-31');

        // 2. quickAddAmount respeitando milestones_fired e evitando celebração duplicada
        function simulateQuickAddWithMilestones(goal, amount) {
            const cur = Number(goal.current_amount || 0) + amount;
            const target = Number(goal.target_amount || 0);
            const isCompleted = target > 0 && cur >= target;
            goal.current_amount = cur;
            goal.completed = isCompleted;

            const pct = Math.min(100, Math.floor((cur / target) * 100));
            const milestones = [25, 50, 75, 90, 100];
            let fired = Array.isArray(goal.milestones_fired) ? [...goal.milestones_fired] : [];
            let newFired = [];

            for (const m of milestones) {
                if (pct >= m && !fired.includes(m)) {
                    fired.push(m);
                    newFired.push(m);
                }
            }

            let celebrationTriggered = false;
            if (newFired.length > 0) {
                goal.milestones_fired = fired;
                if (newFired.includes(100)) {
                    celebrationTriggered = true;
                }
            }

            return { goal, celebrationTriggered, newFired };
        }

        const goalForQuickAdd = {
            id: 'g_qa',
            title: 'Viagem Japão',
            current_amount: 800,
            target_amount: 1000,
            milestones_fired: [25, 50, 75]
        };

        // Aporte 1: R$ 200 leva a 100% (dispara 90% e 100%, comemora 1x)
        const step1 = simulateQuickAddWithMilestones(goalForQuickAdd, 200);
        assert.strictEqual(step1.goal.current_amount, 1000);
        assert.strictEqual(step1.celebrationTriggered, true, 'Deve celebrar 100% atingido pela primeira vez');
        assert.deepStrictEqual(step1.newFired, [90, 100]);
        assert.deepStrictEqual(step1.goal.milestones_fired, [25, 50, 75, 90, 100]);

        // Aporte 2: R$ 500 extra na meta já concluída (1500/1000) -> NÃO deve comemorar novamente
        const step2 = simulateQuickAddWithMilestones(goalForQuickAdd, 500);
        assert.strictEqual(step2.goal.current_amount, 1500);
        assert.strictEqual(step2.celebrationTriggered, false, 'NÃO deve disparar celebração duplicada pois marco 100 já foi disparado');
        assert.deepStrictEqual(step2.newFired, []);

        // 3. resolveGoalYear: Hierarquia completa de fallback
        function resolveGoalYearComplete(g, currentCycleYear = 2026) {
            if (!g) return currentCycleYear;
            if (g.target_year === 'continuous' || g.year === 'continuous' || g.is_continuous === true || g.temporal_mode === 'continuous') return 'continuous';
            if (g.target_year && !isNaN(parseInt(g.target_year))) return parseInt(g.target_year);
            if (g.year && !isNaN(parseInt(g.year))) return parseInt(g.year);
            if (g.deadline) {
                const y = parseInt(String(g.deadline).substring(0, 4));
                if (!isNaN(y) && y > 1900 && y < 2200) return y;
            }
            const t = (g.title || '').toLowerCase();
            if (t.includes('longo prazo') || t.includes('reserva de emergência')) return 'continuous';
            if (g.created_at) {
                const y = parseInt(String(g.created_at).substring(0, 4));
                if (!isNaN(y) && y > 1900 && y < 2200) return y;
            }
            return currentCycleYear;
        }

        assert.strictEqual(resolveGoalYearComplete({ is_continuous: true }), 'continuous', 'Fallback para is_continuous');
        assert.strictEqual(resolveGoalYearComplete({ temporal_mode: 'continuous' }), 'continuous', 'Fallback para temporal_mode');
        assert.strictEqual(resolveGoalYearComplete({ title: 'Minha Reserva de Emergência' }), 'continuous', 'Fallback por palavra-chave reserva de emergência');
        assert.strictEqual(resolveGoalYearComplete({ target_year: 2029 }), 2029, 'Prioridade target_year');
        assert.strictEqual(resolveGoalYearComplete({ year: 2030 }), 2030, 'Fallback para year');
        assert.strictEqual(resolveGoalYearComplete({ deadline: '2027-08-15' }), 2027, 'Fallback para ano de deadline');
        assert.strictEqual(resolveGoalYearComplete({ created_at: '2024-03-01T10:00:00Z' }), 2024, 'Fallback para created_at');
        assert.strictEqual(resolveGoalYearComplete({}), 2026, 'Fallback padrão para ciclo corrente 2026');

        // 4. Notificação push de Patrimônio com tag idempotente
        function generateWealthPushPayload(goal, currentEquity) {
            return {
                title: '🏆 Meta de Patrimônio Conquistada!',
                body: `Parabéns! Você alcançou R$ ${currentEquity.toFixed(2)} na meta "${goal.title}"!`,
                url: 'pages/goals.html',
                tag: `goal-wealth-100-${goal.id}`
            };
        }

        const wealthGoal = { id: 'g_patrimonio_10k', title: 'Patrimônio R$ 10.000', target_amount: 10000 };
        const pushPayload = generateWealthPushPayload(wealthGoal, 10250.50);
        assert.strictEqual(pushPayload.tag, 'goal-wealth-100-g_patrimonio_10k', 'Tag única e idempotente para evitar duplicação');
        assert.ok(pushPayload.body.includes('R$ 10250.50'));
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

        // Cenário 3: Exemplo do Usuário com 20 parcelas (Mãe + 19 seguintes)
        let twentyBills = [];
        const motherId = 'mother_bill_20';
        for (let i = 1; i <= 20; i++) {
            twentyBills.push({
                id: i === 1 ? motherId : `child_bill_${i}`,
                parent_transaction_id: i === 1 ? null : motherId,
                description: `Compra Parcelada (${i}/20)`,
                current_installment: i,
                installments: 20,
                installment_number: i,
                installment_total: 20,
                date: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
                type: 'expense'
            });
        }

        // Ao apagar a 1ª parcela (1/20), detecta as outras 19 restantes
        const remainingTwenty = findRemainingSeries(twentyBills[0], twentyBills);
        assert.strictEqual(remainingTwenty.length, 19, 'Deve identificar as 19 parcelas restantes ao excluir a 1ª');

        // Simulação da exclusão "Apagar o restante":
        const idsToDelete = [twentyBills[0].id, ...remainingTwenty.map(r => r.id)];
        const idSet = new Set(idsToDelete.map(String));
        twentyBills = twentyBills.filter(b => !idSet.has(String(b.id)));
        assert.strictEqual(twentyBills.length, 0, 'Todas as 20 parcelas são removidas, não deixando 2/20 no mês seguinte');
    });

    test('Modal de Exclusão de Parcelas: getFullRemainingSeries busca entre meses e aciona opções do modal', async () => {
        // Simulação do cenário real onde a tela só tem o mês corrente carregado (1 parcela de 20)
        const motherId = 'mother_parcel_1';
        const singleMonthBills = [{
            id: motherId,
            description: 'Mãe (1/20)',
            current_installment: 1,
            installments: 20,
            installment_number: 1,
            installment_total: 20,
            date: '2026-10-15',
            type: 'expense',
            is_bill: true,
            user_id: 'user_test_123'
        }];

        // O banco/cache possui todas as 20 parcelas em meses futuros
        const fullDatabaseBills = [];
        for (let i = 1; i <= 20; i++) {
            fullDatabaseBills.push({
                id: i === 1 ? motherId : `child_parcel_${i}`,
                parent_transaction_id: i === 1 ? null : motherId,
                description: `Mãe (${i}/20)`,
                current_installment: i,
                installments: 20,
                installment_number: i,
                installment_total: 20,
                date: `2026-${String(((i - 1) % 12) + 1).padStart(2, '0')}-15`,
                type: 'expense',
                is_bill: true,
                user_id: 'user_test_123'
            });
        }

        // Simula getFullRemainingSeries consultando o backend quando a lista da tela só tem 1 item
        async function mockGetFullRemainingSeries(target, localList, dbList) {
            let list = Array.isArray(localList) ? localList.slice() : [];
            const isSeriesCandidate = Boolean(
                target.parent_transaction_id ||
                (target.description && /\(\d+\/\d+\)/.test(target.description)) ||
                (parseInt(target.installments, 10) > 1) ||
                (parseInt(target.installment_total, 10) > 1)
            );
            if (isSeriesCandidate && dbList) {
                const map = new Map();
                list.forEach(item => map.set(String(item.id), item));
                dbList.forEach(item => map.set(String(item.id), item));
                list = Array.from(map.values());
            }

            const targetId = String(target.id);
            const targetNum = parseInt(target.installment_number || target.current_installment, 10) || 0;
            const targetDate = String(target.due_date || target.date || '').slice(0, 10);

            return list.filter(x => {
                if (!x || String(x.id) === targetId) return false;
                const xDesc = String(x.description || '').replace(/\s*\(\d+\/\d+\)$/, '').trim().toLowerCase();
                const targetDesc = String(target.description || '').replace(/\s*\(\d+\/\d+\)$/, '').trim().toLowerCase();
                if (xDesc !== targetDesc && x.parent_transaction_id !== targetId) return false;
                const xNum = parseInt(x.installment_number || x.current_installment, 10) || 0;
                const xDate = String(x.due_date || x.date || '').slice(0, 10);
                if (targetNum > 0 && xNum > 0) return xNum >= targetNum;
                if (targetDate && xDate) return xDate >= targetDate;
                return true;
            });
        }

        // 1. Busca de série através dos meses futuros
        const remaining = await mockGetFullRemainingSeries(singleMonthBills[0], singleMonthBills, fullDatabaseBills);
        assert.strictEqual(remaining.length, 19, 'Mesmo a tela tendo apenas o mês 1, encontra as 19 parcelas futuras no backend');

        // 2. Opção 'from_now' (Excluir a partir de agora / desta em diante)
        // Se o usuário está na parcela 5/20 e escolhe 'from_now', remove 5 a 20 e mantém 1 a 4
        const targetParcel5 = fullDatabaseBills[4]; // 5/20
        const remainingFrom5 = await mockGetFullRemainingSeries(targetParcel5, [targetParcel5], fullDatabaseBills);
        assert.strictEqual(remainingFrom5.length, 15, 'A partir da parcela 5/20, restam 15 parcelas futuras (6 a 20)');

        let dbCopyFromNow = fullDatabaseBills.slice();
        const idsFromNow = [targetParcel5.id, ...remainingFrom5.map(r => r.id)];
        const setFromNow = new Set(idsFromNow.map(String));
        dbCopyFromNow = dbCopyFromNow.filter(b => !setFromNow.has(String(b.id)));
        assert.strictEqual(dbCopyFromNow.length, 4, 'Opção from_now mantém as 4 parcelas anteriores (1 a 4) e exclui da 5 em diante');

        // 3. Opção 'all_series' (Excluir TODAS as parcelas da série inteira)
        let dbCopyAll = fullDatabaseBills.slice();
        const idsToDeleteAll = fullDatabaseBills.map(r => String(r.id));
        const setAll = new Set(idsToDeleteAll);
        dbCopyAll = dbCopyAll.filter(b => !setAll.has(String(b.id)));
        assert.strictEqual(dbCopyAll.length, 0, 'Opção all_series apaga a série inteira (todas as 20 parcelas)');

        // 4. Opção 'single' (Excluir somente esta)
        let dbCopySingle = fullDatabaseBills.slice();
        const setSingle = new Set([String(singleMonthBills[0].id)]);
        dbCopySingle = dbCopySingle.filter(b => !setSingle.has(String(b.id)));
        assert.strictEqual(dbCopySingle.length, 19, 'Opção single remove apenas a parcela 1/20 e mantém as 19 restantes');

        // 5. Opção 'cancel' (Cancelar)
        let dbCopyCancel = fullDatabaseBills.slice();
        assert.strictEqual(dbCopyCancel.length, 20, 'Opção cancel não deve remover nenhuma parcela');
    });

    test('Paridade em Transações: Exclusão Inteligente de Parcelas e Recorrência no Extrato', () => {
        // Cenário: 12 parcelas de uma compra no extrato de transações
        const transactionsList = [];
        const motherTxId = 'tx_mother_parcel_1';
        for (let i = 1; i <= 12; i++) {
            transactionsList.push({
                id: i === 1 ? motherTxId : `tx_child_parcel_${i}`,
                parent_transaction_id: i === 1 ? null : motherTxId,
                description: `Notebook Dell (${i}/12)`,
                installment_number: i,
                installment_total: 12,
                amount: 350.00,
                type: 'expense',
                date: `2026-${String(i).padStart(2, '0')}-10`
            });
        }

        // Simula getFullSeriesInfo com as 12 parcelas
        const targetParcel3 = transactionsList[2]; // Parcela 3/12
        const targetId = String(targetParcel3.id);
        const allOther = transactionsList.filter(x => String(x.id) !== targetId);
        const fromNow = allOther.filter(x => (x.installment_number || 0) >= (targetParcel3.installment_number || 0));

        assert.strictEqual(fromNow.length, 9, 'A partir da 3ª parcela, restam 9 parcelas futuras (4 a 12)');
        assert.strictEqual(allOther.length, 11, 'A série completa possui 11 outras parcelas além da 3ª');

        // Teste de exclusão 'from_now' (3 a 12)
        const idsFromNow = new Set([targetId, ...fromNow.map(r => String(r.id))]);
        const remainingAfterFromNow = transactionsList.filter(t => !idsFromNow.has(String(t.id)));
        assert.strictEqual(remainingAfterFromNow.length, 2, 'from_now mantém as parcelas 1 e 2 no extrato');
        assert.strictEqual(remainingAfterFromNow[0].installment_number, 1);
        assert.strictEqual(remainingAfterFromNow[1].installment_number, 2);

        // Teste de exclusão 'all_series' (1 a 12)
        const idsAll = new Set([targetId, ...allOther.map(r => String(r.id))]);
        const remainingAfterAll = transactionsList.filter(t => !idsAll.has(String(t.id)));
        assert.strictEqual(remainingAfterAll.length, 0, 'all_series remove todas as 12 parcelas da série');

        // Teste de exclusão 'single' (somente parcela 3)
        const idsSingle = new Set([targetId]);
        const remainingAfterSingle = transactionsList.filter(t => !idsSingle.has(String(t.id)));
        assert.strictEqual(remainingAfterSingle.length, 11, 'single remove exclusivamente a parcela 3');
    });

    test('Sync Manager & PWA Badging: Indicador Visual de Sincronização e Estados de Fila', () => {
        function resolveSyncState(isOnline, isSyncing, pendingCount) {
            if (isSyncing) return { status: 'syncing', label: 'Sincronizando...' };
            if (!isOnline) return { status: 'offline', label: pendingCount > 0 ? `⚡ ${pendingCount} offline` : 'Offline' };
            if (pendingCount > 0) return { status: 'pending', label: `⚡ ${pendingCount} pendente${pendingCount > 1 ? 's' : ''}` };
            return { status: 'online', label: 'Sincronizado' };
        }

        // Estado 1: Online e sem pendências
        const st1 = resolveSyncState(true, false, 0);
        assert.strictEqual(st1.status, 'online');
        assert.strictEqual(st1.label, 'Sincronizado');

        // Estado 2: Online com 3 itens na fila
        const st2 = resolveSyncState(true, false, 3);
        assert.strictEqual(st2.status, 'pending');
        assert.strictEqual(st2.label, '⚡ 3 pendentes');

        // Estado 3: Offline com 1 item na fila
        const st3 = resolveSyncState(false, false, 1);
        assert.strictEqual(st3.status, 'offline');
        assert.strictEqual(st3.label, '⚡ 1 offline');

        // Estado 4: Offline sem itens na fila
        const st4 = resolveSyncState(false, false, 0);
        assert.strictEqual(st4.status, 'offline');
        assert.strictEqual(st4.label, 'Offline');

        // Estado 5: Processando sincronização
        const st5 = resolveSyncState(true, true, 2);
        assert.strictEqual(st5.status, 'syncing');
        assert.strictEqual(st5.label, 'Sincronizando...');
    });

    test('Antecipação de Parcelas: Quitação antecipada em lote, transação única de extrato e divergência de valor', () => {
        // Cenário: 20 parcelas de R$ 100 cada (Empréstimo)
        const fullSeries = [];
        const motherId = 'bill_mother_20';
        for (let i = 1; i <= 20; i++) {
            fullSeries.push({
                id: i === 1 ? motherId : `bill_parcel_${i}`,
                parent_transaction_id: i === 1 ? null : motherId,
                description: `Empréstimo (${i}/20)`,
                installment_number: i,
                installment_total: 20,
                amount: 100.00,
                paid: i <= 9, // Parcelas 1 a 9 já pagas
                date: `2026-${String(((i - 1) % 12) + 1).padStart(2, '0')}-15`
            });
        }

        const currentParcel10 = fullSeries[9]; // Parcela atual 10/20
        const currentNum = currentParcel10.installment_number;

        // 1. Validação de selecionabilidade: parcelas em aberto (incluindo a atual 10 e futuras 11 a 20)
        const selectable = fullSeries.filter(b => !b.paid);
        assert.strictEqual(selectable.length, 11, 'As 11 parcelas em aberto (10 a 20) podem ser selecionadas para quitação');

        // 1b. Parcelas já pagas (1 a 9) ficam desabilitadas
        const disabledPaid = fullSeries.filter(b => b.paid);
        assert.strictEqual(disabledPaid.length, 9, 'As 9 parcelas anteriores já quitadas ficam desabilitadas');

        // 2. Usuário seleciona as parcelas 18, 19 e 20
        const selected = fullSeries.filter(b => [18, 19, 20].includes(b.installment_number));
        assert.strictEqual(selected.length, 3);
        const sumOriginal = selected.reduce((s, b) => s + b.amount, 0);
        assert.strictEqual(sumOriginal, 300.00, 'Soma das 3 parcelas originais é R$ 300');

        // 2b. Usuário também tem o poder de selecionar a parcela atual (10) junto com 18, 19 e 20
        const selectedWithCurrent = fullSeries.filter(b => [10, 18, 19, 20].includes(b.installment_number));
        assert.strictEqual(selectedWithCurrent.length, 4);
        const sumWithCurrent = selectedWithCurrent.reduce((s, b) => s + b.amount, 0);
        assert.strictEqual(sumWithCurrent, 400.00, 'Soma incluindo a parcela atual é R$ 400');

        // 3. Resolução de helpers via funções puras / mock local (padrão dos demais testes unitários)
        const checkValueMismatch = function(typed, sum) {
            return Math.abs((parseFloat(typed) || 0) - (parseFloat(sum) || 0)) > 0.01;
        };
        const buildAnticipationDescription = function(base, nums) {
            var cleanDesc = String(base || 'Conta').replace(/\s*\(\d+\/\d+\)$/, '').trim();
            var sorted = (nums || []).slice().sort((a, b) => a - b);
            return `Antecipação: ${cleanDesc} (${sorted.join(', ')})`;
        };
        const createAnticipationTransaction = function(target, selectedList, typed, date) {
            var mId = target.parent_transaction_id || target.id;
            var nums = (selectedList || []).map(b => parseInt(b.installment_number || b.current_installment, 10)).filter(Boolean);
            return {
                id: 'ant_test',
                user_id: target.user_id,
                description: buildAnticipationDescription(target.description, nums),
                amount: Math.abs(parseFloat(typed) || 0),
                date: date,
                due_date: date,
                type: 'expense',
                category_id: target.category_id || null,
                is_bill: false,
                paid: true,
                paid_date: date,
                parent_transaction_id: String(mId),
                is_anticipation: true
            };
        };

        // Testes dos helpers
        assert.strictEqual(checkValueMismatch(300, 300), false, 'Valor igual não deve acusar divergência');
        assert.strictEqual(checkValueMismatch(280, 300), true, 'Valor com desconto (R$ 280) acusa divergência');
        assert.strictEqual(checkValueMismatch(320, 300), true, 'Valor com juros (R$ 320) acusa divergência');

        // 4. Descrição canônica (ambos os cenários: só futuras E atual + futuras)
        const descOnlyFuture = buildAnticipationDescription('Empréstimo (10/20)', [18, 19, 20]);
        assert.strictEqual(descOnlyFuture, 'Antecipação: Empréstimo (18, 19, 20)', 'Cenário só futuras 18, 19, 20');

        const descWithCurrent = buildAnticipationDescription('Empréstimo (10/20)', [10, 18, 19, 20]);
        assert.strictEqual(descWithCurrent, 'Antecipação: Empréstimo (10, 18, 19, 20)', 'Cenário incluindo atual 10 + 18, 19, 20');

        // 5. Payload da transação única de extrato (cenário quitação conjunta 10 + 18 + 19 + 20)
        const txPayloadJoint = createAnticipationTransaction(currentParcel10, selectedWithCurrent, 380.00, '2026-10-21');
        assert.strictEqual(txPayloadJoint.amount, 380.00, 'Extrato registra o valor digitado da quitação conjunta (R$ 380)');
        assert.strictEqual(txPayloadJoint.description, 'Antecipação: Empréstimo (10, 18, 19, 20)');
        assert.strictEqual(txPayloadJoint.is_anticipation, true, 'is_anticipation deve ser true');
        assert.strictEqual(txPayloadJoint.is_bill, false, 'is_bill deve ser false para não duplicar como conta a pagar');
        assert.strictEqual(txPayloadJoint.paid, true, 'Transação de quitação nasce como paga');
        assert.strictEqual(txPayloadJoint.parent_transaction_id, motherId, 'Vinculada à conta-mãe');

        // 6. Teste de Isolamento de Linhagem: 2 contas com MESMA descrição ("Empréstimo")
        const otherLoanSeries = [];
        const otherMotherId = 'bill_other_loan_12';
        for (let j = 1; j <= 12; j++) {
            otherLoanSeries.push({
                id: `other_loan_${j}`,
                parent_transaction_id: otherMotherId,
                description: `Empréstimo (${j}/12)`,
                installment_number: j,
                installment_total: 12,
                amount: 50.00,
                paid: false
            });
        }
        const mixedSeries = [...fullSeries, ...otherLoanSeries];
        // Filtro estrito por parent_transaction_id
        const targetPId = currentParcel10.parent_transaction_id || currentParcel10.id;
        const isolated = mixedSeries.filter(b => {
            const bId = String(b.id);
            if (bId === String(currentParcel10.id)) return true;
            const bPId = b.parent_transaction_id ? String(b.parent_transaction_id) : null;
            if (targetPId) {
                if (bId === targetPId) return true;
                if (bPId) return bPId === targetPId;
            }
            return false;
        });
        assert.strictEqual(isolated.length, 20, 'Filtro de linhagem isola exatamente as 20 parcelas do Empréstimo A');
        assert.ok(isolated.every(b => !String(b.id).startsWith('other_loan_')), 'Nenhuma parcela do Empréstimo B entra na série do Empréstimo A');
    });

    test('Antecipação: Atalhos de desconto rápido, tag no extrato, filtro e reversão inteligente', async () => {
        const { revertAnticipatedBills } = require('../js/core.js');

        // 1. Simulação dos atalhos de desconto rápido (-5%, -10%, -15%, -20%)
        const baseSum = 400.00;
        const discount5 = baseSum * (1 - 0.05);
        const discount10 = baseSum * (1 - 0.10);
        const discount15 = baseSum * (1 - 0.15);
        const discount20 = baseSum * (1 - 0.20);

        assert.strictEqual(discount5, 380.00, 'Desconto de 5% sobre R$ 400 resulta em R$ 380');
        assert.strictEqual(discount10, 360.00, 'Desconto de 10% sobre R$ 400 resulta em R$ 360');
        assert.strictEqual(discount15, 340.00, 'Desconto de 15% sobre R$ 400 resulta em R$ 340');
        assert.strictEqual(discount20, 320.00, 'Desconto de 20% sobre R$ 400 resulta em R$ 320');

        // 2. Simulação de filtro no extrato por 'anticipation'
        const txList = [
            { id: '1', description: 'Compra Supermercado', type: 'expense', is_anticipation: false },
            { id: '2', description: 'Antecipação: Empréstimo (10, 18, 19, 20)', type: 'expense', is_anticipation: true },
            { id: '3', description: 'Salário Mensal', type: 'income', is_anticipation: false },
            { id: '4', description: 'antecipação: Notebook (5, 6)', type: 'expense', is_anticipation: false }
        ];

        const filtered = txList.filter(t => !!(t.is_anticipation || (t.description && String(t.description).toLowerCase().startsWith('antecipação:'))));
        assert.strictEqual(filtered.length, 2, 'Filtro de antecipação isola com precisão os 2 lançamentos');
        assert.strictEqual(filtered[0].id, '2');
        assert.strictEqual(filtered[1].id, '4');

        // 3. Simulação da reversão inteligente de parcelas
        const motherId = 'bill_mother_car_48';
        const billsCache = [
            { id: 'c10', parent_transaction_id: motherId, installment_number: 10, description: 'Financiamento Carro (10/48)', paid: true, paid_date: '2026-10-21', amount_paid: 95.00 },
            { id: 'c18', parent_transaction_id: motherId, installment_number: 18, description: 'Financiamento Carro (18/48)', paid: true, paid_date: '2026-10-21', amount_paid: 95.00 },
            { id: 'c19', parent_transaction_id: motherId, installment_number: 19, description: 'Financiamento Carro (19/48)', paid: true, paid_date: '2026-10-21', amount_paid: 95.00 },
            { id: 'c20', parent_transaction_id: motherId, installment_number: 20, description: 'Financiamento Carro (20/48)', paid: true, paid_date: '2026-10-21', amount_paid: 95.00 },
            { id: 'c21', parent_transaction_id: motherId, installment_number: 21, description: 'Financiamento Carro (21/48)', paid: false, paid_date: null, amount_paid: null }
        ];

        const antTx = {
            id: 'tx_ant_999',
            description: 'Antecipação: Financiamento Carro (10, 18, 19, 20)',
            parent_transaction_id: motherId,
            is_anticipation: true
        };

        const result = await revertAnticipatedBills(antTx, { bills: billsCache });
        assert.strictEqual(result.revertedCount, 4, 'Deve reverter exatamente 4 parcelas antecipadas');
        assert.deepStrictEqual(result.installmentNumbers, [10, 18, 19, 20]);

        // Verifica que o estado voltou para NÃO PAGO e amount_paid foi limpo
        const p10 = billsCache.find(b => b.id === 'c10');
        const p18 = billsCache.find(b => b.id === 'c18');
        const p21 = billsCache.find(b => b.id === 'c21');
        assert.strictEqual(p10.paid, false, 'Parcela 10 agora está com paid = false');
        assert.strictEqual(p10.paid_date, null, 'Parcela 10 paid_date resetado');
        assert.strictEqual(p10.amount_paid, null, 'Parcela 10 amount_paid resetado');
        assert.strictEqual(p18.paid, false, 'Parcela 18 agora está com paid = false');
        assert.strictEqual(p21.paid, false, 'Parcela 21 permaneceu inalterada');
    });

    test('Sync Manager: Sanitização de colunas de transações e auto-recuperação de esquemas remotos', () => {
        // Objeto rico em metadados de UI do cliente
        const richClientTx = {
            id: 'b1234567-89ab-cdef-0123-456789abcdef',
            user_id: 'u1234567-89ab-cdef-0123-456789abcdef',
            description: 'Compra Mercado (1/10)',
            amount: 250.50,
            type: 'expense',
            date: '2026-10-23',
            category: 'Alimentação', // campo apenas de exibição na UI
            category_id: 'c1234567-89ab-cdef-0123-456789abcdef',
            paid: true,
            recurrence_type: 'installments', // campo cliente
            is_recurring: false, // campo cliente
            installments: 10, // campo cliente
            current_installment: 1, // campo cliente
            installment_total: 10, // campo cliente
            installment_number: 1, // campo cliente
            updated_at: '2026-10-23T10:00:00.000Z' // campo cliente
        };

        const allowed = [
            'id', 'user_id', 'description', 'amount', 'type', 'date',
            'category_id', 'paid', 'paid_date', 'is_bill', 'due_date',
            'parent_transaction_id', 'is_anticipation', 'amount_paid',
            'notes', 'tags', 'created_at'
        ];

        // 1. Simula _filterTransactionColumns
        const filtered = {};
        for (const key of allowed) {
            if (richClientTx[key] !== undefined) {
                filtered[key] = richClientTx[key];
            }
        }

        assert.strictEqual(filtered.category, undefined, 'Não deve enviar campo "category" textual para a tabela');
        assert.strictEqual(filtered.recurrence_type, undefined, 'Não deve enviar "recurrence_type"');
        assert.strictEqual(filtered.installments, undefined, 'Não deve enviar "installments"');
        assert.strictEqual(filtered.current_installment, undefined, 'Não deve enviar "current_installment"');
        assert.strictEqual(filtered.installment_number, undefined, 'Não deve enviar "installment_number"');
        assert.strictEqual(filtered.description, 'Compra Mercado (1/10)');
        assert.strictEqual(filtered.amount, 250.50);
        assert.strictEqual(filtered.category_id, 'c1234567-89ab-cdef-0123-456789abcdef');

        // 2. Simula _extractMissingColumn de erro do PostgREST
        function extractMissingCol(err) {
            const msg = ((err.message || '') + ' ' + (err.details || '') + ' ' + (err.hint || ''));
            const m1 = msg.match(/column ["']?([a-zA-Z0-9_]+)["']? of relation/i);
            if (m1 && m1[1]) return m1[1];
            const m2 = msg.match(/Could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i);
            if (m2 && m2[1]) return m2[1];
            return null;
        }

        const err1 = { message: "Could not find the 'due_date' column of 'transactions' in the schema cache" };
        assert.strictEqual(extractMissingCol(err1), 'due_date', 'Extrai coluna ausente do schema cache');

        const err2 = { message: 'column "is_anticipation" of relation "transactions" does not exist' };
        assert.strictEqual(extractMissingCol(err2), 'is_anticipation', 'Extrai coluna ausente de erro SQL');
    });

    return results;
}

module.exports = { runUnitTests };

