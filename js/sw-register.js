// ============================================
// SERVICE WORKER REGISTRATION
// ============================================

if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    const swPath = window.location.pathname.includes('/pages/') ? '../sw.js' : './sw.js';
    navigator.serviceWorker.register(swPath).then((registration) => {
      console.log('👷 ServiceWorker registrado com escopo:', registration.scope);
    }).catch((err) => {
      console.warn('⚠️ Falha ao registrar ServiceWorker:', err);
    });
  });
}
