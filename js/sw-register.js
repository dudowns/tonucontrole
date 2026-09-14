// ============================================
// SERVICE WORKER & PWA INSTALL MANAGER
// ============================================

window.tonuDeferredPrompt = null;

// Verifica se já está rodando instalado (standalone)
function isPWAInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || 
         window.navigator.standalone === true || 
         document.referrer.includes('android-app://');
}

// Injeta ou ativa o botão de instalação na topbar
function setupInstallButton() {
  if (isPWAInstalled()) {
    const existingBtn = document.getElementById('pwaInstallBtn');
    if (existingBtn) existingBtn.style.display = 'none';
    return;
  }

  let installBtn = document.getElementById('pwaInstallBtn');
  if (!installBtn) {
    const topbarActions = document.querySelector('.topbar-actions');
    if (topbarActions) {
      installBtn = document.createElement('button');
      installBtn.id = 'pwaInstallBtn';
      installBtn.className = 'pwa-install-btn';
      installBtn.type = 'button';
      installBtn.title = 'Instalar TonuControle';
      installBtn.setAttribute('aria-label', 'Instalar aplicativo');
      installBtn.innerHTML = '<i class="fas fa-download" aria-hidden="true"></i> <span class="pwa-btn-label">Instalar App</span>';
      installBtn.onclick = () => window.installPWA();
      topbarActions.prepend(installBtn);
    }
  } else {
    installBtn.style.display = 'inline-flex';
  }
}

// Captura evento nativo do Chrome/Edge
window.addEventListener('beforeinstallprompt', (e) => {
  // Guarda o evento para acionamento via botão
  window.tonuDeferredPrompt = e;
  console.log('📲 PWA pronto para instalação (beforeinstallprompt disparado)');
  setupInstallButton();
  window.dispatchEvent(new CustomEvent('pwaInstallReady', { detail: { prompt: e } }));
});

// Evento disparado quando o app termina de ser instalado
window.addEventListener('appinstalled', () => {
  console.log('🎉 TonuControle instalado com sucesso!');
  window.tonuDeferredPrompt = null;
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.style.display = 'none';
  if (typeof window.showToast === 'function') {
    window.showToast('🎉 TonuControle instalado com sucesso no seu dispositivo!', 'success');
  }
});

// Ação de instalação chamada pelo botão ou menu
window.installPWA = async function() {
  if (isPWAInstalled()) {
    if (typeof window.showToast === 'function') {
      window.showToast('O TonuControle já está instalado como aplicativo!', 'info');
    }
    return;
  }

  if (window.tonuDeferredPrompt) {
    try {
      window.tonuDeferredPrompt.prompt();
      const choiceResult = await window.tonuDeferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('✅ Usuário aceitou a instalação do PWA');
      } else {
        console.log('❌ Usuário cancelou a instalação');
      }
      window.tonuDeferredPrompt = null;
    } catch (err) {
      console.warn('Erro ao acionar prompt do PWA:', err);
    }
  } else {
    // Verificação de iOS Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      if (typeof window.showToast === 'function') {
        window.showToast('📲 Para instalar no iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início"', 'info', 6000);
      } else {
        alert('Para instalar no iPhone/iPad:\n1. Toque no ícone de Compartilhar (Share) do Safari.\n2. Escolha "Adicionar à Tela de Início".');
      }
    } else {
      if (typeof window.showToast === 'function') {
        window.showToast('💡 No Google Chrome, clique no ícone de instalação (setinha para baixo) na barra de endereços no topo da tela!', 'info', 5000);
      } else {
        alert('Para instalar no Google Chrome:\nClique na setinha ou ícone de instalação na barra de endereços (no topo da tela).');
      }
    }
  }
};

// Registro do Service Worker
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

    // Se suportado e não instalado, verificar botão no carregamento
    if (!isPWAInstalled()) {
      setTimeout(setupInstallButton, 1000);
    }
  });
}

