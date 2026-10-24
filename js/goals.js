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
        if (window.getAuthenticatedUser) user = await window.getAuthenticatedUser();
        if (!user && window.supabaseOffline) {
            user = await window.supabaseOffline.isAuthenticated();
        }

        if (!user && supabaseClient && supabaseClient.auth) {
            try {
                const { data: sessData } = await supabaseClient.auth.getSession();
                user = sessData?.session?.user;
                if (!user) {
                    const { data: { user: authUser } } = await supabaseClient.auth.getUser();
                    user = authUser;
                }
            } catch (_) {}
        }

        if (!user) {
            try {
                const s = sessionStorage.getItem('tonu_user');
                if (s) { const p = JSON.parse(s); user = p.user || p; }
            } catch (_) {}
        }

        if (!user) {
            try {
                const off = localStorage.getItem('tonu_offline_session');
                if (off) { const p = JSON.parse(off); user = p.user || p; }
            } catch (_) {}
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

    // Atualiza o Card de Rendimento CDI no Topo (Aportado, Rend. Bruto, IOF, IR, Saldo Líquido)
    updateCdiGlobalCard(goals);
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
        const goalType = g.type || 'financial';
        const catInfo = resolveGoalCategory(g);
        const color = g.color || catInfo.color || '#6C5CE7';

        // TIPO 1: PROJETO / HÁBITO (📌)
        if (goalType === 'habit') {
            const isCompleted = !!g.completed;
            const completedDateText = g.completed_at ? formatDate(g.completed_at) : (g.deadline ? formatDate(g.deadline) : null);

            return `
                <div class="goal-card ${isCompleted ? 'completed' : ''}" 
                     style="--goal-accent-color: ${color};"
                     onclick="editGoal('${g.id}')">
                    
                    <div class="goal-card-top">
                        <div class="goal-badge-icon" style="background: ${color}20; color: ${color};">
                            <i class="fas fa-tasks"></i>
                        </div>
                        <div class="goal-title-wrap">
                            <div class="goal-category-tag">
                                <span>📌 Projeto / Hábito</span>
                            </div>
                            <h3 class="goal-card-title" title="${stripHTML(g.title)}">${stripHTML(g.title)}</h3>
                        </div>
                        <span class="goal-status-badge ${isCompleted ? 'completed-badge' : 'in-progress'}">
                            ${isCompleted ? '🏆 Concluído' : '⏳ Pendente'}
                        </span>
                    </div>

                    <div class="goal-finance-row" style="background: var(--color-bg, #f8fafc); border-radius: 8px; padding: 10px 12px; margin: 10px 0;">
                        <div class="goal-val-box">
                            <span class="goal-val-label">Status do Hábito</span>
                            <span class="goal-val-current" style="font-size: 13.5px; color:${isCompleted ? '#10b981' : '#f59e0b'};">
                                ${isCompleted ? '✅ Concluído com sucesso' : '⏳ Em andamento'}
                            </span>
                        </div>
                        <div class="goal-val-box" style="text-align: right;">
                            <span class="goal-val-label">${isCompleted ? 'Concluído em' : 'Prazo'}</span>
                            <span class="goal-val-target" style="font-size: 12.5px;">${completedDateText || 'Sem prazo'}</span>
                        </div>
                    </div>

                    <div class="goal-progress-box">
                        <div class="goal-progress-meta">
                            <span>${isCompleted ? '100% Concluído' : 'Pendente de conclusão'}</span>
                            <span class="goal-progress-pct">${isCompleted ? '100%' : '0%'}</span>
                        </div>
                        <div class="goal-progress-track">
                            <div class="goal-progress-fill ${isCompleted ? 'completed' : ''}" style="width: ${isCompleted ? '100%' : '0%'}; background:${isCompleted ? '#10b981' : color};"></div>
                        </div>
                    </div>

                    <div class="goal-actions-bar" onclick="event.stopPropagation();">
                        <button type="button" class="btn-card-action" onclick="toggleHabitStatus('${g.id}')" style="background:${isCompleted ? '#d1fae5' : '#f1f0fd'}; color:${isCompleted ? '#047857' : '#6C5CE7'}; font-weight:700; flex:1;">
                            <i class="fas ${isCompleted ? 'fa-check-circle' : 'fa-circle'}"></i> ${isCompleted ? 'Reabrir Hábito' : 'Marcar como Concluído'}
                        </button>
                        <button type="button" class="btn-card-icon-only" onclick="editGoal('${g.id}')" title="Editar detalhes">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button type="button" class="btn-card-icon-only danger" onclick="deleteGoal('${g.id}')" title="Excluir meta">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        // TIPO 2: DIVIDENDOS (📈 Renda Passiva Mensal)
        if (goalType === 'dividends') {
            const monthlyDivs = getMonthlyDividendsTotal();
            const targetAmount = Number(g.target_amount) || 1;
            const percent = Math.min(100, Math.round((monthlyDivs / targetAmount) * 100));
            const isCompleted = monthlyDivs >= targetAmount;

            return `
                <div class="goal-card ${isCompleted ? 'completed' : ''}" 
                     style="--goal-accent-color: #10B981;"
                     onclick="editGoal('${g.id}')">
                    
                    <div class="goal-card-top">
                        <div class="goal-badge-icon" style="background: rgba(16, 185, 129, 0.15); color: #10B981;">
                            <i class="fas fa-hand-holding-usd"></i>
                        </div>
                        <div class="goal-title-wrap">
                            <div class="goal-category-tag">
                                <span>📈 Dividendos Mensais</span>
                            </div>
                            <h3 class="goal-card-title" title="${stripHTML(g.title)}">${stripHTML(g.title)}</h3>
                        </div>
                        <span class="goal-status-badge ${isCompleted ? 'completed-badge' : 'in-progress'}">
                            ${isCompleted ? '🏆 Atingido' : `${percent}%`}
                        </span>
                    </div>

                    <div class="goal-finance-row">
                        <div class="goal-val-box">
                            <span class="goal-val-label">Recebido este Mês</span>
                            <span class="goal-val-current" style="color:#10b981;">${formatCurrency(monthlyDivs)}</span>
                        </div>
                        <div class="goal-val-box" style="text-align: right;">
                            <span class="goal-val-label">Meta Mensal</span>
                            <span class="goal-val-target">${formatCurrency(targetAmount)}/mês</span>
                        </div>
                    </div>

                    <div class="goal-progress-box">
                        <div class="goal-progress-meta">
                            <span>Progresso: <strong>${formatCurrency(monthlyDivs)} de ${formatCurrency(targetAmount)}</strong></span>
                            <span class="goal-progress-pct">${percent}%</span>
                        </div>
                        <div class="goal-progress-track">
                            <div class="goal-progress-fill ${isCompleted ? 'completed' : ''}" style="width: ${percent}%; background:#10B981;"></div>
                        </div>
                    </div>

                    <div class="goal-actions-bar" onclick="event.stopPropagation();">
                        <button type="button" class="btn-card-action" onclick="window.location.href='investments.html'" style="background:rgba(16,185,129,0.12); color:#047857; font-weight:700; flex:1;">
                            <i class="fas fa-chart-line"></i> Ver Proventos
                        </button>
                        <button type="button" class="btn-card-icon-only" onclick="editGoal('${g.id}')" title="Editar detalhes">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button type="button" class="btn-card-icon-only danger" onclick="deleteGoal('${g.id}')" title="Excluir meta">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        // TIPO 3: FINANCEIRA (💰 Padrão)
        const percent = g.target_amount > 0
            ? Math.min(100, (g.current_amount / g.target_amount) * 100)
            : 0;
        const isCompleted = g.completed || percent >= 99.99;
        const pctDisplay = Math.round(percent);
        const remaining = Math.max(0, (g.target_amount || 0) - (g.current_amount || 0));

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

                <div class="goal-progress-box">
                    <div class="goal-progress-meta">
                        <span>${isCompleted ? '🎉 100% atingido!' : `Faltam ${formatCurrency(remaining)}`}</span>
                        <span class="goal-progress-pct">${pctDisplay}%</span>
                    </div>
                    <div class="goal-progress-track">
                        <div class="goal-progress-fill ${isCompleted ? 'completed' : ''}" style="width: ${pctDisplay}%;"></div>
                    </div>
                </div>

                <div class="goal-insight-pill">
                    <div style="display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        <i class="fas fa-calendar-alt"></i>
                        <span>${deadlineLabel}</span>
                    </div>
                    ${monthlyNeedText ? `<div>${monthlyNeedText}</div>` : ''}
                </div>

                <div class="goal-actions-bar" onclick="event.stopPropagation();">
                    <button type="button" class="btn-card-action" onclick="openGoalYieldModal('${g.id}')" title="Extrato e Rendimento CDI" style="background:rgba(108,92,231,0.1); color:#6C5CE7; font-weight:700;">
                        <i class="fas fa-chart-line"></i> CDI
                    </button>
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
    if (document.getElementById('gType')) document.getElementById('gType').value = 'financial';
    document.getElementById('gCategory').value = 'other';
    document.getElementById('gColor').value = '#6C5CE7';
    if (document.getElementById('gCdiPercent')) document.getElementById('gCdiPercent').value = '100';
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
            if (document.getElementById('gType')) document.getElementById('gType').value = goal.type || 'financial';
            document.getElementById('gTitle').value = goal.title;
            document.getElementById('gTarget').value = formatNumberInput(goal.target_amount);
            document.getElementById('gCurrent').value = formatNumberInput(goal.current_amount || 0);
            document.getElementById('gDeadline').value = goal.deadline || '';
            const catInfo = resolveGoalCategory(goal);
            const catElem = document.getElementById('gCategory');
            if (catElem) catElem.value = goal.category || catInfo.key || 'other';
            document.getElementById('gColor').value = goal.color || '#6C5CE7';
            if (document.getElementById('gCdiPercent')) {
                document.getElementById('gCdiPercent').value = goal.cdi_percent || 100;
            }
            document.getElementById('gCompleted').checked = goal.completed || false;
            title.textContent = 'Editar Meta';
            deleteBtn.classList.remove('hidden');
        }
    }

    if (typeof toggleGoalTypeFields === 'function') {
        toggleGoalTypeFields();
    }

    overlay.classList.add('active');
    modal.classList.remove('hidden');

    setTimeout(() => {
        document.getElementById('gTitle')?.focus();
    }, 100);
}

