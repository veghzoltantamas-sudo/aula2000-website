/**
 * Aula 2000 — Publikus oldalak route-jai
 * =====================================================
 * A publikus (nem admin, nem API) útvonalakat tartalmazza:
 * főoldal, projektek, oldalak, blog, űrlapok, sitemap,
 * robots.txt, manifest.json, health check.
 *
 * A modul egy factory függvényt exportál (createPublicRouter),
 * ami a server.js-ben definiált közös függőségeket kapja meg,
 * és visszaad egy express.Router példányt.
 *
 * A router a server.js-ben: app.use('/', createPublicRouter({...}))
 * -ként van becsatolva, ezért a belső útvonalak a gyökérből
 * indulnak (pl. "/", "/blog", "/quote").
 *
 * Megjegyzés: A /admin-login, /login, /logout belépés/kilépés
 * útvonalak a server.js-ben maradnak (auth folyamat).
 */
const express = require("express");

/**
 * @param {object} deps — a server.js-ből átadott közös függőségek:
 *   {
 *     dbGet, dbAll, dbRun,            // async DB segédek
 *     getContentMap, getSettingsMap,  // tartalom cache
 *     contactLimiter, quoteLimiter,   // rate limiterek
 *     sendNotificationEmail,          // email értesítés
 *     renderPageBlocks,               // page builder renderelő
 *     sanitizeHtml, escapeHtml,       // XSS védelem
 *     getManifestPayload              // PWA manifest
 *   }
 * @returns {express.Router}
 */
