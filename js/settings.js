// ============================================
// CONFIGURAÇÕES - TonuControle (VERSÃO SEGURA)
// ============================================

console.log('⚙️ Settings.js carregado');

// ============================================
// ESTADO
// ============================================
let currentUser = null;
let isProcessing = false;
let _settingsUIListenersBound = false;

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    setupSettingsUIListeners();

    try {
        let user = null;
        if (window.getAuthenticatedUser) user = await window.getAuthenticatedUser();
        if (!user && window.supabaseOffline) user = await window.supabaseOffline.isAuthenticated();

        if (!user && window.supabaseClient && window.supabaseClient.auth) {
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
        window.currentUser = user;
        console.log('✅ Usuário autenticado:', currentUser.email);
    } catch (e) {
        console.error('❌ Erro na autenticação:', e);
        window.location.href = '../index.html';
        return;
    }

    await loadProfile();
    await loadStats();
    renderNotificationSettingsUI();
    await syncPushPreferencesFromSupabase();
    renderBiometricsSettingsUI();
    renderPinSettingsUI();
    renderSecurityStatusUI();
});

// ============================================
// RENDER STATUS DE SEGURANÇA
// ============================================
function renderSecurityStatusUI() {
    const encryptionBadge = document.getElementById('encryptionBadge');
    if (encryptionBadge) {
        if (window.TonuCrypto && window.TonuCrypto.isEnabled) {
            encryptionBadge.innerHTML = '<i class="fas fa-lock"></i> Protegido (AES-GCM)';
            encryptionBadge.style.background = 'rgba(0, 184, 148, 0.14)';
            encryptionBadge.style.color = '#059669';
        } else {
            encryptionBadge.innerHTML = '<i class="fas fa-unlock"></i> Não criptografado';
            encryptionBadge.style.background = 'rgba(239, 68, 68, 0.14)';
            encryptionBadge.style.color = '#dc2626';
        }
    }

    const csrfStatus = document.getElementById('csrfStatus');
    if (csrfStatus && window.TonuCSRF) {
        const token = window.TonuCSRF.get();
        csrfStatus.innerHTML = `
            <span style="display:inline-block;margin-top:8px;font-size:11px;color:var(--color-text-muted,#64748b);">
                <i class="fas fa-shield-alt" style="color:var(--color-primary,#4338CA);"></i>
                CSRF Token: <code style="background:var(--color-bg,#f1f5f9);padding:2px 6px;border-radius:4px;font-size:10px;border:1px solid var(--color-border-light,#e2e8f0);">${token.substring(0, 8)}...</code>
            </span>
        `;
    }
}

// ============================================
// GERENCIADOR DE CATEGORIAS E ORÇAMENTOS
// ============================================
function openCategoriesManager() {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    if (window.TonuCategoryManagerInstance) {
        window.TonuCategoryManagerInstance.showManagerModal(() => {
            loadStats();
        });
    } else {
        showToast('Módulo de categorias não carregado.', 'warning');
    }
}

function openBudgetLimitsModal() {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    if (window.TonuBudget) {
        window.TonuBudget.openBudgetModal();
    } else {
        showToast('Módulo de orçamentos não carregado.', 'warning');
    }
}

// ============================================
// SEGURANÇA: PIN DE BLOQUEIO, INATIVIDADE & 2FA
// ============================================
function renderPinSettingsUI() {
    const pinStatusText = document.getElementById('pinStatusText');
    const pinSubText = document.getElementById('pinSubText');
    const pinActionContainer = document.getElementById('pinActionContainer');
    const selectInactivity = document.getElementById('selectInactivityTimeout');
    const twoFactorSubText = document.getElementById('twoFactorSubText');
    const twoFactorAction = document.getElementById('twoFactorActionContainer');

    if (window.TonuSecurity) {
        const hasPin = window.TonuSecurity.hasPin();
        if (hasPin) {
            if (pinStatusText) pinStatusText.innerHTML = '<span style="color:#00b894;"><i class="fas fa-check-circle"></i> PIN Ativado (4 Dígitos)</span>';
            if (pinSubText) pinSubText.textContent = 'O aplicativo solicita o PIN de segurança ao abrir e após períodos de inatividade.';
            if (pinActionContainer) {
                pinActionContainer.innerHTML = `
                    <div style="display:flex; gap:8px;">
                        <button type="button" class="btn btn-outline btn-sm" data-settings-action="configure-pin">Alterar PIN</button>
                        <button type="button" class="btn btn-danger btn-sm" data-settings-action="remove-pin">Remover</button>
                    </div>
                `;
            }
        } else {
            if (pinStatusText) pinStatusText.textContent = 'PIN Desativado';
            if (pinSubText) pinSubText.textContent = 'Exigido ao abrir o aplicativo ou retornar da tela bloqueada.';
            if (pinActionContainer) {
                pinActionContainer.innerHTML = `
                    <button type="button" class="btn btn-primary btn-sm" data-settings-action="configure-pin">
                        <i class="fas fa-plus"></i> Ativar PIN
                    </button>
                `;
            }
        }

        if (selectInactivity) {
            const currentTimeout = window.TonuSecurity.getInactivityTimeoutMinutes();
            selectInactivity.value = String(currentTimeout);
        }

        const is2FA = window.TonuSecurity.is2FAEnabled();
        if (twoFactorSubText && twoFactorAction) {
            if (is2FA) {
                twoFactorSubText.innerHTML = '<span style="color:#00b894;"><i class="fas fa-check-circle"></i> 2FA Ativo</span> via código OTP';
                twoFactorAction.innerHTML = `
                    <button type="button" class="btn btn-danger btn-sm" data-settings-action="toggle-2fa">Desativar 2FA</button>
                `;
            } else {
                twoFactorSubText.textContent = 'Camada adicional de proteção via código de uso único.';
                twoFactorAction.innerHTML = `
                    <button type="button" class="btn btn-outline btn-sm" data-settings-action="toggle-2fa">
                        <i class="fas fa-shield-alt"></i> Ativar 2FA
                    </button>
                `;
            }
        }
    }
}

