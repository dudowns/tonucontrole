/* ============================================
   DOCK MOBILE — MENU "MAIS"
   Fecha o menu suspenso do dock ao tocar fora
   ou ao pressionar Escape. Sem dependências.
   ============================================ */
(function () {
    const more = document.getElementById('navMore');
    if (!more) return;

    document.addEventListener('click', (event) => {
        if (more.open && !more.contains(event.target)) {
            more.open = false;
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && more.open) {
            more.open = false;
        }
    });
})();