function toggleGoalTypeFields() {
    const type = document.getElementById('gType')?.value || 'financial';
    const amountRow = document.getElementById('goalAmountRow');
    const currentGroup = document.getElementById('goalCurrentGroup');
    const cdiGroup = document.getElementById('goalCdiGroup');
    const lblTarget = document.getElementById('lblTarget');
    const gTarget = document.getElementById('gTarget');
    const gCurrent = document.getElementById('gCurrent');

    if (type === 'habit') {
        if (amountRow) amountRow.style.display = 'none';
        if (cdiGroup) cdiGroup.style.display = 'none';
        if (gTarget) { gTarget.required = false; gTarget.value = '1'; }
        if (gCurrent) gCurrent.value = '0';
    } else if (type === 'dividends') {
        if (amountRow) amountRow.style.display = 'flex';
        if (currentGroup) currentGroup.style.display = 'none';
        if (cdiGroup) cdiGroup.style.display = 'none';
        if (lblTarget) lblTarget.innerHTML = 'Meta Mensal de Proventos (R$/mês) *';
        if (gTarget) { gTarget.required = true; gTarget.placeholder = '50,00'; }
        if (gCurrent) gCurrent.value = '0';
    } else { // 'financial'
        if (amountRow) amountRow.style.display = 'flex';
        if (currentGroup) currentGroup.style.display = 'block';
        if (cdiGroup) cdiGroup.style.display = 'block';
        if (lblTarget) lblTarget.innerHTML = 'Valor Total (R$) *';
        if (gTarget) { gTarget.required = true; gTarget.placeholder = '50.000,00'; }
    }
}
window.toggleGoalTypeFields = toggleGoalTypeFields;