function handleConfigurePin() {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const pin = prompt('Digite um PIN de 4 números para bloquear o app:');
    if (!pin) return;

    if (!/^\d{4}$/.test(pin)) {
        showToast('O PIN deve conter exatamente 4 dígitos numéricos (ex: 1234)!', 'error');
        return;
    }

    const confirmPin = prompt('Confirme o seu PIN de 4 números:');
    if (pin !== confirmPin) {
        showToast('Os PINs digitados não coincidem!', 'error');
        return;
    }

    if (window.TonuSecurity) {
        try {
            window.TonuSecurity.savePin(pin);
            showToast('PIN de segurança configurado com sucesso! 🔒', 'success');
            renderPinSettingsUI();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }
}

function handleRemovePin() {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const pin = prompt('Digite seu PIN atual para desativar:');
    if (!pin) return;

    if (window.TonuSecurity) {
        try {
            if (window.TonuSecurity.verifyPin(pin)) {
                window.TonuSecurity.removePin();
                showToast('PIN de segurança removido.', 'info');
                renderPinSettingsUI();
            } else {
                showToast('PIN incorreto!', 'error');
            }
        } catch (error) {
            showToast(error.message, 'error');
        }
    }
}

function handleInactivityChange(val) {
    const minutes = parseInt(val, 10);
    if (window.TonuSecurity) {
        window.TonuSecurity.setInactivityTimeoutMinutes(minutes);
        showToast(`Tempo de inatividade ajustado para ${minutes === 0 ? 'Nunca' : minutes + ' min'}! ⏱️`, 'success');
    }
}

function handleToggle2FA() {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    if (window.TonuSecurity) {
        const is2FA = window.TonuSecurity.is2FAEnabled();
        if (is2FA) {
            window.TonuSecurity.set2FAEnabled(false);
            showToast('2FA desativado.', 'info');
        } else {
            window.TonuSecurity.set2FAEnabled(true);
            showToast('2FA ativado com sucesso! 🛡️', 'success');
        }
        renderPinSettingsUI();
    }
}

// ============================================
// BIOMETRIA (WEBAUTHN / FACE ID / TOUCH ID)
// ============================================
async function renderBiometricsSettingsUI() {
    try {
        const statusText = document.getElementById('biometricsStatusText');
        const subText = document.getElementById('biometricsSubText');
        const actionContainer = document.getElementById('biometricsActionContainer');
        if (!statusText || !actionContainer) return;

        if (!window.TonuBiometrics) {
            subText.textContent = 'Módulo biométrico não carregado.';
            return;
        }

        const supported = await window.TonuBiometrics.checkSupport();
        const isConfigured = window.TonuBiometrics.isConfigured();

        if (!supported) {
            statusText.innerHTML = 'Biometria Indisponível';
            subText.innerHTML = '<span style="color:#e17055;">Este navegador ou dispositivo não possui sensor biométrico (Face ID / Impressão Digital) compatível.</span>';
            actionContainer.innerHTML = '<span class="badge" style="background:#dfe6e9; color:#636e72;">Não suportado</span>';
            return;
        }

        if (isConfigured) {
            statusText.innerHTML = '<span style="color:#00b894;"><i class="fas fa-check-circle"></i> Biometria Ativada</span>';
            subText.textContent = 'Você pode fazer login com Face ID ou Impressão Digital na tela inicial.';
            actionContainer.innerHTML = `
                <div style="display:flex; gap:8px; align-items:center;">
                    <button type="button" class="btn btn-outline btn-sm" data-settings-action="test-biometrics">
                        <i class="fas fa-fingerprint"></i> Testar
                    </button>
                    <button type="button" class="btn btn-danger btn-sm" data-settings-action="disable-biometrics">
                        <i class="fas fa-times"></i> Desativar
                    </button>
                </div>
            `;
        } else {
            statusText.innerHTML = 'Biometria Disponível';
            subText.textContent = 'Sensor biométrico detectado. Ative para entrar com um toque sem digitar sua senha.';
            actionContainer.innerHTML = `
                <button type="button" class="btn btn-primary btn-sm" data-settings-action="register-biometrics">
                    <i class="fas fa-fingerprint"></i> Ativar Agora
                </button>
            `;
        }
    } catch (err) {
        console.error('❌ Erro ao renderizar UI biométrica:', err);
        return false;
    }
}

async function handleRegisterBiometrics() {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    try {
        if (!currentUser) {
            showToast('Faça login primeiro.', 'warning');
            return;
        }

        if (window.TonuBiometrics && window.TonuBiometrics.isInIframe()) {
            showIframeBiometricsHelp();
            return;
        }

        isProcessing = true;
        showToast('Toque no sensor biométrico ou use o Face ID quando solicitado...', 'info');
        await window.TonuBiometrics.registerBiometrics(currentUser);
        showToast('Biometria cadastrada com sucesso! 🎉', 'success');
        renderBiometricsSettingsUI();
    } catch (err) {
        if (err.message === 'IFRAME_RESTRICTION') {
            showIframeBiometricsHelp();
            return;
        }
        console.error('Erro ao cadastrar biometria:', err);
        showToast(err.message || 'Falha ao registrar biometria.', 'error');
    } finally {
        isProcessing = false;
    }
}

function showIframeBiometricsHelp() {
    let existingModal = document.getElementById('iframeBioModal');
    if (existingModal) existingModal.remove();

    const currentUrl = window.location.href;
    const modalHtml = `
    <div id="iframeBioModal" style="position:fixed; inset:0; background:rgba(15,23,42,0.7); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(5px);">
        <div style="background:#ffffff; border-radius:18px; max-width:480px; width:100%; padding:24px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); border:1px solid #e2e8f0; text-align:center;">
            <div style="width:60px; height:60px; border-radius:50%; background:rgba(67,56,202,0.1); color:#4338CA; display:flex; align-items:center; justify-content:center; font-size:28px; margin:0 auto 16px auto;">
                <i class="fas fa-fingerprint"></i>
            </div>
            <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0 0 8px 0;">Ativação em Nova Aba</h3>
            <p style="font-size:13px; color:#64748b; line-height:1.5; margin:0 0 20px 0;">
                Por políticas de segurança rigorosas dos navegadores (WebAuthn / W3C), a leitura biométrica (Face ID / Digital) é bloqueada dentro do quadro embutido de preview.
                <br><br>
                Abra o TonuControle diretamente em uma <strong>nova aba do navegador</strong> ou instale-o como <strong>PWA</strong> para registrar e usar sua biometria com segurança total!
            </p>
            <div style="display:flex; gap:10px; justify-content:center;">
                <button type="button" class="btn btn-outline btn-sm" data-settings-action="close-iframe-bio-modal">Fechar</button>
                <a href="${currentUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="display:inline-flex; align-items:center; gap:6px; text-decoration:none;">
                    <i class="fas fa-external-link-alt"></i> Abrir em Nova Aba
                </a>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function testBiometrics() {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    try {
        if (window.TonuBiometrics && window.TonuBiometrics.isInIframe()) {
            showIframeBiometricsHelp();
            return;
        }
        isProcessing = true;
        showToast('Toque no sensor biométrico para validar...', 'info');
        const user = await window.TonuBiometrics.authenticate();
        if (user) {
            showToast(`✅ Biometria validada com sucesso! Olá, ${user.name || user.email}!`, 'success');
        }
    } catch (err) {
        if (err.message === 'IFRAME_RESTRICTION') {
            showIframeBiometricsHelp();
            return;
        }
        showToast('Verificação biométrica não concluída.', 'error');
    } finally {
        isProcessing = false;
    }
}

async function disableBiometrics() {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const confirmedBiometrics = await window.TonuConfirm({
        title: 'Desativar biometria?',
        message: 'Deseja realmente desativar o login por biometria neste dispositivo?',
        confirmText: 'Desativar',
        danger: true
    });
    if (confirmedBiometrics) {
        window.TonuBiometrics.disableBiometrics();
        showToast('Biometria desativada.', 'info');
        renderBiometricsSettingsUI();
    }
}

// ============================================
// NOTIFICAÇÕES E LEMBRETES DE VENCIMENTO
// ============================================
function renderNotificationSettingsUI() {
    if (!window.billNotificationManager) return;
    const settings = window.billNotificationManager.settings;
    const permState = window.billNotificationManager.getPermissionState();

    const togglePush = document.getElementById('togglePushEnabled');
    const permStatusText = document.getElementById('notifPermStatusText');
    const permActionRow = document.getElementById('notifPermissionActionRow');
    const toggleOverdue = document.getElementById('toggleRemindOverdue');
    const toggleDividends = document.getElementById('toggleRemindDividends');
    const toggleSound = document.getElementById('toggleNotifSound');

    if (togglePush) {
        togglePush.checked = settings.enabled && permState === 'granted';
    }

    if (permStatusText) {
        if (permState === 'granted') {
            permStatusText.innerHTML = '<span style="color:var(--color-success,#00B894);font-weight:600;">✅ Permissão Concedida no Navegador</span>';
            if (permActionRow) permActionRow.classList.add('hidden');
        } else if (permState === 'denied') {
            permStatusText.innerHTML = '<span style="color:var(--color-danger,#FF7675);font-weight:600;">❌ Bloqueado nas configurações do navegador</span>';
            if (permActionRow) permActionRow.classList.add('hidden');
        } else {
            permStatusText.innerHTML = '<span style="color:var(--color-warning-dark,#F39C12);font-weight:600;">⚠️ Aguardando autorização</span>';
            if (permActionRow) permActionRow.classList.remove('hidden');
        }
    }

    if (toggleOverdue) toggleOverdue.checked = !!settings.remindOverdue;
    if (toggleDividends) toggleDividends.checked = settings.remindDividends !== false;
    if (toggleSound) toggleSound.checked = !!settings.sound;

    // Preferências granulares de push nativo
    const pushPrefs = window.getPushPreferences ? window.getPushPreferences() : (settings.pushPrefs || {});
    const toggleBills = document.getElementById('togglePushBills');
    const toggleCredited = document.getElementById('togglePushDivsCredited');
    const toggleUpcoming = document.getElementById('togglePushDivsUpcoming');
    const toggleGoals = document.getElementById('togglePushGoals');
    const toggleBudgets = document.getElementById('togglePushBudgets');

    if (toggleBills) toggleBills.checked = pushPrefs.bills !== false;
    if (toggleCredited) toggleCredited.checked = pushPrefs.dividends_credited !== false;
    if (toggleUpcoming) toggleUpcoming.checked = pushPrefs.dividends_upcoming !== false;
    if (toggleGoals) toggleGoals.checked = pushPrefs.goals !== false;
    if (toggleBudgets) toggleBudgets.checked = pushPrefs.budgets !== false;

    const days = settings.remindDaysBefore || [0, 1, 2, 3];
    [0, 1, 2, 3, 5, 7].forEach(d => {
        const chip = document.getElementById(`chipDay${d}`);
        if (chip) {
            if (days.includes(d)) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        }
    });

    if (window.loadNotificationHistory) {
        window.loadNotificationHistory();
    }
}

async function togglePushNotifications() {
    if (!window.billNotificationManager) return;
    const toggle = document.getElementById('togglePushEnabled');
    const permState = window.billNotificationManager.getPermissionState();

    if (toggle.checked) {
        if (permState !== 'granted') {
            const granted = await window.billNotificationManager.requestPermission();
            if (!granted) {
                toggle.checked = false;
                renderNotificationSettingsUI();
                return;
            }
        }
        window.billNotificationManager.saveSettings({ enabled: true });
        showToast('🔔 Lembretes de contas ativados!', 'success');
    } else {
        window.billNotificationManager.saveSettings({ enabled: false });
        showToast('Lembretes de contas desativados.', 'info');
    }

    renderNotificationSettingsUI();
}

async function requestPushPermissionFromSettings() {
    if (!window.billNotificationManager) return;
    await window.billNotificationManager.requestPermission();
    renderNotificationSettingsUI();
}

function toggleReminderDay(day) {
    if (!window.billNotificationManager) return;
    const settings = window.billNotificationManager.settings;
    let days = [...(settings.remindDaysBefore || [0, 1, 2, 3])];

    if (days.includes(day)) {
        if (days.length === 1) {
            showToast('Mantenha ao menos uma opção de lembrete selecionada!', 'warning');
            return;
        }
        days = days.filter(d => d !== day);
    } else {
        days.push(day);
        days.sort((a, b) => a - b);
    }

    window.billNotificationManager.saveSettings({ remindDaysBefore: days });
    renderNotificationSettingsUI();

    // Sincronizar com o Supabase (coluna preferences->remind_days_before)
    if (window.savePushPreferences) {
        window.savePushPreferences({ remind_days_before: days });
    }
    showToast('Preferências de antecedência salvas! ✅', 'success');
}

function updateNotificationSettings() {
    if (!window.billNotificationManager) return;
    const remindOverdue = document.getElementById('toggleRemindOverdue')?.checked ?? true;
    const remindDividends = document.getElementById('toggleRemindDividends')?.checked ?? true;
    const sound = document.getElementById('toggleNotifSound')?.checked ?? true;

    window.billNotificationManager.saveSettings({
        remindOverdue,
        remindDividends,
        sound,
        vibrate: sound
    });

    if (window.savePushPreferences) {
        window.savePushPreferences({
            remind_overdue: remindOverdue,
            sound: sound
        });
    }

    showToast('Configurações salvas! ✅', 'success');
}

async function syncPushPreferencesFromSupabase() {
    if (!window.supabaseClient || !currentUser?.id) return;
    try {
        const { data, error } = await window.supabaseClient
            .from('push_subscriptions')
            .select('preferences')
            .eq('user_id', currentUser.id)
            .limit(1);

        if (!error && data && data.length > 0 && data[0].preferences) {
            const remotePrefs = data[0].preferences;
            if (window.billNotificationManager) {
                const merged = Object.assign(window.billNotificationManager.getPushPreferences(), remotePrefs);
                window.billNotificationManager.settings.pushPrefs = merged;
                if (Array.isArray(remotePrefs.remind_days_before)) {
                    window.billNotificationManager.settings.remindDaysBefore = remotePrefs.remind_days_before;
                }
                if (remotePrefs.remind_overdue !== undefined) {
                    window.billNotificationManager.settings.remindOverdue = remotePrefs.remind_overdue;
                }
                if (remotePrefs.sound !== undefined) {
                    window.billNotificationManager.settings.sound = remotePrefs.sound;
                }
                try {
                    localStorage.setItem('tonu_notif_settings', JSON.stringify(window.billNotificationManager.settings));
                } catch (_) {}
                renderNotificationSettingsUI();
            }
        }
    } catch (e) {
        console.warn('[Settings] Erro ao sincronizar preferências de push do Supabase:', e);
    }
}

async function updatePushGranularSettings() {
    const bills = document.getElementById('togglePushBills')?.checked ?? true;
    const dividends_credited = document.getElementById('togglePushDivsCredited')?.checked ?? true;
    const dividends_upcoming = document.getElementById('togglePushDivsUpcoming')?.checked ?? true;
    const goals = document.getElementById('togglePushGoals')?.checked ?? true;
    const budgets = document.getElementById('togglePushBudgets')?.checked ?? true;

    const prefs = { bills, dividends_credited, dividends_upcoming, goals, budgets };

    console.log('[Settings] Atualizando preferências de push:', prefs);
    if (window.savePushPreferences) {
        const res = await window.savePushPreferences(prefs);
        if (res && res.success === false) {
            console.warn('[Settings] Falha ao persistir no Supabase:', res.error);
            showToast('⚠️ Salvo no navegador, mas houve falha ao sincronizar com o banco.', 'warning');
            return;
        }
    }
    showToast('Preferências de push salvas! ✅', 'success');
}

async function testPushNotificationFromSettings() {
    if (!window.billNotificationManager) return;
    await window.billNotificationManager.testNotification();
}

async function checkBillsFromSettings() {
    if (!window.billNotificationManager) return;
    showToast('🔍 Verificando contas a vencer...', 'info');
    await window.billNotificationManager.checkDueBills(true);
    showToast('Verificação concluída! ✅', 'success');
}

window.renderNotificationSettingsUI = renderNotificationSettingsUI;
window.togglePushNotifications = togglePushNotifications;
window.requestPushPermissionFromSettings = requestPushPermissionFromSettings;
window.toggleReminderDay = toggleReminderDay;
window.updateNotificationSettings = updateNotificationSettings;
window.updatePushGranularSettings = updatePushGranularSettings;
window.syncPushPreferencesFromSupabase = syncPushPreferencesFromSupabase;
window.testPushNotificationFromSettings = testPushNotificationFromSettings;
window.checkBillsFromSettings = checkBillsFromSettings;

// ============================================
// PERFIL & FOTO DE PERFIL
// ============================================
async function loadProfile() {
    try {
        let avatarUrl = localStorage.getItem('tonu_avatar_' + currentUser.id) ||
            currentUser.user_metadata?.avatar_url ||
            null;

        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        let fullName = currentUser.user_metadata?.full_name ||
            currentUser.email?.split('@')[0] ||
            'Usuário';

        if (error) {
            console.warn('⚠️ Perfil não encontrado no banco, inicializando...');
            try {
                await supabaseClient
                    .from('profiles')
                    .insert([{
                        id: currentUser.id,
                        full_name: fullName,
                        currency: 'BRL'
                    }]);
            } catch (insErr) {
                console.warn('⚠️ Erro ao inserir perfil padrão:', insErr);
            }
        } else if (data) {
            if (data.full_name) fullName = data.full_name;
            if (data.avatar_url && !avatarUrl) avatarUrl = data.avatar_url;
            if (data.currency) {
                document.getElementById('currencySelect').value = data.currency;
            }
        }

        if (avatarUrl) {
            localStorage.setItem('tonu_avatar_' + currentUser.id, avatarUrl);
        }

        const initial = fullName.charAt(0).toUpperCase();

        document.getElementById('profileName').textContent = fullName;
        document.getElementById('profileEmail').textContent = currentUser.email;

        const avatarLarge = document.getElementById('avatarLarge');
        if (window.renderAvatarElement) {
            window.renderAvatarElement(avatarLarge, avatarUrl, initial);
        } else if (avatarLarge) {
            if (avatarUrl) {
                avatarLarge.innerHTML = `<img src="${avatarUrl}" alt="Avatar" class="avatar-img-element" />`;
                avatarLarge.style.background = 'transparent';
            } else {
                avatarLarge.textContent = initial;
                avatarLarge.style.background = '';
            }
        }

        const btnRemove = document.getElementById('btnRemoveAvatar');
        if (btnRemove) {
            if (avatarUrl) btnRemove.classList.remove('hidden');
            else btnRemove.classList.add('hidden');
        }

        if (window.loadGlobalUserProfile) {
            window.loadGlobalUserProfile();
        }

    } catch (error) {
        console.error('❌ Erro ao carregar perfil:', error);
    }
}

function triggerAvatarUpload() {
    const input = document.getElementById('avatarFileInput');
    if (input) input.click();
}

async function handleAvatarFileSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Por favor, selecione um arquivo de imagem válido (PNG, JPG, WEBP).', 'error');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showToast('A imagem selecionada é muito grande (máximo 10MB).', 'error');
        return;
    }

    try {
        isProcessing = true;
        showToast('📸 Processando e otimizando foto...', 'info');
        const compressedDataUrl = await resizeImageToSquare(file, 280, 280);

        localStorage.setItem('tonu_avatar_' + currentUser.id, compressedDataUrl);

        try {
            await supabaseClient.auth.updateUser({
                data: { avatar_url: compressedDataUrl }
            });
        } catch (authErr) {
            console.warn('⚠️ Não foi possível salvar nos metadados do auth:', authErr);
        }

        try {
            await supabaseClient
                .from('profiles')
                .update({ avatar_url: compressedDataUrl })
                .eq('id', currentUser.id);
        } catch (profErr) {
            console.warn('⚠️ Coluna avatar_url pode não existir na tabela profiles:', profErr);
        }

        showToast('Foto de perfil atualizada com sucesso! 📸', 'success');
        await loadProfile();

    } catch (err) {
        console.error('❌ Erro ao processar foto de perfil:', err);
        showToast('Erro ao processar imagem de perfil', 'error');
    } finally {
        isProcessing = false;
        event.target.value = '';
    }
}

function resizeImageToSquare(file, targetWidth = 280, targetHeight = 280) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');

                const minSide = Math.min(img.width, img.height);
                const sx = (img.width - minSide) / 2;
                const sy = (img.height - minSide) / 2;

                ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetWidth, targetHeight);

                try {
                    const dataUrl = canvas.toDataURL('image/webp', 0.85);
                    resolve(dataUrl);
                } catch (e) {
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    resolve(dataUrl);
                }
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function removeAvatar() {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const confirmedAvatar = await window.TonuConfirm({
        title: 'Remover foto de perfil?',
        message: 'Deseja remover sua foto de perfil?',
        confirmText: 'Remover',
        danger: true
    });
    if (!confirmedAvatar) return;

    try {
        isProcessing = true;
        localStorage.removeItem('tonu_avatar_' + currentUser.id);

        try {
            await supabaseClient.auth.updateUser({
                data: { avatar_url: null }
            });
        } catch (e) { }

        try {
            await supabaseClient
                .from('profiles')
                .update({ avatar_url: null })
                .eq('id', currentUser.id);
        } catch (e) { }

        showToast('Foto de perfil removida!', 'info');
        await loadProfile();

    } catch (err) {
        console.error('❌ Erro ao remover foto:', err);
        showToast('Erro ao remover foto', 'error');
    } finally {
        isProcessing = false;
    }
}

async function editProfile() {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const currentName = document.getElementById('profileName').textContent;
    const name = prompt('Digite seu nome:', currentName);

    if (!name || name === currentName) return;
    if (name.trim().length < 2) {
        showToast('Nome muito curto!', 'error');
        return;
    }

    try {
        isProcessing = true;
        const trimmedName = name.trim();
        const { error } = await supabaseClient
            .from('profiles')
            .update({ full_name: trimmedName })
            .eq('id', currentUser.id);

        if (error) throw error;

        try {
            await supabaseClient.auth.updateUser({
                data: { full_name: trimmedName }
            });
        } catch (authErr) { }

        showToast('Nome atualizado! ✅', 'success');
        await loadProfile();

    } catch (error) {
        console.error('❌ Erro ao atualizar nome:', error);
        showToast('Erro ao atualizar nome', 'error');
    } finally {
        isProcessing = false;
    }
}

// ============================================
// MOEDA
// ============================================
async function changeCurrency() {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    const currency = document.getElementById('currencySelect').value;

    try {
        isProcessing = true;
        const { error } = await supabaseClient
            .from('profiles')
            .update({ currency: currency })
            .eq('id', currentUser.id);

        if (error) throw error;

        showToast('Moeda alterada! 💱', 'success');

    } catch (error) {
        console.error('❌ Erro ao alterar moeda:', error);
        showToast('Erro ao alterar moeda', 'error');
    } finally {
        isProcessing = false;
    }
}

// ============================================
// ESTATÍSTICAS
// ============================================
async function loadStats() {
    try {
        const { count: txCount, error: txError } = await supabaseClient
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id);

        if (txError) throw txError;

        const { count: goalCount, error: goalError } = await supabaseClient
            .from('goals')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id);

        if (goalError) throw goalError;

        const { count: invCount, error: invError } = await supabaseClient
            .from('investments')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id);

        if (invError) throw invError;

        document.getElementById('totalTransactions').textContent = txCount || 0;
        document.getElementById('totalGoals').textContent = goalCount || 0;
        document.getElementById('totalInvestments').textContent = invCount || 0;

    } catch (error) {
        console.error('❌ Erro ao carregar estatísticas:', error);
    }
}

// ============================================
// EXPORTAR DADOS
// ============================================
async function exportData() {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    try {
        isProcessing = true;
        const { data, error } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('date', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            showToast('Nenhum dado para exportar', 'warning');
            return;
        }

        const headers = ['Data', 'Descrição', 'Tipo', 'Valor', 'Categoria', 'Pago', 'Observações'];
        const rows = data.map(t => [
            t.date,
            `"${t.description.replace(/"/g, '""')}"`,
            t.type === 'income' ? 'Receita' : 'Despesa',
            t.amount.toFixed(2).replace('.', ','),
            t.category_id || '',
            t.paid ? 'Sim' : 'Não',
            t.notes ? `"${t.notes.replace(/"/g, '""')}"` : ''
        ]);

        const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tonucontrole_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showToast(`Exportado ${data.length} transações! 📥`, 'success');

    } catch (error) {
        console.error('❌ Erro ao exportar:', error);
        showToast('Erro ao exportar dados', 'error');
    } finally {
        isProcessing = false;
    }
}

