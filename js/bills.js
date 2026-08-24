// ============================================
// CONTAS DO MÊS - TonuControle
// ============================================

console.log('📋 Bills.js carregado');

// ============================================
// ESTADO
// ============================================
let currentUser = null;
let allBills = [];
let categories = [];
let currentMonthOffset = 0;
let isProcessing = false;

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function getLastDayOfMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function formatDateKey(year, month, day) {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
}

function getToday() {
    return new Date().toISOString().split('T')[0];
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Contas do Mês...');

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

    await loadCategories();
    updateMonthDisplay('selectedMonth', currentMonthOffset);
    await loadBills();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(filterBills, 300));
    }

    console.log('✅ Contas do Mês inicializado!');
});

// ============================================
// DEBOUNCE
// ============================================
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(function () {
            fn.apply(this, args);
        }, delay);
    };
}

// ============================================
// CATEGORIAS
// ============================================
async function loadCategories() {
    try {
        const cached = await window.getCachedCategories?.(currentUser.id);
        if (cached) {
            categories = cached;
            populateCategorySelects();
            console.log('✅ Categorias carregadas do cache:', categories.length);
            return;
        }

        const { data, error } = await supabaseClient
            .from('categories')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('name');

        if (error) throw error;

        categories = data || [];

        if (window.setCachedCategories) {
            await window.setCachedCategories(currentUser.id, categories);
        }

        console.log('✅ Categorias carregadas:', categories.length);

    } catch (e) {
        console.error('❌ Erro ao carregar categorias:', e);
        categories = [];
    }

    populateCategorySelects();
}

function populateCategorySelects() {
    const select = document.getElementById('bCategory');
    if (select) {
        select.innerHTML = '<option value="">Selecione...</option>';
        categories.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        });
    }
}

function getCategoryById(id) {
    return categories.find(c => c.id === id) || { name: 'Sem categoria', icon: 'fa-tag', color: '#B2BEC3' };
}

// ============================================
// MÊS
// ============================================
window.changeMonth = function (dir) {
    currentMonthOffset += dir;
    updateMonthDisplay('selectedMonth', currentMonthOffset);
    loadBills();
};

window.goToCurrentMonth = function () {
    currentMonthOffset = 0;
    updateMonthDisplay('selectedMonth', currentMonthOffset);
    loadBills();
};

// ============================================
// CARREGAR CONTAS - MOSTRA TODAS
// ============================================
async function loadBills() {
    console.log('📊 Carregando contas...');

    const d = new Date();
    d.setMonth(d.getMonth() + currentMonthOffset);
    const year = d.getFullYear();
    const month = d.getMonth();
    const lastDay = getLastDayOfMonth(year, month);
    const firstDay = formatDateKey(year, month, 1);
    const lastDayStr = formatDateKey(year, month, lastDay);

    try {
        if (!navigator.onLine && window.tonuSync) {
            const cached = await window.tonuSync.getCachedBills?.();
            if (cached && cached.length > 0) {
                allBills = cached;
                updateSummary();
                renderBills(allBills);
                return;
            }
        }

        // 🔥 BUSCAR TODAS AS CONTAS DO MÊS (pagas E não pagas)
        const { data, error } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('type', 'expense')
            .eq('is_bill', true)
            .gte('date', firstDay)
            .lte('date', lastDayStr)
            .order('date', { ascending: true });

        if (error) throw error;

        allBills = data || [];
        console.log('📊 Contas do mês (pagas + pendentes):', allBills.length);
        updateSummary();
        renderBills(allBills);

        if (window.billNotificationManager) {
            window.billNotificationManager.processDueBills(allBills, false);
        }

    } catch (error) {
        console.error('❌ Erro ao carregar contas:', error);
        showToast('Erro ao carregar contas', 'error');
    }
}