function getMonthlyDividendsTotal(targetMonthStr) {
    const ym = targetMonthStr || (new Date().toISOString().substring(0, 7));
    let divs = [];
    if (Array.isArray(window.allDividends) && window.allDividends.length > 0) {
        divs = window.allDividends;
    } else {
        try {
            const uid = (currentUser && currentUser.id) ? currentUser.id : 'demo';
            const raw = localStorage.getItem('tonucontrole_dividends_' + uid) || 
                        localStorage.getItem('tonu_dividends_' + uid) ||
                        localStorage.getItem('tonu_dividends_current');
            if (raw) divs = JSON.parse(raw);
        } catch (_) {}
    }
    return (divs || [])
        .filter(d => {
            const dt = d.payment_date || d.date || d.created_at || '';
            return dt.startsWith(ym);
        })
        .reduce((sum, d) => sum + (Number(d.net_value ?? d.amount ?? d.total_value ?? 0) || 0), 0);
}
window.getMonthlyDividendsTotal = getMonthlyDividendsTotal;

async function toggleHabitStatus(goalId) {
    const goal = allGoals.find(g => String(g.id) === String(goalId));
    if (!goal) return;
    const newStatus = !goal.completed;
    goal.completed = newStatus;
    goal.current_amount = newStatus ? 1 : 0;
    goal.target_amount = 1;
    goal.updated_at = new Date().toISOString();
    if (newStatus) {
        goal.completed_at = new Date().toISOString();
    } else {
        delete goal.completed_at;
    }

    renderGoals(allGoals);
    updateGoalsStats(allGoals);

    if (newStatus && typeof triggerCelebration === 'function') {
        triggerCelebration(goal.title, 0);
    }

    if (window.tonuSync && currentUser?.id) {
        await window.tonuSync.enqueue('UPDATE_GOAL', {
            id: goal.id,
            completed: newStatus,
            current_amount: goal.current_amount,
            target_amount: 1,
            completed_at: goal.completed_at || null,
            updated_at: goal.updated_at
        });
    }

    if (supabaseClient && currentUser?.id && navigator.onLine) {
        try {
            await supabaseClient.from('goals').update({
                completed: newStatus,
                current_amount: goal.current_amount,
                target_amount: 1,
                completed_at: goal.completed_at || null,
                updated_at: goal.updated_at
            }).eq('id', goal.id).eq('user_id', currentUser.id);
        } catch (e) {
            console.warn('⚠️ Erro ao atualizar status do hábito no Supabase:', e);
        }
    }

    if (typeof showToast === 'function') {
        showToast(newStatus ? '🎉 Projeto/Hábito concluído com sucesso!' : '⏳ Hábito retornado para Pendente', 'info');
    }
}
window.toggleHabitStatus = toggleHabitStatus;

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

    const type = document.getElementById('gType')?.value || 'financial';
    const title = document.getElementById('gTitle').value.trim();
    let target = parseNumberInput(document.getElementById('gTarget')?.value);
    let current = parseNumberInput(document.getElementById('gCurrent')?.value);
    const deadline = document.getElementById('gDeadline').value || null;
    const category = document.getElementById('gCategory') ? document.getElementById('gCategory').value : 'other';
    const color = document.getElementById('gColor').value;

    if (!title) {
        showToast('Informe o título da meta!', 'error');
        return;
    }

    let completed = false;
    if (type === 'habit') {
        target = 1;
        completed = document.getElementById('gCompleted')?.checked || false;
        current = completed ? 1 : 0;
    } else if (type === 'dividends') {
        current = getMonthlyDividendsTotal();
        completed = target > 0 ? (current >= target) : false;
        if (target <= 0) {
            showToast('Informe o valor mensal esperado de dividendos!', 'error');
            return;
        }
    } else {
        completed = document.getElementById('gCompleted').checked || (current >= target);
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
    }

    const cdiPercent = parseFloat(document.getElementById('gCdiPercent')?.value) || 100;

    const data = {
        user_id: currentUser.id,
        type: type,
        title: stripHTML(title),
        target_amount: target,
        current_amount: current,
        deadline: deadline,
        category: category,
        color: color,
        cdi_percent: cdiPercent,
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
            if (typeof window.sendRealtimePush === 'function') {
                const amtFormatted = typeof formatCurrency === 'function' ? formatCurrency(Math.max(target, current)) : `R$ ${Math.max(target, current)}`;
                window.sendRealtimePush({
                    title: `🎯 Meta Concluída: ${title}!`,
                    body: `Parabéns! Você bateu 100% da sua meta no valor de ${amtFormatted}.`,
                    url: 'pages/goals.html',
                    tag: `goal-complete-${Date.now()}`
                });
            }
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

        // Registra aporte histórico em goal_deposits
        try {
            const todayStr = (typeof getToday === 'function') ? getToday() : new Date().toLocaleDateString('sv');
            await supabaseClient.from('goal_deposits').insert([{
                goal_id: id,
                user_id: currentUser.id,
                amount: amount,
                deposit_date: todayStr
            }]);
        } catch (depErr) {
            console.warn('⚠️ Erro ao registrar goal_deposits:', depErr);
        }

        const msg = completed ? '🎉 Meta concluída! Parabéns!' : `💰 ${formatCurrency(amount)} adicionado!`;
        showToast(msg, 'success');
        if (window.triggerHaptic) window.triggerHaptic(completed ? 'heavy' : 'success');
        closeAddValue();
        await loadGoals();
        await checkMilestones(goal, newAmount);

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
// ITEM 12: RENDIMENTO CDI, IOF, IR & MARCOS (25, 50, 75, 90, 100%)
// ============================================
const IOF_TABLE = {
    1: 0.96, 2: 0.93, 3: 0.90, 4: 0.86, 5: 0.83,
    6: 0.80, 7: 0.76, 8: 0.73, 9: 0.70, 10: 0.66,
    11: 0.63, 12: 0.60, 13: 0.56, 14: 0.53, 15: 0.50,
    16: 0.46, 17: 0.43, 18: 0.40, 19: 0.36, 20: 0.33,
    21: 0.30, 22: 0.26, 23: 0.23, 24: 0.20, 25: 0.16,
    26: 0.13, 27: 0.10, 28: 0.06, 29: 0.03
};

function getIOFRate(daysPassed) {
    if (daysPassed <= 0) return 0.96;
    if (daysPassed >= 30) return 0;
    return IOF_TABLE[daysPassed] !== undefined ? IOF_TABLE[daysPassed] : 0;
}

function getIRRate(daysPassed) {
    if (daysPassed <= 180) return 0.225; // 22,5%
    if (daysPassed <= 360) return 0.200; // 20,0%
    if (daysPassed <= 720) return 0.175; // 17,5%
    return 0.150; // 15,0%
}

let cachedCDIDailyRate = 0.040169; // ~10.65% a.a.

async function fetchCDIRate() {
    try {
        if (window.supabaseClient && window.supabaseClient.functions) {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500));
            const invokePromise = window.supabaseClient.functions.invoke('get-cdi');
            const res = await Promise.race([invokePromise, timeoutPromise]);
            if (res && !res.error && res.data?.cdi?.daily_rate) {
                cachedCDIDailyRate = res.data.cdi.daily_rate;
                return cachedCDIDailyRate;
            }
        }
    } catch (e) {
        console.warn('⚠️ Falha ou timeout ao buscar CDI via Edge Function:', e);
    }
    return cachedCDIDailyRate;
}