// ============================================
// LIMPAR CACHE LOCAL & DADOS DE DEMONSTRAÇÃO
// ============================================
async function clearLocalCache() {
    const btn = document.getElementById('btnClearLocalCache');
    const originalText = btn ? btn.innerHTML : '<i class="fas fa-broom"></i> Limpar Cache Local';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Limpando...';
    }

    try {
        let removedCount = 0;
        if (typeof window.purgeDemoAndTemporaryStorage === 'function') {
            removedCount = window.purgeDemoAndTemporaryStorage();
        } else {
            const keys = Object.keys(localStorage);
            keys.forEach(k => {
                if (k.includes('demo') || k.includes('cache') || k.includes('temp') || k.includes('draft') || k.startsWith('quotes_cache_') || k.startsWith('tonu_quotes_')) {
                    localStorage.removeItem(k);
                    removedCount++;
                }
            });
        }

        try {
            sessionStorage.clear();
        } catch (e) {}

        showToast(`✅ Cache local limpo com sucesso! (${removedCount} itens removidos)`, 'success');
    } catch (err) {
        console.error('❌ Erro ao limpar cache local:', err);
        showToast('Erro ao limpar cache local', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// ============================================
// ITEM 7: PREFERÊNCIA DE EVENTOS CORPORATIVOS
// ============================================
function initCorporateEventsPref() {
    const isEnabled = localStorage.getItem('tonu_pref_corporate_events') === 'true';
    const pcToggle = document.getElementById('toggleCorpEventsPref');
    const mobileToggle = document.getElementById('mobileToggleCorpEvents');
    if (pcToggle) pcToggle.checked = isEnabled;
    if (mobileToggle) mobileToggle.checked = isEnabled;
}

window.toggleCorporateEventsPref = function (checked) {
    localStorage.setItem('tonu_pref_corporate_events', checked ? 'true' : 'false');
    if (window.showToast) {
        window.showToast(checked ? 'Gestão de eventos corporativos ativada!' : 'Gestão de eventos corporativos oculta!', 'info');
    }
};

// ============================================
// ITEM 8: ZONA DE RISCO (LIMPEZA APENAS LOCAL + CONFIRMAÇÃO "APAGAR")
// ============================================
window.openRiskZoneModalPC = function () {
    const modal = document.getElementById('riskZoneModalPC');
    const input = document.getElementById('confirmDeleteInputPC');
    const btn = document.getElementById('btnConfirmDeletePC');
    if (modal) modal.classList.add('active');
    if (input) {
        input.value = '';
        input.focus();
    }
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
    }
};

window.closeRiskZoneModalPC = function () {
    const modal = document.getElementById('riskZoneModalPC');
    if (modal) modal.classList.remove('active');
};

window.checkDeleteConfirmationPC = function (val) {
    const btn = document.getElementById('btnConfirmDeletePC');
    if (!btn) return;
    const isMatch = (val || '').trim().toUpperCase() === 'APAGAR';
    btn.disabled = !isMatch;
    btn.style.opacity = isMatch ? '1' : '0.4';
    btn.style.cursor = isMatch ? 'pointer' : 'not-allowed';
};

window.executeLocalDataWipePC = async function () {
    const btn = document.getElementById('btnConfirmDeletePC');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Limpando local...';
    }

    try {
        // Limpa filas de sincronização e cache do IndexedDB
        if (window.tonuSync) {
            try { await window.tonuSync.clearQueue(); } catch (_) {}
            try { await window.tonuSync.clearAllCaches?.(); } catch (_) {}
        }

        if (window.TonuSecureSession) {
            try { window.TonuSecureSession.clear(); } catch (_) {}
        }

        // Limpa caches locais no localStorage (preserva apenas tema e sessão ativa)
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('tonu_') || key.includes('cache') || key.includes('transactions') || key.includes('bills'))) {
                if (key !== 'tonu_theme' && key !== 'tonu_security_pin' && key !== 'tonu_device_mode') {
                    keysToRemove.push(key);
                }
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));

        // Limpa sessionStorage e caches de service worker
        try { sessionStorage.clear(); } catch (_) {}
        if ('caches' in window) {
            try {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(c => caches.delete(c)));
            } catch (_) {}
        }

        if (window.showToast) {
            window.showToast('Cache e dados locais apagados com sucesso! Seus dados na nuvem permanecem seguros. 🛡️', 'success');
        }

        window.closeRiskZoneModalPC();
        setTimeout(() => {
            window.location.reload();
        }, 1500);

    } catch (err) {
        console.error('❌ Erro ao limpar dados locais:', err);
        if (window.showToast) window.showToast('Erro ao limpar dados locais: ' + err.message, 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-trash-alt"></i> Limpar Dados Locais';
        }
    }
};