function updateSummary() {
    const total = allBills.length;
    const paid = allBills.filter(b => b.paid).length;
    const pending = total - paid;
    const totalAmount = allBills.reduce((sum, b) => sum + Number(b.amount), 0);
    const paidAmount = allBills.filter(b => b.paid).reduce((sum, b) => sum + Number(b.amount), 0);
    const pendingAmount = totalAmount - paidAmount;

    document.getElementById('totalBills').textContent = total;
    document.getElementById('pendingBills').textContent = pending;
    document.getElementById('paidBills').textContent = paid;
    document.getElementById('totalAmount').textContent = formatCurrency(totalAmount);

    const remEl = document.getElementById('remainingAmount');
    if (remEl) {
        if (pending > 0) {
            remEl.textContent = `A pagar: ${formatCurrency(pendingAmount)}`;
            remEl.className = 'stat-sub text-danger';
        } else {
            remEl.textContent = 'Tudo pago! ✅';
            remEl.className = 'stat-sub text-success';
        }
    }

    const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
    document.getElementById('progressPercent').textContent = `${pct}%`;
    document.getElementById('progressFill').style.width = `${pct}%`;
}

// ============================================
// RENDER BILLS - PAGAR (VERDE) | PAGO (CINZA)
// ============================================
function renderBills(bills) {
    const container = document.getElementById('billsContainer');
    if (!container) return;

    if (bills.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding:30px 16px;">
                <span class="empty-icon">📋</span>
                <h3>Nenhuma conta para este mês</h3>
                <p>Adicione uma conta fixa, parcelada ou única</p>
                <button class="btn btn-primary" onclick="openModal()" style="margin-top:10px; font-size:13px;">
                    <i class="fas fa-plus"></i> Adicionar conta
                </button>
            </div>
        `;
        return;
    }

    const today = getToday();

    container.innerHTML = bills.map(b => {
        const cat = getCategoryById(b.category_id);
        const isPaid = b.paid || false;
        const isOverdue = !isPaid && b.date < today;

        let statusText = 'Pendente';
        let statusClass = 'badge-pending';
        if (isPaid) {
            statusText = 'Paga ✅';
            statusClass = 'badge-success';
        } else if (isOverdue) {
            statusText = '⚠️ Vencida';
            statusClass = 'badge-overdue';
        }

        const amountClass = isPaid ? 'text-success' : (isOverdue ? 'text-danger' : 'text-warning');
        const cardClass = isOverdue ? 'overdue' : '';

        let recurrenceLabel = '';
        let recurrenceType = '';

        if (b.installments && b.installments > 1) {
            const paidInstallments = b.current_installment || 1;
            const totalInstallments = b.installments;
            recurrenceLabel = `
                <span class="recurrence-badge installment">
                    📦 ${paidInstallments}/${totalInstallments}
                </span>
            `;
            recurrenceType = 'Parcelada';
        } else if (b.is_recurring && b.recurrence_type === 'annual') {
            recurrenceLabel = `<span class="recurrence-badge annual">📅 Anual</span>`;
            recurrenceType = 'Anual';
        } else if (b.is_recurring) {
            recurrenceLabel = `<span class="recurrence-badge monthly">🔄 Fixa</span>`;
            recurrenceType = 'Fixa';
        } else {
            recurrenceLabel = `<span class="recurrence-badge single">📄 Única</span>`;
            recurrenceType = 'Única';
        }

        let daysLeft = '';
        if (!isPaid) {
            const dueDate = new Date(b.date);
            const todayDate = new Date();
            const diffTime = dueDate - todayDate;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
                daysLeft = `<span class="days-left">⏰ ${diffDays} dias</span>`;
            } else if (diffDays === 0) {
                daysLeft = `<span class="days-left urgent">⚠️ Vence hoje!</span>`;
            } else {
                daysLeft = `<span class="days-left overdue">⏰ ${Math.abs(diffDays)} dias</span>`;
            }
        }

        // 🔥 BOTÃO: PAGAR (VERDE) | PAGO (CINZA)
        const botao = isPaid ? `
            <button class="btn btn-secondary btn-sm btn-pago" onclick="event.stopPropagation(); toggleBillPayment('${b.id}')" title="Voltar para pendente">
                <i class="fas fa-check-circle"></i> PAGO
            </button>
        ` : `
            <button class="btn btn-success btn-sm btn-pagar" onclick="event.stopPropagation(); toggleBillPayment('${b.id}')" title="Pagar">
                <i class="fas fa-check"></i> PAGAR
            </button>
        `;

        return `
            <div class="bill-card ${cardClass}" data-id="${b.id}">
                <div class="bill-left">
                    <div class="bill-icon" style="background:${cat.color || '#6C5CE7'}">
                        <i class="fas ${cat.icon || 'fa-file-invoice'}"></i>
                    </div>
                    <div class="bill-info">
                        <strong>${stripHTML(b.description)}</strong>
                        <small>
                            ${cat.name || 'Sem categoria'} • 
                            ${recurrenceType} • 
                            Venc: ${formatDate(b.date)}
                            ${daysLeft}
                        </small>
                        <div style="margin-top:4px;">
                            ${recurrenceLabel}
                        </div>
                    </div>
                </div>
                <div class="bill-right">
                    <span class="badge ${statusClass}">${statusText}</span>
                    <span class="bill-amount ${amountClass}">${formatCurrency(b.amount)}</span>
                    <div class="bill-actions">
                        ${botao}
                        <button class="btn btn-ghost btn-icon-sm" onclick="event.stopPropagation(); editBill('${b.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger btn-icon-sm" onclick="event.stopPropagation(); deleteBill('${b.id}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// FILTROS
// ============================================
function filterBills() {
    const search = document.getElementById('searchInput')?.value?.toLowerCase() || '';
    const status = document.getElementById('filterStatus')?.value || 'all';
    const today = getToday();

    let filtered = [...allBills];

    if (search) {
        filtered = filtered.filter(b => b.description.toLowerCase().includes(search));
    }

    if (status === 'pending') {
        filtered = filtered.filter(b => !b.paid && b.date >= today);
    } else if (status === 'paid') {
        filtered = filtered.filter(b => b.paid);
    } else if (status === 'overdue') {
        filtered = filtered.filter(b => !b.paid && b.date < today);
    }

    renderBills(filtered);
}

// ============================================
// 🔥 TOGGLE PAGAMENTO (PAGAR ↔ DESPAGAR)
// ============================================
async function toggleBillPayment(id) {
    console.log('🔔 toggleBillPayment chamado para ID:', id);

    if (isProcessing) {
        showToast('Aguarde...', 'warning');
        return;
    }

    isProcessing = true;

    const btn = document.querySelector(`[onclick*="toggleBillPayment('${id}')"]`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';
    }

    try {
        // 🔥 BUSCAR A CONTA
        const { data: bill, error: fetchError } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;
        if (!bill) throw new Error('Conta não encontrada');

        const isPaid = bill.paid;

        if (!navigator.onLine && window.tonuSync) {
            if (isPaid) {
                await window.tonuSync.enqueue('UNPAY_BILL', { billId: id });
            } else {
                await window.tonuSync.enqueue('PAY_BILL', { billId: id, paymentData: null });
            }
            showToast('📦 Agendado', 'warning');
            await loadBills();
            isProcessing = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = isPaid ? '<i class="fas fa-check"></i> PAGAR' : '<i class="fas fa-check-circle"></i> PAGO';
            }
            return;
        }

        if (isPaid) {
            // 🔥 DESPAGAR (voltar para pendente)
            const { error: updateError } = await supabaseClient
                .from('transactions')
                .update({ paid: false })
                .eq('id', id);

            if (updateError) throw updateError;

            // REMOVER A TRANSAÇÃO DE PAGAMENTO
            await supabaseClient
                .from('transactions')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('description', `💰 ${bill.description} (pago)`)
                .eq('amount', bill.amount)
                .eq('date', bill.date);

            showToast('🔄 Pendente', 'info');

        } else {
            // 🔥 PAGAR
            const { error: updateError } = await supabaseClient
                .from('transactions')
                .update({ paid: true })
                .eq('id', id);

            if (updateError) throw updateError;

            // VERIFICAR SE JÁ EXISTE TRANSAÇÃO DE PAGAMENTO
            const { data: existingPayment } = await supabaseClient
                .from('transactions')
                .select('id')
                .eq('user_id', currentUser.id)
                .eq('description', `💰 ${bill.description} (pago)`)
                .eq('amount', bill.amount)
                .eq('date', bill.date)
                .maybeSingle();

            if (!existingPayment) {
                const transactionData = {
                    user_id: currentUser.id,
                    type: 'expense',
                    description: `💰 ${bill.description} (pago)`,
                    amount: bill.amount,
                    category_id: bill.category_id,
                    date: bill.date,
                    paid: true,
                    is_bill: false,
                    notes: `Pagamento da conta ${bill.description} em ${new Date().toLocaleDateString()}`,
                    is_recurring: false,
                    recurrence_type: null,
                    installments: 1,
                    current_installment: 1
                };

                await supabaseClient.from('transactions').insert([transactionData]);
            }

            showToast('✅ Paga!', 'success');
        }

        await loadBills();

    } catch (error) {
        console.error('❌ Erro ao alternar pagamento:', error);
        showToast('Erro!', 'error');
    } finally {
        isProcessing = false;
        if (btn) {
            btn.disabled = false;
            const isPaid = allBills.find(b => b.id === id)?.paid;
            btn.innerHTML = isPaid ? '<i class="fas fa-check-circle"></i> PAGO' : '<i class="fas fa-check"></i> PAGAR';
        }
    }
}

// ============================================
// MODAL
// ============================================
function openModal(id = null) {
    if (isProcessing) {
        showToast('Aguarde...', 'warning');
        return;
    }

    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('billModal');
    const form = document.getElementById('billForm');
    const title = document.getElementById('modalTitle');
    const deleteBtn = document.getElementById('btnDelete');

    document.body.classList.add('no-scroll');

    form.reset();
    document.getElementById('editId').value = '';
    document.getElementById('bDueDate').value = getToday();
    document.getElementById('bRecurrence').value = 'single';
    document.getElementById('bRecurrenceType').value = 'monthly';
    document.getElementById('installmentsGroup').classList.add('hidden');
    document.getElementById('recurrenceTypeGroup').classList.add('hidden');
    deleteBtn.classList.add('hidden');
    title.textContent = 'Nova Conta';

    populateCategorySelects();

    if (id) {
        const bill = allBills.find(b => b.id === id);
        if (bill) {
            document.getElementById('editId').value = bill.id;
            document.getElementById('bDescription').value = bill.description;
            document.getElementById('bAmount').value = bill.amount;
            document.getElementById('bDueDate').value = bill.date;
            document.getElementById('bCategory').value = bill.category_id || '';
            document.getElementById('bNotes').value = bill.notes || '';
            document.getElementById('bPaid').checked = bill.paid || false;

            if (bill.installments > 1) {
                document.getElementById('bRecurrence').value = 'installment';
                document.getElementById('bInstallments').value = bill.installments;
                document.getElementById('installmentsGroup').classList.remove('hidden');
            } else if (bill.is_recurring && bill.recurrence_type === 'annual') {
                document.getElementById('bRecurrence').value = 'recurring';
                document.getElementById('bRecurrenceType').value = 'annual';
                document.getElementById('recurrenceTypeGroup').classList.remove('hidden');
            } else if (bill.is_recurring) {
                document.getElementById('bRecurrence').value = 'recurring';
                document.getElementById('bRecurrenceType').value = 'monthly';
                document.getElementById('recurrenceTypeGroup').classList.remove('hidden');
            }

            title.textContent = 'Editar Conta';
            deleteBtn.classList.remove('hidden');
        }
    }

    overlay.classList.add('active');
    modal.classList.remove('hidden');

    setTimeout(() => {
        document.getElementById('bDescription')?.focus();
    }, 100);
}

function closeModal() {
    document.body.classList.remove('no-scroll');
    document.getElementById('modalOverlay').classList.remove('active');
    document.getElementById('billModal').classList.add('hidden');
}

function editBill(id) {
    openModal(id);
}

function toggleRecurrenceOptions() {
    const type = document.getElementById('bRecurrence').value;
    const installmentsGroup = document.getElementById('installmentsGroup');
    const recurrenceTypeGroup = document.getElementById('recurrenceTypeGroup');

    installmentsGroup.classList.add('hidden');
    recurrenceTypeGroup.classList.add('hidden');

    if (type === 'installment') {
        installmentsGroup.classList.remove('hidden');
    } else if (type === 'recurring') {
        recurrenceTypeGroup.classList.remove('hidden');
    }
}

// ============================================
// SALVAR CONTA
// ============================================
async function saveBill(event) {
    event.preventDefault();

    if (isProcessing) {
        showToast('Aguarde...', 'warning');
        return;
    }

    const editId = document.getElementById('editId').value;
    const description = document.getElementById('bDescription').value.trim();
    const amount = parseFloat(document.getElementById('bAmount').value);
    const categoryId = document.getElementById('bCategory').value;
    const dueDate = document.getElementById('bDueDate').value;
    const recurrence = document.getElementById('bRecurrence').value;
    const recurrenceType = document.getElementById('bRecurrenceType')?.value || 'monthly';
    const installments = recurrence === 'installment' ? parseInt(document.getElementById('bInstallments').value) : 1;
    const paid = document.getElementById('bPaid').checked;
    const notes = document.getElementById('bNotes').value.trim();

    const validation = window.validateBill({
        description: description,
        amount: amount,
        date: dueDate
    });

    if (!validation.valid) {
        showToast('❌ ' + validation.errors.join('\n'), 'error');
        return;
    }

    const baseData = {
        user_id: currentUser.id,
        type: 'expense',
        description: stripHTML(description),
        amount: amount,
        category_id: (categoryId && categoryId !== '') ? categoryId : null,
        paid: paid,
        is_bill: true,
        notes: notes || null
    };

    const btn = event.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    isProcessing = true;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';

    try {
        let error;

        if (!navigator.onLine && window.tonuSync) {
            if (editId) {
                await window.tonuSync.enqueue('UPDATE_TRANSACTION', { id: editId, ...baseData });
            } else if (recurrence === 'installment' && installments > 1) {
                const baseDate = new Date(dueDate + 'T12:00:00');
                for (let i = 0; i < installments; i++) {
                    const due = new Date(baseDate);
                    due.setMonth(due.getMonth() + i);
                    const year = due.getFullYear();
                    const month = due.getMonth();
                    const day = Math.min(
                        getLastDayOfMonth(year, month),
                        parseInt(dueDate.split('-')[2])
                    );
                    const dateStr = formatDateKey(year, month, day);

                    const installmentData = {
                        ...baseData,
                        date: dateStr,
                        installments: installments,
                        current_installment: i + 1
                    };
                    await window.tonuSync.enqueue('INSERT_TRANSACTION', installmentData);
                }
            } else {
                await window.tonuSync.enqueue('INSERT_TRANSACTION', {
                    ...baseData,
                    date: dueDate,
                    installments: 1,
                    current_installment: 1
                });
            }
            showToast('📦 Salva!', 'success');
            closeModal();
            await loadBills();
            btn.disabled = false;
            isProcessing = false;
            btn.innerHTML = originalText;
            return;
        }

        if (editId) {
            const { error: err } = await supabaseClient
                .from('transactions')
                .update(baseData)
                .eq('id', editId)
                .eq('user_id', currentUser.id);
            error = err;
        } else if (recurrence === 'installment' && installments > 1) {
            const baseDate = new Date(dueDate + 'T12:00:00');
            const installmentData = [];

            for (let i = 0; i < installments; i++) {
                const due = new Date(baseDate);
                due.setMonth(due.getMonth() + i);
                const year = due.getFullYear();
                const month = due.getMonth();
                const day = Math.min(
                    getLastDayOfMonth(year, month),
                    parseInt(dueDate.split('-')[2])
                );
                const dateStr = formatDateKey(year, month, day);

                installmentData.push({
                    ...baseData,
                    date: dateStr,
                    is_recurring: false,
                    recurrence_type: null,
                    installments: installments,
                    current_installment: i + 1
                });
            }

            const { error: err } = await supabaseClient
                .from('transactions')
                .insert(installmentData);
            error = err;
        } else if (recurrence === 'recurring') {
            const { error: err } = await supabaseClient
                .from('transactions')
                .insert([{
                    ...baseData,
                    date: dueDate,
                    is_recurring: true,
                    recurrence_type: recurrenceType,
                    installments: 1,
                    current_installment: 1
                }]);
            error = err;
        } else {
            const { error: err } = await supabaseClient
                .from('transactions')
                .insert([{
                    ...baseData,
                    date: dueDate,
                    is_recurring: false,
                    recurrence_type: null,
                    installments: 1,
                    current_installment: 1
                }]);
            error = err;
        }

        if (error) throw error;

        let msg = 'Conta salva! ✅';
        if (recurrence === 'installment' && installments > 1) {
            msg = `${installments} parcelas criadas! ✅`;
        } else if (recurrence === 'recurring' && recurrenceType === 'annual') {
            msg = 'Conta anual salva! ✅';
        } else if (recurrence === 'recurring') {
            msg = 'Conta fixa mensal salva! ✅';
        }

        showToast(msg, 'success');
        closeModal();
        await loadBills();

    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        showToast('Erro ao salvar', 'error');
    } finally {
        btn.disabled = false;
        isProcessing = false;
        btn.innerHTML = originalText;
    }
}

// ============================================
// EXCLUIR CONTA
// ============================================
async function deleteBill(id = null) {
    const editId = id || document.getElementById('editId').value;
    if (!editId) return;

    if (isProcessing) {
        showToast('Aguarde...', 'warning');
        return;
    }

    const bill = allBills.find(b => b.id === editId);
    let msg = 'Excluir esta conta permanentemente?';

    if (bill && bill.installments > 1) {
        msg = `Excluir TODAS as ${bill.installments} parcelas?`;
    } else if (bill && bill.is_recurring) {
        msg = `Excluir esta conta recorrente?`;
    }

    if (!confirm(msg)) return;

    isProcessing = true;
    const btn = document.getElementById('btnDelete');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';
    }

    try {
        if (!navigator.onLine && window.tonuSync) {
            if (bill && bill.installments > 1) {
                await window.tonuSync.enqueue('DELETE_TRANSACTION', {
                    id: editId,
                    description: bill.description,
                    amount: bill.amount,
                    installments: bill.installments,
                    deleteAll: true
                });
            } else {
                await window.tonuSync.enqueue('DELETE_TRANSACTION', { id: editId });
            }
            showToast('🗑️ Exclusão agendada', 'warning');
            closeModal();
            await loadBills();
            isProcessing = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-trash"></i> Excluir';
            }
            return;
        }

        let error;

        if (bill && bill.installments > 1) {
            const { error: err } = await supabaseClient
                .from('transactions')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('description', bill.description)
                .eq('amount', bill.amount)
                .eq('installments', bill.installments);
            error = err;
        } else {
            const { error: err } = await supabaseClient
                .from('transactions')
                .delete()
                .eq('id', editId)
                .eq('user_id', currentUser.id);
            error = err;
        }

        if (error) throw error;

        showToast('Excluída! 🗑️', 'success');
        closeModal();
        await loadBills();

    } catch (error) {
        console.error('❌ Erro ao excluir:', error);
        showToast('Erro ao excluir', 'error');
    } finally {
        isProcessing = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-trash"></i> Excluir';
        }
    }
}

