const fs = require("fs");
let footer = fs.readFileSync("views/partials/index-footer.ejs", "utf8");

// Add sticky header and styles before footer
const stickyHtml = `<%- include("partials/sticky-styles") %>\n<%- include("partials/sticky-header") -->\n`;
footer = footer.replace("<footer>", stickyHtml + "<footer>");

// Add JavaScript before </body>
const script = `<script>
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
</script>\n`;

footer = footer.replace("</body>", script + "</body>");

fs.writeFileSync("views/partials/index-footer.ejs", footer);
console.log("Footer fixed!");