async function clearAllData() {
    window.openRiskZoneModalPC();
}

// ============================================
// EXPORTA FUNÇÕES GLOBAIS
// ============================================
window.toggleSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const main = document.getElementById('mainContent');

    if (!sidebar) return;

    if (sidebar.classList.contains('hidden')) {
        sidebar.classList.remove('hidden');
        if (window.innerWidth <= 768 && overlay) overlay.classList.add('show');
        else if (main) main.classList.remove('full');
    } else {
        sidebar.classList.add('hidden');
        if (overlay) overlay.classList.remove('show');
        if (main && window.innerWidth > 768) main.classList.add('full');
    }
};

window.closeSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const main = document.getElementById('mainContent');

    if (sidebar) sidebar.classList.add('hidden');
    if (overlay) overlay.classList.remove('show');
    if (main && window.innerWidth > 768) main.classList.add('full');
};

window.editProfile = editProfile;
window.triggerAvatarUpload = triggerAvatarUpload;
window.handleAvatarFileSelect = handleAvatarFileSelect;
window.removeAvatar = removeAvatar;
window.loadProfile = loadProfile;
window.changeCurrency = changeCurrency;
window.exportData = exportData;
window.clearLocalCache = clearLocalCache;
window.clearAllData = clearAllData;
window.loadStats = loadStats;
window.handleRegisterBiometrics = handleRegisterBiometrics;
window.testBiometrics = testBiometrics;
window.disableBiometrics = disableBiometrics;
window.openCategoriesManager = openCategoriesManager;
window.openBudgetLimitsModal = openBudgetLimitsModal;
window.renderPinSettingsUI = renderPinSettingsUI;
window.handleConfigurePin = handleConfigurePin;
window.handleRemovePin = handleRemovePin;
window.handleInactivityChange = handleInactivityChange;
window.handleToggle2FA = handleToggle2FA;

