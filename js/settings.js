// ============================================
// CONFIGURAÇÕES - TonuControle (VERSÃO SEGURA)
// ============================================

console.log('⚙️ Settings.js carregado');

// ============================================
// ESTADO
// ============================================
let currentUser = null;
let isProcessing = false;

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
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

    await loadProfile();
    await loadStats();
    renderNotificationSettingsUI();
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
            encryptionBadge.style.background = '#e8f8f5';
            encryptionBadge.style.color = '#00b894';
        } else {
            encryptionBadge.innerHTML = '<i class="fas fa-unlock"></i> Não criptografado';
            encryptionBadge.style.background = '#fdeaea';
            encryptionBadge.style.color = '#e74c3c';
        }
    }

    const csrfStatus = document.getElementById('csrfStatus');
    if (csrfStatus && window.TonuCSRF) {
        const token = window.TonuCSRF.get();
        csrfStatus.innerHTML = `
            <span style="font-size:11px;color:#64748b;">
                <i class="fas fa-shield-alt" style="color:#6c5ce7;"></i>
                CSRF Token: <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:10px;">${token.substring(0, 8)}...</code>
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
                        <button class="btn btn-outline btn-sm" onclick="handleConfigurePin()">Alterar PIN</button>
                        <button class="btn btn-danger btn-sm" onclick="handleRemovePin()">Remover</button>
                    </div>
                `;
            }
        } else {
            if (pinStatusText) pinStatusText.textContent = 'PIN Desativado';
            if (pinSubText) pinSubText.textContent = 'Exigido ao abrir o aplicativo ou retornar da tela bloqueada.';
            if (pinActionContainer) {
                pinActionContainer.innerHTML = `
                    <button class="btn btn-primary btn-sm" onclick="handleConfigurePin()">
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
                    <button class="btn btn-danger btn-sm" onclick="handleToggle2FA()">Desativar 2FA</button>
                `;
            } else {
                twoFactorSubText.textContent = 'Camada adicional de proteção via código de uso único.';
                twoFactorAction.innerHTML = `
                    <button class="btn btn-outline btn-sm" onclick="handleToggle2FA()">
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
                <button class="btn btn-outline btn-sm" onclick="testBiometrics()">
                    <i class="fas fa-fingerprint"></i> Testar
                </button>
                <button class="btn btn-danger btn-sm" onclick="disableBiometrics()">
                    <i class="fas fa-times"></i> Desativar
                </button>
            </div>
        `;
    } else {
        statusText.innerHTML = 'Biometria Disponível';
        subText.textContent = 'Sensor biométrico detectado. Ative para entrar com um toque sem digitar sua senha.';
        actionContainer.innerHTML = `
            <button class="btn btn-primary btn-sm" onclick="handleRegisterBiometrics()">
                <i class="fas fa-fingerprint"></i> Ativar Agora
            </button>
        `;
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
            <div style="width:60px; height:60px; border-radius:50%; background:rgba(108,92,231,0.1); color:#6c5ce7; display:flex; align-items:center; justify-content:center; font-size:28px; margin:0 auto 16px auto;">
                <i class="fas fa-fingerprint"></i>
            </div>
            <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0 0 8px 0;">Ativação em Nova Aba</h3>
            <p style="font-size:13px; color:#64748b; line-height:1.5; margin:0 0 20px 0;">
                Por políticas de segurança rigorosas dos navegadores (WebAuthn / W3C), a leitura biométrica (Face ID / Digital) é bloqueada dentro do quadro embutido de preview.
                <br><br>
                Abra o TonuControle diretamente em uma <strong>nova aba do navegador</strong> ou instale-o como <strong>PWA</strong> para registrar e usar sua biometria com segurança total!
            </p>
            <div style="display:flex; gap:10px; justify-content:center;">
                <button class="btn btn-outline btn-sm" onclick="document.getElementById('iframeBioModal').remove()">Fechar</button>
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

function disableBiometrics() {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    if (confirm('Deseja realmente desativar o login por biometria neste dispositivo?')) {
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
    if (toggleSound) toggleSound.checked = !!settings.sound;

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
    showToast('Preferências de antecedência salvas! ✅', 'success');
}

function updateNotificationSettings() {
    if (!window.billNotificationManager) return;
    const remindOverdue = document.getElementById('toggleRemindOverdue')?.checked ?? true;
    const sound = document.getElementById('toggleNotifSound')?.checked ?? true;

    window.billNotificationManager.saveSettings({
        remindOverdue,
        sound,
        vibrate: sound
    });

    showToast('Configurações salvas! ✅', 'success');
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

    if (!confirm('Deseja remover sua foto de perfil?')) return;

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

        const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
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
// LIMPAR DADOS (COM CONFIRMAÇÃO)
// ============================================
async function clearAllData() {
    if (isProcessing) {
        showToast('Aguarde a operação atual terminar...', 'warning');
        return;
    }

    if (!confirm('⚠️ ATENÇÃO: Isso apagará TODOS os seus dados permanentemente!')) return;
    if (!confirm('Esta ação NÃO pode ser desfeita. Tem certeza?')) return;

    try {
        isProcessing = true;
        const tables = [
            'transactions',
            'goals',
            'investments',
            'dividends',
            'user_stats',
            'monthly_budgets'
        ];

        for (const table of tables) {
            try {
                const { error } = await supabaseClient
                    .from(table)
                    .delete()
                    .eq('user_id', currentUser.id);

                if (error) {
                    console.warn(`⚠️ Erro ao limpar ${table}:`, error);
                } else {
                    console.log(`✅ ${table} limpa!`);
                }
            } catch (e) {
                console.warn(`⚠️ Erro ao limpar ${table}:`, e);
            }
        }

        try {
            await supabaseClient
                .from('profiles')
                .delete()
                .eq('id', currentUser.id);
            console.log('✅ Perfil limpo!');
        } catch (e) {
            console.warn('⚠️ Erro ao limpar perfil:', e);
        }

        if (window.tonuSync) {
            await window.tonuSync.clearQueue();
        }

        if (window.TonuSecureSession) {
            window.TonuSecureSession.clear();
        }

        showToast('Todos os dados foram limpos! 🗑️', 'success');
        await loadStats();

    } catch (error) {
        console.error('❌ Erro ao limpar dados:', error);
        showToast('Erro ao limpar dados', 'error');
    } finally {
        isProcessing = false;
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

window.logout = async function () {
    if (window.supabaseOffline) {
        await window.supabaseOffline.logout();
    } else {
        await supabaseClient.auth.signOut();
    }
    window.location.href = '../index.html';
};

window.editProfile = editProfile;
window.triggerAvatarUpload = triggerAvatarUpload;
window.handleAvatarFileSelect = handleAvatarFileSelect;
window.removeAvatar = removeAvatar;
window.loadProfile = loadProfile;
window.changeCurrency = changeCurrency;
window.exportData = exportData;
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
                    <i class="fas fa-file-alt" style="color:#6c5ce7;"></i> Relatório
                </h3>
                <button onclick="document.getElementById('reportModal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#94a3b8;">&times;</button>
            </div>
            <form id="reportForm" onsubmit="event.preventDefault(); window.generateReportFromModal();">
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
                    <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('reportModal').remove()">Cancelar</button>
                    <button type="submit" class="btn btn-primary btn-sm">
                        <i class="fas fa-file-export"></i> Gerar
                    </button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
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
            const csv = ['\uFEFF' + headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
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
                doc.setTextColor(108, 92, 231);
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
                    <i class="fas fa-envelope" style="color:#6c5ce7;"></i> E-mail Semanal
                </h3>
                <button onclick="document.getElementById('emailSettingsModal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#94a3b8;">&times;</button>
            </div>
            <form id="emailSettingsForm" onsubmit="event.preventDefault(); window.saveEmailSettings();">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;">
                    <div>
                        <strong style="font-size:13px;color:#0f172a;">Ativar envio</strong>
                        <div style="font-size:11px;color:#64748b;">Receber resumo semanal por e-mail</div>
                    </div>
                    <label style="position:relative;display:inline-block;width:44px;height:24px;">
                        <input type="checkbox" id="emailEnabled" ${settings.enabled ? 'checked' : ''} style="opacity:0;width:0;height:0;">
                        <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#cbd5e1;transition:0.25s;border-radius:24px;" onclick="this.previousElementSibling.checked = !this.previousElementSibling.checked;"></span>
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
                    <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('emailSettingsModal').remove()">Cancelar</button>
                    <button type="submit" class="btn btn-primary btn-sm">
                        <i class="fas fa-save"></i> Salvar
                    </button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    const toggle = modal.querySelector('span[onclick]');
    const input = modal.querySelector('#emailEnabled');
    if (toggle && input) {
        toggle.onclick = () => {
            input.checked = !input.checked;
        };
    }
}

function saveEmailSettings() {
    const enabled = document.getElementById('emailEnabled').checked;
    const dayOfWeek = parseInt(document.getElementById('emailDay').value);
    const hourOfDay = parseInt(document.getElementById('emailHour').value);

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

        window.open(`mailto:${user.email}?subject=${subject}&body=${body}`, '_blank');

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
                { id: 'cat_moradia', name: 'Moradia', icon: 'fa-home', color: '#6c5ce7', type: 'expense' },
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
                color: c.color || '#6c5ce7',
                spent: 0,
                limit: 0,
                remaining: 0,
                percentage: 0,
                isExceeded: false,
                isWarning: false
            }));
        }

        renderSettingsBudgetListHtml(settingsBudgetData);

    } catch (err) {
        console.error('Erro ao carregar limites em configurações:', err);
        container.innerHTML = '<div style="padding:16px; color:#ef4444; font-size:12px;">Não foi possível carregar as categorias para limites.</div>';
    }
}

function renderSettingsBudgetListHtml(items) {
    const container = document.getElementById('settingsBudgetListContainer');
    if (!container) return;

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
        const spentFormatted = typeof formatCurrency === 'function' ? formatCurrency(cat.spent || 0) : `R$ ${(cat.spent || 0).toFixed(2)}`;
        const limitVal = cat.limit > 0 ? cat.limit.toFixed(2).replace('.', ',') : '';
        const pct = Math.min(100, Math.round(cat.percentage || 0));
        const statusCls = cat.isExceeded ? 'danger' : (cat.isWarning ? 'warning' : 'normal');
        const statusLabel = cat.isExceeded ? 'Estourado' : (cat.isWarning ? 'Atenção' : (cat.limit > 0 ? 'Normal' : 'Sem limite'));

        return `
            <div class="settings-budget-item" data-cat-id="${cat.categoryId}" data-cat-name="${(cat.name || '').toLowerCase()}">
                <div class="budget-cat-info">
                    <div class="budget-cat-icon" style="background:${cat.color || '#6c5ce7'};">
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
                            ${cat.limit > 0 ? `${pct}% consumido` : 'Sem teto definido'}
                        </span>
                        <span class="badge ${cat.isExceeded ? 'badge-danger' : (cat.isWarning ? 'badge-warning' : 'badge-success')}" style="font-size:10px; padding:1px 6px;">
                            ${statusLabel}
                        </span>
                    </div>
                    <div class="budget-progress-track">
                        <div class="budget-progress-fill ${statusCls}" style="width: ${cat.limit > 0 ? Math.max(3, pct) : 0}%;"></div>
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
                        oninput="window.handleBudgetInputChange(this)"
                        onfocus="this.select()"
                        title="Digite o teto mensal para ${cat.name}" />
                </div>
            </div>
        `;
    }).join('');
}

function handleBudgetInputChange(inputEl) {
    let val = inputEl.value.replace(/[^0-9,\.]/g, '');
    inputEl.value = val;
}

function filterBudgetCategories(term) {
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
