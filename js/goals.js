// ============================================
// METAS - TonuControle (VERSÃO SEGURA)
// ============================================

console.log('🎯 Goals.js carregado');

// ============================================
// ESTADO
// ============================================
let currentUser = null;
let allGoals = [];
let isProcessing = false;
let currentFilter = 'all';
let currentSearch = '';

// Mapeamento de categorias visuais para metas
const GOAL_CATEGORY_MAP = {
    emergency: { label: 'Reserva de Emergência', icon: 'fa-shield-alt', emoji: '🛡️', color: '#00B894' },
    travel: { label: 'Viagem & Lazer', icon: 'fa-plane-departure', emoji: '✈️', color: '#0984E3' },
    vehicle: { label: 'Veículo', icon: 'fa-car', emoji: '🚗', color: '#E17055' },
    home: { label: 'Imóvel / Casa', icon: 'fa-home', emoji: '🏠', color: '#6C5CE7' },
    education: { label: 'Educação', icon: 'fa-graduation-cap', emoji: '🎓', color: '#A29BFE' },
    investment: { label: 'Investimentos', icon: 'fa-chart-line', emoji: '📈', color: '#10B981' },
    purchase: { label: 'Compras', icon: 'fa-shopping-bag', emoji: '📱', color: '#FDCB6E' },
    other: { label: 'Objetivo Geral', icon: 'fa-bullseye', emoji: '🎯', color: '#6C5CE7' }
};

// Tenta inferir categoria com base no título se não estiver explícito
function resolveGoalCategory(goal) {
    if (goal.category && GOAL_CATEGORY_MAP[goal.category]) {
        return { key: goal.category, ...GOAL_CATEGORY_MAP[goal.category] };
    }
    const t = (goal.title || '').toLowerCase();
    if (t.includes('reserva') || t.includes('emergência') || t.includes('segurança')) return { key: 'emergency', ...GOAL_CATEGORY_MAP.emergency };
    if (t.includes('viagem') || t.includes('férias') || t.includes('praia') || t.includes('euro') || t.includes('dólar') || t.includes('passagem')) return { key: 'travel', ...GOAL_CATEGORY_MAP.travel };
    if (t.includes('carro') || t.includes('moto') || t.includes('veículo') || t.includes('cnh') || t.includes('auto')) return { key: 'vehicle', ...GOAL_CATEGORY_MAP.vehicle };
    if (t.includes('casa') || t.includes('apê') || t.includes('apartamento') || t.includes('imóvel') || t.includes('reforma') || t.includes('obra')) return { key: 'home', ...GOAL_CATEGORY_MAP.home };
    if (t.includes('curso') || t.includes('faculdade') || t.includes('pós') || t.includes('estudo') || t.includes('livro') || t.includes('mba')) return { key: 'education', ...GOAL_CATEGORY_MAP.education };
    if (t.includes('invest') || t.includes('ação') || t.includes('fii') || t.includes('aposentadoria') || t.includes('renda passiva') || t.includes('patrimônio')) return { key: 'investment', ...GOAL_CATEGORY_MAP.investment };
    if (t.includes('celular') || t.includes('iphone') || t.includes('macbook') || t.includes('notebook') || t.includes('compra') || t.includes('tv')) return { key: 'purchase', ...GOAL_CATEGORY_MAP.purchase };
    return { key: 'other', ...GOAL_CATEGORY_MAP.other };
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Metas...');

    try {
        let user = null;
        if (window.supabaseOffline) {
            user = await window.supabaseOffline.isAuthenticated();
        }

        if (!user) {
            const { data: { user: authUser } } = await supabaseClient.auth.getUser();
            user = authUser;
        }

        if (!user) {
            window.location.href = '../index.html';
            return;
        }

        currentUser = user;
        console.log('✅ Usuário autenticado:', currentUser.email);
    } catch (e) {
        console.error('❌ Erro na autenticação:', e);
        window.location.href = '../index.html';
        return;
    }

    await loadGoals();
    console.log('✅ Metas inicializado!');
});

// ============================================
// CARREGAR METAS
// ============================================
async function loadGoals() {
    try {
        if (!navigator.onLine && window.tonuSync) {
            const cached = await window.tonuSync.getCachedGoals?.();
            if (cached && cached.length > 0) {
                allGoals = cached;
                updateGoalsStats(allGoals);
                renderFilteredGoals();
                return;
            }
        }

        const { data, error } = await supabaseClient
            .from('goals')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) {
            if (error.code === '42P01') {
                document.getElementById('goalsContainer').innerHTML = `
                    <div class="empty-state" style="grid-column:1/-1;padding:40px 16px;">
                        <span class="empty-icon">⚠️</span>
                        <h3>Erro de configuração</h3>
                        <p>A tabela de metas não foi encontrada. Execute o SQL de criação.</p>
                    </div>
                `;
                return;
            }
            throw error;
        }

        allGoals = data || [];
        updateGoalsStats(allGoals);
        renderFilteredGoals();

    } catch (error) {
        console.error('❌ Erro ao carregar metas:', error);
        showToast('Erro ao carregar metas', 'error');
    }
}