console.log('✅ Settings.js carregado com sucesso (versão segura)!');

// ============================================
// RELATÓRIOS - MELHORIA EXISTENTE
// ============================================

function showReportModal() {
    if (window.TonuReport && typeof window.TonuReport.showReportModal === 'function') {
        window.TonuReport.showReportModal();
        return;
    }

    let modal = document.getElementById('reportModal');
    if (modal) modal.remove();

    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDefault = thirtyDaysAgo.toISOString().split('T')[0];

    modal = document.createElement('div');
    modal.id = 'reportModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.8);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);font-family:Inter,sans-serif;';
    modal.innerHTML = `
        <div style="background:#ffffff;border-radius:20px;max-width:440px;width:100%;padding:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.3);border:1px solid #e2e8f0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="font-size:18px;font-weight:800;color:#0f172a;margin:0;">
                    <i class="fas fa-file-alt" style="color:#4338CA;"></i> Relatório
                </h3>
                <button type="button" data-settings-action="close-report-modal" style="background:none;border:none;font-size:22px;cursor:pointer;color:#94a3b8;" aria-label="Fechar">&times;</button>
            </div>
            <form id="reportForm">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                        <label style="font-size:12px;font-weight:600;color:#64748b;">Data Início</label>
                        <input type="date" id="reportStart" value="${startDefault}" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;">
                    </div>
                    <div>
                        <label style="font-size:12px;font-weight:600;color:#64748b;">Data Fim</label>
                        <input type="date" id="reportEnd" value="${today}" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;">
                    </div>
                </div>
                <div style="margin-top:12px;">
                    <label style="font-size:12px;font-weight:600;color:#64748b;">Formato</label>
                    <div style="display:flex;gap:12px;margin-top:4px;">
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                            <input type="radio" name="reportFormat" value="csv" checked> CSV
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                            <input type="radio" name="reportFormat" value="pdf"> PDF
                        </label>
                    </div>
                </div>
                <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
                    <button type="button" class="btn btn-outline btn-sm" data-settings-action="close-report-modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary btn-sm">
                        <i class="fas fa-file-export"></i> Gerar
                    </button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    const reportForm = modal.querySelector('#reportForm');
    if (reportForm) {
        reportForm.addEventListener('submit', (e) => {
            e.preventDefault();
            generateReportFromModal();
        });
    }
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

async function generateReportFromModal() {
    const btn = document.querySelector('#reportForm button[type="submit"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';
    }

    try {
        const start = document.getElementById('reportStart').value;
        const end = document.getElementById('reportEnd').value;
        const format = document.querySelector('input[name="reportFormat"]:checked')?.value || 'csv';

        if (!window.supabaseClient) {
            throw new Error('Supabase não disponível');
        }

        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        let query = window.supabaseClient
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .eq('paid', true)
            .eq('is_bill', false)
            .order('date', { ascending: false });

        if (start) query = query.gte('date', start);
        if (end) query = query.lte('date', end);

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
            if (typeof showToast === 'function') {
                showToast('Nenhum dado encontrado para o período', 'warning');
            }
            return;
        }

        if (format === 'csv') {
            const headers = ['Data', 'Descrição', 'Tipo', 'Valor', 'Categoria'];
            const rows = data.map(t => [
                t.date || '',
                `"${(t.description || '').replace(/"/g, '""')}"`,
                t.type === 'income' ? 'Receita' : 'Despesa',
                (Number(t.amount) || 0).toFixed(2).replace('.', ','),
                t.category || 'Outros'
            ]);
            const csv = ['\uFEFF' + headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `relatorio-${start || 'todos'}-${end || 'todos'}.csv`;
            a.click();
            URL.revokeObjectURL(url);

            if (typeof showToast === 'function') {
                showToast(`✅ ${data.length} transações exportadas!`, 'success');
            }
        } else {
            if (typeof window.jspdf !== 'undefined') {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('p', 'pt', 'a4');
                doc.setFontSize(20);
                doc.setTextColor(67, 56, 202);
                doc.text('📊 TonuControle - Relatório', 40, 60);
                doc.setFontSize(12);
                doc.setTextColor(44, 62, 80);
                doc.text(`Período: ${start || 'Início'} a ${end || 'Hoje'}`, 40, 90);
                doc.text(`Total: ${data.length} transações`, 40, 110);

                let y = 140;
                const maxDisplay = Math.min(20, data.length);
                doc.setFontSize(10);
                for (let i = 0; i < maxDisplay; i++) {
                    const t = data[i];
                    const valStr = typeof formatCurrency === 'function' ? formatCurrency(t.amount) : ('R$ ' + (Number(t.amount) || 0).toFixed(2).replace('.', ','));
                    const line = `${i + 1}. ${t.date} - ${t.description} - ${t.type === 'income' ? 'Receita' : 'Despesa'} - ${valStr}`;
                    if (y > 750) { doc.addPage(); y = 50; }
                    doc.text(line, 50, y);
                    y += 16;
                }

                doc.save(`relatorio-${start || 'todos'}-${end || 'todos'}.pdf`);

                if (typeof showToast === 'function') {
                    showToast('✅ PDF gerado com sucesso!', 'success');
                }
            } else {
                if (typeof showToast === 'function') {
                    showToast('📥 jsPDF não carregado. Use CSV.', 'warning');
                }
            }
        }

        document.getElementById('reportModal')?.remove();

    } catch (error) {
        console.error('❌ Erro ao gerar relatório:', error);
        if (typeof showToast === 'function') {
            showToast('❌ Erro ao gerar relatório', 'error');
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-file-export"></i> Gerar';
        }
    }
}

// ============================================
// NOTIFICAÇÕES POR E-MAIL - MELHORIA EXISTENTE
// ============================================

