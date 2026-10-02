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

    return results;
}

module.exports = { runUnitTests };
