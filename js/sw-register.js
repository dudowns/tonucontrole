// ==========================================================================
// TONUCONTROLE - SW-REGISTER.JS
// Registro unificado do Service Worker com prevenção de duplicação
// ==========================================================================

(function () {
    'use strict';

    // ============================================
    // 1. GERENCIADOR DE SERVICE WORKER
    // ============================================

    class ServiceWorkerManager {
        constructor() {
            this.registration = null;
            this.isSupported = 'serviceWorker' in navigator;
            this.version = '2.1.0';
            this.swUrl = '/sw.js';
            this.scope = '/';
            this.updateCheckInterval = null;
            this.isUpdateAvailable = false;
        }

        // ============================================
        // REGISTRO
        // ============================================

        async register() {
            if (!this.isSupported) {
                console.warn('⚠️ Service Worker não suportado neste navegador');
                return false;
            }

            try {
                // Verificar se já existe um registro ativo
                const existingReg = await navigator.serviceWorker.getRegistration(this.scope);

                if (existingReg) {
                    console.log('📦 Service Worker já registrado');

                    // Verificar se é o mesmo SW ou uma versão mais antiga
                    const sw = existingReg.active || existingReg.installing || existingReg.waiting;

                    if (sw) {
                        const swUrl = sw.scriptURL || '';
                        if (swUrl.includes('sw.js')) {
                            this.registration = existingReg;
                            this.setupListeners();

                            // Verificar atualizações
                            await this.checkForUpdates();

                            return true;
                        } else {
                            await existingReg.unregister();
                            console.log('🗑️ Service Worker antigo desregistrado');
                        }
                    }
                }

                // Registrar novo SW
                console.log('📦 Registrando Service Worker...');

                // Verificar se o arquivo existe antes de registrar
                const swExists = await this.checkSwFileExists();
                if (!swExists) {
                    console.warn('⚠️ Arquivo sw.js não encontrado, continuando sem SW');
                    return false;
                }

                this.registration = await navigator.serviceWorker.register(this.swUrl, {
                    scope: this.scope,
                    updateViaCache: 'none'
                });

                this.setupListeners();
                console.log('✅ Service Worker registrado com sucesso');

                // Verificar atualizações após um tempo
                setTimeout(() => this.checkForUpdates(), 5000);

                // Configurar verificação periódica
                this.startPeriodicCheck();

                return true;

            } catch (error) {
                console.error('❌ Erro ao registrar Service Worker:', error);

                if (error.message && error.message.includes('scope')) {
                    try {
                        console.log('🔄 Tentando com escopo padrão...');
                        this.registration = await navigator.serviceWorker.register(this.swUrl);
                        this.setupListeners();
                        console.log('✅ Service Worker registrado com escopo padrão');
                        return true;
                    } catch (retryError) {
                        console.error('❌ Falha no registro com escopo padrão:', retryError);
                    }
                }

                return false;
            }
        }

        // ============================================
        // VERIFICAÇÃO DE ARQUIVO
        // ============================================

        async checkSwFileExists() {
            try {
                const response = await fetch(this.swUrl, {
                    method: 'HEAD',
                    cache: 'no-store'
                });
                return response.ok;
            } catch {
                return false;
            }
        }

        // ============================================
        // LISTENERS
        // ============================================

        setupListeners() {
            if (!this.registration) return;

            // Remover listeners antigos para evitar duplicação
            navigator.serviceWorker.removeEventListener('message', this.handleMessage);
            navigator.serviceWorker.removeEventListener('controllerchange', this.handleControllerChange);

            // Adicionar listeners
            navigator.serviceWorker.addEventListener('message', this.handleMessage.bind(this));
            navigator.serviceWorker.addEventListener('controllerchange', this.handleControllerChange.bind(this));

            // Detectar novas versões
            this.registration.addEventListener('updatefound', this.handleUpdateFound.bind(this));
        }

        handleMessage(event) {
            if (event.data) {
                const type = event.data.type;

                switch (type) {
                    case 'SYNC_COMPLETED':
                        console.log('📩 Sincronização em segundo plano concluída');
                        this.showToast('✅ Sincronização concluída!', 'success');
                        break;

                    case 'SYNC_STARTED':
                        console.log('🔄 Sincronização iniciada em segundo plano');
                        break;

                    case 'BILL_ACTION_PAY':
                        console.log('📩 Ação de pagamento recebida:', event.data.billId);
                        if (typeof window.payBill === 'function') {
                            window.payBill(event.data.billId);
                        }
                        break;

                    default:
                        console.log('📩 Mensagem do Service Worker:', event.data);
                }
            }
        }

        handleControllerChange() {
            console.log('🔄 Controlador do Service Worker alterado');
            if (this.isUpdateAvailable) {
                window.location.reload();
            }
        }

        handleUpdateFound() {
            const newSW = this.registration.installing;
            console.log('🔄 Nova versão do Service Worker detectada');

            if (!newSW) return;

            newSW.addEventListener('statechange', () => {
                if (newSW.state === 'installed') {
                    console.log('✅ Nova versão instalada, aguardando ativação');

                    if (this.registration.waiting) {
                        this.isUpdateAvailable = true;
                        this.promptForUpdate();
                    }
                }

                if (newSW.state === 'activated') {
                    console.log('✅ Nova versão do Service Worker ativada');
                    this.isUpdateAvailable = false;
                    this.showToast('🔄 Atualização aplicada com sucesso!', 'success');
                }
            });
        }

        // ============================================
        // ATUALIZAÇÕES
        // ============================================

        async checkForUpdates() {
            if (!this.registration) return;

            try {
                await this.registration.update();
                console.log('🔄 Verificação de atualização concluída');
            } catch (error) {
                console.warn('⚠️ Erro ao verificar atualizações:', error);
            }
        }

        startPeriodicCheck() {
            if (this.updateCheckInterval) {
                clearInterval(this.updateCheckInterval);
            }

            // Verificar a cada 30 minutos
            this.updateCheckInterval = setInterval(() => {
                if (navigator.onLine) {
                    this.checkForUpdates();
                }
            }, 30 * 60 * 1000);

            console.log('⏰ Verificação periódica de atualizações configurada (30min)');
        }

        // ============================================
        // PROMPT DE ATUALIZAÇÃO
        // ============================================

        promptForUpdate() {
            let existingBanner = document.getElementById('swUpdateBanner');
            if (existingBanner) return;

            const banner = document.createElement('div');
            banner.id = 'swUpdateBanner';
            banner.setAttribute('role', 'alert');
            banner.setAttribute('aria-live', 'polite');
            banner.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: #1e293b;
                color: #f8fafc;
                padding: 14px 24px;
                border-radius: 14px;
                z-index: 999999;
                display: flex;
                align-items: center;
                gap: 16px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                font-family: 'Inter', sans-serif;
                max-width: 90%;
                animation: slideUp 0.3s ease;
                border: 1px solid #334155;
            `;

            banner.innerHTML = `
                <span style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:20px;">🔄</span>
                    <span style="font-weight:600;font-size:14px;">Nova versão disponível!</span>
                </span>
                <button onclick="window.skipWaitingAndReload()" 
                        style="background: #6C5CE7; color: white; border: none; 
                               padding: 8px 18px; border-radius: 8px; 
                               font-weight: 600; cursor: pointer;
                               font-family: 'Inter', sans-serif;
                               transition: background 0.2s;">
                    Atualizar agora
                </button>
                <button onclick="this.closest('#swUpdateBanner').remove()" 
                        style="background: none; border: none; color: #94a3b8; 
                               cursor: pointer; font-size: 20px;
                               padding: 4px 8px;"
                        aria-label="Fechar aviso">
                    &times;
                </button>
            `;

            document.body.appendChild(banner);
            this.showToast('🔄 Nova versão disponível!', 'info');
        }

        // ============================================
        // DESREGISTRO
        // ============================================

        async unregister() {
            if (!this.registration) return false;

            try {
                const unregistered = await this.registration.unregister();
                if (unregistered) {
                    console.log('🗑️ Service Worker desregistrado');
                    this.registration = null;
                    this.isUpdateAvailable = false;

                    if (this.updateCheckInterval) {
                        clearInterval(this.updateCheckInterval);
                        this.updateCheckInterval = null;
                    }

                    return true;
                }
                return false;
            } catch (error) {
                console.error('❌ Erro ao desregistrar Service Worker:', error);
                return false;
            }
        }

        // ============================================
        // UTILITÁRIOS
        // ============================================

        isControlled() {
            return !!navigator.serviceWorker.controller;
        }

        async getState() {
            if (!this.registration) return null;
            const sw = this.registration.active || this.registration.installing || this.registration.waiting;
            return sw ? sw.state : null;
        }

        getRegistration() {
            return this.registration;
        }

        // ============================================
        // TOAST HELPER
        // ============================================

        showToast(message, type = 'info') {
            if (typeof window.showToast === 'function') {
                window.showToast(message, type);
            } else {
                console.log(`[${type}] ${message}`);
            }
        }
    }

    // ============================================
    // 2. FUNÇÃO DE INJEÇÃO CSS PARA ANIMAÇÃO
    // ============================================

    function injectUpdateStyles() {
        if (document.getElementById('sw-update-styles')) return;

        const style = document.createElement('style');
        style.id = 'sw-update-styles';
        style.textContent = `
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }

            @media (prefers-reduced-motion: reduce) {
                #swUpdateBanner {
                    animation: none !important;
                }
            }
        `;

        document.head.appendChild(style);
    }

    // ============================================
    // 3. INSTANCIAR E EXPORTAR
    // ============================================

    // Injetar estilos de animação
    injectUpdateStyles();

    // Criar instância
    const swManager = new ServiceWorkerManager();

    // Registrar automaticamente ao carregar
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            swManager.register();
        }, 1000);
    });

    // Função global para pular espera e recarregar
    window.skipWaitingAndReload = () => {
        if (swManager.registration && swManager.registration.waiting) {
            swManager.registration.waiting.postMessage({ type: 'SKIP_WAITING' });

            setTimeout(() => {
                window.location.reload();
            }, 500);
        } else {
            window.location.reload();
        }
    };

    // EXPORTAÇÃO GLOBAL
    window.swManager = swManager;
    window.ServiceWorkerManager = ServiceWorkerManager;

    console.log('✅ Service Worker Manager carregado');

})();