function showEmailSettings() {
    let modal = document.getElementById('emailSettingsModal');
    if (modal) modal.remove();

    const settings = JSON.parse(localStorage.getItem('tonu_email_settings') || '{"enabled":false,"dayOfWeek":1,"hourOfDay":9}');

    modal = document.createElement('div');
    modal.id = 'emailSettingsModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.8);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);font-family:Inter,sans-serif;';
    modal.innerHTML = `
        <div style="background:#ffffff;border-radius:20px;max-width:420px;width:100%;padding:24px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.3);border:1px solid #e2e8f0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="font-size:18px;font-weight:800;color:#0f172a;margin:0;">
                    <i class="fas fa-envelope" style="color:#4338CA;"></i> E-mail Semanal
                </h3>
                <button type="button" data-settings-action="close-email-modal" style="background:none;border:none;font-size:22px;cursor:pointer;color:#94a3b8;" aria-label="Fechar">&times;</button>
            </div>
            <form id="emailSettingsForm">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;">
                    <div>
                        <strong style="font-size:13px;color:#0f172a;">Ativar envio</strong>
                        <div style="font-size:11px;color:#64748b;">Receber resumo semanal por e-mail</div>
                    </div>
                    <label style="position:relative;display:inline-block;width:44px;height:24px;">
                        <input type="checkbox" id="emailEnabled" ${settings.enabled ? 'checked' : ''} style="opacity:0;width:0;height:0;">
                        <span class="email-enabled-toggle-track" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#cbd5e1;transition:0.25s;border-radius:24px;"></span>
                    </label>
                </div>
                <div style="margin-top:12px;">
                    <label style="font-size:12px;font-weight:600;color:#64748b;">Dia da semana</label>
                    <select id="emailDay" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;">
                        ${['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((d, i) =>
        `<option value="${i}" ${settings.dayOfWeek === i ? 'selected' : ''}>${d}</option>`
    ).join('')}
                    </select>
                </div>
                <div style="margin-top:12px;">
                    <label style="font-size:12px;font-weight:600;color:#64748b;">Horário</label>
                    <select id="emailHour" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;">
                        ${Array.from({ length: 24 }, (_, i) =>
        `<option value="${i}" ${settings.hourOfDay === i ? 'selected' : ''}>${String(i).padStart(2, '0')}:00</option>`
    ).join('')}
                    </select>
                </div>
                <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
                    <button type="button" class="btn btn-outline btn-sm" data-settings-action="close-email-modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary btn-sm">
                        <i class="fas fa-save"></i> Salvar
                    </button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    const emailForm = modal.querySelector('#emailSettingsForm');
    if (emailForm) {
        emailForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveEmailSettings();
        });
    }

    const toggleTrack = modal.querySelector('.email-enabled-toggle-track');
    const input = modal.querySelector('#emailEnabled');
    if (toggleTrack && input) {
        toggleTrack.addEventListener('click', () => {
            input.checked = !input.checked;
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

function saveEmailSettings() {
    const enabled = document.getElementById('emailEnabled').checked;
    const dayOfWeek = parseInt(document.getElementById('emailDay').value, 10) || 0;
    const hourOfDay = parseInt(document.getElementById('emailHour').value, 10) || 9;

    localStorage.setItem('tonu_email_settings', JSON.stringify({
        enabled,
        dayOfWeek,
        hourOfDay,
        lastSent: null
    }));

    document.getElementById('emailSettingsModal').remove();

    if (typeof showToast === 'function') {
        showToast('✅ Configurações salvas!', 'success');
    }

    if (enabled) {
        setTimeout(() => {
            if (typeof window.sendTestEmail === 'function') {
                window.sendTestEmail();
            }
        }, 1000);
    }
}

async function sendTestEmail() {
    try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (!user) {
            if (typeof showToast === 'function') {
                showToast('Faça login primeiro', 'warning');
            }
            return;
        }

        const settings = JSON.parse(localStorage.getItem('tonu_email_settings') || '{"enabled":false}');
        if (!settings.enabled) {
            if (typeof showToast === 'function') {
                showToast('Ative as notificações primeiro', 'warning');
            }
            return;
        }

        const subject = encodeURIComponent('📊 Teste - Resumo Semanal TonuControle');
        const body = encodeURIComponent(
            `📊 TESTE DE NOTIFICAÇÃO\n\n` +
            `Olá, ${user.user_metadata?.full_name || user.email.split('@')[0]}!\n\n` +
            `Este é um e-mail de teste do TonuControle.\n\n` +
            `Suas configurações de notificação estão funcionando! ✅\n\n` +
            `📱 TonuControle - Suas finanças em ordem! 💰`
        );

        const mailtoLink = document.createElement('a');
        mailtoLink.href = `mailto:${user.email}?subject=${subject}&body=${body}`;
        mailtoLink.style.display = 'none';
        document.body.appendChild(mailtoLink);
        mailtoLink.click();
        document.body.removeChild(mailtoLink);

        if (typeof showToast === 'function') {
            showToast('📧 Cliente de e-mail aberto!', 'success');
        }

    } catch (error) {
        console.error('❌ Erro ao enviar teste:', error);
        if (typeof showToast === 'function') {
            showToast('❌ Erro ao enviar teste', 'error');
        }
    }
}

// ============================================
// GESTÃO DE LIMITES E TETOS EM CONFIGURAÇÕES
// ============================================
let settingsBudgetData = [];

async function renderSettingsBudgets() {
    const container = document.getElementById('settingsBudgetListContainer');
    if (!container) return;

    try {
        let user = null;
        try {
            if (window.supabaseOffline) {
                user = await window.supabaseOffline.isAuthenticated();
            }
            if (!user && window.supabaseClient?.auth?.getUser) {
                user = (await window.supabaseClient.auth.getUser())?.data?.user;
            }
            if (!user && window.currentUser) {
                user = window.currentUser;
            }
        } catch {}

        const userId = user?.id || 'offline_user';

        if (window.TonuBudget) {
            const threshold = window.TonuBudget.getWarningThreshold(userId);
            const selectEl = document.getElementById('budgetWarningThresholdSelect');
            if (selectEl) selectEl.value = String(threshold);
        }

        // Buscar transações e categorias
        let categories = [];
        let transactions = [];

        if (window.supabaseClient && user) {
            try {
                const [cRes, tRes] = await Promise.all([
                    window.supabaseClient.from('categories').select('*').eq('user_id', user.id),
                    window.supabaseClient.from('transactions').select('*').eq('user_id', user.id)
                ]);
                if (cRes.data) categories = cRes.data;
                if (tRes.data) transactions = tRes.data;
            } catch (e) {
                console.warn('Erro ao buscar dados do Supabase para limites:', e);
            }
        }

        if (categories.length === 0) {
            try {
                const localCats = localStorage.getItem('tonu_categories_' + userId);
                if (localCats) categories = JSON.parse(localCats);
            } catch {}
        }

        // Se ainda vazio, categorias padrão
        if (categories.length === 0) {
            categories = [
                { id: 'cat_alimentacao', name: 'Alimentação', icon: 'fa-utensils', color: '#ff7675', type: 'expense' },
                { id: 'cat_moradia', name: 'Moradia', icon: 'fa-home', color: '#4338CA', type: 'expense' },
                { id: 'cat_transporte', name: 'Transporte', icon: 'fa-car', color: '#0984e3', type: 'expense' },
                { id: 'cat_lazer', name: 'Lazer', icon: 'fa-gamepad', color: '#fdcb6e', type: 'expense' },
                { id: 'cat_saude', name: 'Saúde', icon: 'fa-heartbeat', color: '#00b894', type: 'expense' },
                { id: 'cat_educacao', name: 'Educação', icon: 'fa-graduation-cap', color: '#e17055', type: 'expense' },
                { id: 'cat_outros', name: 'Outros', icon: 'fa-tag', color: '#636e72', type: 'expense' }
            ];
        }

        if (transactions.length === 0) {
            try {
                const localTxs = localStorage.getItem('tonu_transactions_' + userId);
                if (localTxs) transactions = JSON.parse(localTxs);
            } catch {}
        }

        if (window.TonuBudget) {
            settingsBudgetData = window.TonuBudget.calculateCategoryProgress(userId, transactions, categories);
        } else {
            settingsBudgetData = categories.filter(c => c.type === 'expense').map(c => ({
                categoryId: c.id,
                name: c.name,
                icon: c.icon || 'fa-tag',
                color: c.color || '#4338CA',
                spent: 0,
                limit: 0,
                remaining: 0,
                percentage: 0,
                isExceeded: false,
                isWarning: false
            }));
        }

        renderSettingsBudgetListHtml(settingsBudgetData);
        _updateBudgetAccordionSummary(settingsBudgetData);

    } catch (err) {
        console.error('Erro ao carregar limites em configurações:', err);
        container.innerHTML = '<div style="padding:16px; color:#ef4444; font-size:12px;">Não foi possível carregar as categorias para limites.</div>';
        _updateBudgetAccordionSummary([]);
    }
}

function _parseSettingsBudgetNumeric(raw) {
    if (raw === null || raw === undefined) return 0;
    const cleaned = String(raw).trim().replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return (!isNaN(num) && num > 0) ? num : 0;
}

function _formatSettingsBudgetMoney(val) {
    const num = Number(val) || 0;
    if (typeof formatCurrency === 'function') {
        return formatCurrency(num);
    }
    try {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num).replace(/\u00A0/g, ' ');
    } catch (_) {
        return `R$ ${num.toFixed(2).replace('.', ',')}`;
    }
}

function _formatSettingsSliderCap(val) {
    const num = Math.max(0, Number(val) || 0);
    try {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num).replace(/\u00A0/g, ' ');
    } catch (_) {
        return `R$ ${Math.round(num)}`;
    }
}

function _computeBudgetSliderMax(value) {
    const num = Math.max(0, Number(value) || 0);
    if (num <= 10000) return 10000;
    return Math.max(10000, Math.ceil((num * 1.15) / 5000) * 5000);
}

function _updateBudgetAccordionSummary(items) {
    const summaryEl = document.getElementById('budgetAccordionSummary');
    if (!summaryEl) return;

    const list = Array.isArray(items) ? items : [];
    const configured = list.filter(c => (Number(c.limit) || 0) > 0);
    const totalLimit = configured.reduce((sum, c) => sum + (Number(c.limit) || 0), 0);
    const exceededCount = list.filter(c => c.isExceeded).length;
    const warningCount = list.filter(c => c.isWarning).length;

    const selectEl = document.getElementById('budgetWarningThresholdSelect');
    const threshold = selectEl ? (parseInt(selectEl.value, 10) || 80) : 80;

    const pills = [];
    if (configured.length > 0) {
        pills.push(`<span class="budget-summary-pill budget-summary-pill-active">${configured.length} de ${list.length} com teto</span>`);
        pills.push(`<span class="budget-summary-pill">Total: ${_formatSettingsBudgetMoney(totalLimit)}</span>`);
    } else {
        pills.push(`<span class="budget-summary-pill budget-summary-pill-muted">Nenhum teto definido</span>`);
    }

    pills.push(`<span class="budget-summary-pill budget-summary-pill-muted">Alerta ${threshold}%</span>`);

    if (exceededCount > 0) {
        pills.push(`<span class="budget-summary-pill budget-summary-pill-danger">${exceededCount} estourado${exceededCount > 1 ? 's' : ''}</span>`);
    } else if (warningCount > 0) {
        pills.push(`<span class="budget-summary-pill budget-summary-pill-warning">${warningCount} em atenção</span>`);
    }

    summaryEl.innerHTML = pills.join('');
}

function _applySliderVisualState(row, numVal, maxScale) {
    if (!row) return;
    const sliderEl = row.querySelector('.budget-range-slider');
    const valueLabel = row.querySelector('.budget-slider-value');
    const maxLabel = row.querySelector('.budget-slider-max-label');

    const safeVal = Math.max(0, Number(numVal) || 0);
    const safeMax = Math.max(10000, Number(maxScale) || 10000);
    const pct = safeMax > 0 ? Math.min(100, Math.max(0, (safeVal / safeMax) * 100)) : 0;

    if (sliderEl) {
        if (String(sliderEl.max) !== String(safeMax)) {
            sliderEl.max = String(safeMax);
        }
        sliderEl.value = String(safeVal);
        sliderEl.style.setProperty('--slider-pct', `${pct.toFixed(2)}%`);
        sliderEl.setAttribute('aria-valuenow', String(safeVal));
        sliderEl.setAttribute('aria-valuemax', String(safeMax));
    }

    if (valueLabel) {
        valueLabel.textContent = safeVal > 0 ? _formatSettingsBudgetMoney(safeVal) : 'Sem limite';
        valueLabel.classList.toggle('is-empty', safeVal <= 0);
    }

    if (maxLabel) {
        maxLabel.textContent = _formatSettingsSliderCap(safeMax);
    }
}

function _bindSettingsBudgetSliderEvents(container) {
    if (!container || container.dataset.budgetSliderBound === '1') return;
    container.dataset.budgetSliderBound = '1';

    container.addEventListener('input', function (event) {
        const target = event.target;
        if (!target || !target.classList) return;

        if (target.classList.contains('budget-range-slider')) {
            const row = target.closest('.settings-budget-item');
            if (!row) return;

            const num = Math.max(0, parseFloat(target.value) || 0);
            const currentMax = Math.max(10000, parseFloat(target.max) || 10000);
            const inputEl = row.querySelector('.budget-input-field');

            if (inputEl) {
                inputEl.value = num > 0 ? num.toFixed(2).replace('.', ',') : '';
            }

            _applySliderVisualState(row, num, currentMax);
            return;
        }

        if (target.classList.contains('budget-input-field')) {
            handleBudgetInputChange(target);
        }
    });

    container.addEventListener('focusin', function (event) {
        const target = event.target;
        if (target && target.classList && target.classList.contains('budget-input-field')) {
            target.select();
        }
    });
}

function renderSettingsBudgetListHtml(items) {
    const container = document.getElementById('settingsBudgetListContainer');
    if (!container) return;

    _bindSettingsBudgetSliderEvents(container);

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:32px 16px; color:var(--color-text-muted);">
                <i class="fas fa-bullseye" style="font-size:28px; opacity:0.3; margin-bottom:8px;"></i>
                <p style="font-size:13px; font-weight:600;">Nenhuma categoria encontrada.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(cat => {
        const spentFormatted = _formatSettingsBudgetMoney(cat.spent || 0);
        const numericLimit = Math.max(0, Number(cat.limit) || 0);
        const limitVal = numericLimit > 0 ? numericLimit.toFixed(2).replace('.', ',') : '';
        const sliderMax = _computeBudgetSliderMax(numericLimit);
        const limitDisplay = numericLimit > 0 ? _formatSettingsBudgetMoney(numericLimit) : 'Sem limite';
        const pct = Math.min(100, Math.round(cat.percentage || 0));
        const statusCls = cat.isExceeded ? 'danger' : (cat.isWarning ? 'warning' : 'normal');
        const statusLabel = cat.isExceeded ? 'Estourado' : (cat.isWarning ? 'Atenção' : (numericLimit > 0 ? 'Normal' : 'Sem limite'));

        return `
            <div class="settings-budget-item" data-cat-id="${cat.categoryId}" data-cat-name="${(cat.name || '').toLowerCase()}">
                <div class="budget-cat-info">
                    <div class="budget-cat-icon" style="background:${cat.color || '#4338CA'};">
                        <i class="fas ${cat.icon || 'fa-tag'}"></i>
                    </div>
                    <div class="budget-cat-name-box">
                        <div class="budget-cat-name" title="${cat.name}">${cat.name}</div>
                        <div class="budget-cat-spent">Gasto: <strong>${spentFormatted}</strong></div>
                    </div>
                </div>

                <div class="budget-progress-col">
                    <div class="budget-progress-labels">
                        <span style="color:var(--color-text-muted); font-size:11px;">
                            ${numericLimit > 0 ? `${pct}% consumido` : 'Sem teto definido'}
                        </span>
                        <span class="badge ${cat.isExceeded ? 'badge-danger' : (cat.isWarning ? 'badge-warning' : 'badge-success')}" style="font-size:10px; padding:1px 6px;">
                            ${statusLabel}
                        </span>
                    </div>
                    <div class="budget-progress-track">
                        <div class="budget-progress-fill ${statusCls}" style="width: ${numericLimit > 0 ? Math.max(3, pct) : 0}%;"></div>
                    </div>
                </div>

                <div class="budget-input-col">
                    <span class="budget-currency-prefix">R$</span>
                    <input type="text"
                        class="budget-input-field"
                        placeholder="0,00"
                        value="${limitVal}"
                        data-cat-id="${cat.categoryId}"
                        data-cat-name="${cat.name}"
                        title="Digite o teto mensal para ${cat.name}" />
                </div>

                <div class="budget-slider-row">
                    <span class="budget-slider-bound">R$ 0</span>
                    <input type="range"
                        class="budget-range-slider"
                        min="0"
                        max="${sliderMax}"
                        step="10"
                        value="${numericLimit}"
                        data-cat-id="${cat.categoryId}"
                        aria-label="Ajustar limite mensal de ${cat.name}"
                        aria-valuemin="0"
                        aria-valuemax="${sliderMax}"
                        aria-valuenow="${numericLimit}" />
                    <span class="budget-slider-bound budget-slider-max-label">${_formatSettingsSliderCap(sliderMax)}</span>
                    <span class="budget-slider-value ${numericLimit <= 0 ? 'is-empty' : ''}">${limitDisplay}</span>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.settings-budget-item').forEach(row => {
        const sliderEl = row.querySelector('.budget-range-slider');
        const inputEl = row.querySelector('.budget-input-field');
        const num = _parseSettingsBudgetNumeric(inputEl ? inputEl.value : (sliderEl ? sliderEl.value : 0));
        const maxScale = _computeBudgetSliderMax(num);
        _applySliderVisualState(row, num, maxScale);
    });
}