function createPublicRouter(deps) {
    const router = express.Router();

    const {
        dbGet, dbAll, dbRun,
        getContentMap, getSettingsMap,
        contactLimiter, quoteLimiter,
        sendNotificationEmail,
        renderPageBlocks,
        sanitizeHtml, escapeHtml,
        getManifestPayload
    } = deps;

    /* ============================================================
       HEALTH CHECK — uptime monitor / nginx proxy_check / k8s probe
       ============================================================ */
    router.get(["/healthz", "/health"], async (req, res) => {
        try {
            // Így a DB kapcsolat létét is ellenőrizzük, nem csak a processzt
            const t0 = Date.now();
            await dbGet("SELECT 1 AS ok");
            const dbLatency = Date.now() - t0;
            res.status(200).json({
                status: "ok",
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                db_latency_ms: dbLatency,
                node_version: process.version,
                memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
                version: "1.0.0"
            });
        } catch {
            res.status(503).json({ status: "error", timestamp: new Date().toISOString() });
        }
    });

    /* ============================================================
       FŐOLDAL
       ============================================================ */
    router.get("/", async (req, res, next) => {
        try {
            const content = await getContentMap();
            const projects = await dbAll("SELECT * FROM projects ORDER BY id DESC");
            const settings = await getSettingsMap();
            const testimonials = await dbAll("SELECT * FROM testimonials WHERE is_active = 1 ORDER BY sort_order ASC, id DESC");
            const partners = await dbAll("SELECT * FROM partners WHERE is_active = 1 ORDER BY sort_order ASC, id DESC");
            const schemaEntries = await dbAll("SELECT * FROM schema_entries WHERE is_active = 1 ORDER BY sort_order ASC, id DESC");
            const services = await dbAll("SELECT * FROM services WHERE is_active = 1 ORDER BY sort_order ASC, id DESC");
            const workflows = await dbAll("SELECT * FROM workflows WHERE is_active = 1 ORDER BY sort_order ASC, id DESC").catch(() => []);
            const unreadMessages = await dbGet("SELECT COUNT(*) AS c FROM messages WHERE is_read = 0").catch(() => ({ c: 0 }));
            const beforeAfterItems = await dbAll("SELECT * FROM before_after WHERE is_active = 1 ORDER BY sort_order ASC, id DESC").catch(() => []);
            res.render("index", { content, projects, settings, testimonials, partners, schemaEntries, services, workflows, unreadMessages: Number(unreadMessages?.c || 0), beforeAfterItems });
        } catch (err) { next(err); }
    });

    /* ============================================================
       SZOLGÁLTATÁS RÉSZLETEK
       ============================================================ */
    router.get("/szolgaltatasok/:slug", async (req, res, next) => {
        try {
            const service = await dbGet("SELECT * FROM services WHERE slug = ? AND is_active = 1", [req.params.slug]);
            if (!service) {
                return next({ status: 404, message: "A szolgáltatás nem található." });
            }
            const content = await getContentMap();
            const settings = await getSettingsMap();
            const schemaEntries = await dbAll("SELECT * FROM schema_entries WHERE is_active = 1 ORDER BY sort_order ASC, id DESC").catch(() => []);
            try { service.gallery = JSON.parse(service.gallery_images || '[]'); } catch { service.gallery = []; }
            const unreadMessages = await dbGet("SELECT COUNT(*) AS c FROM messages WHERE is_read = 0").catch(() => ({ c: 0 }));
            res.render("service-detail", { service, content, settings, schemaEntries, unreadMessages: Number(unreadMessages?.c || 0) });
        } catch (err) { next(err); }
    });

    router.get("/munkafolyamatok/:slug", async (req, res, next) => {
        try {
            const workflow = await dbGet("SELECT * FROM workflows WHERE slug = ? AND is_active = 1", [req.params.slug]);
            if (!workflow) return next({ status: 404, message: "A munkafolyamat nem található." });
            const content = await getContentMap();
            const settings = await getSettingsMap();
            const schemaEntries = await dbAll("SELECT * FROM schema_entries WHERE is_active = 1 ORDER BY sort_order ASC, id DESC").catch(() => []);
            workflow.description = sanitizeHtml(workflow.description || '').replace(/\n/g, '<br>');
            try { workflow.gallery = JSON.parse(workflow.gallery_images || '[]'); } catch { workflow.gallery = []; }
            const unreadMessages = await dbGet("SELECT COUNT(*) AS c FROM messages WHERE is_read = 0").catch(() => ({ c: 0 }));
            res.render("workflow-detail", { workflow, content, settings, schemaEntries, unreadMessages: Number(unreadMessages?.c || 0) });
        } catch (err) { next(err); }
    });

    /* ============================================================
       DINAMIKUS OLDAL
       ============================================================ */
    router.get("/page/:slug", async (req, res, next) => {
        try {
            const content = await getContentMap();
            const page = await dbGet("SELECT * FROM pages WHERE slug=? AND status='published'", [req.params.slug]);
            if (!page) {
                return res.status(404).render("page", {
                    content,
                    page: null,
                    blocksHtml: '<p>Ez az oldal nem található.</p>'
                });
            }
            res.render("page", {
                content,
                page,
                blocksHtml: renderPageBlocks(page.content_json)
            });
        } catch (err) { next(err); }
    });

    /* ============================================================
       PROJEKT RÉSZLETEK
       ============================================================ */
    router.get("/project/:id", async (req, res, next) => {
        try {
            const content = await getContentMap();
            // Csak numerikus ID-t fogadunk el — elkerüljük a nem várt típusú paramétereket
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id <= 0) {
                return res.status(404).render("error", { code: 404, message: "A kért projekt nem található", backUrl: "/" });
            }
            const project = await dbGet("SELECT * FROM projects WHERE id=?", [id]);
            if (!project) {
                // Nem létező projekt: 404-es hibaoldal, ne csendesen redirecteljünk 200-zal
                return res.status(404).render("error", { code: 404, message: "A kért projekt nem található", backUrl: "/" });
            }
            const images = await dbAll("SELECT * FROM project_images WHERE project_id=?", [id]);
            res.render("project", { content, project, images });
        } catch (err) { next(err); }
    });

    /* ============================================================
       KAPCSOLAT ŰRLAP
       ============================================================ */
    router.post("/contact", contactLimiter, async (req, res, next) => {
        try {
            // Honeypot: ha kitöltötték a rejtett mezőt, akkor spambot — csendesen eldobjuk
            if (req.body && req.body.website && String(req.body.website).trim() !== '') {
                return res.redirect("/?msg=sent#kapcsolat");
            }
            const date = new Date().toLocaleString("hu-HU");
            const payload = {
                name: String(req.body.name || '').trim(),
                email: String(req.body.email || '').trim(),
                phone: String(req.body.phone || '').trim(),
                message: String(req.body.message || '').trim()
            };

            if (!payload.name || !payload.email || !payload.message) {
                return res.status(400).redirect("/?msg=sent#kapcsolat");
            }
            // Érvényes e-mail formátum ellenőrzés
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
                return res.status(400).redirect("/?msg=sent#kapcsolat");
            }

            await dbRun("INSERT INTO messages (name, email, phone, message, date, is_read, priority, pipeline_status) VALUES (?,?,?,?,?,?,?,?)", [payload.name, payload.email, payload.phone, payload.message, date, 0, 'new', 'new']);

            await sendNotificationEmail({
                subject: "Új kapcsolatfelvétel az Aula 2000 weboldalon",
                text: `Név: ${payload.name}\nE-mail: ${payload.email}\nTelefon: ${payload.phone || 'Nincs megadva'}\nÜzenet:\n${payload.message}`,
                html: `<h3>Új kapcsolatfelvétel</h3><p><strong>Név:</strong> ${payload.name}<br><strong>E-mail:</strong> ${payload.email}<br><strong>Telefon:</strong> ${payload.phone || 'Nincs megadva'}</p><p><strong>Üzenet:</strong><br>${payload.message.replace(/\n/g, '<br>')}</p>`
            });
            const escapeEmailHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            await sendNotificationEmail({
                to: payload.email,
                subject: "Megkaptuk az üzenetét - Aula 2000",
                text: `Kedves ${payload.name}!\n\nKöszönjük megkeresését. Üzenetét megkaptuk, hamarosan jelentkezünk.\n\nÜdvözlettel,\nAula 2000`,
                html: `<p>Kedves ${escapeEmailHtml(payload.name)}!</p><p>Köszönjük megkeresését. Üzenetét megkaptuk, hamarosan jelentkezünk.</p><p>Üdvözlettel,<br><strong>Aula 2000</strong></p>`
            });

            res.redirect("/?msg=sent#kapcsolat");
        } catch (err) { next(err); }
    });

    /* ============================================================
       PRÉMIUM AJÁNLATKÉRŐ KONFIGURÁTOR
       ============================================================ */
    router.get(["/quote", "/ajanlatkeres"], async (req, res, next) => {
        try {
            const content = await getContentMap();
            res.render("quote", { content, settings: await getSettingsMap(), submitted: req.query.msg === 'sent' });
        } catch (err) { next(err); }
    });

    router.post(["/quote", "/ajanlatkeres"], quoteLimiter, async (req, res, next) => {
        try {
            const body = req.body || {};
            const name = String(body.name || '').trim();
            const email = String(body.email || '').trim();
            if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).send("Kérjük, adja meg a nevét és érvényes e-mail címét.");
            }

            const record = [
                name, email, String(body.phone || '').trim(), String(body.service_type || '').trim(),
                String(body.project_scope || '').trim(), String(body.room_count || '').trim(),
                String(body.dimensions || '').trim(), String(body.material || '').trim(),
                String(body.finish || '').trim(), String(body.budget || '').trim(),
                String(body.timeline || '').trim(), String(body.has_plan || '').trim(),
                String(body.notes || '').trim(), 'new', new Date().toISOString()
            ];

            await dbRun(
                `INSERT INTO quote_requests
                 (name,email,phone,service_type,project_scope,room_count,dimensions,material,finish,budget,timeline,has_plan,notes,status,created_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                record
            );

            await sendNotificationEmail({
                subject: "Új ajánlatkérés az Aula 2000 weboldalon",
                text: `Név: ${name}\nE-mail: ${email}\nTelefon: ${record[2]}\nSzolgáltatás: ${record[3]}\nProjekt: ${record[4]}\nMéretek: ${record[6]}\nAnyag: ${record[7]}\nMegjegyzés:\n${record[12]}`,
                html: `<h3>Új ajánlatkérés</h3><p><strong>Név:</strong> ${name}<br><strong>E-mail:</strong> ${email}<br><strong>Telefon:</strong> ${record[2] || 'Nincs megadva'}</p><ul><li><strong>Szolgáltatás:</strong> ${record[3] || 'Nincs megadva'}</li><li><strong>Projekt:</strong> ${record[4] || 'Nincs megadva'}</li><li><strong>Méretek:</strong> ${record[6] || 'Nincs megadva'}</li><li><strong>Anyag:</strong> ${record[7] || 'Nincs megadva'}</li><li><strong>Budjet:</strong> ${record[9] || 'Nincs megadva'}</li></ul><p><strong>Megjegyzés:</strong><br>${String(record[12] || '').replace(/\n/g, '<br>')}</p>`
            });
            const escapeEmailHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            await sendNotificationEmail({
                to: email,
                subject: "Megkaptuk az ajánlatkérését - Aula 2000",
                text: `Kedves ${name}!\n\nKöszönjük ajánlatkérését. A megadott adatokat megkaptuk, és hamarosan felvesszük Önnel a kapcsolatot.\n\nÜdvözlettel,\nAula 2000`,
                html: `<p>Kedves ${escapeEmailHtml(name)}!</p><p>Köszönjük ajánlatkérését. A megadott adatokat megkaptuk, és hamarosan felvesszük Önnel a kapcsolatot.</p><p>Üdvözlettel,<br><strong>Aula 2000</strong></p>`
            });

            res.redirect("/quote?msg=sent");
        } catch (err) { next(err); }
    });

    /* ============================================================
       PUBLIKUS BLOG
       ============================================================ */
    router.get("/blog", async (req, res, next) => {
        try {
            const content = await getContentMap();
            const settings = await getSettingsMap();
            const category = req.query.cat || '';
            const perPage = 9;
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const offset = (page - 1) * perPage;
            let blogQuery = "SELECT * FROM blog_posts WHERE status='published'";
            let countQuery = "SELECT COUNT(*) as c FROM blog_posts WHERE status='published'";
            const params = [];
            const countParams = [];
            if (category) {
                blogQuery += " AND category = ?";
                countQuery += " AND category = ?";
                params.push(category);
                countParams.push(category);
            }
            blogQuery += " ORDER BY id DESC LIMIT ? OFFSET ?";
            params.push(perPage, offset);
            const posts = await dbAll(blogQuery, params).catch(() => []);
            const totalPosts = await dbGet(countQuery, countParams).catch(() => ({ c: 0 }));
            const totalPages = Math.max(1, Math.ceil((totalPosts?.c || 0) / perPage));
            const categories = await dbAll("SELECT DISTINCT category FROM blog_posts WHERE status='published' AND category != '' ORDER BY category").catch(() => []);
            res.render("blog", {
                content, settings, posts,
                categories: categories.map(c => c.category),
                activeCategory: category,
                currentPage: page,
                totalPages,
                totalPosts: totalPosts?.c || 0
            });
        } catch (err) { next(err); }
    });

    router.get("/blog/:slug", async (req, res, next) => {
        try {
            const content = await getContentMap();
            const settings = await getSettingsMap();
            const post = await dbGet("SELECT * FROM blog_posts WHERE slug=? AND status='published'", [req.params.slug]).catch(() => null);
            if (!post) return res.status(404).render("error", { code: 404, message: "Blog bejegyzés nem található", backUrl: "/blog" });
            // Növeljük a megtekintések számát
            await dbRun("UPDATE blog_posts SET views = views + 1 WHERE id = ?", [post.id]).catch(() => {});
            // Related: legutóbbi 3 publikált bejegyzés azonos kategóriából (RANDOM() teljes
            // tábla rendezés lenne — id DESC + slice gyorsabb és indexbarát)
            const relatedPosts = (await dbAll("SELECT id, title, slug, excerpt, cover, category FROM blog_posts WHERE status='published' AND id != ? AND category = ? ORDER BY id DESC LIMIT 10", [post.id, post.category]).catch(() => []))
                .sort(() => Math.random() - 0.5)
                .slice(0, 3);
            // XSS védelem: a blog tartalom sanitizálva, a title/author escape-elve
            const safePost = Object.assign({}, post, {
                content: sanitizeHtml(post.content)
            });
            res.render("blog-post", { content, settings, post: safePost, relatedPosts, escapeHtml });
        } catch (err) { next(err); }
    });

    /* ============================================================
       ROBOTS.TXT (dinamikus sitemap URL)
       ============================================================ */
    router.get("/robots.txt", async (req, res) => {
        try {
            const settings = await getSettingsMap();
            const sitemapUrl = (settings.sitemap_base_url || "https://www.aula2000.hu") + "/sitemap.xml";
            res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin-login\nDisallow: /api/\nSitemap: ${sitemapUrl}\n`);
        } catch {
            res.type("text/plain").send("User-agent: *\nDisallow: /admin\n");
        }
    });

    /* ============================================================
       SITEMAP.XML
       ============================================================ */
    router.get("/sitemap.xml", async (req, res, next) => {
        try {
            const settings = await getSettingsMap();
            const baseUrl = settings.sitemap_base_url || "https://www.aula2000.hu";
            const projects = await dbAll("SELECT id, title, updated_at FROM projects ORDER BY id DESC").catch(() => []);
            const pages = await dbAll("SELECT slug, updated_at FROM pages WHERE status='published' ORDER BY id DESC");
            const blogPosts = await dbAll("SELECT slug, updated_at FROM blog_posts WHERE status='published' ORDER BY id DESC").catch(() => []);

            let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
            // Főoldal
            xml += `  <url><loc>${baseUrl}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n`;
            // Ajánlatkérés
            xml += `  <url><loc>${baseUrl}/quote</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;
            // Projektek
            for (const p of projects) {
                const lastmod = p.updated_at ? new Date(p.updated_at).toISOString().split('T')[0] : '';
                xml += `  <url><loc>${baseUrl}/project/${p.id}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
            }
            // Dinamikus oldalak
            for (const p of pages) {
                const lastmod = p.updated_at ? new Date(p.updated_at).toISOString().split('T')[0] : '';
                xml += `  <url><loc>${baseUrl}/page/${p.slug}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>monthly</changefreq><priority>0.6</priority></url>\n`;
            }
            // Blog bejegyzések
            for (const b of blogPosts) {
                const lastmod = b.updated_at ? new Date(b.updated_at).toISOString().split('T')[0] : '';
                xml += `  <url><loc>${baseUrl}/blog/${b.slug}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.7</priority></url>\n`;
            }
            xml += `</urlset>`;
            res.type("application/xml").send(xml);
        } catch (err) { next(err); }
    });

    /* ============================================================
       PWA MANIFEST
       ============================================================ */
    router.get("/manifest.json", async (req, res) => {
        try {
            res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
            res.json(await getManifestPayload());
        } catch {
            res.status(500).json({ name: "Aula 2000", short_name: "Aula 2000", display: "standalone", start_url: "/" });
        }
    });

    return router;
}

module.exports = { createPublicRouter };
