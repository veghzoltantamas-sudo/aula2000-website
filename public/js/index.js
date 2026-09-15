/* ============================================
   ASZTALOSPRO — FŐOLDAL SPECIFIKUS JS (index.js)
   ============================================
   Az index-footer.ejs inline scriptjéből a specifikus
   funkciók (promo countdown, PWA install, splash, push,
   galéria scroll, social proof toast).
   A közös kódok (analytics, keresés, hírlevél,
   galéria szűrő) a main.js-ben élnek.

   A szerver-oldali (EJS) dinamikus értékeket
   <meta> tagekből olvassa (CSP-biztos):
     - meta[name="promo-deadline"]   → promo számláló
     - meta[name="vapid-public-key"] → push VAPID kulcs
   ============================================ */
(function () {
    'use strict';

    function initAOS() {
        if (window.AOS && typeof window.AOS.init === 'function') {
            window.AOS.init({ duration: 800, once: true });
        }
    }
    initAOS();
    document.addEventListener('DOMContentLoaded', initAOS);
    window.addEventListener('load', initAOS);

    function meta(name) {
        var el = document.querySelector('meta[name="' + name + '"]');
        return el ? el.getAttribute('content') : '';
    }

    var cfg = window.Aula2000Config || window['Aula 2000Config'] || {};
    var deadlineMeta = meta('promo-deadline');
    window.promoDeadline = (cfg.promoDeadline && !isNaN(Number(cfg.promoDeadline)))
        ? Number(cfg.promoDeadline)
        : ((deadlineMeta && !isNaN(Number(deadlineMeta))) ? Number(deadlineMeta) : (Date.now() + 72 * 60 * 60 * 1000));

    // --- URL-ből form prefill ---
    var urlParams = new URLSearchParams(window.location.search);
    ['name', 'email', 'phone'].forEach(function (key) {
        var value = urlParams.get(key);
        if (!value) return;
        var input = document.querySelector('input[name="' + key + '"]');
        if (input) input.value = value;
    });

    // --- Galéria scroll pozíció megőrzése ---
    document.querySelectorAll('.project-card').forEach(function (card) {
        card.addEventListener('click', function () {
            sessionStorage.setItem('galleryScrollY', String(window.scrollY));
        });
    });
    if (urlParams.get('from') === 'gallery') {
        var savedScrollY = Number(sessionStorage.getItem('galleryScrollY'));
        sessionStorage.removeItem('galleryScrollY');
        if (Number.isFinite(savedScrollY) && savedScrollY > 0) {
            requestAnimationFrame(function () {
                requestAnimationFrame(function () { window.scrollTo(0, savedScrollY); });
            });
        }
        history.replaceState(null, '', '/#referenciak');
    }

    // --- PWA Splash ---
    var pwaSplash = document.getElementById('pwaSplash');
    if (pwaSplash) {
        var hideSplash = function () {
            pwaSplash.classList.add('is-hidden');
            setTimeout(function () { pwaSplash.style.display = 'none'; }, 400);
        };
        if (document.readyState === 'complete') {
            hideSplash();
        } else {
            window.addEventListener('load', hideSplash);
            document.addEventListener('DOMContentLoaded', hideSplash);
            setTimeout(hideSplash, 1200);
        }
    }

    // --- Service Worker + Push ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js').catch(function (error) {
                console.warn('Service worker registration failed:', error);
            }).then(function (registration) {
                var VAPID_KEY = cfg.vapidPublicKey || meta('vapid-public-key');
                if (registration && VAPID_KEY && 'PushManager' in window) {
                    if (Notification.permission === 'granted') {
                        subscribeToPush(registration, VAPID_KEY);
                    }
                }
            });
        });
    }

    function subscribeToPush(registration, vapidKey) {
        var urlB64ToUint8Array = function (base64String) {
            var padding = '='.repeat((4 - base64String.length % 4) % 4);
            var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            var rawData = window.atob(base64);
            var outputArray = new Uint8Array(rawData.length);
            for (var i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
            return outputArray;
        };
        registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlB64ToUint8Array(vapidKey)
        }).then(function (subscription) {
            return fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            });
        }).catch(function () {});
    }

    // --- Promo countdown ---
    var countdownElement = document.getElementById('promoCountdown');
    if (countdownElement) {
        var deadline = Number(window.promoDeadline || (Date.now() + 72 * 60 * 60 * 1000));
        var pad2 = function (n) { return String(n).padStart(2, '0'); };
        var tick = function () {
            var totalMs = Math.max(0, deadline - Date.now());
            var days = Math.floor(totalMs / (1000 * 60 * 60 * 24));
            var hours = Math.floor((totalMs / (1000 * 60 * 60)) % 24);
            var minutes = Math.floor((totalMs / (1000 * 60)) % 60);
            var seconds = Math.floor((totalMs / 1000) % 60);
            countdownElement.textContent = pad2(days) + 'd ' + pad2(hours) + ':' + pad2(minutes) + ':' + pad2(seconds);
            if (totalMs > 0) { setTimeout(tick, 1000); }
        };
        tick();
    }

    
    // --- PWA Installation Logic ---
    var deferredInstallPrompt = null;
    var directInstallWrap = document.getElementById('pwaDirectInstallWrap');
    var directInstallBtn = document.getElementById('pwaDirectInstallBtn');

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredInstallPrompt = e;
        if (directInstallWrap) {
            directInstallWrap.classList.remove('d-none');
        }
    });

    window.addEventListener('appinstalled', function () {
        deferredInstallPrompt = null;
        if (directInstallWrap) {
            directInstallWrap.classList.add('d-none');
        }
        var modalEl = document.getElementById('pwaInstallModal');
        if (modalEl && typeof bootstrap !== 'undefined') {
            var inst = bootstrap.Modal.getInstance(modalEl);
            if (inst) inst.hide();
        }
    });

    async function triggerInstall(e) {
        if (e) e.preventDefault();
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            var choice = await deferredInstallPrompt.userChoice;
            if (choice && choice.outcome === 'accepted') {
                deferredInstallPrompt = null;
                var modalEl = document.getElementById('pwaInstallModal');
                if (modalEl && typeof bootstrap !== 'undefined') {
                    var inst = bootstrap.Modal.getInstance(modalEl);
                    if (inst) inst.hide();
                }
                return;
            }
        }
        
        var modalEl = document.getElementById('pwaInstallModal');
        if (modalEl && typeof bootstrap !== 'undefined') {
            var m = bootstrap.Modal.getOrCreateInstance(modalEl);
            m.show();
        }
    }

    var navInstallBtn = document.getElementById('pwaInstallNavBtn');
    if (navInstallBtn) {
        navInstallBtn.addEventListener('click', triggerInstall);
    }
    if (directInstallBtn) {
        directInstallBtn.addEventListener('click', triggerInstall);
    }


    // --- Social proof toast ---
    var proofToast = document.getElementById('socialProofToast');
    if (proofToast) {
        proofToast.style.cursor = 'pointer';
        proofToast.classList.remove('d-none');
        setTimeout(function () { proofToast.classList.add('show'); }, 2400);
        proofToast.addEventListener('click', function () {
            proofToast.classList.remove('show');
            proofToast.classList.add('d-none');
        });
        setTimeout(function () {
            if (proofToast.classList.contains('show')) {
                proofToast.classList.remove('show');
                proofToast.classList.add('d-none');
            }
        }, 10400);
    }
})();