function handleBudgetInputChange(inputEl) {
    let val = inputEl.value.replace(/[^0-9,\.]/g, '');
    if (inputEl.value !== val) {
        inputEl.value = val;
    }

    const row = inputEl.closest('.settings-budget-item');
    if (row) {
        const num = _parseSettingsBudgetNumeric(val);
        const nextMax = _computeBudgetSliderMax(num);
        _applySliderVisualState(row, num, nextMax);
    }
}

function _applyFilterBudgetCategories(term) {
    const cleanTerm = (term || '').trim().toLowerCase();
    const rows = document.querySelectorAll('.settings-budget-item');
    rows.forEach(row => {
        const catName = row.getAttribute('data-cat-name') || '';
        if (!cleanTerm || catName.includes(cleanTerm)) {
            row.style.display = 'grid';
        } else {
            row.style.display = 'none';
        }
    });
}

const filterBudgetCategories = (typeof window !== 'undefined' && typeof window.TonuDebounce === 'function')
    ? window.TonuDebounce(_applyFilterBudgetCategories, 180)
    : _applyFilterBudgetCategories;

function updateBudgetWarningThreshold(val) {
    const num = parseFloat(val) || 80;
    const user = currentUser || (window.supabaseOffline ? window.supabaseOffline.cachedUser : null);
    const userId = user?.id || 'offline_user';

    if (window.TonuBudget) {
        window.TonuBudget.setWarningThreshold(userId, num);
        if (typeof showToast === 'function') {
            showToast(`Margem de aviso preventivo ajustada para ${num}%!`, 'success');
        }
        renderSettingsBudgets();
    }
}

async function saveAllSettingsBudgets() {
    const btn = document.getElementById('saveAllBudgetsBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    try {
        let user = null;
        try {
            if (window.supabaseOffline) {
                user = await window.supabaseOffline.isAuthenticated();
            }
            if (!user && window.supabaseClient?.auth?.getUser) {
                user = (await window.supabaseClient.auth.getUser())?.data?.user;
            }
            if (!user && window.currentUser) {
                user = window.currentUser;
            }
        } catch {}

        const userId = user?.id || 'offline_user';

        const inputs = document.querySelectorAll('.budget-input-field');
        let savedCount = 0;

        inputs.forEach(input => {
            const catId = input.getAttribute('data-cat-id');
            const catName = input.getAttribute('data-cat-name');
            let rawVal = input.value.trim().replace(/\./g, '').replace(',', '.');
            const num = parseFloat(rawVal) || 0;

            if (window.TonuBudget) {
                window.TonuBudget.setCategoryBudget(userId, catId, num, catName);
                savedCount++;
            }
        });

        if (typeof showToast === 'function') {
            showToast('✅ Limites orçamentários salvos com sucesso!', 'success');
        }

        await renderSettingsBudgets();

        if (typeof window.checkNotifications === 'function') {
            window.checkNotifications();
        }

    } catch (err) {
        console.error('Erro ao salvar limites:', err);
        if (typeof showToast === 'function') {
            showToast('Erro ao salvar limites', 'error');
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save" aria-hidden="true"></i> Salvar Limites';
        }
    }
}

