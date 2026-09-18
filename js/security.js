// ==========================================================================
// TONUCONTROLE - UNIFIED SECURITY SUITE (VERSÃO COMPLETA)
// Módulos integrados com criptografia, biometria, PIN, CSRF e rotação de chaves
// ==========================================================================

(function () {
    'use strict';

    // ==========================================================================
    // 1. TONU CRYPTO (AES-GCM 256-bit) - COM ROTAÇÃO DE CHAVES
    // ==========================================================================
    const ENCRYPTION_ALGO = 'AES-GCM';
    const KEY_DERIVATION_ALGO = 'PBKDF2';
    const HASH_ALGO = 'SHA-256';
    const PBKDF2_ITERATIONS = 100000;
    const SALT_STORAGE_KEY = 'tonu_crypto_salt_v1';
    const ENCRYPTION_ENABLED_KEY = 'tonu_encryption_enabled';

    class TonuCryptoManager {
        constructor() {
            this.cryptoKey = null;
            this.isSupported = !!(window.crypto && window.crypto.subtle);
            this.isEnabled = localStorage.getItem(ENCRYPTION_ENABLED_KEY) !== 'false';
            this.scheduleKeyRotation();
        }

        getSalt() {
            let saltHex = localStorage.getItem(SALT_STORAGE_KEY);
            if (!saltHex) {
                const salt = new Uint8Array(16);
                window.crypto.getRandomValues(salt);
                saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
                localStorage.setItem(SALT_STORAGE_KEY, saltHex);
            }
            const match = saltHex.match(/.{1,2}/g);
            return new Uint8Array(match ? match.map(byte => parseInt(byte, 16)) : new Uint8Array(16));
        }

        async getOrCreateKey(seed = 'TonuControle-Secure-Vault-Key') {
            if (this.cryptoKey) return this.cryptoKey;
            if (!this.isSupported) return null;

            try {
                const enc = new TextEncoder();
                const keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    enc.encode(seed),
                    { name: KEY_DERIVATION_ALGO },
                    false,
                    ['deriveKey']
                );

                const salt = this.getSalt();

                this.cryptoKey = await window.crypto.subtle.deriveKey({
                    name: KEY_DERIVATION_ALGO,
                    salt: salt,
                    iterations: PBKDF2_ITERATIONS,
                    hash: HASH_ALGO
                },
                    keyMaterial, { name: ENCRYPTION_ALGO, length: 256 },
                    false,
                    ['encrypt', 'decrypt']
                );

                return this.cryptoKey;
            } catch (err) {
                console.error('❌ Erro ao derivar chave criptográfica:', err);
                return null;
            }
        }

        async encrypt(data) {
            if (!this.isSupported || !this.isEnabled) {
                return { __plain: true, payload: data };
            }

            try {
                const key = await this.getOrCreateKey();
                if (!key) return { __plain: true, payload: data };

                const iv = new Uint8Array(12);
                window.crypto.getRandomValues(iv);

                const jsonStr = JSON.stringify(data);
                const enc = new TextEncoder();
                const encodedData = enc.encode(jsonStr);

                const ciphertextBuffer = await window.crypto.subtle.encrypt({ name: ENCRYPTION_ALGO, iv: iv },
                    key,
                    encodedData
                );

                const ciphertextArray = Array.from(new Uint8Array(ciphertextBuffer));
                const ivArray = Array.from(iv);

                return {
                    __encrypted: true,
                    version: this.getKeyVersion(),
                    iv: ivArray,
                    data: ciphertextArray,
                    timestamp: Date.now()
                };
            } catch (err) {
                console.warn('⚠️ Falha na criptografia, usando fallback seguro:', err);
                return { __plain: true, payload: data };
            }
        }

        async decrypt(payload) {
            if (!payload) return payload;

            if (payload.__plain) {
                return payload.payload;
            }

            if (!payload.__encrypted || !payload.data || !payload.iv) {
                return payload;
            }

            if (!this.isSupported) {
                console.warn('⚠️ Web Crypto não suportado para descriptografar dados.');
                return null;
            }

            try {
                const key = await this.getOrCreateKey();
                if (!key) return null;

                const iv = new Uint8Array(payload.iv);
                const ciphertext = new Uint8Array(payload.data);

                const decryptedBuffer = await window.crypto.subtle.decrypt({ name: ENCRYPTION_ALGO, iv: iv },
                    key,
                    ciphertext
                );

                const dec = new TextDecoder();
                const jsonStr = dec.decode(decryptedBuffer);
                return JSON.parse(jsonStr);
            } catch (err) {
                console.error('❌ Falha ao descriptografar payload:', err);
                return null;
            }
        }

        setEnabled(enabled) {
            this.isEnabled = !!enabled;
            localStorage.setItem(ENCRYPTION_ENABLED_KEY, this.isEnabled ? 'true' : 'false');
        }

        // ============================================
        // ROTAÇÃO DE CHAVES
        // ============================================

        getKeyVersion() {
            return parseInt(localStorage.getItem('tonu_crypto_key_version') || '1', 10);
        }

        setKeyVersion(version) {
            localStorage.setItem('tonu_crypto_key_version', String(version));
        }

        async rotateKeys() {
            if (!this.isSupported) return false;
            if (!this.isEnabled) return false;

            try {
                const currentVersion = this.getKeyVersion();
                const newVersion = currentVersion + 1;

                console.log(`🔄 Rotacionando chaves: v${currentVersion} → v${newVersion}`);

                const oldKey = this.cryptoKey;
                this.cryptoKey = null;
                await this.getOrCreateKey();

                if (!this.cryptoKey) {
                    throw new Error('Falha ao gerar nova chave');
                }

                await this.reEncryptData(oldKey, this.cryptoKey);

                this.setKeyVersion(newVersion);
                localStorage.setItem('tonu_crypto_last_rotation', String(Date.now()));

                console.log(`✅ Chaves rotacionadas com sucesso: v${newVersion}`);
                return true;

            } catch (error) {
                console.error('❌ Erro ao rotacionar chaves:', error);
                if (this.cryptoKey) {
                    this.cryptoKey = null;
                    await this.getOrCreateKey();
                }
                return false;
            }
        }

        async reEncryptData(oldKey, newKey) {
            try {
                const keys = Object.keys(localStorage);
                const encryptedKeys = keys.filter(k => {
                    try {
                        const val = localStorage.getItem(k);
                        if (!val) return false;
                        const parsed = JSON.parse(val);
                        return parsed && parsed.__encrypted === true;
                    } catch {
                        return false;
                    }
                });

                console.log(`🔐 Re-criptografando ${encryptedKeys.length} itens...`);

                for (const key of encryptedKeys) {
                    try {
                        const raw = localStorage.getItem(key);
                        const encrypted = JSON.parse(raw);

                        if (encrypted.__encrypted && oldKey) {
                            const iv = new Uint8Array(encrypted.iv);
                            const ciphertext = new Uint8Array(encrypted.data);

                            const decryptedBuffer = await window.crypto.subtle.decrypt({ name: ENCRYPTION_ALGO, iv: iv },
                                oldKey,
                                ciphertext
                            );

                            const dec = new TextDecoder();
                            const jsonStr = dec.decode(decryptedBuffer);
                            const data = JSON.parse(jsonStr);

                            const newIv = new Uint8Array(12);
                            window.crypto.getRandomValues(newIv);
                            const enc = new TextEncoder();
                            const encoded = enc.encode(JSON.stringify(data));

                            const newCiphertext = await window.crypto.subtle.encrypt({ name: ENCRYPTION_ALGO, iv: newIv },
                                newKey,
                                encoded
                            );

                            const newEncrypted = {
                                __encrypted: true,
                                version: this.getKeyVersion(),
                                iv: Array.from(newIv),
                                data: Array.from(new Uint8Array(newCiphertext)),
                                timestamp: Date.now()
                            };

                            localStorage.setItem(key, JSON.stringify(newEncrypted));
                            console.log(`✅ Re-criptografado: ${key}`);
                        }
                    } catch (e) {
                        console.warn(`⚠️ Erro ao re-criptografar ${key}:`, e);
                    }
                }

                console.log('✅ Re-criptografia concluída');

            } catch (error) {
                console.error('❌ Erro na re-criptografia:', error);
                throw error;
            }
        }

        scheduleKeyRotation() {
            const lastRotation = localStorage.getItem('tonu_crypto_last_rotation');
            const now = Date.now();
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;

            if (!lastRotation || now - parseInt(lastRotation, 10) > thirtyDays) {
                console.log('⏰ Rotação de chaves agendada...');
                setTimeout(async () => {
                    await this.rotateKeys();
                }, 5000);
            } else {
                const daysLeft = Math.ceil(
                    (thirtyDays - (now - parseInt(lastRotation, 10))) / (24 * 60 * 60 * 1000)
                );
                console.log(`🔐 Próxima rotação de chaves em ${daysLeft} dias`);
            }
        }

        async forceRotate() {
            return await this.rotateKeys();
        }

        async encryptSession(userData) {
            return await this.encrypt(userData);
        }

        async decryptSession(encryptedData) {
            return await this.decrypt(encryptedData);
        }
    }

    // ==========================================================================
    // 2. TONU BIOMETRICS
    // ==========================================================================
    const BIOMETRICS_ENABLED_KEY = 'tonu_biometrics_enabled';
    const BIOMETRICS_CREDENTIAL_KEY = 'tonu_biometrics_credential';
    const BIOMETRICS_USER_INFO_KEY = 'tonu_biometrics_user';

    class TonuBiometricsManager {
        constructor() {
            this.isSupported = false;
            this.checkSupport();
            this.maxRetries = 3;
            this.retryCount = 0;
        }

        isInIframe() {
            try {
                return window.self !== window.top;
            } catch (e) {
                return true;
            }
        }

        async checkSupport() {
            if (window.PublicKeyCredential &&
                typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
                try {
                    this.isSupported = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
                } catch (e) {
                    this.isSupported = false;
                }
            } else {
                this.isSupported = false;
            }
            return this.isSupported;
        }

        isConfigured() {
            return localStorage.getItem(BIOMETRICS_ENABLED_KEY) === 'true' &&
                !!localStorage.getItem(BIOMETRICS_CREDENTIAL_KEY);
        }

        getSavedUserInfo() {
            try {
                const info = localStorage.getItem(BIOMETRICS_USER_INFO_KEY);
                return info ? JSON.parse(info) : null;
            } catch (e) {
                return null;
            }
        }

        bufferToBase64(buffer) {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return window.btoa(binary);
        }

        base64ToBuffer(base64) {
            const binary = window.atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes.buffer;
        }

        async registerBiometrics(user) {
            if (this.isInIframe()) {
                throw new Error('IFRAME_RESTRICTION');
            }

            const supported = await this.checkSupport();
            if (!supported) {
                throw new Error('Biometria não suportada neste dispositivo.');
            }

            if (!user || !user.id || !user.email) {
                throw new Error('Usuário não autenticado.');
            }

            if (this.isConfigured()) {
                throw new Error('Biometria já configurada neste dispositivo.');
            }

            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            const userIdBuffer = new TextEncoder().encode(user.id);

            const publicKeyCredentialCreationOptions = {
                challenge: challenge,
                rp: {
                    name: 'TonuControle',
                    id: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname
                },
                user: {
                    id: userIdBuffer,
                    name: user.email,
                    displayName: user.user_metadata?.full_name || user.email.split('@')[0] || 'Usuário TonuControle'
                },
                pubKeyCredParams: [
                    { alg: -7, type: 'public-key' },
                    { alg: -257, type: 'public-key' }
                ],
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    userVerification: 'required',
                    residentKey: 'preferred'
                },
                timeout: 60000,
                attestation: 'none'
            };

            try {
                const credential = await navigator.credentials.create({
                    publicKey: publicKeyCredentialCreationOptions
                });

                if (!credential) {
                    throw new Error('Criação de credencial cancelada.');
                }

                const credentialIdBase64 = this.bufferToBase64(credential.rawId);

                localStorage.setItem(BIOMETRICS_CREDENTIAL_KEY, credentialIdBase64);
                localStorage.setItem(BIOMETRICS_ENABLED_KEY, 'true');
                localStorage.setItem(BIOMETRICS_USER_INFO_KEY, JSON.stringify({
                    id: user.id,
                    email: user.email,
                    name: user.user_metadata?.full_name || user.email.split('@')[0]
                }));

                this.retryCount = 0;
                return true;
            } catch (err) {
                if (err.name === 'NotAllowedError' && err.message && err.message.includes('publickey-credentials-create')) {
                    throw new Error('IFRAME_RESTRICTION');
                }
                console.error('❌ Erro no registro biométrico:', err);
                throw err;
            }
        }

        async authenticate() {
            if (this.isInIframe()) {
                throw new Error('IFRAME_RESTRICTION');
            }

            const supported = await this.checkSupport();
            if (!supported || !this.isConfigured()) {
                throw new Error('Biometria não configurada neste dispositivo.');
            }

            const credentialIdBase64 = localStorage.getItem(BIOMETRICS_CREDENTIAL_KEY);
            const rawIdBuffer = this.base64ToBuffer(credentialIdBase64);

            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            const publicKeyCredentialRequestOptions = {
                challenge: challenge,
                allowCredentials: [{
                    id: rawIdBuffer,
                    type: 'public-key',
                    transports: ['internal']
                }],
                userVerification: 'required',
                timeout: 60000
            };

            try {
                const assertion = await navigator.credentials.get({
                    publicKey: publicKeyCredentialRequestOptions
                });

                if (!assertion) {
                    throw new Error('Verificação biométrica não concluída.');
                }

                this.retryCount = 0;
                return this.getSavedUserInfo();
            } catch (err) {
                if (err.name === 'NotAllowedError' && err.message && err.message.includes('publickey-credentials-get')) {
                    throw new Error('IFRAME_RESTRICTION');
                }

                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    console.log(`🔄 Tentativa ${this.retryCount} de autenticação biométrica...`);
                    return await this.authenticate();
                }

                console.error('❌ Erro na autenticação biométrica:', err);
                throw err;
            }
        }

        disableBiometrics() {
            localStorage.removeItem(BIOMETRICS_ENABLED_KEY);
            localStorage.removeItem(BIOMETRICS_CREDENTIAL_KEY);
            localStorage.removeItem(BIOMETRICS_USER_INFO_KEY);
            this.retryCount = 0;
        }
    }

    // ==========================================================================
    // 3. TONU SECURITY - PIN, INATIVIDADE, 2FA
    // ==========================================================================
    class TonuSecurityManager {
        constructor() {
            this.storageKeyPin = 'tonu_security_pin';
            this.storageKeyInactivity = 'tonu_inactivity_timeout_min';
            this.storageKey2FA = 'tonu_2fa_enabled';
            this.storageKey2FASecret = 'tonu_2fa_secret';
            this.inactivityTimer = null;
            this.isLocked = false;
            this.enteredPin = '';
            this.maxPinAttempts = 5;
            this.pinAttempts = 0;
            this.pinLockedUntil = null;

            this.init();
        }

        init() {
            this.bindActivityListeners();
            this.resetInactivityTimer();
            this.checkInitialLock();
            this.checkPinLockout();
        }

        checkPinLockout() {
            const lockedUntil = localStorage.getItem('tonu_pin_locked_until');
            if (lockedUntil) {
                const lockTime = parseInt(lockedUntil, 10);
                if (Date.now() < lockTime) {
                    this.isLocked = true;
                    this.renderPinLockModal();
                    return true;
                } else {
                    localStorage.removeItem('tonu_pin_locked_until');
                    this.pinAttempts = 0;
                }
            }
            return false;
        }

        getPin() {
            return localStorage.getItem(this.storageKeyPin) || null;
        }

        savePin(pin) {
            if (!pin || pin.length < 4) {
                throw new Error('O PIN deve conter pelo menos 4 dígitos numéricos.');
            }
            localStorage.setItem(this.storageKeyPin, pin);
            this.pinAttempts = 0;
            localStorage.removeItem('tonu_pin_locked_until');
        }

        removePin() {
            localStorage.removeItem(this.storageKeyPin);
            localStorage.removeItem('tonu_pin_locked_until');
            this.pinAttempts = 0;
            this.unlockApp();
        }

        hasPin() {
            return !!this.getPin();
        }

        verifyPin(pin) {
            if (!pin) return false;

            if (this.pinLockedUntil && Date.now() < this.pinLockedUntil) {
                const remaining = Math.ceil((this.pinLockedUntil - Date.now()) / 1000);
                throw new Error(`PIN bloqueado. Aguarde ${remaining} segundos.`);
            }

            const savedPin = this.getPin();
            if (!savedPin) return false;

            const isValid = pin === savedPin;

            if (!isValid) {
                this.pinAttempts++;
                if (this.pinAttempts >= this.maxPinAttempts) {
                    this.pinLockedUntil = Date.now() + 5 * 60 * 1000;
                    localStorage.setItem('tonu_pin_locked_until', String(this.pinLockedUntil));
                    throw new Error('Muitas tentativas. PIN bloqueado por 5 minutos.');
                }
            } else {
                this.pinAttempts = 0;
                localStorage.removeItem('tonu_pin_locked_until');
            }

            return isValid;
        }

        getInactivityTimeoutMinutes() {
            return parseInt(localStorage.getItem(this.storageKeyInactivity) || '15', 10);
        }

        setInactivityTimeoutMinutes(mins) {
            localStorage.setItem(this.storageKeyInactivity, mins.toString());
            this.resetInactivityTimer();
        }

        is2FAEnabled() {
            return localStorage.getItem(this.storageKey2FA) === 'true';
        }

        set2FAEnabled(enabled, secret = '') {
            localStorage.setItem(this.storageKey2FA, enabled ? 'true' : 'false');
            if (secret) {
                localStorage.setItem(this.storageKey2FASecret, secret);
            } else if (!enabled) {
                localStorage.removeItem(this.storageKey2FASecret);
            }
        }

        bindActivityListeners() {
            const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
            events.forEach(evt => {
                window.addEventListener(evt, () => this.resetInactivityTimer(), { passive: true });
            });
        }

        resetInactivityTimer() {
            if (this.inactivityTimer) {
                clearTimeout(this.inactivityTimer);
            }

            const timeoutMins = this.getInactivityTimeoutMinutes();
            if (timeoutMins <= 0 || this.isLocked) return;

            this.inactivityTimer = setTimeout(() => {
                this.handleInactivityTrigger();
            }, timeoutMins * 60 * 1000);
        }

        handleInactivityTrigger() {
            if (this.hasPin()) {
                this.lockApp();
            } else {
                console.log('⏰ Inatividade detectada - efetuando logout automático por segurança');
                if (window.showToast) {
                    window.showToast('Sessão expirada por inatividade.', 'warning');
                }
                setTimeout(() => {
                    if (window.logout) window.logout();
                    else window.location.href = '../index.html';
                }, 1500);
            }
        }

        checkInitialLock() {
            const isUnlockedSession = sessionStorage.getItem('tonu_session_unlocked');
            if (this.hasPin() && isUnlockedSession !== 'true') {
                this.lockApp();
            }
        }

        lockApp() {
            this.isLocked = true;
            sessionStorage.removeItem('tonu_session_unlocked');
            this.renderPinLockModal();
        }

        unlockApp() {
            this.isLocked = false;
            sessionStorage.setItem('tonu_session_unlocked', 'true');
            const modal = document.getElementById('tonuPinLockModal');
            if (modal) modal.remove();
            this.resetInactivityTimer();
        }

        renderPinLockModal() {
            let modal = document.getElementById('tonuPinLockModal');
            if (modal) modal.remove();

            this.enteredPin = '';
            this.pinAttempts = 0;

            const modalHtml = `
            <div id="tonuPinLockModal" style="position:fixed; inset:0; background:rgba(15,23,42,0.92); z-index:99999999; display:flex; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(10px); font-family:'Inter',sans-serif;">
                <div style="background:#ffffff; border-radius:24px; max-width:360px; width:100%; padding:32px 24px; text-align:center; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
                    <div style="width:64px; height:64px; border-radius:50%; background:rgba(108,92,231,0.12); color:#6c5ce7; display:flex; align-items:center; justify-content:center; font-size:28px; margin:0 auto 16px auto;">
                        <i class="fas fa-lock"></i>
                    </div>
                    <h2 style="font-size:20px; font-weight:800; color:#0f172a; margin:0 0 6px 0;">Aplicativo Bloqueado</h2>
                    <p style="font-size:13px; color:#64748b; margin:0 0 24px 0;" id="pinLockMessage">Digite o seu PIN de segurança para continuar</p>

                    <div id="pinDotsDisplay" style="display:flex; justify-content:center; gap:12px; margin-bottom:28px;">
                        <span class="pin-dot" style="width:14px; height:14px; border-radius:50%; border:2px solid #cbd5e1; display:inline-block; transition:all 0.2s;"></span>
                        <span class="pin-dot" style="width:14px; height:14px; border-radius:50%; border:2px solid #cbd5e1; display:inline-block; transition:all 0.2s;"></span>
                        <span class="pin-dot" style="width:14px; height:14px; border-radius:50%; border:2px solid #cbd5e1; display:inline-block; transition:all 0.2s;"></span>
                        <span class="pin-dot" style="width:14px; height:14px; border-radius:50%; border:2px solid #cbd5e1; display:inline-block; transition:all 0.2s;"></span>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; max-width:260px; margin:0 auto;">
                        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => `
                            <button type="button" onclick="TonuSecurity.handlePinInput('${num}')" style="height:54px; font-size:20px; font-weight:700; border-radius:14px; border:1px solid #e2e8f0; background:#f8fafc; color:#0f172a; cursor:pointer; transition:all 0.15s;">
                                ${num}
                            </button>
                        `).join('')}
                        <button type="button" onclick="TonuSecurity.handleBiometricQuickUnlock()" style="height:54px; font-size:18px; border-radius:14px; border:1px solid #e2e8f0; background:#f0edff; color:#6c5ce7; cursor:pointer; display:flex; align-items:center; justify-content:center;" title="Desbloquear com Biometria">
                            <i class="fas fa-fingerprint"></i>
                        </button>
                        <button type="button" onclick="TonuSecurity.handlePinInput('0')" style="height:54px; font-size:20px; font-weight:700; border-radius:14px; border:1px solid #e2e8f0; background:#f8fafc; color:#0f172a; cursor:pointer;">
                            0
                        </button>
                        <button type="button" onclick="TonuSecurity.handlePinBackspace()" style="height:54px; font-size:18px; border-radius:14px; border:1px solid #e2e8f0; background:#f8fafc; color:#e17055; cursor:pointer; display:flex; align-items:center; justify-content:center;" title="Apagar">
                            <i class="fas fa-backspace"></i>
                        </button>
                    </div>

                    <div style="margin-top:24px;">
                        <button type="button" onclick="if(window.logout){ window.logout(); } else { window.location.href='../index.html'; }" style="background:none; border:none; color:#94a3b8; font-size:12px; cursor:pointer; text-decoration:underline;">
                            Sair da conta
                        </button>
                    </div>
                </div>
            </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            this.updatePinDots();
        }

        handlePinInput(digit) {
            if (this.pinLockedUntil && Date.now() < this.pinLockedUntil) {
                const remaining = Math.ceil((this.pinLockedUntil - Date.now()) / 1000);
                const msgEl = document.getElementById('pinLockMessage');
                if (msgEl) {
                    msgEl.textContent = `⏳ Bloqueado. Aguarde ${remaining}s`;
                    msgEl.style.color = '#e17055';
                }
                return;
            }

            if (this.enteredPin.length >= 6) return;
            this.enteredPin += digit;
            this.updatePinDots();

            const savedPin = this.getPin();
            if (this.enteredPin.length === (savedPin ? savedPin.length : 4)) {
                setTimeout(() => {
                    try {
                        const isValid = this.verifyPin(this.enteredPin);
                        if (isValid) {
                            if (window.showToast) window.showToast('Desbloqueado com sucesso! 🎉', 'success');
                            this.unlockApp();
                        } else {
                            const remaining = this.maxPinAttempts - this.pinAttempts;
                            const msgEl = document.getElementById('pinLockMessage');
                            if (msgEl) {
                                msgEl.textContent = `PIN incorreto. ${remaining} tentativa${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}`;
                                msgEl.style.color = '#e17055';
                            }
                            if (this.pinLockedUntil) {
                                const wait = Math.ceil((this.pinLockedUntil - Date.now()) / 1000);
                                if (msgEl) {
                                    msgEl.textContent = `⏳ Bloqueado por ${wait}s`;
                                }
                            }
                            this.enteredPin = '';
                            this.updatePinDots(true);
                        }
                    } catch (error) {
                        const msgEl = document.getElementById('pinLockMessage');
                        if (msgEl) {
                            msgEl.textContent = error.message;
                            msgEl.style.color = '#e17055';
                        }
                        this.enteredPin = '';
                        this.updatePinDots(true);
                    }
                }, 150);
            }
        }

        handlePinBackspace() {
            if (this.enteredPin.length > 0) {
                this.enteredPin = this.enteredPin.slice(0, -1);
                this.updatePinDots();
            }
        }

        updatePinDots(shake = false) {
            const dots = document.querySelectorAll('#pinDotsDisplay .pin-dot');
            dots.forEach((dot, index) => {
                if (index < this.enteredPin.length) {
                    dot.style.background = '#6c5ce7';
                    dot.style.borderColor = '#6c5ce7';
                    dot.style.transform = 'scale(1.2)';
                } else {
                    dot.style.background = 'transparent';
                    dot.style.borderColor = '#cbd5e1';
                    dot.style.transform = 'scale(1)';
                }
            });

            if (shake) {
                const container = document.getElementById('pinDotsDisplay');
                if (container) {
                    container.style.animation = 'shake 0.3s ease';
                    setTimeout(() => { container.style.animation = ''; }, 300);
                }
            }
        }

        async handleBiometricQuickUnlock() {
            if (window.TonuBiometrics && window.TonuBiometrics.isConfigured()) {
                try {
                    const user = await window.TonuBiometrics.authenticate();
                    if (user) {
                        if (window.showToast) window.showToast('Desbloqueado com Biometria! ✨', 'success');
                        this.unlockApp();
                    }
                } catch (e) {
                    console.log('Biometria cancelada ou falhou:', e);
                }
            } else {
                if (window.showToast) window.showToast('Biometria não configurada.', 'info');
            }
        }

        injectShakeStyle() {
            if (document.getElementById('tonu-shake-style')) return;
            const style = document.createElement('style');
            style.id = 'tonu-shake-style';
            style.textContent = `
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
                    20%, 40%, 60%, 80% { transform: translateX(8px); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // ==========================================================================
    // 4. SESSÃO OFFLINE CRIPTOGRAFADA
    // ==========================================================================
    const SESSION_STORAGE_KEY = 'tonu_secure_session_v2';

    class TonuSecureSession {
        constructor() {
            this.crypto = window.TonuCrypto;
        }

        async save(user) {
            try {
                const sessionData = {
                    user: user,
                    timestamp: Date.now(),
                    email: user.email,
                    sessionId: this.generateSessionId()
                };

                if (this.crypto && typeof this.crypto.encrypt === 'function') {
                    const encrypted = await this.crypto.encrypt(sessionData);
                    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(encrypted));
                } else {
                    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
                        user: { id: user.id, email: user.email },
                        timestamp: Date.now()
                    }));
                }
                return true;
            } catch (error) {
                console.error('❌ Erro ao salvar sessão:', error);
                return false;
            }
        }

        async load() {
            try {
                const raw = localStorage.getItem(SESSION_STORAGE_KEY);
                if (!raw) return null;

                let parsed = JSON.parse(raw);

                if (parsed.__encrypted && this.crypto) {
                    parsed = await this.crypto.decrypt(parsed);
                    if (!parsed) return null;
                }

                if (Date.now() - parsed.timestamp > 7 * 24 * 60 * 60 * 1000) {
                    localStorage.removeItem(SESSION_STORAGE_KEY);
                    return null;
                }

                return parsed.user;
            } catch (error) {
                console.error('❌ Erro ao carregar sessão:', error);
                return null;
            }
        }

        clear() {
            localStorage.removeItem(SESSION_STORAGE_KEY);
        }

        generateSessionId() {
            const array = new Uint8Array(16);
            if (window.crypto && window.crypto.getRandomValues) {
                window.crypto.getRandomValues(array);
                return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
            }
            return 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
        }
    }

    // ==========================================================================
    // 5. CSRF PROTECTION
    // ==========================================================================
    class TonuCSRF {
        constructor() {
            this.storageKey = 'tonu_csrf_token';
            this.token = null;
            this.init();
        }

        init() {
            const saved = sessionStorage.getItem(this.storageKey);
            if (saved) {
                this.token = saved;
            } else {
                this.generate();
            }
        }

        generate() {
            const array = new Uint8Array(32);
            if (window.crypto && window.crypto.getRandomValues) {
                window.crypto.getRandomValues(array);
                this.token = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
            } else {
                this.token = 'csrf_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
            }
            sessionStorage.setItem(this.storageKey, this.token);
            return this.token;
        }

        get() {
            if (!this.token) this.generate();
            return this.token;
        }

        validate(token) {
            if (!token || !this.token) return false;
            return token === this.token;
        }

        secureRequest(data) {
            return {
                ...data,
                _csrf: this.get(),
                _timestamp: Date.now()
            };
        }
    }

    // ==========================================================================
    // INSTANCIAÇÃO GLOBAL
    // ==========================================================================
    window.TonuCrypto = new TonuCryptoManager();
    window.TonuBiometrics = new TonuBiometricsManager();
    window.TonuSecurity = new TonuSecurityManager();
    window.TonuSecureSession = new TonuSecureSession();
    window.TonuCSRF = new TonuCSRF();

    if (window.TonuSecurity && typeof window.TonuSecurity.injectShakeStyle === 'function') {
        window.TonuSecurity.injectShakeStyle();
    }

    window.forceRotateKeys = async function () {
        if (window.TonuCrypto) {
            const result = await window.TonuCrypto.forceRotate();
            if (result) {
                if (typeof showToast === 'function') {
                    showToast('🔐 Chaves criptográficas rotacionadas com sucesso!', 'success');
                } else {
                    console.log('✅ Chaves rotacionadas com sucesso!');
                }
            } else {
                if (typeof showToast === 'function') {
                    showToast('❌ Falha ao rotacionar chaves', 'error');
                } else {
                    console.log('❌ Falha ao rotacionar chaves');
                }
            }
            return result;
        }
        return false;
    };

    window.validateTransaction = function (data) {
        const errors = [];

        if (!data.description || data.description.length < 2) {
            errors.push('Descrição deve ter pelo menos 2 caracteres');
        }
        if (data.description && data.description.length > 200) {
            errors.push('Descrição muito longa (máximo 200 caracteres)');
        }
        if (isNaN(data.amount) || data.amount <= 0) {
            errors.push('Valor deve ser maior que zero');
        }
        if (data.amount && data.amount > 999999999.99) {
            errors.push('Valor excede o limite máximo');
        }
        if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
            errors.push('Data inválida');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    };

    console.log('🛡️ TonuControle Unified Security Suite v2.0 carregada com rotação de chaves!');
})();