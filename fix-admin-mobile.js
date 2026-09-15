const fs = require("fs");
let html = fs.readFileSync("views/admin.ejs", "utf8");

// 1. Add mobile header with hamburger button at the top
const mobileHeader = `
<!-- Mobile Header -->
<div class="admin-mobile-header">
    <button class="admin-hamburger" id="sidebarToggleBtn" aria-label="Menü">
        <i class="fa-solid fa-bars"></i>
    </button>
    <span class="admin-mobile-title"><i class="fa-solid fa-tree me-2 text-warning"></i> LUXURY CRM</span>
    <a href="/" target="_blank" class="admin-mobile-view" title="Weboldal megtekintése"><i class="fa-solid fa-external-link-alt"></i></a>
</div>
<!-- Sidebar Overlay for mobile -->
<div class="admin-sidebar-overlay" id="sidebarOverlay"></div>
`;

// Insert mobile header after body tag
html = html.replace("<body>\n", "<body>\n" + mobileHeader);

// 2. Update sidebar to be mobile-compatible
html = html.replace(
    '<div class="col-md-2 sidebar position-fixed">',
    '<div class="col-md-2 sidebar position-fixed" id="adminSidebar">'
);

// 3. Update main content area for mobile
html = html.replace(
    '<div class="col-md-10 offset-md-2 p-5 content-shell">',
    '<div class="col-md-10 offset-md-2 p-5 content-shell" id="adminMainContent">'
);

// 4. Add mobile CSS
const mobileCSS = `
<style>
/* Mobile Admin Styles */
.admin-mobile-header {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 56px;
    background: linear-gradient(135deg, #1a1d20, #25282c);
    border-bottom: 1px solid rgba(212,176,107,0.3);
    z-index: 1060;
    align-items: center;
    padding: 0 16px;
    gap: 12px;
}
.admin-hamburger {
    width: 40px;
    height: 40px;
    border: 1px solid rgba(212,176,107,0.3);
    border-radius: 8px;
    background: rgba(255,255,255,0.05);
    color: #fff;
    font-size: 1.2rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}
.admin-hamburger:hover {
    background: rgba(212,176,107,0.2);
    border-color: var(--gold);
}
.admin-mobile-title {
    color: #fff;
    font-weight: 700;
    font-size: 1rem;
    flex: 1;
}
.admin-mobile-view {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: rgba(212,176,107,0.1);
    color: var(--gold);
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
}
.admin-sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 1045;
}
.admin-sidebar-overlay.active {
    display: block;
}
.sidebar.open {
    left: 0 !important;
}

/* Responsive breakpoints */
@media (max-width: 991.98px) {
    .admin-mobile-header {
        display: flex;
    }
    #adminSidebar {
        position: fixed !important;
        left: -100%;
        top: 0;
        width: 85% !important;
        max-width: 320px;
        height: 100vh;
        z-index: 1050;
        transition: left 0.3s ease;
        overflow-y: auto;
    }
    #adminMainContent {
        margin-left: 0 !important;
        width: 100% !important;
        padding: 70px 16px 20px !important;
    }
    .sidebar a {
        padding: 14px 18px !important;
        font-size: 1rem !important;
    }
    .crm-summary .col-md-4 {
        width: 100% !important;
        margin-bottom: 12px;
    }
    .card-body {
        padding: 16px !important;
    }
    .btn {
        padding: 12px 16px !important;
    }
    .faq-editem .card-body {
        padding: 12px !important;
    }
}
@media (max-width: 575.98px) {
    #adminMainContent {
        padding: 60px 10px 15px !important;
    }
    h5 { font-size: 1.1rem !important; }
    h6 { font-size: 1rem !important; }
    .summary-card { padding: 16px !important; }
    .summary-card strong { font-size: 1.5rem !important; }
}
</style>

<script>
// Mobile sidebar toggle
(function() {
    var sidebar = document.getElementById("adminSidebar");
    var overlay = document.getElementById("sidebarOverlay");
    var toggleBtn = document.getElementById("sidebarToggleBtn");
    
    function openSidebar() {
        if (sidebar) sidebar.classList.add("open");
        if (overlay) overlay.classList.add("active");
        document.body.style.overflow = "hidden";
    }
    function closeSidebar() {
        if (sidebar) sidebar.classList.remove("open");
        if (overlay) overlay.classList.remove("active");
        document.body.style.overflow = "";
    }
    
    if (toggleBtn) toggleBtn.addEventListener("click", function() {
        if (sidebar.classList.contains("open")) closeSidebar();
        else openSidebar();
    });
    if (overlay) overlay.addEventListener("click", closeSidebar);
    
    // Close sidebar when clicking a link (mobile)
    if (sidebar) {
        sidebar.querySelectorAll("a").forEach(function(link) {
            link.addEventListener("click", function() {
                if (window.innerWidth < 992) closeSidebar();
            });
        });
    }
})();
</script>`;

// Insert before </body>
html = html.replace("</body>", mobileCSS + "\n</body>");

fs.writeFileSync("views/admin.ejs", html);
console.log("Admin mobile-friendly updated!");