async function checkMilestones(goal, newAmount) {
    if (!goal || !goal.target_amount || goal.target_amount <= 0) return;
    const pct = Math.min(100, Math.floor((newAmount / goal.target_amount) * 100));
    const milestones = [25, 50, 75, 90, 100];
    let fired = Array.isArray(goal.milestones_fired) ? [...goal.milestones_fired] : [];
    let newFired = [];

    for (const m of milestones) {
        if (pct >= m && !fired.includes(m)) {
            fired.push(m);
            newFired.push(m);
        }
    }

    if (newFired.length > 0) {
        goal.milestones_fired = fired;
        if (window.supabaseClient && currentUser?.id) {
            try {
                await window.supabaseClient
                    .from('goals')
                    .update({ milestones_fired: fired })
                    .eq('id', goal.id)
                    .eq('user_id', currentUser.id);
            } catch (err) {
                console.warn('⚠️ Erro ao persistir milestones_fired:', err);
            }
        }

        const highestMilestone = newFired[newFired.length - 1];
        if (highestMilestone === 100) {
            triggerCelebration(goal.title, newAmount);
        } else {
            showToast(`🎯 Marco de ${highestMilestone}% alcançado na meta "${goal.title}"! 🚀`, 'success');
            if (typeof confetti === 'function') {
                try { confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } }); } catch (_) {}
            }
        }

        if (typeof window.sendRealtimePush === 'function') {
            window.sendRealtimePush({
                title: `🎯 Marco alcançado: ${highestMilestone}% da meta!`,
                body: `Você conquistou ${highestMilestone}% da sua meta "${goal.title}"! Continue firme.`,
                url: 'pages/goals.html',
                tag: `goal-milestone-${goal.id}-${highestMilestone}`
            });
        }
    }
}

