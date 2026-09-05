// ==========================================================================
// TONUCONTROLE - FINANCIAL TOOLS & INTELLIGENCE SUITE
// Módulos unificados: Orçamentos, Fluxo de Caixa, Relatórios,
// Gerenciador de Categorias, Importador Bancário (OFX/CSV) e Backup JSON.
// ==========================================================================

(function () {
    'use strict';

    function formatMoney(val) {
        if (typeof window.formatCurrency === 'function') {
            return window.formatCurrency(val);
        }
        if (val === null || val === undefined || val === '') val = 0;
        if (typeof val === 'string') {
            const cleaned = val.replace(/[R$\s]/g, '');
            if (cleaned.includes(',') && cleaned.includes('.')) {
                val = cleaned.replace(/\./g, '').replace(',', '.');
            } else if (cleaned.includes(',')) {
                val = cleaned.replace(',', '.');
            }
            val = parseFloat(val);
        }
        const num = Number(val) || 0;
        try {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num).replace(/\u00A0/g, ' ');
        } catch {
            const isNegative = num < 0;
            const parts = Math.abs(num).toFixed(2).split('.');
            const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            const res = 'R$ ' + intPart + ',' + parts[1];
            return isNegative ? '-' + res : res;
        }
    }

    // ==========================================================================
    // 1. ORÇAMENTOS E LIMITES POR CATEGORIA (TonuBudget)
    // ==========================================================================
    class TonuBudgetManager {
        constructor() {
            this.storagePrefix = 'tonu_budget_limits_';
            this.nameMapPrefix = 'tonu_budget_namemap_';
            this.thresholdPrefix = 'tonu_budget_threshold_';
        }

        getBudgets(userId) {
            try {
                const raw = localStorage.getItem(this.storagePrefix + userId);
                return raw ? JSON.parse(raw) : {};
            } catch (e) {
                return {};
            }
        }

        getNameMap(userId) {
            try {
                const raw = localStorage.getItem(this.nameMapPrefix + userId);
                return raw ? JSON.parse(raw) : {};
            } catch (e) {
                return {};
            }
        }

        getWarningThreshold(userId) {
            try {
                const raw = localStorage.getItem(this.thresholdPrefix + userId);
                const val = parseFloat(raw);
                return (!isNaN(val) && val >= 50 && val <= 95) ? val : 80;
            } catch (e) {
                return 80;
            }
        }

        setWarningThreshold(userId, threshold) {
            const val = parseFloat(threshold) || 80;
            localStorage.setItem(this.thresholdPrefix + userId, String(val));
        }

        getLimitForCategory(userId, categoryId, categoryName = null) {
            const budgets = this.getBudgets(userId);
            if (categoryId && budgets[categoryId] !== undefined) {
                return Number(budgets[categoryId]) || 0;
            }
            if (categoryName) {
                const cleanName = categoryName.trim().toLowerCase();
                const nameMap = this.getNameMap(userId);
                if (nameMap[cleanName] && budgets[nameMap[cleanName]] !== undefined) {
                    return Number(budgets[nameMap[cleanName]]) || 0;
                }
                if (budgets[cleanName] !== undefined) {
                    return Number(budgets[cleanName]) || 0;
                }
                // Check case-insensitive match on keys
                for (const k in budgets) {
                    if (k.toLowerCase() === cleanName) {
                        return Number(budgets[k]) || 0;
                    }
                }
            }
            return 0;
        }

        setCategoryBudget(userId, categoryId, limitAmount, categoryName = null) {
            const budgets = this.getBudgets(userId);
            const nameMap = this.getNameMap(userId);
            const limit = parseFloat(limitAmount) || 0;

            const key = categoryId || (categoryName ? categoryName.trim() : null);
            if (!key) return;

            if (limit > 0) {
                budgets[key] = limit;
                if (categoryName) {
                    const cleanName = categoryName.trim().toLowerCase();
                    nameMap[cleanName] = key;
                    budgets[cleanName] = limit;
                }
            } else {
                delete budgets[key];
                if (categoryName) {
                    const cleanName = categoryName.trim().toLowerCase();
                    delete nameMap[cleanName];
                    delete budgets[cleanName];
                }
            }

            localStorage.setItem(this.storagePrefix + userId, JSON.stringify(budgets));
            localStorage.setItem(this.nameMapPrefix + userId, JSON.stringify(nameMap));

            try {
                window.dispatchEvent(new CustomEvent('tonu:budget-updated', { detail: { categoryId, categoryName, limit } }));
            } catch (e) {}

            if (typeof window.checkNotifications === 'function') {
                window.checkNotifications();
            }
        }

        calculateCategoryProgress(userId, transactions, categories, targetMonth = null) {
            const now = new Date();
            const monthPrefix = targetMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const threshold = this.getWarningThreshold(userId);
            const results = [];

            // Gather base expense categories
            const categoryPool = [...(categories || []).filter(c => c.type === 'expense')];

            // Also check transactions in the current month for any custom categories not in categories list
            const seenCategoryKeys = new Set(categoryPool.map(c => (c.name || '').trim().toLowerCase()));
            (transactions || []).forEach(t => {
                if (t.type === 'expense' && t.category) {
                    const clean = t.category.trim().toLowerCase();
                    if (!seenCategoryKeys.has(clean)) {
                        seenCategoryKeys.add(clean);
                        categoryPool.push({
                            id: t.category_id || ('cat_' + clean),
                            name: t.category.trim(),
                            icon: 'fa-tag',
                            color: '#6c5ce7',
                            type: 'expense'
                        });
                    }
                }
            });

            // Also check if user has set limits for any categories not yet in the pool
            const budgets = this.getBudgets(userId);
            for (const bKey in budgets) {
                const cleanKey = bKey.trim().toLowerCase();
                if (!seenCategoryKeys.has(cleanKey) && !categoryPool.some(c => c.id === bKey)) {
                    seenCategoryKeys.add(cleanKey);
                    categoryPool.push({
                        id: bKey,
                        name: bKey,
                        icon: 'fa-bullseye',
                        color: '#f39c12',
                        type: 'expense'
                    });
                }
            }

            categoryPool.forEach(cat => {
                const limit = this.getLimitForCategory(userId, cat.id, cat.name);
                const cleanName = (cat.name || '').trim().toLowerCase();

                const spent = (transactions || [])
                    .filter(t => {
                        if (t.type !== 'expense') return false;
                        if (!t.date || !t.date.startsWith(monthPrefix)) return false;
                        const tCat = (t.category || '').trim().toLowerCase();
                        return (cat.id && t.category_id && String(t.category_id) === String(cat.id)) ||
                               (cleanName && tCat === cleanName);
                    })
                    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

                const percentage = limit > 0 ? (spent / limit) * 100 : 0;
                const isExceeded = limit > 0 && spent > limit;
                const isWarning = limit > 0 && percentage >= threshold && spent <= limit;

                results.push({
                    categoryId: cat.id,
                    name: cat.name,
                    icon: cat.icon || 'fa-tag',
                    color: cat.color || '#6c5ce7',
                    limit: limit,
                    spent: spent,
                    remaining: Math.max(0, limit - spent),
                    exceededBy: Math.max(0, spent - limit),
                    percentage: percentage,
                    isExceeded: isExceeded,
                    isWarning: isWarning,
                    threshold: threshold
                });
            });

            // Sort: Exceeded first, then warnings, then highest spent
            results.sort((a, b) => {
                if (a.isExceeded && !b.isExceeded) return -1;
                if (!a.isExceeded && b.isExceeded) return 1;
                if (a.isWarning && !b.isWarning) return -1;
                if (!a.isWarning && b.isWarning) return 1;
                if (a.limit > 0 && b.limit === 0) return -1;
                if (a.limit === 0 && b.limit > 0) return 1;
                return b.spent - a.spent;
            });

            return results;
        }

        checkLimitAfterTransaction(userId, transaction, allTransactions, categories) {
            if (!transaction || transaction.type !== 'expense') return;

            const now = new Date();
            const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const txDate = transaction.date || currentMonthPrefix;
            if (!txDate.startsWith(currentMonthPrefix)) return; // Only notify if current month

            const catName = transaction.category || 'Outros';
            const catId = transaction.category_id || null;
            const limit = this.getLimitForCategory(userId, catId, catName);

            if (limit <= 0) return; // No limit set for this category

            const threshold = this.getWarningThreshold(userId);
            const cleanName = catName.trim().toLowerCase();

            // Calculate total spent in this category for current month
            const txList = allTransactions || [];
            const spent = txList
                .filter(t => {
                    if (t.type !== 'expense') return false;
                    if (!t.date || !t.date.startsWith(currentMonthPrefix)) return false;
                    const tCat = (t.category || '').trim().toLowerCase();
                    return (catId && t.category_id && String(t.category_id) === String(catId)) ||
                           (cleanName && tCat === cleanName);
                })
                .reduce((sum, t) => sum + Number(t.amount || 0), 0);

            const percentage = (spent / limit) * 100;

            if (spent > limit) {
                const diff = spent - limit;
                if (typeof window.showToast === 'function') {
                    window.showToast(`🚨 Limite Estourado: Você gastou ${formatMoney(spent)} em ${catName}! Limite de ${formatMoney(limit)} ultrapassado em ${formatMoney(diff)}.`, 'error');
                }
            } else if (percentage >= threshold) {
                const remaining = limit - spent;
                if (typeof window.showToast === 'function') {
                    window.showToast(`⚠️ Atenção: Você atingiu ${percentage.toFixed(0)}% do limite de ${catName}! Gastou ${formatMoney(spent)} de ${formatMoney(limit)}. Restam ${formatMoney(remaining)}.`, 'warning');
                }
            }

            if (typeof window.checkNotifications === 'function') {
                setTimeout(window.checkNotifications, 100);
            }
        }

        async openBudgetModal() {
            try {
                let user = null;
                if (window.supabaseOffline) {
                    user = await window.supabaseOffline.isAuthenticated();
                }
                if (!user && window.supabaseClient?.auth?.getUser) {
                    const res = await window.supabaseClient.auth.getUser();
                    user = res?.data?.user;
                }

                if (!user) {
                    try {
                        const raw = localStorage.getItem('tonu_user');
                        if (raw) user = JSON.parse(raw);
                    } catch (e) {}
                }

                if (!user) {
                    if (window.showToast) window.showToast('Faça login para gerenciar limites.', 'warning');
                    return;
                }

                let txList = [];
                let catList = [];

                if (window.supabaseClient) {
                    try {
                        const [txRes, catRes] = await Promise.all([
                            window.supabaseClient.from('transactions').select('*').eq('user_id', user.id),
                            window.supabaseClient.from('categories').select('*').eq('user_id', user.id)
                        ]);
                        txList = txRes.data || [];
                        catList = catRes.data || [];
                    } catch (e) {
                        console.warn('Fallback para cache local:', e);
                    }
                }

                if (txList.length === 0) {
                    try {
                        const local = localStorage.getItem('tonu_transactions_' + user.id);
                        if (local) txList = JSON.parse(local);
                    } catch (e) {}
                }

                if (catList.length === 0) {
                    try {
                        const local = localStorage.getItem('tonu_categories_' + user.id);
                        if (local) catList = JSON.parse(local);
                    } catch (e) {}
                }

                this.showBudgetModal(user.id, catList, txList);
            } catch (e) {
                console.error('❌ Erro ao abrir modal de orçamentos:', e);
                if (window.showToast) window.showToast('Erro ao abrir gerenciador de limites.', 'error');
            }
        }

        showBudgetModal(userId, categories, transactions, onSaveCallback) {
            let modal = document.getElementById('tonuBudgetModal');
            if (modal) modal.remove();

            const progressList = this.calculateCategoryProgress(userId, transactions, categories);
            const currentThreshold = this.getWarningThreshold(userId);

            const activeBudgets = progressList.filter(p => p.limit > 0);
            const totalBudget = activeBudgets.reduce((sum, p) => sum + p.limit, 0);
            const totalSpent = progressList.reduce((sum, p) => sum + p.spent, 0);
            const totalSpentInBudgeted = activeBudgets.reduce((sum, p) => sum + p.spent, 0);

            const exceededCount = progressList.filter(p => p.isExceeded).length;
            const warningCount = progressList.filter(p => p.isWarning).length;

            const modalHtml = `
            <div id="tonuBudgetModal" style="position:fixed; inset:0; background:rgba(15,23,42,0.82); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(6px); font-family:'Inter',sans-serif;">
                <div style="background:#ffffff; border-radius:20px; max-width:680px; width:100%; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35); border:1px solid #e2e8f0; overflow:hidden;">
                    
                    <!-- HEADER -->
                    <div style="padding:18px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:flex-start; background:#ffffff;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <div style="width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg, #6c5ce7, #a29bfe); color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:16px; box-shadow:0 4px 10px rgba(108,92,231,0.25);">
                                    <i class="fas fa-bullseye"></i>
                                </div>
                                <div>
                                    <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">
                                        Limites & Tetos por Categoria
                                    </h3>
                                    <p style="font-size:12px; color:#64748b; margin:2px 0 0 0;">
                                        Estipule limites mensais e receba notificações automáticas se chegar perto ou ultrapassar.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <button onclick="document.getElementById('tonuBudgetModal').remove()" style="background:none; border:none; font-size:24px; cursor:pointer; color:#94a3b8; line-height:1; padding:4px;" title="Fechar">&times;</button>
                    </div>

                    <!-- STATS BAR -->
                    <div style="padding:12px 24px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px; font-size:12px;">
                        <div style="background:#ffffff; padding:10px 14px; border-radius:10px; border:1px solid #e2e8f0;">
                            <span style="color:#64748b; display:block; font-size:11px;">Teto Total Definido</span>
                            <strong style="color:#0f172a; font-size:15px; font-weight:700;">${formatMoney(totalBudget)}</strong>
                        </div>
                        <div style="background:#ffffff; padding:10px 14px; border-radius:10px; border:1px solid #e2e8f0;">
                            <span style="color:#64748b; display:block; font-size:11px;">Gasto Total no Mês</span>
                            <strong style="color:${totalSpentInBudgeted > totalBudget && totalBudget > 0 ? '#ff7675' : '#00b894'}; font-size:15px; font-weight:700;">
                                ${formatMoney(totalSpent)}
                            </strong>
                        </div>
                        <div style="background:#ffffff; padding:10px 14px; border-radius:10px; border:1px solid #e2e8f0;">
                            <span style="color:#64748b; display:block; font-size:11px;">Status de Alertas</span>
                            <div style="display:flex; gap:6px; align-items:center; margin-top:2px;">
                                ${exceededCount > 0 ? `<span style="background:#fee2e2; color:#dc2626; padding:2px 6px; border-radius:6px; font-size:11px; font-weight:700;">🚨 ${exceededCount} estourado(s)</span>` : ''}
                                ${warningCount > 0 ? `<span style="background:#fef3c7; color:#d97706; padding:2px 6px; border-radius:6px; font-size:11px; font-weight:700;">⚠️ ${warningCount} perto</span>` : ''}
                                ${exceededCount === 0 && warningCount === 0 ? `<span style="background:#dcfce7; color:#16a34a; padding:2px 6px; border-radius:6px; font-size:11px; font-weight:700;">✅ Tudo no limite</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- CONTROLS & FILTER BAR -->
                    <div style="padding:12px 24px; background:#ffffff; border-bottom:1px solid #e2e8f0; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:10px;">
                        <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:200px;">
                            <div style="position:relative; width:100%; max-width:240px;">
                                <i class="fas fa-search" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:12px;"></i>
                                <input type="text" id="budgetSearchInput" placeholder="Buscar categoria..." oninput="TonuBudget.filterList()" style="width:100%; padding:6px 10px 6px 30px; border-radius:8px; border:1px solid #cbd5e1; font-size:12px;">
                            </div>
                            <div style="display:flex; gap:4px;">
                                <button type="button" class="btn-budget-filter active" id="btnFilterAll" onclick="TonuBudget.setFilter('all')" style="padding:5px 9px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; background:#6c5ce7; color:#fff; border:none;">Todas (${progressList.length})</button>
                                <button type="button" class="btn-budget-filter" id="btnFilterActive" onclick="TonuBudget.setFilter('active')" style="padding:5px 9px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; background:#f1f5f9; color:#475569; border:1px solid #e2e8f0;">Com Limite (${activeBudgets.length})</button>
                                <button type="button" class="btn-budget-filter" id="btnFilterAlerts" onclick="TonuBudget.setFilter('alerts')" style="padding:5px 9px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; background:#f1f5f9; color:#475569; border:1px solid #e2e8f0;">Alertas (${exceededCount + warningCount})</button>
                            </div>
                        </div>

                        <div style="display:flex; align-items:center; gap:8px;">
                            <label style="font-size:11px; color:#64748b; font-weight:600;">Alertar a:</label>
                            <select id="budgetThresholdSelect" onchange="TonuBudget.updateThreshold('${userId}', this.value)" style="padding:4px 8px; border-radius:6px; border:1px solid #cbd5e1; font-size:11px; font-weight:600;">
                                <option value="70" ${currentThreshold === 70 ? 'selected' : ''}>70% do teto</option>
                                <option value="80" ${currentThreshold === 80 ? 'selected' : ''}>80% do teto (Padrão)</option>
                                <option value="85" ${currentThreshold === 85 ? 'selected' : ''}>85% do teto</option>
                                <option value="90" ${currentThreshold === 90 ? 'selected' : ''}>90% do teto</option>
                            </select>

                            <button type="button" onclick="TonuBudget.openNewCategoryModal('${userId}')" style="background:#ede9fe; color:#6c5ce7; border:1px solid #ddd6fe; border-radius:8px; padding:5px 10px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px;">
                                <i class="fas fa-plus"></i> Nova Categoria
                            </button>
                        </div>
                    </div>

                    <!-- CATEGORIES LIST -->
                    <div id="budgetCategoryListContainer" style="flex:1; overflow-y:auto; padding:16px 24px; max-height:440px; display:flex; flex-direction:column; gap:12px;">
                        ${this.renderCategoryRows(userId, progressList)}
                    </div>

                    <!-- FOOTER -->
                    <div style="padding:14px 24px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
                        <span style="font-size:12px; color:#64748b;">
                            <i class="fas fa-info-circle" style="color:#6c5ce7;"></i> Deixe em branco ou 0 para desativar o limite.
                        </span>
                        <div style="display:flex; gap:10px;">
                            <button class="btn btn-outline btn-sm" onclick="document.getElementById('tonuBudgetModal').remove()">Fechar</button>
                            <button class="btn btn-primary btn-sm" onclick="TonuBudget.saveBudgetsFromModal('${userId}', ${JSON.stringify(progressList.map(p => ({ id: p.categoryId, name: p.name }))).replace(/"/g, '&quot;')})">
                                <i class="fas fa-save"></i> Salvar Limites
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            this.currentSaveCallback = onSaveCallback;
            this.currentProgressList = progressList;
            this.currentFilter = 'all';
        }

        renderCategoryRows(userId, progressList) {
            if (!progressList || progressList.length === 0) {
                return '<div style="padding:32px; text-align:center; color:#94a3b8; font-size:13px;">Nenhuma categoria encontrada. Clique em "+ Nova Categoria" acima para criar uma!</div>';
            }

            return progressList.map(prog => {
                const barColor = prog.isExceeded ? '#ff7675' : (prog.isWarning ? '#fdcb6e' : '#00b894');
                const badgeHtml = prog.isExceeded
                    ? `<span style="background:#fee2e2; color:#dc2626; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:800;">🚨 LIMITE ESTOURADO (+${formatMoney(prog.exceededBy)})</span>`
                    : (prog.isWarning
                        ? `<span style="background:#fef3c7; color:#d97706; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:800;">⚠️ ${prog.percentage.toFixed(0)}% CONSUMIDO (Perto)</span>`
                        : (prog.limit > 0 ? `<span style="background:#dcfce7; color:#16a34a; padding:2px 8px; border-radius:99px; font-size:10px; font-weight:700;">✅ Dentro do Limite</span>` : ''));

                const pctWidth = Math.min(Math.max(prog.percentage, 0), 100);

                return `
                <div class="budget-cat-row" data-cat-id="${prog.categoryId}" data-cat-name="${prog.name.toLowerCase()}" data-has-limit="${prog.limit > 0}" data-is-alert="${prog.isExceeded || prog.isWarning}" style="padding:14px 16px; background:#ffffff; border:1px solid ${prog.isExceeded ? '#fca5a5' : (prog.isWarning ? '#fde68a' : '#e2e8f0')}; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,0.02); transition:all 0.2s ease;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
                        
                        <!-- LEFT INFO -->
                        <div style="display:flex; align-items:center; gap:12px; min-width:200px;">
                            <div style="width:38px; height:38px; border-radius:10px; background:${prog.color || '#6c5ce7'}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0;">
                                <i class="fas ${prog.icon || 'fa-tag'}"></i>
                            </div>
                            <div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <strong style="font-size:14px; color:#0f172a;">${prog.name}</strong>
                                    ${badgeHtml}
                                </div>
                                <div style="font-size:12px; color:#64748b; margin-top:2px;">
                                    Gasto no mês: <strong style="color:#0f172a;">${formatMoney(prog.spent)}</strong>
                                    ${prog.limit > 0 ? ` • Restante: <span style="color:${prog.isExceeded ? '#dc2626' : '#16a34a'}; font-weight:600;">${prog.isExceeded ? 'R$ 0,00' : formatMoney(prog.remaining)}</span>` : ''}
                                </div>
                            </div>
                        </div>

                        <!-- RIGHT INPUT -->
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="font-size:12px; color:#64748b; font-weight:600;">Limite Mensal:</span>
                            <div style="position:relative; width:130px;">
                                <span style="position:absolute; left:8px; top:50%; transform:translateY(-50%); font-size:12px; font-weight:700; color:#64748b;">R$</span>
                                <input type="number" step="10" min="0" id="budget_input_${prog.categoryId}" value="${prog.limit || ''}" placeholder="Sem limite" style="width:100%; padding:7px 8px 7px 28px; border-radius:8px; border:1px solid #cbd5e1; font-size:13px; font-weight:700; color:#0f172a; text-align:right;">
                            </div>
                            <!-- PRESETS -->
                            <div style="display:flex; gap:2px;">
                                <button type="button" title="Definir R$ 100" onclick="document.getElementById('budget_input_${prog.categoryId}').value='100'" style="padding:4px 6px; font-size:10px; font-weight:600; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:4px; cursor:pointer; color:#475569;">100</button>
                                <button type="button" title="Definir R$ 250" onclick="document.getElementById('budget_input_${prog.categoryId}').value='250'" style="padding:4px 6px; font-size:10px; font-weight:600; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:4px; cursor:pointer; color:#475569;">250</button>
                                <button type="button" title="Definir R$ 500" onclick="document.getElementById('budget_input_${prog.categoryId}').value='500'" style="padding:4px 6px; font-size:10px; font-weight:600; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:4px; cursor:pointer; color:#475569;">500</button>
                            </div>
                        </div>
                    </div>

                    <!-- PROGRESS BAR -->
                    ${prog.limit > 0 ? `
                    <div style="margin-top:6px;">
                        <div style="width:100%; height:7px; background:#e2e8f0; border-radius:99px; overflow:hidden;">
                            <div style="width:${pctWidth}%; height:100%; background:${barColor}; border-radius:99px; transition:width 0.3s ease;"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#64748b; margin-top:4px;">
                            <span>${prog.percentage.toFixed(0)}% do limite consumido</span>
                            <span>${prog.isExceeded ? `<strong style="color:#dc2626;">Estourou o teto em ${formatMoney(prog.exceededBy)}</strong>` : `Teto: ${formatMoney(prog.limit)}`}</span>
                        </div>
                    </div>
                    ` : `
                    <div style="font-size:11px; color:#94a3b8; font-style:italic; margin-top:4px;">
                        Nenhum teto configurado para esta categoria. Defina um valor ao lado para receber alertas.
                    </div>
                    `}
                </div>
                `;
            }).join('');
        }

        filterList() {
            const query = (document.getElementById('budgetSearchInput')?.value || '').trim().toLowerCase();
            const filter = this.currentFilter || 'all';
            const rows = document.querySelectorAll('.budget-cat-row');

            rows.forEach(row => {
                const name = row.getAttribute('data-cat-name') || '';
                const hasLimit = row.getAttribute('data-has-limit') === 'true';
                const isAlert = row.getAttribute('data-is-alert') === 'true';

                let matchesSearch = !query || name.includes(query);
                let matchesFilter = true;

                if (filter === 'active') matchesFilter = hasLimit;
                else if (filter === 'alerts') matchesFilter = isAlert;

                if (matchesSearch && matchesFilter) {
                    row.style.display = 'block';
                } else {
                    row.style.display = 'none';
                }
            });
        }

        setFilter(filterType) {
            this.currentFilter = filterType;
            document.querySelectorAll('.btn-budget-filter').forEach(b => {
                b.style.background = '#f1f5f9';
                b.style.color = '#475569';
                b.style.border = '1px solid #e2e8f0';
            });

            const activeBtn = document.getElementById(filterType === 'all' ? 'btnFilterAll' : (filterType === 'active' ? 'btnFilterActive' : 'btnFilterAlerts'));
            if (activeBtn) {
                activeBtn.style.background = '#6c5ce7';
                activeBtn.style.color = '#ffffff';
                activeBtn.style.border = 'none';
            }

            this.filterList();
        }

        updateThreshold(userId, newThreshold) {
            this.setWarningThreshold(userId, newThreshold);
            if (window.showToast) {
                window.showToast(`Notificações serão disparadas ao atingir ${newThreshold}% do limite.`, 'info');
            }
            if (typeof window.checkNotifications === 'function') {
                window.checkNotifications();
            }
        }

        openNewCategoryModal(userId) {
            if (window.TonuCategoryManager) {
                window.TonuCategoryManager.showEditModal(null, userId);
            } else {
                const name = prompt('Nome da nova categoria:');
                if (name && name.trim()) {
                    const limit = prompt(`Limite mensal em R$ para "${name.trim()}" (opcional):`, '100');
                    const num = parseFloat(limit) || 0;
                    this.setCategoryBudget(userId, null, num, name.trim());
                    if (window.showToast) window.showToast(`Categoria "${name.trim()}" configurada com limite de ${formatMoney(num)}!`, 'success');
                    this.openBudgetModal();
                }
            }
        }

        saveBudgetsFromModal(userId, categories) {
            categories.forEach(cat => {
                const input = document.getElementById(`budget_input_${cat.id}`);
                if (input) {
                    const val = parseFloat(input.value) || 0;
                    this.setCategoryBudget(userId, cat.id, val, cat.name);
                }
            });

            if (window.showToast) {
                window.showToast('Limites de gastos atualizados com sucesso! 🎯', 'success');
            }

            const modal = document.getElementById('tonuBudgetModal');
            if (modal) modal.remove();

            if (typeof window.checkNotifications === 'function') {
                window.checkNotifications();
            }

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
                            <div style="font-size:16px; font-weight:700; color:#0f172a;">${formatMoney(projection.currentBalance)}</div>
                        </div>
                        <div style="background:#ffffff; padding:12px 14px; border-radius:12px; border:1px solid #e2e8f0;">
                            <div style="font-size:11px; color:#64748b; margin-bottom:2px;">Saldo em 30 Dias</div>
                            <div style="font-size:16px; font-weight:700; color:${projection.finalBalance >= 0 ? '#00b894' : '#ff7675'};">
                                ${formatMoney(projection.finalBalance)}
                            </div>
                        </div>
                        <div style="background:#ffffff; padding:12px 14px; border-radius:12px; border:1px solid #e2e8f0;">
                            <div style="font-size:11px; color:#64748b; margin-bottom:2px;">Menor Saldo Previsto</div>
                            <div style="font-size:16px; font-weight:700; color:${projection.minBalance >= 0 ? '#0984e3' : '#e17055'};">
                                ${formatMoney(projection.minBalance)}
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
                                        ${p.dayIncome > 0 ? `<span style="color:#00b894;">+ ${formatMoney(p.dayIncome)}</span>` : ''}
                                        ${p.dayExpense > 0 ? `<span style="color:#ff7675;">- ${formatMoney(p.dayExpense)}</span>` : ''}
                                    </div>
                                    <span style="font-weight:700; color:${p.balance >= 0 ? '#0f172a' : '#ff7675'};">
                                        Saldo: ${formatMoney(p.balance)}
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
            const fmt = (v) => formatMoney(v);
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
                        ${cats.map(c => {
                            const catLimit = window.TonuBudget ? window.TonuBudget.getLimitForCategory(user.id, c.id, c.name) : 0;
                            return `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px;">
                                <div style="display:flex; align-items:center; gap:12px;">
                                    <div style="width:36px; height:36px; border-radius:10px; background:${c.color || '#6c5ce7'}; color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:15px;">
                                        <i class="fas ${c.icon || 'fa-tag'}"></i>
                                    </div>
                                    <div>
                                        <div style="display:flex; align-items:center; gap:6px;">
                                            <strong style="font-size:13px; color:#0f172a;">${c.name}</strong>
                                            ${catLimit > 0 ? `<span style="background:#ede9fe; color:#6c5ce7; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:700;"><i class="fas fa-bullseye"></i> Limite: ${formatMoney(catLimit)}</span>` : ''}
                                        </div>
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
                            `;
                        }).join('')}
                    </div>

                    <div style="padding:14px 24px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
                        <button class="btn btn-outline btn-sm" onclick="window.TonuBudget?.openBudgetModal(); document.getElementById('tonuCategoriesModal').remove();">
                            <i class="fas fa-sliders-h"></i> Ajustar Todos os Limites
                        </button>
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
            const currentLimit = window.TonuBudget ? window.TonuBudget.getLimitForCategory(userId, id, name) : 0;

            const modalHtml = `
            <div id="categoryEditSubModal" style="position:fixed; inset:0; background:rgba(15,23,42,0.85); z-index:9999999; display:flex; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(6px); font-family:'Inter',sans-serif;">
                <div style="background:#ffffff; border-radius:20px; max-width:440px; width:100%; padding:24px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.3); border:1px solid #e2e8f0;">
                    <h3 style="font-size:17px; font-weight:800; color:#0f172a; margin:0 0 16px 0;">
                        ${isEdit ? 'Editar Categoria' : 'Nova Categoria'}
                    </h3>

                    <div style="display:flex; flex-direction:column; gap:14px;">
                        <div>
                            <label style="font-size:12px; font-weight:600; color:#64748b; display:block; margin-bottom:4px;">Nome da Categoria</label>
                            <input type="text" id="catEditName" value="${name}" placeholder="Ex: Delivery, Mercado, Lazer..." style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid #cbd5e1; font-size:14px;">
                        </div>

                        <div>
                            <label style="font-size:12px; font-weight:600; color:#64748b; display:block; margin-bottom:4px;">Tipo</label>
                            <select id="catEditType" onchange="document.getElementById('catEditBudgetBox').style.display = this.value === 'expense' ? 'block' : 'none';" style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid #cbd5e1; font-size:14px;">
                                <option value="expense" ${type === 'expense' ? 'selected' : ''}>🔴 Despesa</option>
                                <option value="income" ${type === 'income' ? 'selected' : ''}>🟢 Receita</option>
                            </select>
                        </div>

                        <!-- LIMITE MENSAL DE GASTOS -->
                        <div id="catEditBudgetBox" style="background:#f8fafc; padding:12px; border-radius:12px; border:1px dashed #cbd5e1; display:${type === 'expense' ? 'block' : 'none'};">
                            <label style="font-size:12px; font-weight:700; color:#0f172a; display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                                <i class="fas fa-bullseye" style="color:#6c5ce7;"></i> Limite Mensal de Gastos (R$)
                                <span style="font-size:11px; font-weight:normal; color:#64748b;">(Opcional)</span>
                            </label>
                            <p style="font-size:11px; color:#64748b; margin:0 0 6px 0;">Receba uma notificação automática ao se aproximar ou ultrapassar este valor.</p>
                            <input type="number" step="10" min="0" id="catEditBudgetLimit" value="${currentLimit > 0 ? currentLimit : ''}" placeholder="Ex: 100.00" style="width:100%; padding:9px 12px; border-radius:10px; border:1px solid #cbd5e1; font-size:14px; font-weight:700; color:#0f172a;">
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
            const budgetLimitInput = document.getElementById('catEditBudgetLimit');
            const limitVal = budgetLimitInput ? (parseFloat(budgetLimitInput.value) || 0) : 0;

            if (!name) {
                if (window.showToast) window.showToast('Digite um nome para a categoria.', 'warning');
                return;
            }

            try {
                let savedId = id;
                if (id) {
                    await window.supabaseClient
                        .from('categories')
                        .update({ name, type, color, icon })
                        .eq('id', id)
                        .eq('user_id', userId);
                } else {
                    const insertRes = await window.supabaseClient
                        .from('categories')
                        .insert([{ user_id: userId, name, type, color, icon }])
                        .select();
                    if (insertRes?.data && insertRes.data[0]) {
                        savedId = insertRes.data[0].id;
                    }
                }

                // Save or update budget limit if configured
                if (window.TonuBudget) {
                    window.TonuBudget.setCategoryBudget(userId, savedId || name, limitVal, name);
                }

                if (window.showToast) {
                    window.showToast(`Categoria ${id ? 'atualizada' : 'criada'} com sucesso! 🎉`, 'success');
                }

                document.getElementById('categoryEditSubModal')?.remove();
                if (window.TonuCategoryManagerInstance) {
                    window.TonuCategoryManagerInstance.showManagerModal(window.TonuCategoryManagerInstance.currentUpdateCallback);
                }

                if (window.TonuCategoryManagerInstance?.currentUpdateCallback) {
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
                        <span style="color:#00b894; font-weight:600;"><i class="fas fa-arrow-down"></i> Entradas: ${formatMoney(totalIncome)}</span>
                        <span style="color:#ff7675; font-weight:600;"><i class="fas fa-arrow-up"></i> Saídas: ${formatMoney(totalExpense)}</span>
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
                                        ${t.type === 'income' ? '+' : '-'} ${formatMoney(t.amount)}
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
