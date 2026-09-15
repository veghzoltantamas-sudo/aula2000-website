const fs = require("fs");
let html = fs.readFileSync("views/admin.ejs", "utf8");

// Add mobile-responsive CSS that keeps sidebar always visible
const mobileCSS = `
<style>
/* Admin - Always visible sidebar, mobile responsive */
:root { --sidebar-width: 220px; }

@media (max-width: 991.98px) {
    :root { --sidebar-width: 180px; }
    .sidebar {
        width: var(--sidebar-width) !important;
        min-width: var(--sidebar-width) !important;
        font-size: 0.85rem;
    }
    .sidebar h5 { font-size: 0.9rem !important; padding: 0 8px; }
    .sidebar a { padding: 8px 10px !important; font-size: 0.8rem; }
    .sidebar a i { margin-right: 4px !important; width: 16px; }
    .sidebar .px-3 { padding: 0 8px !important; }
    .content-shell {
        margin-left: var(--sidebar-width) !important;
        width: calc(100% - var(--sidebar-width)) !important;
        padding: 10px !important;
    }
    .summary-card { padding: 12px !important; }
    .summary-card strong { font-size: 1.3rem !important; }
    .summary-card .summary-label { font-size: 0.7rem; }
    .summary-card small { font-size: 0.65rem; }
    .card-body { padding: 12px !important; }
    .card-header h5 { font-size: 0.95rem !important; }
    .form-label { font-size: 0.85rem; }
    .form-control, .form-select { padding: 8px 10px !important; font-size: 0.85rem; }
    .btn { padding: 8px 12px !important; font-size: 0.85rem; }
    textarea.form-control { font-size: 0.8rem !important; }
}

@media (max-width: 575.98px) {
    :root { --sidebar-width: 140px; }
    .sidebar { font-size: 0.7rem; }
    .sidebar a { padding: 6px 6px !important; font-size: 0.7rem; }
    .sidebar a i { display: none; }
    .sidebar h5 { font-size: 0.75rem !important; }
    .sidebar .small { font-size: 0.65rem; }
    .content-shell { padding: 6px !important; }
    .crm-summary .col-md-4 { margin-bottom: 6px; }
    .summary-card { padding: 8px !important; }
    .summary-card strong { font-size: 1.1rem !important; }
}

/* Ensure horizontal scroll prevention */
body { overflow-x: hidden; }
.sidebar { overflow-y: auto; }
</style>
`;

// Insert before </body>
html = html.replace("</body>", mobileCSS + "\n</body>");

fs.writeFileSync("views/admin.ejs", html);
console.log("Admin sidebar always visible - mobile responsive!");