// ============================================
// ITEM 12: CARD GLOBAL DE RENDIMENTO CDI (DESKTOP)
// ============================================
async function updateCdiGlobalCard(goals) {
    const goalsList = Array.isArray(goals) ? goals : (allGoals || []);
    const cdiDaily = await fetchCDIRate();
    const annualizedRate = ((Math.pow(1 + (cdiDaily / 100), 252) - 1) * 100).toFixed(2);

    const statusEl = document.getElementById('cdiStatusText');
    if (statusEl) {
        statusEl.textContent = `Taxa CDI Atual: ~${annualizedRate.replace('.', ',')}% a.a. (BCB SGS 12) • 100% CDI`;
    }

    let allDeposits = [];
    if (window.supabaseClient && currentUser?.id) {
        try {
            const { data } = await window.supabaseClient
                .from('goal_deposits')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('deposit_date', { ascending: false });
            if (data && data.length > 0) {
                allDeposits = data;
            }
        } catch (err) {
            console.warn('⚠️ Erro ao buscar goal_deposits global:', err);
        }
    }

    const todayDate = new Date();
    let totalAportado = 0;
    let totalGrossYield = 0;
    let totalIOF = 0;
    let totalIR = 0;
    let totalNetYield = 0;

    goalsList.forEach(g => {
        const cur = Number(g.current_amount) || 0;
        if (cur <= 0) return;

        const cdiPct = parseFloat(g.cdi_percent) || 100;
        const ratePerDay = (cdiDaily / 100) * (cdiPct / 100);

        const goalDeps = allDeposits.filter(d => String(d.goal_id) === String(g.id));

        if (goalDeps.length > 0) {
            let sumDeps = 0;
            goalDeps.forEach(dep => {
                const amt = parseFloat(dep.amount) || 0;
                sumDeps += amt;
                const depDate = dep.deposit_date ? new Date(dep.deposit_date + 'T12:00:00') : todayDate;
                const diffDays = Math.max(0, Math.floor((todayDate.getTime() - depDate.getTime()) / 86400000));
                const workDays = diffDays > 0 ? Math.max(1, Math.round(diffDays * (252 / 365))) : 0;

                const factor = Math.max(0, Math.pow(1 + ratePerDay, workDays) - 1);
                const grossYield = amt * factor;

                const iofRate = getIOFRate(diffDays);
                const iof = grossYield * iofRate;

                const baseForIR = Math.max(0, grossYield - iof);
                const irRate = getIRRate(diffDays);
                const ir = baseForIR * irRate;

                const netYield = Math.max(0, grossYield - iof - ir);

                totalAportado += amt;
                totalGrossYield += grossYield;
                totalIOF += iof;
                totalIR += ir;
                totalNetYield += netYield;
            });

            if (cur > sumDeps) {
                const remAmt = cur - sumDeps;
                const createdDate = g.created_at ? new Date(g.created_at.slice(0, 10) + 'T12:00:00') : todayDate;
                const diffDays = Math.max(0, Math.floor((todayDate.getTime() - createdDate.getTime()) / 86400000));
                const workDays = diffDays > 0 ? Math.max(1, Math.round(diffDays * (252 / 365))) : 0;

                const factor = Math.max(0, Math.pow(1 + ratePerDay, workDays) - 1);
                const grossYield = remAmt * factor;

                const iofRate = getIOFRate(diffDays);
                const iof = grossYield * iofRate;

                const baseForIR = Math.max(0, grossYield - iof);
                const irRate = getIRRate(diffDays);
                const ir = baseForIR * irRate;

                const netYield = Math.max(0, grossYield - iof - ir);

                totalAportado += remAmt;
                totalGrossYield += grossYield;
                totalIOF += iof;
                totalIR += ir;
                totalNetYield += netYield;
            }
        } else {
            const createdDate = g.created_at ? new Date(g.created_at.slice(0, 10) + 'T12:00:00') : todayDate;
            const diffDays = Math.max(0, Math.floor((todayDate.getTime() - createdDate.getTime()) / 86400000));
            const workDays = diffDays > 0 ? Math.max(1, Math.round(diffDays * (252 / 365))) : 0;

            const factor = Math.max(0, Math.pow(1 + ratePerDay, workDays) - 1);
            const grossYield = cur * factor;

            const iofRate = getIOFRate(diffDays);
            const iof = grossYield * iofRate;

            const baseForIR = Math.max(0, grossYield - iof);
            const irRate = getIRRate(diffDays);
            const ir = baseForIR * irRate;

            const netYield = Math.max(0, grossYield - iof - ir);

            totalAportado += cur;
            totalGrossYield += grossYield;
            totalIOF += iof;
            totalIR += ir;
            totalNetYield += netYield;
        }
    });

    const totalNet = totalAportado + totalNetYield;

    const elAportado = document.getElementById('cdiStatAportado');
    const elBruto = document.getElementById('cdiStatBruto');
    const elIOF = document.getElementById('cdiStatIOF');
    const elIR = document.getElementById('cdiStatIR');
    const elLiquido = document.getElementById('cdiStatLiquido');

    if (elAportado) elAportado.textContent = formatCurrency(totalAportado);
    if (elBruto) elBruto.textContent = `+ ${formatCurrency(totalGrossYield)}`;
    if (elIOF) elIOF.textContent = `- ${formatCurrency(totalIOF)}`;
    if (elIR) elIR.textContent = `- ${formatCurrency(totalIR)}`;
    if (elLiquido) elLiquido.textContent = formatCurrency(totalNet);
}

