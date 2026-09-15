/**
 * Aula 2000 — API route-ok
 * =====================================================
 * A /api/... végpontokat tartalmazza (keresés, hírlevél,
 * analitika, push feliratkozás).
 *
 * A modul egy factory függvényt exportál (createApiRouter),
 * ami a server.js-ben definiált közös függőségeket kapja meg,
 * és visszaad egy express.Router példányt.
 *
 * A router a server.js-ben: app.use('/api', createApiRouter({...}))
 * -ként van becsatolva, ezért a belső útvonalak NEM tartalmazzák
 * a '/api' előtagot (pl. "/search" → /api/search).
 */
const express = require("express");
const { requireLogin } = require("../middleware/auth");

/**
 * @param {object} deps — a server.js-ből átadott közös függőségek:
 *   {
 *     dbGet, dbAll, dbRun,          // async DB segédek
 *     getSwVersion,
 *     analyticsLimiter,             // rate limiterek
 *     newsletterLimiter, pushLimiter
 *   }
 * @returns {express.Router}
 */
function createApiRouter(deps) {
    const router = express.Router();

    const {
        dbGet, dbAll, dbRun,
        getSwVersion,
        analyticsLimiter, newsletterLimiter, pushLimiter
    } = deps;

    /* ============================================================
       SERVICE WORKER VERZIÓ
       ============================================================ */
    router.get("/sw-version", async (req, res) => {
        try {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            res.json({ version: await getSwVersion() });
        } catch {
            res.json({ version: "fallback" });
        }
    });

    /* ============================================================
       KERESÉS
       ============================================================ */
    router.get("/search", async (req, res) => {
        try {
            const q = String(req.query.q || '').trim().toLowerCase();
            if (!q || q.length < 2) return res.json({ results: [] });
            const projects = await dbAll("SELECT id, title, category, description, cover FROM projects WHERE LOWER(title) LIKE ? OR LOWER(category) LIKE ? OR LOWER(description) LIKE ? LIMIT 10", [`%${q}%`, `%${q}%`, `%${q}%`]);
            const pages = await dbAll("SELECT slug, title FROM pages WHERE status='published' AND (LOWER(title) LIKE ? OR LOWER(slug) LIKE ?) LIMIT 10", [`%${q}%`, `%${q}%`]);
            const blogPosts = await dbAll("SELECT slug, title, excerpt FROM blog_posts WHERE status='published' AND (LOWER(title) LIKE ? OR LOWER(excerpt) LIKE ? OR LOWER(content) LIKE ?) LIMIT 10", [`%${q}%`, `%${q}%`, `%${q}%`]).catch(() => []);
            const results = [
                ...projects.map(p => ({ type: 'project', title: p.title, subtitle: p.category, url: `/project/${p.id}`, cover: p.cover })),
                ...pages.map(p => ({ type: 'page', title: p.title, subtitle: 'Oldal', url: `/page/${p.slug}` })),
                ...blogPosts.map(b => ({ type: 'blog', title: b.title, subtitle: b.excerpt || 'Blog', url: `/blog/${b.slug}` }))
            ];
            res.json({ results, query: q });
        } catch { res.json({ results: [], query: req.query.q }); }
    });

    /* ============================================================
       HÍRLEVÉL FELIRATKOZÁS
       ============================================================ */
    router.post("/newsletter", newsletterLimiter, async (req, res) => {
        try {
            const email = String(req.body.email || '').trim();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({ error: "Érvénytelen email cím." });
            }
            const existing = await dbGet("SELECT id FROM newsletter_subscribers WHERE email = ?", [email]);
            if (existing) return res.json({ ok: true, message: "Már feliratkozva!" });
            await dbRun("INSERT INTO newsletter_subscribers (email, subscribed_at) VALUES (?, ?)", [email, new Date().toISOString()]);
            res.json({ ok: true, message: "Sikeres feliratkozás!" });
        } catch { res.status(500).json({ error: "Szerverhiba." }); }
    });

    /* ============================================================
       HÍRLEVÉL LEIRATKOZÁS (GET) — GDPR-kompatibilis
       ============================================================ */
    router.get("/newsletter/unsubscribe", async (req, res) => {
        try {
            const email = String((req.query.email || '').trim()).toLowerCase();
            if (email) {
                await dbRun("UPDATE newsletter_subscribers SET is_active = 0 WHERE LOWER(email) = ?", [email]);
            }
            res.type('html').send('<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>Leiratkozás</title></head><body style="font-family:sans-serif;background:#0a0d11;color:#f5efe8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;max-width:420px;padding:2rem"><h1 style="color:#d5ab5d">Leiratkozás</h1><p>Sikeresen leiratkozott a hírlevélről.</p><p><a href="/" style="color:#f4d59b">Vissza a főoldalra</a></p></div></body></html>');
        } catch { res.status(500).send('Hiba történt'); }
    });

    /* ============================================================
       HÍRLEVÉL LEIRATKOZÁS (POST form)
       ============================================================ */
    router.post("/newsletter/unsubscribe", async (req, res) => {
        try {
            const email = String((req.body.email || '').trim()).toLowerCase();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({ error: "Érvénytelen email cím." });
            }
            await dbRun("UPDATE newsletter_subscribers SET is_active = 0 WHERE LOWER(email) = ?", [email]);
            res.json({ ok: true, message: "Sikeresen leiratkozott." });
        } catch { res.status(500).json({ error: "Szerverhiba." }); }
    });

    /* ============================================================
       ANALITIKA
       ============================================================ */
    router.post("/analytics", analyticsLimiter, async (req, res) => {
        try {
            const { page, referrer } = req.body || {};
            if (!page) return res.json({ ok: true });
            const today = new Date().toISOString().slice(0, 10);
            // GDPR-helyes IP anonimizálás: az utolsó oktettet/tagegységet nullázzuk,
            // így egyedi látogatót tudunk számolni, de nem lehet beazonosítani az egyént.
            let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
            ip = String(ip).split(',')[0].trim();
            if (ip.includes('.')) {
                ip = ip.split('.').slice(0, 3).concat(['0']).join('.');
            } else if (ip.includes(':')) {
                // IPv6 rövidítés anonimizálása
                try {
                    const parts = ip.split(':');
                    for (let i = Math.max(0, parts.length - 4); i < parts.length; i++) parts[i] = '0';
                    ip = parts.join(':');
                } catch { /* nem anonimizálható IP formátum */ }
            }
            await dbRun("INSERT INTO analytics (page, referrer, ip, date, created_at) VALUES (?,?,?,?,?)", [page, referrer || '', ip, today, new Date().toISOString()]);
            res.json({ ok: true });
        } catch { res.json({ ok: true }); }
    });

    router.get("/analytics/summary", requireLogin, async (req, res) => {
        try {
            const today = new Date().toISOString().slice(0, 10);
            const totalViews = await dbGet("SELECT COUNT(*) as c FROM analytics");
            const todayViews = await dbGet("SELECT COUNT(*) as c FROM analytics WHERE date = ?", [today]);
            const uniqueVisitors = await dbGet("SELECT COUNT(DISTINCT ip) as c FROM analytics");
            const topPages = await dbAll("SELECT page, COUNT(*) as views FROM analytics GROUP BY page ORDER BY views DESC LIMIT 10");
            const dailyViews = await dbAll("SELECT date, COUNT(*) as views FROM analytics GROUP BY date ORDER BY date DESC LIMIT 30");
            const referrers = await dbAll("SELECT referrer, COUNT(*) as views FROM analytics WHERE referrer != '' GROUP BY referrer ORDER BY views DESC LIMIT 10");
            res.json({ totalViews: totalViews?.c || 0, todayViews: todayViews?.c || 0, uniqueVisitors: uniqueVisitors?.c || 0, topPages, dailyViews, referrers });
        } catch { res.json({ totalViews: 0, todayViews: 0, uniqueVisitors: 0, topPages: [], dailyViews: [], referrers: [] }); }
    });

    /* ============================================================
       PUSH ÉRTESÍTÉSEK — FELIRATKOZÁS
       ============================================================ */
    router.post("/push/subscribe", pushLimiter, async (req, res) => {
        try {
            const subscription = JSON.stringify(req.body);
            const endpoint = req.body && req.body.endpoint;
            if (!endpoint) return res.status(400).json({ error: "No endpoint" });
            const existing = await dbGet("SELECT id FROM push_subscribers WHERE endpoint = ?", [endpoint]);
            if (existing) return res.json({ ok: true });
            await dbRun("INSERT INTO push_subscribers (endpoint, subscription_json, created_at) VALUES (?,?,?)", [endpoint, subscription, new Date().toISOString()]);
            res.json({ ok: true });
        } catch { res.status(500).json({ error: "Hiba" }); }
    });

    return router;
}

module.exports = { createApiRouter };
