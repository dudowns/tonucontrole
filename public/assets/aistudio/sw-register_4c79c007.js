// ============================================
// SERVICE WORKER & PWA BROWSER PROMPT INTEGRATION
// ============================================

// Remove qualquer resíduo de botão de instalação interno do app
function removeInternalInstallButtons() {
  const existingBtn = document.getElementById('pwaInstallBtn');
  if (existingBtn && existingBtn.parentNode) {
    existingBtn.parentNode.removeChild(existingBtn);
  }
}

// Limpa caso algum elemento tenha sido criado
window.addEventListener('DOMContentLoaded', removeInternalInstallButtons);
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  removeInternalInstallButtons();
}

// Monitora evento nativo do Google Chrome / Edge
// Não chamamos preventDefault() para que o Chrome exiba o ícone de instalação nativo na barra de endereços/navegação
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('📲 PWA pronto para instalação nativa pelo navegador (Google Chrome Omnibox)');
  removeInternalInstallButtons();
});

// Evento disparado quando o app é instalado pelo Chrome
window.addEventListener('appinstalled', () => {
  console.log('🎉 TonuControle instalado com sucesso via navegador!');
  removeInternalInstallButtons();
  if (typeof window.showToast === 'function') {
    window.showToast('🎉 TonuControle instalado com sucesso no seu dispositivo!', 'success');
  }
});

// Registro do Service Worker para critérios de PWA do Chrome
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    let swPath = './sw.js';
    if (window.location.pathname.includes('/pages/mobile/')) {
      swPath = '../../sw.js';
    } else if (window.location.pathname.includes('/pages/')) {
      swPath = '../sw.js';
    }

    const swScope = swPath.replace('sw.js', '') || './';
    navigator.serviceWorker.register(swPath, { scope: swScope }).then((registration) => {
      console.log('👷 ServiceWorker registrado com escopo:', registration.scope);
      registration.update();

      if (registration.waiting) {
        registration.waiting.postMessage('skipWaiting');
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage('skipWaiting');
            }
          });
        }
      });

      // Limpeza forçada do app badge no iOS ao registrar
      if ('clearAppBadge' in navigator) {
        navigator.clearAppBadge().catch(() => {});
      }
      if (registration.active) {
        registration.active.postMessage({ type: 'CLEAR_APP_BADGE' });
      }
    }).catch((err) => {
      console.warn('⚠️ Falha ao registrar ServiceWorker:', err);
    });
  });

  // Forçar limpeza do App Badge ao abrir o app ou voltar ao primeiro plano (iOS / Safari PWA)
  function forceClearPwaBadge() {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_APP_BADGE' });
    }
  }

  window.addEventListener('DOMContentLoaded', forceClearPwaBadge);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      forceClearPwaBadge();
    }
  });
}
