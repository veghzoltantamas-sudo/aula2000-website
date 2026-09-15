/* Aula 2000 — project (referencia munka) oldal JavaScriptje */

// Fancybox galéria inicializálása
(function() {
    if (typeof Fancybox !== 'undefined' && document.querySelector('[data-fancybox]')) {
        Fancybox.bind('[data-fancybox]', { loop: true });
    }
})();

// Service Worker regisztráció
(function() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('/sw.js').catch(function(error) {
                console.warn('Service worker registration failed:', error);
            });
        });
    }
})();