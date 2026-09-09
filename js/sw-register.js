// ============================================
// SERVICE WORKER REGISTRATION
// ============================================

if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    const swPath = window.location.pathname.includes('/pages/') ? '../sw.js' : './sw.js';
    navigator.serviceWorker.register(swPath).then((registration) => {
      console.log('👷 ServiceWorker registrado com escopo:', registration.scope);
      // Força verificação imediata de nova versão
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