// ============================================
// 🔥 TOAST MENOR E MAIS DISCRETO
// ============================================
function showToast(message, type) {
    type = type || 'info';
    const toast = document.getElementById('toast');
    if (!toast) return;

    const colors = {
        info: '#3B82F6',
        success: '#10B981',
        error: '#EF4444',
        warning: '#F59E0B'
    };

    toast.textContent = message;
    toast.style.background = colors[type] || '#3B82F6';
    toast.style.color = '#fff';
    toast.style.fontSize = '14px';        // 🔥 AUMENTADO
    toast.style.padding = '6px 16px';     // 🔥 AUMENTADO
    toast.style.borderRadius = '8px';     // 🔥 AUMENTADO
    toast.style.minHeight = '30px';       // 🔥 AUMENTADO
    toast.style.fontWeight = '600';       // 🔥 AUMENTADO
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.className = 'toast show';


    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.className = 'toast hidden';
    }, 1200);
}

// ============================================
// EXPORTAR FUNÇÕES GLOBAIS
// ============================================
window.openModal = openModal;
window.closeModal = closeModal;
window.editBill = editBill;
window.saveBill = saveBill;
window.deleteBill = deleteBill;
window.toggleBillPayment = toggleBillPayment;
window.filterBills = filterBills;
window.toggleRecurrenceOptions = toggleRecurrenceOptions;
window.changeMonth = changeMonth;
window.goToCurrentMonth = goToCurrentMonth;
window.loadBills = loadBills;

console.log('✅ Bills.js carregado com sucesso!');