// ============================================
// REGISTRO CENTRALIZADO DE LISTENERS (CSP-SAFE)
// ============================================
function handleSettingsAction(action, triggerEl) {
    switch (action) {
        case 'logout':
            if (typeof window.logout === 'function') window.logout();
            break;
        case 'toggle-sidebar':
            if (typeof window.toggleSidebar === 'function') window.toggleSidebar();
            break;
        case 'toggle-theme':
            if (typeof window.toggleTheme === 'function') window.toggleTheme();
            break;
        case 'trigger-avatar-upload':
            triggerAvatarUpload();
            break;
        case 'remove-avatar':
            removeAvatar();
            break;
        case 'edit-profile':
            editProfile();
            break;
        case 'open-categories':
            openCategoriesManager();
            break;
        case 'show-weekly-summary':
            if (window.TonuWeeklyReport && typeof window.TonuWeeklyReport.showWeeklySummaryModal === 'function') {
                window.TonuWeeklyReport.showWeeklySummaryModal();
            }
            break;
        case 'send-weekly-email':
            if (window.TonuWeeklyReport && typeof window.TonuWeeklyReport.sendWeeklyEmail === 'function') {
                window.TonuWeeklyReport.sendWeeklyEmail();
            }
            break;
        case 'configure-pin':
            handleConfigurePin();
            break;
        case 'remove-pin':
            handleRemovePin();
            break;
        case 'toggle-2fa':
            handleToggle2FA();
            break;
        case 'register-biometrics':
            handleRegisterBiometrics();
            break;
        case 'test-biometrics':
            testBiometrics();
            break;
        case 'disable-biometrics':
            disableBiometrics();
            break;
        case 'open-budget-modal':
            openBudgetLimitsModal();
            break;
        case 'save-all-budgets':
            saveAllSettingsBudgets();
            break;
        case 'register-push':
            if (typeof window.registerPushSubscription === 'function') window.registerPushSubscription();
            break;
        case 'test-push':
            testPushNotificationFromSettings();
            break;
        case 'check-bills':
            checkBillsFromSettings();
            break;
        case 'request-push-permission':
            requestPushPermissionFromSettings();
            break;
        case 'mark-all-history-read':
            if (typeof window.markAllHistoryRead === 'function') window.markAllHistoryRead();
            break;
        case 'clear-notif-history':
            if (typeof window.clearNotificationHistory === 'function') window.clearNotificationHistory();
            break;
        case 'flush-sync':
            if (window.tonuSync && typeof window.tonuSync.flushQueue === 'function') {
                window.tonuSync.flushQueue();
            }
            break;
        case 'export-full-backup':
            if (window.TonuBackupInstance && typeof window.TonuBackupInstance.exportFullBackup === 'function') {
                window.TonuBackupInstance.exportFullBackup();
            }
            break;
        case 'restore-backup':
            if (window.TonuBackupInstance && typeof window.TonuBackupInstance.selectAndRestoreBackup === 'function') {
                window.TonuBackupInstance.selectAndRestoreBackup(loadStats);
            }
            break;
        case 'export-csv':
            exportData();
            break;
        case 'clear-local-cache':
            clearLocalCache();
            break;
        case 'logout-all-devices':
            if (typeof window.logoutAllDevices === 'function') window.logoutAllDevices();
            break;
        case 'open-risk-zone':
            if (typeof window.openRiskZoneModalPC === 'function') window.openRiskZoneModalPC();
            break;
        case 'close-risk-zone':
            if (typeof window.closeRiskZoneModalPC === 'function') window.closeRiskZoneModalPC();
            break;
        case 'execute-local-wipe':
            if (typeof window.executeLocalDataWipePC === 'function') window.executeLocalDataWipePC();
            break;
        case 'close-iframe-bio-modal':
            document.getElementById('iframeBioModal')?.remove();
            break;
        case 'close-report-modal':
            document.getElementById('reportModal')?.remove();
            break;
        case 'close-email-modal':
            document.getElementById('emailSettingsModal')?.remove();
            break;
        default:
            break;
    }
}

function setupSettingsUIListeners() {
    if (_settingsUIListenersBound) return;
    _settingsUIListenersBound = true;

    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            if (typeof window.closeSidebar === 'function') window.closeSidebar();
        });
    }

    const notifBellBtn = document.getElementById('notifBellBtn');
    if (notifBellBtn && typeof notifBellBtn.onclick !== 'function') {
        notifBellBtn.addEventListener('click', (e) => {
            if (typeof window.toggleNotificationDropdown === 'function') {
                window.toggleNotificationDropdown(e);
            }
        });
    }

    document.addEventListener('click', (e) => {
        const target = e.target;
        if (!target) return;

        if (target.id === 'riskZoneModalPC' && typeof window.closeRiskZoneModalPC === 'function') {
            window.closeRiskZoneModalPC();
            return;
        }

        if (target.id === 'iframeBioModal') {
            target.remove();
            return;
        }

        const chip = target.closest?.('.day-chip[data-day]');
        if (chip) {
            const day = parseInt(chip.dataset.day, 10);
            if (!isNaN(day)) {
                toggleReminderDay(day);
            }
            return;
        }

        const actionEl = target.closest?.('[data-settings-action]');
        if (actionEl) {
            handleSettingsAction(actionEl.dataset.settingsAction, actionEl);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const target = e.target;
        if (!target) return;

        const chip = target.closest?.('.day-chip[data-day]');
        if (chip) {
            e.preventDefault();
            const day = parseInt(chip.dataset.day, 10);
            if (!isNaN(day)) toggleReminderDay(day);
            return;
        }

        const avatarBtn = target.closest?.('.avatar-large-container[data-settings-action="trigger-avatar-upload"]');
        if (avatarBtn) {
            e.preventDefault();
            triggerAvatarUpload();
        }
    });

    const avatarFileInput = document.getElementById('avatarFileInput');
    if (avatarFileInput) {
        avatarFileInput.addEventListener('change', (e) => handleAvatarFileSelect(e));
    }

    const desktopThemeToggle = document.getElementById('desktopThemeToggle');
    if (desktopThemeToggle) {
        desktopThemeToggle.addEventListener('change', () => {
            if (typeof window.toggleTheme === 'function') window.toggleTheme();
        });
    }

    const currencySelect = document.getElementById('currencySelect');
    if (currencySelect) {
        currencySelect.addEventListener('change', async () => {
            await changeCurrency();
            if (typeof window.updateCurrencyBadge === 'function') {
                window.updateCurrencyBadge();
            }
        });
    }

    const toggleCorpEventsPref = document.getElementById('toggleCorpEventsPref');
    if (toggleCorpEventsPref) {
        toggleCorpEventsPref.addEventListener('change', (e) => {
            if (typeof window.toggleCorporateEventsPref === 'function') {
                window.toggleCorporateEventsPref(e.target.checked);
            }
        });
    }

    const selectInactivityTimeout = document.getElementById('selectInactivityTimeout');
    if (selectInactivityTimeout) {
        selectInactivityTimeout.addEventListener('change', (e) => handleInactivityChange(e.target.value));
    }

    const budgetCategorySearch = document.getElementById('budgetCategorySearch');
    if (budgetCategorySearch) {
        budgetCategorySearch.addEventListener('input', (e) => filterBudgetCategories(e.target.value));
    }

    const budgetWarningThresholdSelect = document.getElementById('budgetWarningThresholdSelect');
    if (budgetWarningThresholdSelect) {
        budgetWarningThresholdSelect.addEventListener('change', (e) => updateBudgetWarningThreshold(e.target.value));
    }

    const togglePushEnabled = document.getElementById('togglePushEnabled');
    if (togglePushEnabled) {
        togglePushEnabled.addEventListener('change', () => togglePushNotifications());
    }

    ['toggleRemindOverdue', 'toggleNotifSound'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => updateNotificationSettings());
    });

    [
        'togglePushBills',
        'togglePushDivsCredited',
        'togglePushDivsUpcoming',
        'togglePushGoals',
        'togglePushBudgets'
    ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => updatePushGranularSettings());
    });

    const confirmDeleteInputPC = document.getElementById('confirmDeleteInputPC');
    if (confirmDeleteInputPC) {
        confirmDeleteInputPC.addEventListener('input', (e) => {
            if (typeof window.checkDeleteConfirmationPC === 'function') {
                window.checkDeleteConfirmationPC(e.target.value);
            }
        });
    }
}

// ============================================
// EXPORTAR FUNÇÕES GLOBAIS
// ============================================

window.showReportModal = showReportModal;
window.generateReportFromModal = generateReportFromModal;
window.showEmailSettings = showEmailSettings;
window.saveEmailSettings = saveEmailSettings;
window.sendTestEmail = sendTestEmail;
window.renderSettingsBudgets = renderSettingsBudgets;
window.saveAllSettingsBudgets = saveAllSettingsBudgets;
window.updateBudgetWarningThreshold = updateBudgetWarningThreshold;
window.filterBudgetCategories = filterBudgetCategories;
window.handleBudgetInputChange = handleBudgetInputChange;
window.setupSettingsUIListeners = setupSettingsUIListeners;

