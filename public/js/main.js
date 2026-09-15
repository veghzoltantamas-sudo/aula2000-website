/* Aula 2000 — Közös JavaScript */

(function() {
    var cfg = window.Aula2000Config || window['Aula 2000Config'] || {};
    if (!window.promoDeadline && cfg.promoDeadline) {
        window.promoDeadline = Number(cfg.promoDeadline);
    }
})();

// Analytics küldés
(function() {
    try {
        fetch('/api/analytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: window.location.pathname, referrer: document.referrer })
        }).catch(function() {});
    } catch (e) {}
})();

// Keresés megnyitása/benzárása
(function() {
    var overlay = document.getElementById('searchOverlay');
    var input = document.getElementById('searchInput');
    var results = document.getElementById('searchResults');
    var closeBtn = document.getElementById('searchClose');
    var toggleBtn = document.getElementById('searchToggle');

    if (!overlay || !input || !toggleBtn) return;

    toggleBtn.addEventListener('click', function() {
        overlay.classList.add('active');
        setTimeout(function() { input.focus(); }, 60);
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', function() { overlay.classList.remove('active'); });
    }

    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.classList.remove('active');
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') overlay.classList.remove('active');
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            overlay.classList.add('active');
            setTimeout(function() { input.focus(); }, 60);
        }
    });

    var timeout = null;
    input.addEventListener('input', function() {
        clearTimeout(timeout);
        var q = input.value.trim();
        if (q.length < 2) { results.innerHTML = ''; return; }
        timeout = setTimeout(async function() {
            try {
                var res = await fetch('/api/search?q=' + encodeURIComponent(q));
                var data = await res.json();
                if (!data.results || !data.results.length) {
                    results.innerHTML = '<div class="text-muted text-center py-4">Nincs találat</div>';
                    return;
                }
                results.innerHTML = data.results.map(function(r) {
                    var typeLabel = r.type === 'project' ? 'Projekt' : r.type === 'blog' ? 'Blog' : 'Oldal';
                    // XSS elleni védelem: minden felhasználói adatot escape-elünk
                    var esc = function(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); };
                    var escTitle = esc(r.title);
                    var escSub = esc(r.subtitle || '');
                    var escUrl = esc(r.url);
                    var escCover = esc(r.cover || '');
                    var cover = r.cover ? '<img src="' + escCover + '" alt="" style="width:48px;height:48px;border-radius:8px;object-fit:cover">' : '<div style="width:48px;height:48px;border-radius:8px;background:rgba(212,176,107,0.2);display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-compass-drafting" style="color:#d5ab5d"></i></div>';
                    return '<a href="' + escUrl + '" class="search-result-item">' + cover + '<div><div class="search-result-type">' + typeLabel + '</div><div class="fw-bold">' + escTitle + '</div><div class="small text-muted">' + escSub + '</div></div></a>';
                }).join('');
            } catch (e) {
                results.innerHTML = '<div class="text-muted text-center py-4">Hiba történt a keresés során</div>';
            }
        }, 300);
    });
})();

// Galéria szűrő
document.querySelectorAll('.gallery-filter-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        var cat = btn.dataset.category;
        document.querySelectorAll('.gallery-filter-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('.gallery-item').forEach(function(item) {
            item.classList.toggle('hidden', cat !== 'all' && item.dataset.category !== cat);
        });
    });
});

// Hírlevél feliratkozás
(function() {
    var form = document.getElementById('newsletter-form');
    if (!form) return;
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        var consent = document.getElementById('newsletter-gdpr-consent');
        if (consent && !consent.checked) {
            var msgEl = document.getElementById('newsletter-msg');
            msgEl.textContent = 'Kérjük, fogadja el az adatvédelmi tájékoztatót a feliratkozáshoz!';
            msgEl.classList.add('newsletter-err');
            consent.focus();
            return;
        }
        var emailInput = document.getElementById('newsletter-email');
        var msgEl = document.getElementById('newsletter-msg');
        if (!emailInput || !msgEl) return;
        msgEl.className = 'text-center small mt-2';
        try {
            var res = await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailInput.value })
            });
            var data = await res.json();
            if (res.ok) {
                msgEl.textContent = data.message || 'Sikeres feliratkozás!';
                msgEl.classList.add('newsletter-ok');
                emailInput.value = '';
            } else {
                msgEl.textContent = data.error || 'Hiba történt';
                msgEl.classList.add('newsletter-err');
            }
        } catch (err) {
            msgEl.textContent = 'Szerverhiba';
            msgEl.classList.add('newsletter-err');
        }
    });
})();

// Sticky CTA + scroll-to-top
(function() {
    var stickyHeader = document.getElementById("stickyCtaHeader");
    if (stickyHeader) {
        var lastScrollY = window.scrollY;
        var ticking = false;
        window.addEventListener("scroll", function() {
            if (!ticking) {
                window.requestAnimationFrame(function() {
                    var currentScrollY = window.scrollY;
                    if (currentScrollY > 600 && currentScrollY > lastScrollY) {
                        stickyHeader.classList.add("show");
                    } else if (currentScrollY < 400 || currentScrollY < lastScrollY) {
                        stickyHeader.classList.remove("show");
                    }
                    lastScrollY = currentScrollY;
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }
    var scrollTopBtn = document.getElementById("scrollTopBtn");
    if (scrollTopBtn) {
        window.addEventListener("scroll", function() {
            if (window.pageYOffset > 400) {
                scrollTopBtn.classList.add("show");
            } else {
                scrollTopBtn.classList.remove("show");
            }
        }, { passive: true });
        scrollTopBtn.addEventListener("click", function() {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }
})();
