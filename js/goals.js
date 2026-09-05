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
                        <button class="btn btn-success btn-sm btn-add-value" onclick="openAddValue('${g.id}')" title="Aportar valor">
                            <i class="fas fa-plus"></i> Aportar
                        </button>
                        <button type="button" class="btn-complete-quick" onclick="quickCompleteGoal('${g.id}')" title="Concluir meta agora!">
                            <i class="fas fa-check"></i>
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
    const prevGoal = editId ? allGoals.find(g => g.id === editId) : null;
    const wasCompleted = prevGoal ? (prevGoal.completed || (prevGoal.current_amount >= prevGoal.target_amount)) : false;

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
            .update(secureData)
            .eq('id', id)
            .eq('user_id', currentUser.id);

        if (error) throw error;

        const msg = completed ? '🎉 Meta concluída! Parabéns!' : `💰 ${formatCurrency(amount)} adicionado!`;
        showToast(msg, 'success');
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
        const data = {
            current_amount: goal.target_amount,
            completed: true,
            updated_at: new Date().toISOString()
        };

        const secureData = window.TonuCSRF ? window.TonuCSRF.secureRequest(data) : data;

        if (!navigator.onLine && window.tonuSync) {
            await window.tonuSync.enqueue('UPDATE_GOAL', { id: id, ...secureData });
            showToast('📦 Meta concluída localmente! Sincronização pendente.', 'success');
            await loadGoals();
            triggerCelebration(goal.title, goal.target_amount);
            isProcessing = false;
            return;
        }

        const { error } = await supabaseClient
            .from('goals')
            .update(secureData)
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
window.quickCompleteGoal = quickCompleteGoal;
window.triggerCelebration = triggerCelebration;
window.dismissCelebration = dismissCelebration;
window.retriggerConfetti = retriggerConfetti;
window.loadGoals = loadGoals;

console.log('✅ Goals.js carregado com sucesso (versão segura com celebração em tela cheia)!');