let currentYieldGoalId = null;

async function openGoalYieldModal(goalId) {
    const goal = allGoals.find(g => String(g.id) === String(goalId));
    if (!goal) return;

    currentYieldGoalId = goal.id;
    document.body.classList.add('no-scroll');

    const overlay = document.getElementById('goalYieldOverlay');
    const modal = document.getElementById('goalYieldModal');
    if (overlay) overlay.classList.add('active');
    if (modal) modal.classList.remove('hidden');

    const titleEl = document.getElementById('yieldGoalTitle');
    if (titleEl) titleEl.textContent = goal.title;

    const cdiInput = document.getElementById('yieldModalCdiPercentInput');
    if (cdiInput) cdiInput.value = goal.cdi_percent || 100;

    const qGoalId = document.getElementById('quickDepositGoalId');
    if (qGoalId) qGoalId.value = goal.id;

    const qDate = document.getElementById('quickDepositDate');
    if (qDate) qDate.value = (typeof getToday === 'function') ? getToday() : new Date().toLocaleDateString('sv');

    await renderGoalYieldDetails(goal);
}

function closeGoalYieldModal() {
    document.body.classList.remove('no-scroll');
    const overlay = document.getElementById('goalYieldOverlay');
    const modal = document.getElementById('goalYieldModal');
    if (overlay) overlay.classList.remove('active');
    if (modal) modal.classList.add('hidden');
    currentYieldGoalId = null;
}

