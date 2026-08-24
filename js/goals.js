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
                renderGoals(allGoals);
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
        renderGoals(allGoals);

    } catch (error) {
        console.error('❌ Erro ao carregar metas:', error);
        showToast('Erro ao carregar metas', 'error');
    }
}

function renderGoals(goals) {
    const container = document.getElementById('goalsContainer');
    if (!container) return;

    if (goals.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;padding:40px 16px;">
                <span class="empty-icon">🎯</span>
                <h3>Nenhuma meta ainda</h3>
                <p>Defina seus objetivos financeiros e acompanhe seu progresso!</p>
                <button class="btn btn-primary" onclick="openModal()" style="margin-top:10px; font-size:13px;">
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

        const deadline = g.deadline ? formatDate(g.deadline) : 'Sem prazo';
        const daysLeft = g.deadline
            ? Math.ceil((new Date(g.deadline) - new Date()) / (1000 * 60 * 60 * 24))
            : null;

        const color = g.color || '#6C5CE7';
        const emoji = isCompleted ? '🏆' : '🎯';
        const pctDisplay = Math.round(percent);

        let deadlineDisplay = deadline;
        if (daysLeft !== null && daysLeft > 0 && !isCompleted) {
            deadlineDisplay = `⏰ ${daysLeft} dias`;
        } else if (daysLeft !== null && daysLeft <= 0 && !isCompleted) {
            deadlineDisplay = '⏰ Prazo expirado';
        }

        return `
            <div class="goal-card ${isCompleted ? 'completed' : ''}" 
                 style="border-left-color:${color};"
                 onclick="editGoal('${g.id}')">
                <div class="goal-header">
                    <h3>${stripHTML(g.title)}</h3>
                    <span class="goal-emoji">${emoji}</span>
                </div>
                
                <div class="goal-amounts">
                    <span>Atual: <strong>${formatCurrency(g.current_amount)}</strong></span>
                    <span>Meta: <strong>${formatCurrency(g.target_amount)}</strong></span>
                </div>
                
                <div class="goal-progress">
                    <div class="progress-label">
                        <span>${pctDisplay}% concluído</span>
                        <span>${isCompleted ? '✅ Concluída!' : ''}</span>
                    </div>
                    <div class="progress">
                        <div class="progress-bar ${isCompleted ? 'success' : ''}" style="width:${pctDisplay}%;background:${color};"></div>
                    </div>
                </div>
                
                <div class="goal-footer">
                    <span>📅 ${deadlineDisplay}</span>
                    <span>${isCompleted ? '🏆 Meta alcançada!' : ''}</span>
                </div>
                
                <div class="goal-actions" onclick="event.stopPropagation();">
                    ${!isCompleted ? `
                        <button class="btn btn-success btn-sm btn-add-value" onclick="openAddValue('${g.id}')">
                            <i class="fas fa-plus"></i> Adicionar
                        </button>
                    ` : ''}
                    <button class="btn btn-ghost btn-icon-sm" onclick="editGoal('${g.id}')" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-icon-sm" onclick="deleteGoal('${g.id}')" title="Excluir">
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
    const title = document.getElementById('gTitle').value.trim();
    const target = parseNumberInput(document.getElementById('gTarget').value);
    const current = parseNumberInput(document.getElementById('gCurrent').value);
    const deadline = document.getElementById('gDeadline').value || null;
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
        color: color,
        completed: completed,
        updated_at: new Date().toISOString()
    };

    const secureData = window.TonuCSRF ? window.TonuCSRF.secureRequest(data) : data;

    const btn = event.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    isProcessing = true;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';

    try {
        let result;

        if (!navigator.onLine && window.tonuSync) {
            if (editId) {
                await window.tonuSync.enqueue('UPDATE_GOAL', { id: editId, ...secureData });
            } else {
                secureData.created_at = new Date().toISOString();
                await window.tonuSync.enqueue('INSERT_GOAL', secureData);
            }
            showToast('📦 Meta salva localmente! Sincronização pendente.', 'success');
            closeModal();
            await loadGoals();
            btn.disabled = false;
            isProcessing = false;
            btn.innerHTML = originalText;
            return;
        }

        if (editId) {
            result = await supabaseClient
                .from('goals')
                .update(secureData)
                .eq('id', editId)
                .eq('user_id', currentUser.id);
        } else {
            secureData.created_at = new Date().toISOString();
            result = await supabaseClient
                .from('goals')
                .insert([secureData]);
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
        closeModal();
        await loadGoals();

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
    document.getElementById('addValueOverlay').classList.remove('active');
    document.getElementById('addValueModal').classList.add('hidden');
}

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
        const data = {
            current_amount: newAmount,
            completed: completed,
            updated_at: new Date().toISOString()
        };

        const secureData = window.TonuCSRF ? window.TonuCSRF.secureRequest(data) : data;

        if (!navigator.onLine && window.tonuSync) {
            await window.tonuSync.enqueue('UPDATE_GOAL', { id: id, ...secureData });
            showToast('📦 Valor adicionado localmente! Sincronização pendente.', 'success');
            closeAddValue();
            await loadGoals();
            btn.disabled = false;
            isProcessing = false;
            btn.innerHTML = originalText;
            return;
        }

        const { error } = await supabaseClient
            .from('goals')
            .update(secureData)
            .eq('id', id)
            .eq('user_id', currentUser.id);

        if (error) throw error;

        const msg = completed ? '🎉 Meta concluída! Parabéns!' : `💰 ${formatCurrency(amount)} adicionado!`;
        showToast(msg, 'success');
        closeAddValue();
        await loadGoals();

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
window.loadGoals = loadGoals;

console.log('✅ Goals.js carregado com sucesso (versão segura)!');