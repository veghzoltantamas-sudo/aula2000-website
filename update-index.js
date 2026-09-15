const fs = require("fs");

// Read the files
let index = fs.readFileSync("/opt/asztalospro/views/index.ejs", "utf8");

// Read CSS content
const css = fs.readFileSync("/opt/asztalospro/views/partials/sticky-styles.ejs", "utf8");

// Add CSS before </head>
index = index.replace("</head>", css + "\n</head>");

// Add canonical URL and SEO meta tags after <title>
index = index.replace(
  "<title><%= content.site_title %></title>",
  `<title><%= content.site_title %></title>
    <link rel="canonical" href="https://www.asztalospro.hu/">
    <meta name="title" content="<%= content.site_title %> | Prémium Asztalosműhely">
    <meta property="og:site_name" content="<%= content.site_title %>">
    <meta property="og:locale" content="hu_HU">
    <meta property="og:url" content="https://www.asztalospro.hu/">
    <meta name="twitter:title" content="<%= content.site_title %> | Prémium Asztalosműhely">`
);

// Add sticky header HTML and scroll to top before </body>
const stickyHtml = `
<!-- Sticky CTA Header (mobile) -->
<div class="sticky-cta-header" id="stickyCtaHeader">
    <div class="container">
        <div class="sticky-cta-content">
            <a href="tel:<%= String(content.contact_phone || '').replace(/[^\\d+]/g, '') %>" class="sticky-cta-phone">
                <i class="fa-solid fa-phone"></i>
                <span><%= content.contact_phone || '+36 30 555 5555' %></span>
            </a>
            <a href="#kapcsolat" class="sticky-cta-btn">
                <i class="fa-solid fa-calendar-check me-2"></i>
                Ingyenes felmérés
            </a>
        </div>
    </div>
</div>
<!-- Scroll to top button -->
<button id="scrollTopBtn" class="scroll-top-btn" aria-label="Ugrás a tetejére">
    <i class="fa-solid fa-chevron-up"></i>
</button>
`;

// Add JavaScript before </body>
const script = `
<script>
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
</script>
`;

// Find the closing body tag and insert before it
// Find the include('partials/index-footer') line and insert before it
const footerIncludeIndex = index.lastIndexOf("<%- include('partials/index-footer'");
if (footerIncludeIndex !== -1) {
  index = index.slice(0, footerIncludeIndex) + stickyHtml + "\n" + script + "\n" + index.slice(footerIncludeIndex);
}

// Write the file
fs.writeFileSync("/opt/asztalospro/views/index.ejs", index);
console.log("index.ejs updated!");