// ============================================
// ATUALIZAR ESTATÍSTICAS E CONTADORES DO TOPO
// ============================================
function updateGoalsStats(goals) {
    const totalAccumulated = goals.reduce((acc, g) => acc + (Number(g.current_amount) || 0), 0);
    const globalTarget = goals.reduce((acc, g) => acc + (Number(g.target_amount) || 0), 0);
    const completedCount = goals.filter(g => g.completed || (g.target_amount > 0 && g.current_amount >= g.target_amount)).length;
    const activeCount = goals.length - completedCount;
    const almostCount = goals.filter(g => {
        const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
        return pct >= 75 && !g.completed && pct < 100;
    }).length;

    const globalPct = globalTarget > 0 ? Math.min(100, Math.round((totalAccumulated / globalTarget) * 100)) : 0;
    const remainingGlobal = Math.max(0, globalTarget - totalAccumulated);

    // Elementos do DOM
    const elAccumulated = document.getElementById('statsTotalAccumulated');
    const elTarget = document.getElementById('statsGlobalTarget');
    const elCompleted = document.getElementById('statsCompletedCount');
    const elPct = document.getElementById('statsGlobalProgressPct');
    const elBar = document.getElementById('statsGlobalProgressBar');
    const elRem = document.getElementById('statsRemainingGlobal');

    if (elAccumulated) elAccumulated.textContent = formatCurrency(totalAccumulated);
    if (elTarget) elTarget.textContent = formatCurrency(globalTarget);
    if (elCompleted) elCompleted.textContent = `${completedCount} de ${goals.length}`;
    if (elPct) elPct.textContent = `${globalPct}%`;
    if (elBar) elBar.style.width = `${globalPct}%`;
    if (elRem) {
        elRem.textContent = remainingGlobal > 0
            ? `Faltam ${formatCurrency(remainingGlobal)} para alcançar todos os sonhos`
            : `🏆 Parabéns! Todos os objetivos globais foram atingidos!`;
    }

    // Atualizar Badges das abas de filtro
    const bAll = document.getElementById('badgeFilterAll');
    const bActive = document.getElementById('badgeFilterActive');
    const bAlmost = document.getElementById('badgeFilterAlmost');
    const bCompleted = document.getElementById('badgeFilterCompleted');

    if (bAll) bAll.textContent = goals.length;
    if (bActive) bActive.textContent = activeCount;
    if (bAlmost) bAlmost.textContent = almostCount;
    if (bCompleted) bCompleted.textContent = completedCount;
}

// ============================================
// CONTROLES DE FILTRO E PESQUISA
// ============================================
function setGoalsFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.goal-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderFilteredGoals();
}

function handleGoalsSearch(event) {
    currentSearch = (event.target.value || '').trim().toLowerCase();
    const clearBtn = document.getElementById('goalsSearchClearBtn');
    if (clearBtn) {
        clearBtn.classList.toggle('hidden', currentSearch.length === 0);
    }
    renderFilteredGoals();
}

function clearGoalsSearch() {
    const input = document.getElementById('goalsSearchInput');
    if (input) {
        input.value = '';
        currentSearch = '';
    }
    const clearBtn = document.getElementById('goalsSearchClearBtn');
    if (clearBtn) clearBtn.classList.add('hidden');
    renderFilteredGoals();
}

function renderFilteredGoals() {
    let list = [...allGoals];

    // Aplicar Filtro de Status
    if (currentFilter === 'active') {
        list = list.filter(g => !g.completed && (g.target_amount <= 0 || (g.current_amount < g.target_amount)));
    } else if (currentFilter === 'almost') {
        list = list.filter(g => {
            const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
            return pct >= 75 && !g.completed && pct < 100;
        });
    } else if (currentFilter === 'completed') {
        list = list.filter(g => g.completed || (g.target_amount > 0 && g.current_amount >= g.target_amount));
    }

    // Aplicar Filtro de Busca
    if (currentSearch) {
        list = list.filter(g => {
            const titleMatch = (g.title || '').toLowerCase().includes(currentSearch);
            const targetMatch = String(g.target_amount || '').includes(currentSearch);
            const currentMatch = String(g.current_amount || '').includes(currentSearch);
            return titleMatch || targetMatch || currentMatch;
        });
    }

    renderGoals(list);
}

