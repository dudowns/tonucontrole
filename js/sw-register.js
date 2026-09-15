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
    const swPath = window.location.pathname.includes('/pages/') ? '../sw.js' : './sw.js';
    navigator.serviceWorker.register(swPath).then((registration) => {
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
    }).catch((err) => {
      console.warn('⚠️ Falha ao registrar ServiceWorker:', err);
    });
  });
}
