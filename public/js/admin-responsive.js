/* ============================================
   ASZTALOSPRO ADMIN — RESPONSIVE JS
   Desktop: bal oldali rögzített menü
   Mobil (< 992px): offcanvas drawer menü
   ============================================ */
(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        var sidebar = document.querySelector('.sidebar');
        var contentShell = document.querySelector('.content-shell');
        var sidebarToggle = document.getElementById('sidebarToggle') || document.querySelector('.sidebar-open-btn');
        var sidebarOverlay = document.getElementById('sidebarOverlay') || document.querySelector('.sidebar-overlay');


            var btn = document.createElement('button');
            btn.className = 'sidebar-open-btn';
            btn.id = 'sidebarToggle';
            btn.setAttribute('aria-label', 'Menü megnyitása');
            btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
            document.body.appendChild(btn);
            sidebarToggle = btn;
        }

            var ov = document.createElement('div');
            ov.className = 'sidebar-overlay';
            ov.id = 'sidebarOverlay';
            document.body.appendChild(ov);
            sidebarOverlay = ov;
        }

        function isMobile() {
            return window.innerWidth < 992;
        }

        function openDrawer() {
            sidebar.classList.add('open');
            sidebarOverlay.classList.add('active');
            sidebarOverlay.style.display = 'block';
            document.body.style.overflow = 'hidden';
            if (sidebarToggle) {
                sidebarToggle.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            }
        }

        function closeDrawer() {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
            sidebarOverlay.style.display = 'none';
            document.body.style.overflow = '';
            if (sidebarToggle) {
                sidebarToggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
            }
        }

        function toggleDrawer() {
            if (sidebar.classList.contains('open')) {
                closeDrawer();
            } else {
                openDrawer();
            }
        }

        sidebarToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleDrawer();
        });

        sidebarOverlay.addEventListener('click', closeDrawer);

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && sidebar.classList.contains('open')) {
                closeDrawer();
            }
        });

        sidebar.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
                if (isMobile()) {
                    closeDrawer();
                }
            });
        });

        window.addEventListener('resize', function() {
                closeDrawer();
            }
        });
    });
})();
