// ============================================
// TONUCONTROLE - BILLS CONTROLLER (ADAPTATIVO)
// ============================================

(function () {
    'use strict';

    console.log('📋 Bills.js carregando...');

    let currentUser = null;
    let allBills = [];
    let categories = [];
    let currentEditBillId = null;
    let currentPage = 1;
    let isLoadingMore = false;
    let hasMoreItems = true;

    // ============================================
    // 🔥 DETECTOR DE DISPOSITIVO
    // ============================================
    function isMobileDevice() {
        const ua = navigator.userAgent || navigator.vendor || window.opera;
        const mobileRegex = /Android|iPhone|iPad|iPod|BlackBerry|Windows Phone|webOS|Mobile/i;
        const isSmallScreen = window.innerWidth < 768;
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        return mobileRegex.test(ua) || (isSmallScreen && hasTouch);
    }

    // ============================================
    // 🔥 CONFIGURAÇÕES POR DISPOSITIVO
    // ============================================
    const DEVICE_CONFIG = {
        isMobile: isMobileDevice(),
        itemsPerPage: isMobileDevice() ? 10 : 30,
        cardLayout: isMobileDevice() ? 'mobile' : 'desktop',
        showSidebar: !isMobileDevice(),
        showBottomNav: isMobileDevice(),
        allowSwipe: isMobileDevice(),
    };

    console.log(`📱 Bills - Dispositivo: ${DEVICE_CONFIG.isMobile ? 'Mobile' : 'Desktop'}`);

    // ============================================
    // FUNÇÕES AUXILIARES
    // ============================================
    function sanitize(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatBRL(val) {
        const num = Number(val) || 0;
        try {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
        } catch {
            return 'R$ ' + num.toFixed(2);
        }
    }

    function formatDateDisplay(dateStr) {
        if (!dateStr) return '--/--/----';
        const parts = dateStr.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return dateStr;
    }

    function getToday() {
        return new Date().toISOString().split('T')[0];
    }

    // ============================================
    // 🔥 RENDERIZAÇÃO ADAPTATIVA
    // ============================================
    function renderBills(bills) {
        const container = document.getElementById('billsContainer') || document.getElementById('billsList');
        if (!container) return;

        if (bills.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align:center;padding:40px 16px;">
                    <div style="font-size:40px;margin-bottom:12px;">📑</div>
                    <h3 style="font-size:16px;font-weight:600;margin-bottom:4px;">Nenhuma conta cadastrada</h3>
                    <p style="color:var(--color-text-muted,#94a3b8);font-size:13px;margin-top:4px;">
                        Cadastre contas fixas ou recorrentes para manter seus pagamentos em dia.
                    </p>
                    <button class="btn btn-primary" style="margin-top:12px;" onclick="openBillModal()">
                        <i class="fas fa-plus"></i> Nova Conta
                    </button>
                </div>
            `;
            return;
        }

        const todayStr = getToday();
        let html = '';

        if (DEVICE_CONFIG.isMobile) {
            // 🔥 VERSÃO MOBILE - Cards compactos
            html = '<div class="bill-list-mobile">';
            bills.forEach(b => {
                const isOverdue = !b.paid && b.due_date && b.due_date < todayStr;
                const statusText = b.paid ? 'Pago ✅' : (isOverdue ? 'Vencida ⚠️' : 'Pendente');
                const statusColor = b.paid ? '#00B894' : (isOverdue ? '#FF7675' : '#FDCB6E');
                const statusBg = b.paid ? '#D5F5E3' : (isOverdue ? '#FADBD8' : '#FFF3CD');

                html += `
                    <div class="bill-card-mobile" onclick="openBillModal('${sanitize(b.id)}')" style="
                        background: var(--color-surface, #ffffff);
                        border-radius: 10px;
                        padding: 12px 14px;
                        border: 1px solid var(--color-border, #e2e8f0);
                        margin-bottom: 8px;
                        border-left: 4px solid ${statusColor};
                        box-shadow: 0 2px 6px rgba(0,0,0,0.04);
                    ">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                            <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
                                <div style="width:32px; height:32px; border-radius:8px; background:var(--color-primary-light,#ede9fe); color:var(--color-primary,#6c5ce7); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                                    <i class="fas ${b.icon || 'fa-file-invoice'}"></i>
                                </div>
                                <div style="min-width:0;">
                                    <strong style="font-size:13px; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                        ${sanitize(b.name || 'Conta sem nome')}
                                    </strong>
                                    <small style="font-size:11px; color:var(--color-text-muted,#94a3b8);">
                                        ${formatDateDisplay(b.due_date)} • ${sanitize(b.category || 'Contas')}
                                    </small>
                                </div>
                            </div>
                            <div style="text-align:right; flex-shrink:0;">
                                <div style="font-weight:700; font-size:14px; color:var(--color-text,#2d3436);">
                                    ${formatBRL(b.amount)}
                                </div>
                                <span style="display:inline-block; font-size:9px; font-weight:600; padding:1px 8px; border-radius:10px; background:${statusBg}; color:${statusColor};">
                                    ${statusText}
                                </span>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';

            // Botão "Carregar mais" para mobile
            if (hasMoreItems && bills.length >= DEVICE_CONFIG.itemsPerPage) {
                html += `
                    <div style="text-align:center;padding:12px 0;">
                        <button class="btn btn-outline btn-sm" onclick="window.loadMoreBills()" style="font-size:12px;">
                            <i class="fas fa-chevron-down"></i> Carregar mais
                        </button>
                    </div>
                `;
            }

        } else {
            // 🔥 VERSÃO DESKTOP - Cards em grid
            html = '<div class="bills-grid-desktop" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">';
            bills.forEach(b => {
                const isOverdue = !b.paid && b.due_date && b.due_date < todayStr;
                const statusText = b.paid ? 'Pago' : (isOverdue ? 'Atrasada' : 'A Vencer');
                const statusBg = b.paid ? '#d4edda' : (isOverdue ? '#f8d7da' : '#fff3cd');
                const statusColor = b.paid ? '#155724' : (isOverdue ? '#721c24' : '#856404');

                html += `
                    <div class="bill-card" onclick="openBillModal('${sanitize(b.id)}')" style="
                        display:flex; align-items:center; justify-content:space-between;
                        padding:14px 18px;
                        background:var(--color-surface,#fff);
                        border-radius:10px;
                        border:1px solid var(--color-border,#e2e8f0);
                        gap:12px;
                        cursor:pointer;
                        transition: all 0.2s ease;
                    ">
                        <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
                            <div style="width:36px; height:36px; border-radius:8px; background:var(--color-primary-light,#ede9fe); color:var(--color-primary,#6c5ce7); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                                <i class="fas ${b.icon || 'fa-file-invoice'}"></i>
                            </div>
                            <div style="min-width:0;">
                                <strong style="font-size:14px; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                    ${sanitize(b.name || 'Conta sem nome')}
                                </strong>
                                <small style="font-size:12px; color:var(--color-text-muted,#94a3b8);">
                                    Vence em: ${formatDateDisplay(b.due_date)} • ${sanitize(b.category || 'Contas')}
                                </small>
                            </div>
                        </div>
                        <div style="text-align:right; flex-shrink:0;">
                            <div style="font-weight:700; font-size:15px; color:var(--color-text,#2d3436);">
                                ${formatBRL(b.amount)}
                            </div>
                            <span style="display:inline-block; font-size:10px; font-weight:600; padding:2px 10px; border-radius:12px; background:${statusBg}; color:${statusColor};">
                                ${statusText}
                            </span>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }

        container.innerHTML = html;
        updateBillsSummary(bills);
    }

    // ============================================
    // CARREGAR CONTAS COM PAGINAÇÃO ADAPTATIVA
    // ============================================
    async function loadBills(page = 1) {
        const container = document.getElementById('billsContainer') || document.getElementById('billsList');
        if (container && page === 1) {
            container.innerHTML = `
                <div style="text-align:center;padding:30px;">
                    <span class="spinner" style="width:28px;height:28px;border-width:3px;"></span>
                    <p style="color:var(--color-text-muted,#94a3b8);margin-top:8px;font-size:13px;">Carregando contas...</p>
                </div>
            `;
        }

        const limit = DEVICE_CONFIG.itemsPerPage;
        const offset = (page - 1) * limit;

        try {
            let bills = [];

            if (window.supabaseClient) {
                let query = window.supabaseClient
                    .from('bills')
                    .select('*', { count: 'exact' })
                    .eq('user_id', currentUser.id)
                    .order('due_date', { ascending: true })
                    .range(offset, offset + limit - 1);

                const { data, error, count } = await query;

                if (!error && data) {
                    bills = data;
                    hasMoreItems = data && data.length === limit;
                }
            }

            if (bills.length === 0 && page === 1) {
                const local = localStorage.getItem('tonu_bills_' + currentUser.id);
                if (local) {
                    try { bills = JSON.parse(local); } catch { }
                    hasMoreItems = false;
                }
            }

            if (page === 1) {
                allBills = bills;
            } else {
                allBills = [...allBills, ...bills];
            }

            renderBills(allBills);

        } catch (err) {
            console.error('❌ Erro ao carregar contas:', err);
            if (container) {
                container.innerHTML = `
                    <div style="text-align:center;padding:20px;color:var(--color-danger,#ff7675);font-size:13px;">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p style="margin-top:4px;">Erro ao carregar contas. Tente novamente.</p>
                    </div>
                `;
            }
        }
    }

    // ============================================
    // FUNÇÃO GLOBAL PARA CARREGAR MAIS (MOBILE)
    // ============================================
    window.loadMoreBills = function () {
        if (isLoadingMore || !hasMoreItems) return;
        isLoadingMore = true;
        currentPage++;
        loadBills(currentPage).finally(() => {
            isLoadingMore = false;
        });
    };

    // ============================================
    // ATUALIZAR RESUMO
    // ============================================
    function updateBillsSummary(bills) {
        let total = 0;
        let paid = 0;
        let pending = 0;
        const todayStr = getToday();

        bills.forEach(b => {
            const amt = parseFloat(b.amount) || 0;
            total += amt;
            if (b.paid) paid += amt;
            else pending += amt;
        });

        const elTotal = document.getElementById('billsStatTotal');
        const elPaid = document.getElementById('billsStatPaid');
        const elPending = document.getElementById('billsStatPending');

        if (elTotal) elTotal.textContent = formatBRL(total);
        if (elPaid) elPaid.textContent = formatBRL(paid);
        if (elPending) elPending.textContent = formatBRL(pending);
    }

    // ============================================
    // FILTROS
    // ============================================
    function setupBillFilters() {
        const searchInput = document.getElementById('billFilterSearch');
        const statusSelect = document.getElementById('billFilterStatus');

        const apply = () => {
            const query = (searchInput?.value || '').toLowerCase().trim();
            const status = statusSelect?.value || '';
            const todayStr = getToday();

            const filtered = allBills.filter(b => {
                if (query && !b.name?.toLowerCase().includes(query)) return false;
                if (status === 'paid' && !b.paid) return false;
                if (status === 'pending' && b.paid) return false;
                if (status === 'overdue' && (b.paid || b.due_date >= todayStr)) return false;
                return true;
            });

            renderBills(filtered);
        };

        if (searchInput) searchInput.addEventListener('input', apply);
        if (statusSelect) statusSelect.addEventListener('change', apply);
    }

    // ============================================
    // MODAL (NOVA CONTA / EDITAR)
    // ============================================
    function openBillModal(id = null) {
        currentEditBillId = id;
        const modal = document.getElementById('billModal');
        const form = document.getElementById('billForm');
        const titleEl = document.getElementById('billModalTitle');
        const btnDelete = document.getElementById('btnDeleteBill');

        if (!modal) return;
        if (form) form.reset();

        const dateInput = document.getElementById('billDueDate');
        if (dateInput && !id) {
            dateInput.value = getToday();
        }

        if (id) {
            const bill = allBills.find(b => String(b.id) === String(id));
            if (bill) {
                if (titleEl) titleEl.textContent = 'Editar Conta';
                document.getElementById('billEditId').value = bill.id;
                document.getElementById('billName').value = bill.name || '';
                document.getElementById('billAmount').value = bill.amount || '';
                document.getElementById('billDueDate').value = bill.due_date || '';
                document.getElementById('billCategory').value = bill.category || '';
                document.getElementById('billPaid').checked = !!bill.paid;
                if (btnDelete) btnDelete.classList.remove('hidden');
            }
        } else {
            if (titleEl) titleEl.textContent = 'Nova Conta';
            if (document.getElementById('billEditId')) document.getElementById('billEditId').value = '';
            if (btnDelete) btnDelete.classList.add('hidden');
        }

        modal.classList.add('show');
    }

    function closeBillModal() {
        const modal = document.getElementById('billModal');
        if (modal) modal.classList.remove('show');
        currentEditBillId = null;
    }

    // ============================================
    // SALVAR CONTA
    // ============================================
    async function saveBill(event) {
        if (event) event.preventDefault();

        const name = document.getElementById('billName')?.value.trim();
        const amount = parseFloat(document.getElementById('billAmount')?.value);
        const dueDate = document.getElementById('billDueDate')?.value;
        const category = document.getElementById('billCategory')?.value || 'Contas';
        const paid = document.getElementById('billPaid')?.checked ?? false;
        const editId = document.getElementById('billEditId')?.value || currentEditBillId;

        if (!name || isNaN(amount) || amount <= 0 || !dueDate) {
            if (window.showToast) window.showToast('Preencha os campos obrigatórios!', 'warning');
            return;
        }

        const billData = {
            user_id: currentUser.id,
            name: name,
            amount: amount,
            due_date: dueDate,
            category: category,
            paid: paid,
            updated_at: new Date().toISOString()
        };

        try {
            if (editId) {
                if (window.supabaseClient) {
                    await window.supabaseClient.from('bills').update(billData).eq('id', editId).eq('user_id', currentUser.id);
                }
                const idx = allBills.findIndex(b => String(b.id) === String(editId));
                if (idx !== -1) allBills[idx] = { ...allBills[idx], ...billData, id: editId };
                if (window.showToast) window.showToast('Conta atualizada! ✅', 'success');
            } else {
                billData.id = 'bill_' + Date.now();
                billData.created_at = new Date().toISOString();
                if (window.supabaseClient) {
                    await window.supabaseClient.from('bills').insert([billData]);
                }
                allBills.unshift(billData);
                if (window.showToast) window.showToast('Conta adicionada com sucesso! 🎉', 'success');
            }

            localStorage.setItem('tonu_bills_' + currentUser.id, JSON.stringify(allBills));
            closeBillModal();
            renderBills(allBills);
            updateBillsSummary(allBills);
            if (window.checkNotifications) window.checkNotifications();

        } catch (err) {
            console.error('❌ Erro ao salvar conta:', err);
            if (window.showToast) window.showToast('Erro ao salvar: ' + err.message, 'error');
        }
    }

    // ============================================
    // EXCLUIR CONTA
    // ============================================
    async function deleteBill() {
        const id = document.getElementById('billEditId')?.value || currentEditBillId;
        if (!id) return;
        if (!confirm('Excluir esta conta?')) return;

        try {
            if (window.supabaseClient) {
                await window.supabaseClient.from('bills').delete().eq('id', id).eq('user_id', currentUser.id);
            }
            allBills = allBills.filter(b => String(b.id) !== String(id));
            localStorage.setItem('tonu_bills_' + currentUser.id, JSON.stringify(allBills));
            if (window.showToast) window.showToast('Conta excluída! 🗑️', 'info');
            closeBillModal();
            renderBills(allBills);
            updateBillsSummary(allBills);
            if (window.checkNotifications) window.checkNotifications();
        } catch (err) {
            console.error('❌ Erro ao excluir conta:', err);
        }
    }

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            let user = null;
            if (window.supabaseOffline) {
                user = await window.supabaseOffline.isAuthenticated();
            }
            if (!user && window.supabaseClient?.auth) {
                const { data: { user: authUser } } = await window.supabaseClient.auth.getUser();
                user = authUser;
            }

            if (!user) {
                console.warn('⚠️ Usuário não autenticado em Contas');
                const isMobilePage = window.location.pathname.includes('/mobile/');
                window.location.href = isMobilePage ? '../../index.html' : '../index.html';
                return;
            }

            currentUser = user;
            console.log('✅ Contas: Usuário autenticado:', currentUser.email);

            if (window.loadGlobalUserProfile) {
                await window.loadGlobalUserProfile();
            }

            await loadBills(1);
            setupBillFilters();

        } catch (err) {
            console.error('❌ Erro na inicialização de contas:', err);
        }
    });

    // ============================================
    // EXPORTAÇÕES GLOBAIS
    // ============================================
    window.openBillModal = openBillModal;
    window.closeBillModal = closeBillModal;
    window.saveBill = saveBill;
    window.deleteBill = deleteBill;
    window.loadBills = loadBills;
    window.loadMoreBills = loadMoreBills;

})();