// ============================================
// RENDERIZAÇÃO DOS CARDS REDESENHADOS
// ============================================
function renderGoals(goals) {
    const container = document.getElementById('goalsContainer');
    if (!container) return;

    if (goals.length === 0) {
        if (allGoals.length > 0 && (currentFilter !== 'all' || currentSearch)) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1;padding:40px 16px;">
                    <span class="empty-icon">🔍</span>
                    <h3>Nenhuma meta encontrada</h3>
                    <p>Nenhuma meta corresponde ao filtro ou termo pesquisado.</p>
                    <button class="btn btn-secondary" onclick="clearGoalsSearch(); setGoalsFilter('all');" style="margin-top:10px; font-size:12.5px;">
                        <i class="fas fa-undo"></i> Limpar filtros
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;padding:40px 16px;">
                <span class="empty-icon">🎯</span>
                <h3>Nenhuma meta ainda</h3>
                <p>Defina seus objetivos financeiros e acompanhe seu progresso!</p>
                <button class="btn btn-primary" onclick="openModal()" style="margin-top:10px; font-size:13px;"
                    aria-label="Criar primeira meta">
                    <i class="fas fa-plus"></i> Criar primeira meta
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = goals.map(g => {
        const percent = g.target_amount > 0
            ? Math.min(100, (g.current_amount / g.target_amount) * 100)
            : 0;
        const isCompleted = g.completed || percent >= 99.99;
        const pctDisplay = Math.round(percent);
        const remaining = Math.max(0, (g.target_amount || 0) - (g.current_amount || 0));

        const catInfo = resolveGoalCategory(g);
        const color = g.color || catInfo.color || '#6C5CE7';

        // Análise de prazo e cálculo de aporte mensal necessário
        let deadlineLabel = 'Sem prazo definido';
        let monthlyNeedText = '';
        if (g.deadline) {
            const now = new Date();
            const targetDate = new Date(g.deadline);
            const daysDiff = Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24));
            const monthsDiff = Math.max(1, Math.ceil(daysDiff / 30.4));

            if (isCompleted) {
                deadlineLabel = `🏆 Concluída`;
            } else if (daysDiff > 0) {
                deadlineLabel = `⏰ ${daysDiff} dias restantes (${formatDate(g.deadline)})`;
                if (remaining > 0 && monthsDiff >= 1) {
                    const monthlyNeed = remaining / monthsDiff;
                    monthlyNeedText = `Aporte sugerido: <strong>${formatCurrency(monthlyNeed)}/mês</strong> (${monthsDiff} meses)`;
                }
            } else {
                deadlineLabel = `⚠️ Prazo expirou em ${formatDate(g.deadline)}`;
            }
        }

        return `
            <div class="goal-card ${isCompleted ? 'completed' : ''}" 
                 style="--goal-accent-color: ${color};"
                 onclick="editGoal('${g.id}')">
                
                <!-- TOP HEADER -->
                <div class="goal-card-top">
                    <div class="goal-badge-icon" style="background: ${color}20; color: ${color};">
                        <i class="fas ${catInfo.icon}"></i>
                    </div>
                    <div class="goal-title-wrap">
                        <div class="goal-category-tag">
                            <span>${catInfo.emoji} ${catInfo.label}</span>
                        </div>
                        <h3 class="goal-card-title" title="${stripHTML(g.title)}">${stripHTML(g.title)}</h3>
                    </div>
                    <span class="goal-status-badge ${isCompleted ? 'completed-badge' : 'in-progress'}">
                        ${isCompleted ? '🏆 Concluída' : `${pctDisplay}%`}
                    </span>
                </div>

                <!-- VALORES PRINCIPAIS -->
                <div class="goal-finance-row">
                    <div class="goal-val-box">
                        <span class="goal-val-label">Valor Poupado</span>
                        <span class="goal-val-current">${formatCurrency(g.current_amount)}</span>
                    </div>
                    <div class="goal-val-box" style="text-align: right;">
                        <span class="goal-val-label">Meta Total</span>
                        <span class="goal-val-target">${formatCurrency(g.target_amount)}</span>
                    </div>
                </div>

                <!-- PROGRESS TRACK -->
                <div class="goal-progress-box">
                    <div class="goal-progress-meta">
                        <span>${isCompleted ? '🎉 100% atingido!' : `Faltam ${formatCurrency(remaining)}`}</span>
                        <span class="goal-progress-pct">${pctDisplay}%</span>
                    </div>
                    <div class="goal-progress-track">
                        <div class="goal-progress-fill ${isCompleted ? 'completed' : ''}" style="width: ${pctDisplay}%;"></div>
                    </div>
                </div>

                <!-- ESTIMATIVA / HORIZONTE -->
                <div class="goal-insight-pill">
                    <div style="display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        <i class="fas fa-calendar-alt"></i>
                        <span>${deadlineLabel}</span>
                    </div>
                    ${monthlyNeedText ? `<div>${monthlyNeedText}</div>` : ''}
                </div>

                <!-- AÇÕES RÁPIDAS -->
                <div class="goal-actions-bar" onclick="event.stopPropagation();">
                    ${!isCompleted ? `
                        <button type="button" class="btn-card-action btn-deposit" onclick="openAddValue('${g.id}')" title="Fazer um aporte nesta meta">
                            <i class="fas fa-plus"></i> Aportar
                        </button>
                        <button type="button" class="btn-card-action btn-withdraw" onclick="openWithdrawModal('${g.id}')" title="Resgatar ou ajustar valor">
                            <i class="fas fa-minus"></i> Resgatar
                        </button>
                        <button type="button" class="btn-card-icon-only quick-check" onclick="quickCompleteGoal('${g.id}')" title="Marcar como 100% Concluída!">
                            <i class="fas fa-check"></i>
                        </button>
                    ` : `
                        <button type="button" class="btn-card-action btn-withdraw" onclick="openWithdrawModal('${g.id}')" title="Ajustar ou reabrir meta com resgate">
                            <i class="fas fa-hand-holding-usd"></i> Movimentar
                        </button>
                    `}
                    <button type="button" class="btn-card-icon-only" onclick="editGoal('${g.id}')" title="Editar detalhes">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button type="button" class="btn-card-icon-only danger" onclick="deleteGoal('${g.id}')" title="Excluir meta">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// MODAL PRINCIPAL
// ============================================
function openModal(id = null) {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('goalModal');
    const form = document.getElementById('goalForm');
    const title = document.getElementById('modalTitle');
    const deleteBtn = document.getElementById('btnDelete');

    document.body.classList.add('no-scroll');

    form.reset();
    document.getElementById('editId').value = '';
    document.getElementById('gCurrent').value = '';
    document.getElementById('gDeadline').value = '';
    document.getElementById('gCategory').value = 'other';
    document.getElementById('gColor').value = '#6C5CE7';
    document.getElementById('gCompleted').checked = false;
    deleteBtn.classList.add('hidden');
    title.textContent = 'Nova Meta';

    if (window.TonuCSRF) {
        let csrfInput = document.getElementById('csrfTokenGoal');
        if (!csrfInput) {
            csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.id = 'csrfTokenGoal';
            csrfInput.name = '_csrf';
            form.appendChild(csrfInput);
        }
        csrfInput.value = window.TonuCSRF.get();
    }

    if (id) {
        const goal = allGoals.find(g => g.id === id);
        if (goal) {
            document.getElementById('editId').value = goal.id;
            document.getElementById('gTitle').value = goal.title;
            document.getElementById('gTarget').value = formatNumberInput(goal.target_amount);
            document.getElementById('gCurrent').value = formatNumberInput(goal.current_amount || 0);
            document.getElementById('gDeadline').value = goal.deadline || '';
            const catInfo = resolveGoalCategory(goal);
            const catElem = document.getElementById('gCategory');
            if (catElem) catElem.value = goal.category || catInfo.key || 'other';
            document.getElementById('gColor').value = goal.color || '#6C5CE7';
            document.getElementById('gCompleted').checked = goal.completed || false;
            title.textContent = 'Editar Meta';
            deleteBtn.classList.remove('hidden');
        }
    }

    overlay.classList.add('active');
    modal.classList.remove('hidden');

    setTimeout(() => {
        document.getElementById('gTitle')?.focus();
    }, 100);
}

function formatNumberInput(value) {
    if (value === null || value === undefined || isNaN(value)) return '';
    return Number(value).toFixed(2).replace('.', ',');
}

function parseNumberInput(value) {
    if (!value) return 0;
    return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
}

function closeModal() {
    document.body.classList.remove('no-scroll');
    document.getElementById('modalOverlay').classList.remove('active');
    document.getElementById('goalModal').classList.add('hidden');
}

function editGoal(id) {
    openModal(id);
}

// ============================================
// SALVAR META
// ============================================
async function saveGoal(event) {
    event.preventDefault();

    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const editId = document.getElementById('editId').value;
    const prevGoal = editId ? allGoals.find(g => g.id === editId) : null;
    const wasCompleted = prevGoal ? (prevGoal.completed || (prevGoal.current_amount >= prevGoal.target_amount)) : false;

    const title = document.getElementById('gTitle').value.trim();
    const target = parseNumberInput(document.getElementById('gTarget').value);
    const current = parseNumberInput(document.getElementById('gCurrent').value);
    const deadline = document.getElementById('gDeadline').value || null;
    const category = document.getElementById('gCategory') ? document.getElementById('gCategory').value : 'other';
    const color = document.getElementById('gColor').value;
    const completed = document.getElementById('gCompleted').checked || (current >= target);

    const validation = window.validateGoal({
        title: title,
        target_amount: target,
        current_amount: current,
        deadline: deadline
    });

    if (!validation.valid) {
        showToast('❌ ' + validation.errors.join('\n'), 'error');
        return;
    }

    if (current > target) {
        showToast('O valor atual não pode ser maior que a meta!', 'error');
        return;
    }

    const data = {
        user_id: currentUser.id,
        title: stripHTML(title),
        target_amount: target,
        current_amount: current,
        deadline: deadline,
        category: category,
        color: color,
        completed: completed,
        updated_at: new Date().toISOString()
    };

    // Validação local de CSRF sem poluir colunas do banco de dados
    const formCsrf = event.target.querySelector('input[name="_csrf"]')?.value;
    if (window.TonuCSRF && formCsrf && !window.TonuCSRF.validate(formCsrf)) {
        console.warn('⚠️ Token CSRF inválido ou expirado');
    }

    const payload = { ...data };
    delete payload._csrf;
    delete payload._timestamp;

    const btn = event.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    isProcessing = true;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';

    try {
        let result;

        if (!navigator.onLine && window.tonuSync) {
            if (editId) {
                await window.tonuSync.enqueue('UPDATE_GOAL', { id: editId, ...payload });
            } else {
                payload.created_at = new Date().toISOString();
                await window.tonuSync.enqueue('INSERT_GOAL', payload);
            }
            showToast('📦 Meta salva localmente! Sincronização pendente.', 'success');
            closeModal();
            await loadGoals();
            if (completed && !wasCompleted) {
                triggerCelebration(title, Math.max(target, current));
            }
            btn.disabled = false;
            isProcessing = false;
            btn.innerHTML = originalText;
            return;
        }

        if (editId) {
            result = await supabaseClient
                .from('goals')
                .update(payload)
                .eq('id', editId)
                .eq('user_id', currentUser.id);
        } else {
            payload.created_at = new Date().toISOString();
            result = await supabaseClient
                .from('goals')
                .insert([payload]);
        }

        // Se o banco não tiver a coluna 'category' (PGRST204), tenta salvar sem esse campo
        if (result.error && (result.error.code === 'PGRST204' || (result.error.message && result.error.message.includes('category')))) {
            console.warn('⚠️ Coluna category não encontrada no Supabase, salvando sem category...');
            const fallbackData = { ...payload };
            delete fallbackData.category;
            if (editId) {
                result = await supabaseClient
                    .from('goals')
                    .update(fallbackData)
                    .eq('id', editId)
                    .eq('user_id', currentUser.id);
            } else {
                result = await supabaseClient
                    .from('goals')
                    .insert([fallbackData]);
            }
        }

        if (result.error) {
            console.error('❌ Erro detalhado:', result.error);
            if (result.error.code === 'PGRST204') {
                showToast('Erro: Coluna não encontrada. Execute o SQL de criação da tabela.', 'error');
            } else if (result.error.code === '42P01') {
                showToast('Tabela de metas não existe. Execute o SQL de criação.', 'error');
            } else {
                showToast(`Erro: ${result.error.message}`, 'error');
            }
            return;
        }

        showToast(editId ? 'Meta atualizada! 🎯' : 'Meta criada! 🎯', 'success');
        if (window.triggerHaptic) window.triggerHaptic('success');
        closeModal();
        await loadGoals();
        if (completed && !wasCompleted) {
            triggerCelebration(title, Math.max(target, current));
        }

    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        showToast('Erro ao salvar meta', 'error');
    } finally {
        btn.disabled = false;
        isProcessing = false;
        btn.innerHTML = originalText;
    }
}

// ============================================
// EXCLUIR META
// ============================================
async function deleteGoal(id = null) {
    const editId = id || document.getElementById('editId').value;
    if (!editId) return;

    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    if (!confirm('Excluir esta meta permanentemente?')) return;

    isProcessing = true;
    const btn = document.getElementById('btnDelete');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';
    }

    try {
        if (!navigator.onLine && window.tonuSync) {
            await window.tonuSync.enqueue('DELETE_GOAL', { id: editId });
            showToast('🗑️ Exclusão agendada para sincronização.', 'warning');
            closeModal();
            await loadGoals();
            isProcessing = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-trash"></i> Excluir';
            }
            return;
        }

        const { error } = await supabaseClient
            .from('goals')
            .delete()
            .eq('id', editId)
            .eq('user_id', currentUser.id);

        if (error) throw error;

        showToast('Meta excluída! 🗑️', 'success');
        closeModal();
        await loadGoals();

    } catch (error) {
        console.error('❌ Erro ao excluir:', error);
        showToast('Erro ao excluir meta', 'error');
    } finally {
        isProcessing = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-trash"></i> Excluir';
        }
    }
}

// ============================================
// ADICIONAR VALOR
// ============================================
function openAddValue(id) {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const goal = allGoals.find(g => g.id === id);
    if (!goal) return;

    document.getElementById('addValueGoalId').value = id;
    document.getElementById('addValueGoalTitle').textContent = goal.title;
    document.getElementById('addValueCurrent').textContent = formatCurrency(goal.current_amount);
    document.getElementById('addValueTarget').textContent = formatCurrency(goal.target_amount);
    document.getElementById('addValueAmount').value = '';
    document.getElementById('addValueAmount').focus();

    if (window.TonuCSRF) {
        let csrfInput = document.getElementById('csrfTokenAddValue');
        if (!csrfInput) {
            const form = document.getElementById('addValueForm');
            csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.id = 'csrfTokenAddValue';
            csrfInput.name = '_csrf';
            form.appendChild(csrfInput);
        }
        csrfInput.value = window.TonuCSRF.get();
    }

    document.getElementById('addValueOverlay').classList.add('active');
    document.getElementById('addValueModal').classList.remove('hidden');
}

function closeAddValue() {
    document.body.classList.remove('no-scroll');
    document.getElementById('addValueOverlay')?.classList.remove('active');
    document.getElementById('addValueModal')?.classList.add('hidden');
}

// ============================================
// MODAL DE RESGATE / AJUSTE DE VALOR DA META
// ============================================
function openWithdrawModal(id) {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const goal = allGoals.find(g => g.id === id);
    if (!goal) return;

    if (!goal.current_amount || goal.current_amount <= 0) {
        showToast('Esta meta não possui saldo acumulado para resgate.', 'info');
        return;
    }

    document.body.classList.add('no-scroll');

    const form = document.getElementById('withdrawForm');
    form.reset();

    document.getElementById('withdrawGoalId').value = goal.id;
    document.getElementById('withdrawGoalTitle').textContent = goal.title;
    document.getElementById('withdrawCurrent').textContent = formatCurrency(goal.current_amount);
    document.getElementById('withdrawAmount').value = '';
    document.getElementById('withdrawAmount').focus();

    if (window.TonuCSRF) {
        let csrfInput = document.getElementById('csrfTokenWithdraw');
        if (!csrfInput) {
            csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.id = 'csrfTokenWithdraw';
            csrfInput.name = '_csrf';
            form.appendChild(csrfInput);
        }
        csrfInput.value = window.TonuCSRF.get();
    }

    document.getElementById('withdrawOverlay').classList.add('active');
    document.getElementById('withdrawModal').classList.remove('hidden');
}

function closeWithdrawModal() {
    document.body.classList.remove('no-scroll');
    document.getElementById('withdrawOverlay')?.classList.remove('active');
    document.getElementById('withdrawModal')?.classList.add('hidden');
}

async function submitWithdraw(event) {
    event.preventDefault();

    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const id = document.getElementById('withdrawGoalId').value;
    const amount = parseNumberInput(document.getElementById('withdrawAmount').value);

    if (!amount || amount <= 0) {
        showToast('Digite um valor de resgate válido!', 'error');
        return;
    }

    const goal = allGoals.find(g => g.id === id);
    if (!goal) return;

    if (amount > goal.current_amount) {
        showToast(`O valor não pode ser maior que o saldo atual (${formatCurrency(goal.current_amount)})!`, 'error');
        return;
    }

    const newAmount = Math.max(0, goal.current_amount - amount);
    const completed = newAmount >= goal.target_amount;

    const btn = event.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    isProcessing = true;
    btn.innerHTML = '<span class="spinner"></span> Processando...';

    try {
        const payload = {
            current_amount: newAmount,
            completed: completed,
            updated_at: new Date().toISOString()
        };

        if (!navigator.onLine && window.tonuSync) {
            await window.tonuSync.enqueue('UPDATE_GOAL', { id: id, ...payload });
            showToast('📦 Resgate efetuado localmente! Sincronização pendente.', 'success');
            closeWithdrawModal();
            await loadGoals();
            btn.disabled = false;
            isProcessing = false;
            btn.innerHTML = originalText;
            return;
        }

        const { error } = await supabaseClient
            .from('goals')
            .update(payload)
            .eq('id', id)
            .eq('user_id', currentUser.id);

        if (error) throw error;

        showToast(`💸 Resgate de ${formatCurrency(amount)} realizado com sucesso!`, 'success');
        closeWithdrawModal();
        await loadGoals();

    } catch (error) {
        console.error('❌ Erro ao resgatar valor:', error);
        showToast('Erro ao resgatar valor', 'error');
    } finally {
        btn.disabled = false;
        isProcessing = false;
        btn.innerHTML = originalText;
    }
}

// Ouvinte global para tecla ESC fechar modais de metas e overlay de comemoração
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const celebrationOverlay = document.getElementById('celebrationOverlay');
        if (celebrationOverlay && celebrationOverlay.classList.contains('active')) {
            dismissCelebration();
            return;
        }
        const addOverlay = document.getElementById('addValueOverlay');
        if (addOverlay && addOverlay.classList.contains('active')) {
            closeAddValue();
            return;
        }
        const withdrawOverlay = document.getElementById('withdrawOverlay');
        if (withdrawOverlay && withdrawOverlay.classList.contains('active')) {
            closeWithdrawModal();
            return;
        }
        const goalOverlay = document.getElementById('modalOverlay');
        if (goalOverlay && goalOverlay.classList.contains('active')) {
            closeModal();
        }
    }
});

async function submitAddValue(event) {
    event.preventDefault();

    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const id = document.getElementById('addValueGoalId').value;
    const amount = parseNumberInput(document.getElementById('addValueAmount').value);

    if (!amount || amount <= 0) {
        showToast('Digite um valor válido!', 'error');
        return;
    }

    const goal = allGoals.find(g => g.id === id);
    if (!goal) return;

    const newAmount = goal.current_amount + amount;
    const completed = newAmount >= goal.target_amount;

    const btn = event.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    isProcessing = true;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';

    try {
        const payload = {
            current_amount: newAmount,
            completed: completed,
            updated_at: new Date().toISOString()
        };

        if (!navigator.onLine && window.tonuSync) {
            await window.tonuSync.enqueue('UPDATE_GOAL', { id: id, ...payload });
            showToast('📦 Valor adicionado localmente! Sincronização pendente.', 'success');
            closeAddValue();
            await loadGoals();
            if (completed) {
                triggerCelebration(goal.title, newAmount);
            }
            btn.disabled = false;
            isProcessing = false;
            btn.innerHTML = originalText;
            return;
        }

        const { error } = await supabaseClient
            .from('goals')
            .update(payload)
            .eq('id', id)
            .eq('user_id', currentUser.id);

        if (error) throw error;

        const msg = completed ? '🎉 Meta concluída! Parabéns!' : `💰 ${formatCurrency(amount)} adicionado!`;
        showToast(msg, 'success');
        if (window.triggerHaptic) window.triggerHaptic(completed ? 'heavy' : 'success');
        closeAddValue();
        await loadGoals();
        if (completed) {
            triggerCelebration(goal.title, newAmount);
        }

    } catch (error) {
        console.error('❌ Erro ao adicionar valor:', error);
        showToast('Erro ao adicionar valor', 'error');
    } finally {
        btn.disabled = false;
        isProcessing = false;
        btn.innerHTML = originalText;
    }
}

// ============================================
// CONCLUIR META RAPIDAMENTE (QUICK COMPLETE)
// ============================================
async function quickCompleteGoal(id) {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const goal = allGoals.find(g => g.id === id);
    if (!goal) return;

    if (!confirm(`Deseja marcar a meta "${goal.title}" como 100% concluída?`)) {
        return;
    }

    isProcessing = true;

    try {
        const payload = {
            current_amount: goal.target_amount,
            completed: true,
            updated_at: new Date().toISOString()
        };

        if (!navigator.onLine && window.tonuSync) {
            await window.tonuSync.enqueue('UPDATE_GOAL', { id: id, ...payload });
            showToast('📦 Meta concluída localmente! Sincronização pendente.', 'success');
            await loadGoals();
            triggerCelebration(goal.title, goal.target_amount);
            isProcessing = false;
            return;
        }

        const { error } = await supabaseClient
            .from('goals')
            .update(payload)
            .eq('id', id)
            .eq('user_id', currentUser.id);

        if (error) throw error;

        showToast('🎉 Meta concluída com sucesso!', 'success');
        await loadGoals();
        triggerCelebration(goal.title, goal.target_amount);

    } catch (error) {
        console.error('❌ Erro ao concluir meta:', error);
        showToast('Erro ao concluir meta', 'error');
    } finally {
        isProcessing = false;
    }
}

// ============================================
// SISTEMA DE COMEMORAÇÃO EM TELA INTEIRA (CONFETTI & FANFARRA)
// ============================================
let celebrationAnimId = null;
let celebrationParticles = [];
let celebrationAutoDismissTimer = null;

function playCelebrationSound() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const notes = [
            { freq: 523.25, time: 0.00, dur: 0.22 }, // C5
            { freq: 659.25, time: 0.12, dur: 0.22 }, // E5
            { freq: 783.99, time: 0.24, dur: 0.22 }, // G5
            { freq: 1046.50, time: 0.38, dur: 0.45 }, // C6
            { freq: 1318.51, time: 0.48, dur: 0.55 }  // E6
        ];

        notes.forEach(n => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.time);

            gain.gain.setValueAtTime(0.001, ctx.currentTime + n.time);
            gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + n.time + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + n.time + n.dur);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime + n.time);
            osc.stop(ctx.currentTime + n.time + n.dur + 0.05);
        });
    } catch (e) {
        // Áudio é um aprimoramento progressivo; ignora se a política do navegador bloquear
    }
}

function createConfettiParticles(count = 140, origin = 'cannons') {
    const colors = [
        '#FFD700', '#FFA500', '#6C5CE7', '#00B894', 
        '#0984E3', '#FF7675', '#FD79A8', '#FDCB6E', '#A29BFE'
    ];
    const shapes = ['rect', 'circle', 'ribbon', 'star'];
    const particles = [];
    const width = window.innerWidth;
    const height = window.innerHeight;

    for (let i = 0; i < count; i++) {
        const fromLeft = i % 2 === 0;
        let x, y, vx, vy;

        if (origin === 'cannons') {
            x = fromLeft ? Math.random() * (width * 0.25) : width * 0.75 + Math.random() * (width * 0.25);
            y = height + 10;
            vx = fromLeft ? (Math.random() * 8 + 3) : -(Math.random() * 8 + 3);
            vy = -(Math.random() * 14 + 14);
        } else {
            // Explosão central
            x = width * 0.5 + (Math.random() - 0.5) * 80;
            y = height * 0.45 + (Math.random() - 0.5) * 60;
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 15 + 5;
            vx = Math.cos(angle) * speed;
            vy = Math.sin(angle) * speed - 6;
        }

        particles.push({
            x,
            y,
            vx,
            vy,
            size: Math.random() * 8 + 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            shape: shapes[Math.floor(Math.random() * shapes.length)],
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 12,
            wobble: Math.random() * 10,
            wobbleSpeed: Math.random() * 0.1 + 0.05,
            opacity: 1,
            gravity: 0.32 + Math.random() * 0.12,
            drag: 0.982
        });
    }
    return particles;
}

function startCelebrationCanvas() {
    const canvas = document.getElementById('celebrationCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    celebrationParticles = createConfettiParticles(160, 'cannons');

    // Explosão central complementar após 300ms
    setTimeout(() => {
        if (celebrationParticles.length > 0) {
            celebrationParticles.push(...createConfettiParticles(70, 'center'));
        }
    }, 350);

    if (celebrationAnimId) {
        cancelAnimationFrame(celebrationAnimId);
    }

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = celebrationParticles.length - 1; i >= 0; i--) {
            const p = celebrationParticles[i];

            p.vx *= p.drag;
            p.vy *= p.drag;
            p.vy += p.gravity;
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;
            p.wobble += p.wobbleSpeed;

            // Se cair abaixo da tela
            if (p.y > canvas.height + 40) {
                celebrationParticles.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.globalAlpha = p.opacity;
            ctx.fillStyle = p.color;

            if (p.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.shape === 'star') {
                drawStar(ctx, 0, 0, 5, p.size, p.size / 2);
            } else if (p.shape === 'ribbon') {
                ctx.fillRect(-p.size / 2, -p.size * 1.5, p.size * Math.cos(p.wobble), p.size * 2);
            } else {
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size * Math.cos(p.wobble), p.size);
            }

            ctx.restore();
        }

        if (celebrationParticles.length > 0) {
            celebrationAnimId = requestAnimationFrame(render);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    celebrationAnimId = requestAnimationFrame(render);
}

function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
}

function triggerCelebration(title, amount) {
    const overlay = document.getElementById('celebrationOverlay');
    if (!overlay) return;

    const titleEl = document.getElementById('celebrationGoalTitle');
    const amountEl = document.getElementById('celebrationGoalAmount');

    if (titleEl) titleEl.textContent = title || 'Sua Meta';
    if (amountEl) amountEl.textContent = formatCurrency(amount || 0);

    overlay.classList.add('active');
    document.body.classList.add('no-scroll');

    if (window.triggerHaptic) {
        window.triggerHaptic('heavy');
    }

    playCelebrationSound();
    startCelebrationCanvas();

    if (celebrationAutoDismissTimer) {
        clearTimeout(celebrationAutoDismissTimer);
    }
    celebrationAutoDismissTimer = setTimeout(() => {
        dismissCelebration();
    }, 8500);
}

function dismissCelebration() {
    const overlay = document.getElementById('celebrationOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
    document.body.classList.remove('no-scroll');

    if (celebrationAutoDismissTimer) {
        clearTimeout(celebrationAutoDismissTimer);
        celebrationAutoDismissTimer = null;
    }

    if (celebrationAnimId) {
        cancelAnimationFrame(celebrationAnimId);
        celebrationAnimId = null;
    }
    celebrationParticles = [];

    const canvas = document.getElementById('celebrationCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

function retriggerConfetti() {
    playCelebrationSound();
    if (celebrationParticles.length < 50) {
        startCelebrationCanvas();
    } else {
        celebrationParticles.push(...createConfettiParticles(100, 'cannons'));
    }
}

window.addEventListener('resize', () => {
    const canvas = document.getElementById('celebrationCanvas');
    if (canvas && celebrationAnimId) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
});

// ============================================
// TOAST
// ============================================
function showToast(message, type) {
    type = type || 'info';
    const toast = document.getElementById('toast');
    if (!toast) return;

    const colors = {
        info: '#0984E3',
        success: '#00B894',
        error: '#FF7675',
        warning: '#FDCB6E'
    };

    toast.textContent = message;
    toast.style.background = colors[type] || colors.info;
    toast.style.color = '#fff';
    toast.className = 'toast show';

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.className = 'toast hidden';
    }, 3000);
}

// ============================================
// EXPORTAR FUNÇÕES GLOBAIS
// ============================================
window.openModal = openModal;
window.closeModal = closeModal;
window.editGoal = editGoal;
window.saveGoal = saveGoal;
window.deleteGoal = deleteGoal;
window.openAddValue = openAddValue;
window.closeAddValue = closeAddValue;
window.submitAddValue = submitAddValue;
window.openWithdrawModal = openWithdrawModal;
window.closeWithdrawModal = closeWithdrawModal;
window.submitWithdraw = submitWithdraw;
window.setGoalsFilter = setGoalsFilter;
window.handleGoalsSearch = handleGoalsSearch;
window.clearGoalsSearch = clearGoalsSearch;
window.quickCompleteGoal = quickCompleteGoal;
window.triggerCelebration = triggerCelebration;
window.dismissCelebration = dismissCelebration;
window.retriggerConfetti = retriggerConfetti;
window.loadGoals = loadGoals;

console.log('✅ Goals.js carregado com sucesso (versão segura com celebração em tela cheia)!');