async function renderGoalYieldDetails(goal) {
    const tbody = document.getElementById('goalDepositsTableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:16px;"><span class="spinner"></span> Carregando aportes e calculando rendimentos...</td></tr>';
    }

    const cdiDaily = await fetchCDIRate();
    const cdiPercent = parseFloat(goal.cdi_percent) || 100;

    let deposits = [];
    if (window.supabaseClient && currentUser?.id) {
        try {
            const { data } = await window.supabaseClient
                .from('goal_deposits')
                .select('*')
                .eq('goal_id', goal.id)
                .order('deposit_date', { ascending: false });
            if (data && data.length > 0) deposits = data;
        } catch (err) {
            console.warn('⚠️ Erro ao buscar goal_deposits:', err);
        }
    }

    if (deposits.length === 0 && (Number(goal.current_amount) || 0) > 0) {
        deposits = [{
            id: 'initial',
            amount: Number(goal.current_amount),
            deposit_date: (goal.created_at ? goal.created_at.slice(0, 10) : ((typeof getToday === 'function') ? getToday() : new Date().toLocaleDateString('sv'))),
            is_initial: true
        }];
    }

    const todayDate = new Date();
    let totalDeposited = 0;
    let totalGrossYield = 0;
    let totalIOF = 0;
    let totalIR = 0;
    let totalNetYield = 0;

    const rowsHtml = deposits.map(dep => {
        const amt = parseFloat(dep.amount) || 0;
        const depDate = dep.deposit_date ? new Date(dep.deposit_date + 'T12:00:00') : todayDate;
        const diffDays = Math.max(0, Math.floor((todayDate.getTime() - depDate.getTime()) / 86400000));
        const workDays = diffDays > 0 ? Math.max(1, Math.round(diffDays * (252 / 365))) : 0;

        const ratePerDay = (cdiDaily / 100) * (cdiPercent / 100);
        const factor = Math.max(0, Math.pow(1 + ratePerDay, workDays) - 1);
        const grossYield = Math.max(0, amt * factor);

        const iofRate = getIOFRate(diffDays);
        const iof = grossYield * iofRate;

        const baseForIR = Math.max(0, grossYield - iof);
        const irRate = getIRRate(diffDays);
        const ir = baseForIR * irRate;

        const netYield = Math.max(0, grossYield - iof - ir);

        totalDeposited += amt;
        totalGrossYield += grossYield;
        totalIOF += iof;
        totalIR += ir;
        totalNetYield += netYield;

        const dateFormatted = typeof formatDate === 'function' ? formatDate(dep.deposit_date) : dep.deposit_date;

        return `
            <tr style="border-bottom: 1px solid var(--color-border); padding: 8px 10px;">
                <td style="padding: 8px 10px; font-weight: 600;">${dateFormatted} ${dep.is_initial ? '<span style="font-size:9.5px; color:var(--color-primary);">(Inicial)</span>' : ''}</td>
                <td style="padding: 8px 10px; font-weight: 700;">${formatCurrency(amt)}</td>
                <td style="padding: 8px 10px; color:var(--color-text-muted);">${diffDays} dia(s)</td>
                <td style="padding: 8px 10px; color:#00B894; font-weight: 700;">+${formatCurrency(grossYield)}</td>
                <td style="padding: 8px 10px; color:#ef4444;">-${formatCurrency(iof + ir)}</td>
                <td style="padding: 8px 10px; color:#6C5CE7; font-weight: 700;">+${formatCurrency(netYield)}</td>
                <td style="padding: 8px 10px; text-align:right;">
                    ${!dep.is_initial ? `<button type="button" class="btn btn-sm" onclick="deleteGoalDeposit('${dep.id}', ${amt})" style="color:#ef4444; background:none; border:none; padding:2px 6px; cursor:pointer;" title="Remover Aporte"><i class="fas fa-trash"></i></button>` : '-'}
                </td>
            </tr>
        `;
    }).join('');

    if (tbody) {
        tbody.innerHTML = rowsHtml || '<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--color-text-muted);">Nenhum aporte registrado ainda.</td></tr>';
    }

    const grossTotal = totalDeposited + totalGrossYield;
    const netTotal = totalDeposited + totalNetYield;

    const elDep = document.getElementById('yieldStatDeposited');
    const elGrossYield = document.getElementById('yieldStatGrossYield');
    const elGrossTotal = document.getElementById('yieldStatGrossTotal');
    const elIOF = document.getElementById('yieldStatIOF');
    const elIR = document.getElementById('yieldStatIR');
    const elNetTotal = document.getElementById('yieldStatNetTotal');

    if (elDep) elDep.textContent = formatCurrency(totalDeposited);
    if (elGrossYield) elGrossYield.textContent = `+${formatCurrency(totalGrossYield)}`;
    if (elGrossTotal) elGrossTotal.textContent = formatCurrency(grossTotal);
    if (elIOF) elIOF.textContent = `-${formatCurrency(totalIOF)}`;
    if (elIR) elIR.textContent = `-${formatCurrency(totalIR)}`;
    if (elNetTotal) elNetTotal.textContent = formatCurrency(netTotal);
}

async function saveGoalCdiPercentDirect() {
    if (!currentYieldGoalId) return;
    const input = document.getElementById('yieldModalCdiPercentInput');
    const val = parseFloat(input?.value) || 100;

    const goal = allGoals.find(g => g.id === currentYieldGoalId);
    if (!goal) return;

    goal.cdi_percent = val;
    if (window.supabaseClient && currentUser?.id) {
        try {
            await window.supabaseClient.from('goals').update({ cdi_percent: val }).eq('id', goal.id).eq('user_id', currentUser.id);
            showToast(`Percentual atualizado para ${val}% do CDI! ✅`, 'success');
        } catch (e) {
            console.error(e);
            showToast('Erro ao salvar % do CDI', 'error');
        }
    }
    await renderGoalYieldDetails(goal);
}

async function submitQuickDeposit(event) {
    if (event) event.preventDefault();
    if (!currentYieldGoalId) return;

    const goal = allGoals.find(g => g.id === currentYieldGoalId);
    if (!goal) return;

    const amtInput = document.getElementById('quickDepositAmount');
    const dateInput = document.getElementById('quickDepositDate');
    const rawVal = parseNumberInput(amtInput?.value || '');
    const depDate = dateInput?.value || (typeof getToday === 'function' ? getToday() : new Date().toLocaleDateString('sv'));

    if (!rawVal || rawVal <= 0) {
        showToast('Digite um valor de aporte válido!', 'warning');
        return;
    }

    try {
        if (window.supabaseClient && currentUser?.id) {
            await window.supabaseClient.from('goal_deposits').insert([{
                goal_id: goal.id,
                user_id: currentUser.id,
                amount: rawVal,
                deposit_date: depDate
            }]);

            const newAmount = (Number(goal.current_amount) || 0) + rawVal;
            const completed = newAmount >= goal.target_amount;

            await window.supabaseClient.from('goals').update({
                current_amount: newAmount,
                completed: completed,
                updated_at: new Date().toISOString()
            }).eq('id', goal.id).eq('user_id', currentUser.id);

            goal.current_amount = newAmount;
            goal.completed = completed;
            await checkMilestones(goal, newAmount);
        }

        if (amtInput) amtInput.value = '';
        showToast(`Aporte de ${formatCurrency(rawVal)} registrado com sucesso! 💰`, 'success');
        await renderGoalYieldDetails(goal);
        await loadGoals();
    } catch (err) {
        console.error('Erro ao adicionar aporte:', err);
        showToast('Erro ao registrar aporte', 'error');
    }
}

async function deleteGoalDeposit(depId, amount) {
    if (!confirm('Deseja excluir este aporte do histórico?')) return;
    if (!currentYieldGoalId) return;

    const goal = allGoals.find(g => g.id === currentYieldGoalId);
    if (!goal) return;

    try {
        if (window.supabaseClient && currentUser?.id) {
            await window.supabaseClient.from('goal_deposits').delete().eq('id', depId).eq('user_id', currentUser.id);
            const newAmount = Math.max(0, (Number(goal.current_amount) || 0) - amount);
            await window.supabaseClient.from('goals').update({
                current_amount: newAmount,
                completed: newAmount >= goal.target_amount,
                updated_at: new Date().toISOString()
            }).eq('id', goal.id).eq('user_id', currentUser.id);
            goal.current_amount = newAmount;
            goal.completed = newAmount >= goal.target_amount;
        }
        showToast('Aporte removido com sucesso!', 'info');
        await renderGoalYieldDetails(goal);
        await loadGoals();
    } catch (err) {
        console.error('Erro ao excluir aporte:', err);
        showToast('Erro ao excluir aporte', 'error');
    }
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
window.openGoalYieldModal = openGoalYieldModal;
window.closeGoalYieldModal = closeGoalYieldModal;
window.saveGoalCdiPercentDirect = saveGoalCdiPercentDirect;
window.submitQuickDeposit = submitQuickDeposit;
window.deleteGoalDeposit = deleteGoalDeposit;
window.updateCdiGlobalCard = updateCdiGlobalCard;

console.log('✅ Goals.js carregado com sucesso (versão segura com CDI, marcos e celebração)!');