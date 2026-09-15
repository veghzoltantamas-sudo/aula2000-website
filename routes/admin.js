/**
 * Aula 2000 — Adminisztrációs route-ok
 * =====================================================
 * A /admin és /admin/api útvonalakat tartalmazza.
 *
 * A modul egy factory függvényt exportál (createAdminRouter),
 * ami a server.js-ben definiált közös függőségeket kapja meg
 * (db, validátorok, multer, képkezelés, beállítások stb.),
 * és visszaad egy express.Router példányt.
 *
 * A router a server.js-ben: app.use('/admin', createAdminRouter({...}))
 * -ként van becsatolva, ezért a belső útvonalak NEM tartalmazzák
 * a '/admin' előtagot (pl. "/" → /admin, "/update-content" → /admin/update-content).
 *
 * Megjegyzés: A /admin-login, /login, /logout belépés/kilépés útvonalak
 * a server.js-ben maradnak (auth folyamat, nem admin kezelő).
 */
const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const { requireLogin, requireAdmin, requireNotViewer, requireCsrf } = require("../middleware/auth");
const { broadcastLimiter } = require("../middleware/rateLimiters");

/**
 * @param {object} deps — a server.js-ből átadott közös függőségek:
 *   {
 *     dbGet, dbAll, dbRun,            // async DB segédek
 *     messageStatus, leadStatuses,    // CRM állapot segédek
 *     leadStatus,
 *     upload, ALLOWED_MIME,           // multer + MIME whitelist
 *     processAndSaveImage, deleteImage,
 *     getSettingsMap, updateSettingsMap, invalidateContentCache,
 *     slugify, activityLog, bcrypt,
 *     getMailTransport,
 *     dataDir                         // abszolút út a data/ mappához (DB backup)
 *   }
 * @returns {express.Router}
 */
function createAdminRouter(deps) {
    const router = express.Router();

    const {
        db, dbGet, dbAll, dbRun,
        messageStatus, leadStatuses, leadStatus,
        upload, ALLOWED_MIME, processAndSaveImage, deleteImage,
        getSettingsMap, updateSettingsMap, invalidateContentCache, getContentMap,
        slugify, activityLog, bcrypt,
        getMailTransport,
        sendNotificationEmail,
        sanitizeHtml,
        dataDir,
        clientMod, formatClientBody: fmtClientBody, CLIENT_DIR, clientUpload
    } = deps;

    /* FAQ válasz: egyszerű szöveg → formázott HTML
       Támogatott formátumok:
       - **félkövér** → <strong>
       - *dőlt* → <em>
       - - lista elem → <ul><li>
       - 1. számozott elem → <ol><li>
       - üres sor → bekezdés törés
    */
    function formatFaqAnswer(text) {
        const lines = String(text || '').split(/\r?\n/);
        const html = [];
        let listType = null;

        const closeList = () => {
            if (listType) {
                html.push(`</${listType}>`);
                listType = null;
            }
        };

        const inline = (s) => {
            let out = s
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/\*([^*]+)\*/g, '<em>$1</em>')
                .replace(/`([^`]+)`/g, '<code>$1</code>');
            return out;
        };

        for (const raw of lines) {
            const line = raw.trimEnd();
            if (!line.trim() && !listType) { html.push('<p></p>'); continue; }
            if (!line.trim()) { closeList(); continue; }

            const ulMatch = line.match(/^\s*[-•]\s+(.+)/);
            const olMatch = line.match(/^\s*\d+[.)]\s+(.+)/);
            const hMatch = line.match(/^(#{2,3})\s+(.+)/);

            if (ulMatch) {
                if (listType !== 'ul') { closeList(); listType = 'ul'; html.push('<ul>'); }
                html.push(`<li>${inline(ulMatch[1])}</li>`);
            } else if (olMatch) {
                if (listType !== 'ol') { closeList(); listType = 'ol'; html.push('<ol>'); }
                html.push(`<li>${inline(olMatch[1])}</li>`);
            } else if (hMatch) {
                closeList();
                const lvl = hMatch[1].length === 3 ? 'h3' : 'h2';
                html.push(`<${lvl}>${inline(hMatch[2])}</${lvl}>`);
            } else {
                closeList();
                html.push(`<p>${inline(line)}</p>`);
            }
        }
        closeList();
        return sanitizeHtml(html.join(''));
    }

    /* ============================================================
       ADMIN DASHBOARD
       ============================================================ */
    router.get("/", requireLogin, async (req, res, next) => {
        try {
            const content = await getContentMap();
            const today = new Date().toISOString().slice(0, 10);

            const msgPage = Math.max(1, parseInt(req.query.msgPage) || 1);
            const msgPageSize = 15;
            const msgOffset = (msgPage - 1) * msgPageSize;

            const logPage = Math.max(1, parseInt(req.query.logPage) || 1);
            const logPageSize = 25;
            const logOffset = (logPage - 1) * logPageSize;

            const logSearch = String(req.query.logSearch || '').trim().toLowerCase();
            const logStatus = String(req.query.logStatus || '').trim();
            const requestedLogFilter = String(req.query.logFilter || 'all');

            // Napló SQL szűrő feltételek
            const logConditions = [];
            const logParams = [];
            if (requestedLogFilter !== 'all') {
                logConditions.push("level = ?");
                logParams.push(requestedLogFilter);
            }
            if (logStatus) {
                logConditions.push("status = ?");
                logParams.push(logStatus);
            }
            if (logSearch) {
                logConditions.push("(LOWER(action) LIKE ? OR LOWER(method) LIKE ? OR LOWER(url) LIKE ? OR LOWER(message) LIKE ? OR LOWER(details) LIKE ?)");
                const searchPattern = `%${logSearch}%`;
                logParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
            }
            const logWhere = logConditions.length > 0 ? `WHERE ${logConditions.join(' AND ')}` : '';

            // Párhuzamos lekérdezések — az admin dashboard ~16 db lekérdezése korábban
            // szekvenciálisan futott (több száz ms késleltetés). Promise.all-ban egy roundra
            // csökken az idő kb. a leglassabb lekérdezés idejére.
            const [
                messagesRaw, messagesCountRes, schemaEntries, quoteRequestsRaw, projects, allImages,
                users, pages, settings, testimonials, partners,
                totalViews, todayViews, uniqueVisitors, topPages, dailyViews,
                newsletterCount, newsletterSubscribers, blogPosts,
                activityLogs, activityLogsCountRes, services, workflows,
                beforeAfterItems,
                clientUsers, clientUpdates, clientFiles
            ] = await Promise.all([
                dbAll(`SELECT * FROM messages ORDER BY CASE WHEN priority='important' THEN 0 WHEN is_read=0 THEN 1 ELSE 2 END, id DESC LIMIT ? OFFSET ?`, [msgPageSize, msgOffset]),
                dbGet("SELECT COUNT(*) as c FROM messages").catch(() => ({ c: 0 })),
                dbAll("SELECT * FROM schema_entries ORDER BY sort_order ASC, id DESC"),
                dbAll("SELECT * FROM quote_requests ORDER BY id DESC"),
                dbAll("SELECT * FROM projects ORDER BY id DESC"),
                dbAll("SELECT * FROM project_images"),
                dbAll("SELECT id, username, role FROM users"),
                dbAll("SELECT * FROM pages ORDER BY id DESC"),
                getSettingsMap(),
                dbAll("SELECT * FROM testimonials ORDER BY sort_order ASC, id DESC"),
                dbAll("SELECT * FROM partners ORDER BY sort_order ASC, id DESC"),
                dbGet("SELECT COUNT(*) as c FROM analytics").catch(() => ({ c: 0 })),
                dbGet("SELECT COUNT(*) as c FROM analytics WHERE date = ?", [today]).catch(() => ({ c: 0 })),
                dbGet("SELECT COUNT(DISTINCT ip) as c FROM analytics").catch(() => ({ c: 0 })),
                dbAll("SELECT page, COUNT(*) as views FROM analytics GROUP BY page ORDER BY views DESC LIMIT 5").catch(() => []),
                dbAll("SELECT date, COUNT(*) as views FROM analytics GROUP BY date ORDER BY date DESC LIMIT 14").catch(() => []),
                dbGet("SELECT COUNT(*) as c FROM newsletter_subscribers WHERE is_active = 1").catch(() => ({ c: 0 })),
                dbAll("SELECT * FROM newsletter_subscribers ORDER BY subscribed_at DESC LIMIT 50").catch(() => []),
                dbAll("SELECT * FROM blog_posts ORDER BY id DESC").catch(() => []),
                dbAll(`SELECT * FROM activity_logs ${logWhere} ORDER BY id DESC LIMIT ? OFFSET ?`, [...logParams, logPageSize, logOffset]).catch(() => []),
                dbGet(`SELECT COUNT(*) as c FROM activity_logs ${logWhere}`, logParams).catch(() => ({ c: 0 })),
                dbAll("SELECT * FROM services ORDER BY sort_order ASC, id DESC").catch(() => []),
                dbAll("SELECT * FROM workflows ORDER BY sort_order ASC, id DESC").catch(() => []),
                dbAll("SELECT * FROM before_after ORDER BY sort_order ASC, id DESC").catch(() => []),
                dbAll("SELECT * FROM client_users ORDER BY id DESC").catch(() => []),
                dbAll("SELECT * FROM client_project_updates ORDER BY id DESC").catch(() => []),
                dbAll("SELECT * FROM client_files ORDER BY id DESC").catch(() => [])
            ]);

            const totalMessages = messagesCountRes?.c || 0;
            const totalMessagePages = Math.ceil(totalMessages / msgPageSize) || 1;

            const totalLogs = activityLogsCountRes?.c || 0;
            const totalLogPages = Math.ceil(totalLogs / logPageSize) || 1;

            const messages = messagesRaw.map((m) => {
                const status = messageStatus(m);
                return { ...m, status: status.key, statusLabel: status.label, pipelineStatus: leadStatus(m.pipeline_status) };
            });
            const quoteRequests = quoteRequestsRaw.map(q => ({
                ...q, status: leadStatus(q.status), statusLabel: leadStatuses[leadStatus(q.status)]
            }));
            const crmLeads = [
                ...quoteRequests.map(q => ({ ...q, leadType: 'quote', leadTypeLabel: 'Konfigurátor', created: q.created_at, summary: [q.service_type, q.budget, q.timeline].filter(Boolean).join(' · ') })),
                ...messages.map(m => ({ ...m, leadType: 'message', leadTypeLabel: 'Kapcsolat', created: m.date, summary: m.message }))
            ].sort((a, b) => String(b.created).localeCompare(String(a.created)));
            const pipelineSummary = Object.keys(leadStatuses).map(status => ({
                status, label: leadStatuses[status],
                count: crmLeads.filter(lead => lead.status === status || lead.pipelineStatus === status).length
            }));
            const unreadMessages = messages.filter(m => Number(m.is_read) !== 1).length;
            const importantMessages = messages.filter(m => String(m.priority || '').toLowerCase() === 'important').length;
            const latestMessage = messages[0] || null;

            const emailTemplates = await dbAll("SELECT * FROM email_templates ORDER BY id DESC").catch(() => []);
            const currentLogFilter = requestedLogFilter;
            const currentLogStatus = logStatus;
            const currentLogSearch = logSearch;
            const currentLogPage = logPage;
            const currentMsgPage = msgPage;
            const filteredActivityLogs = activityLogs;
            const backupDir = path.join(dataDir, 'backups');
            const backupNames = await fs.readdir(backupDir).catch(() => []);
            const backups = (await Promise.all(backupNames.filter(name => /^auto-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name)).map(async (name) => {
                try {
                    const backupPath = path.join(backupDir, name);
                    const stat = await fs.stat(backupPath);
                    const header = await fs.open(backupPath, 'r');
                    const buffer = Buffer.alloc(16);
                    await header.read(buffer, 0, 16, 0);
                    await header.close();
                    return { name, size: stat.size, createdAt: stat.mtime.toISOString(), valid: buffer.toString('utf8') === 'SQLite format 3\0' };
                } catch { return null; }
            }))).filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

            // Média könyvtár — fájlok listázása
            let mediaFiles = [];
            const currentTab = req.query.tab || 'content';
            console.log("DEBUG: Current tab:", currentTab);
            
            try {
                const uploadPath = path.join(__dirname, "../public/uploads");
                const files = await fs.readdir(uploadPath);
                for (const file of files) {
                    if (file.startsWith('.')) continue;
                    const stat = await fs.stat(path.join(uploadPath, file));
                    mediaFiles.push({
                        name: file,
                        size: stat.size,
                        createdAt: stat.mtime
                    });
                }
                mediaFiles.sort((a, b) => b.createdAt - a.createdAt);
                console.log("DEBUG: Found media files:", mediaFiles.length);
            } catch (e) {
                console.error("Hiba a média könyvtár olvasásakor:", e);
            }

            res.render("admin", {
                content,
                projects,
                allImages,
                messages,
                unreadMessages,
                importantMessages,
                latestMessage,
                msgPage: currentMsgPage,
                totalMessages,
                totalMessagePages,
                users,
                pages,
                services,
                workflows,
                settings,
                testimonials,
                partners,
                schemaEntries,
                quoteRequests,
                crmLeads,
                pipelineSummary,
                emailTemplates,
                userRole: req.session.userRole || 'admin',
                currentUsername: req.session.username || '',
                tab: req.query.tab || "content",
                analytics: { totalViews: totalViews?.c || 0, todayViews: todayViews?.c || 0, uniqueVisitors: uniqueVisitors?.c || 0, topPages, dailyViews },
                newsletterCount: newsletterCount?.c || 0,
                newsletterSubscribers,
                blogPosts,
                mediaFiles,
                // Activity logs
                activityLogs: filteredActivityLogs.map(l => ({
                    ...l,
                    levelClass: l.level === 'error' ? 'danger' : l.level === 'warn' ? 'warning' : l.level === 'upload' ? 'info' : 'secondary',
                    levelIcon: l.level === 'error' ? 'fa-circle-exclamation' : l.level === 'warn' ? 'fa-triangle-exclamation' : l.level === 'upload' ? 'fa-cloud-arrow-up' : 'fa-circle-info'
                })),
                logFilter: requestedLogFilter,
                logSearch: req.query.logSearch || '',
                logStatus,
                logPage: currentLogPage,
                totalLogs,
                totalLogPages,
                backups,
                beforeAfterItems: beforeAfterItems || [],
                clientUsers: clientUsers || [],
                clientUpdates: clientUpdates || [],
                clientFiles: clientFiles || []
            });
        } catch (err) { next(err); }
    });

    /* ============================================================
       TARTALOM ÉS BEÁLLÍTÁSOK
       ============================================================ */
    router.post("/update-content", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            // Kizárólag az engedélyezett tartalmi szekciókat mentjük — a _csrf mező és egyéb
            // idegen kulcsok nem kerülhetnek az adatbázisba (korábban a req.body összes kulcsát
            // beszúrta, így a CSRF token is szennyezte a content táblát).
            const allowedSections = [
                "site_title", "brand_line", "brand_slogan", "brand_mark_text",
                "hero_title", "hero_badge", "hero_intro_primary", "hero_intro_secondary",
                "hero_subtitle", "hero_button_text", "hero_button_link",
                "hero_secondary_button_text", "hero_secondary_button_link",
                "hero_tertiary_button_text", "hero_tertiary_button_link",
                "about_title", "about_text",
                "contact_phone", "contact_email", "contact_address",
                "feature1_title", "feature1_desc", "feature2_title", "feature2_desc",
                "feature3_title", "feature3_desc"
            ];
            const entries = Object.entries(req.body).filter(([key]) => allowedSections.includes(key));
            const queries = entries.map(([key, value]) =>
                dbRun("INSERT OR REPLACE INTO content (section, body) VALUES (?, ?)", [key, value])
            );
            await Promise.all(queries);
            invalidateContentCache(); // tartalom cache invalidálása
            res.redirect("/admin?tab=content&msg=Mentve");
        } catch (err) { next(err); }
    });

    router.post("/update-settings", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            const moduleName = ['marketing', 'pwa', 'smtp', 'settings', 'compliance'].includes(String(req.body.module || '')) ? String(req.body.module) : 'marketing';
            await updateSettingsMap({
                company_name: req.body.company_name,
                company_short_name: req.body.company_short_name,
                company_description: req.body.company_description,
                business_address: req.body.business_address,
                business_opening_hours: req.body.business_opening_hours,
                whatsapp_number: req.body.whatsapp_number,
                whatsapp_message: req.body.whatsapp_message,
                facebook_url: req.body.facebook_url,
                instagram_url: req.body.instagram_url,
                youtube_url: req.body.youtube_url,
                seo_description: req.body.seo_description,
                seo_keywords: req.body.seo_keywords,
                hero_image_url: req.body.hero_image_url,
                about_image_url: req.body.about_image_url,
                stat_years: req.body.stat_years,
                stat_projects: req.body.stat_projects,
                stat_response_hours: req.body.stat_response_hours,
                mail_host: req.body.mail_host,
                mail_port: req.body.mail_port,
                mail_user: req.body.mail_user,
                mail_pass: req.body.mail_pass,
                mail_from: req.body.mail_from,
                mail_to: req.body.mail_to,
                pwa_name: req.body.pwa_name,
                pwa_short_name: req.body.pwa_short_name,
                pwa_theme_color: req.body.pwa_theme_color,
                pwa_background_color: req.body.pwa_background_color,
                pwa_display: req.body.pwa_display,
                promo_active: req.body.promo_active ? '1' : '0',
                promo_end_date: req.body.promo_end_date,
                brand_primary_color: req.body.brand_primary_color,
                brand_secondary_color: req.body.brand_secondary_color,
                enable_dark_mode: req.body.enable_dark_mode ? '1' : '0',
                enable_gallery_filter: req.body.enable_gallery_filter ? '1' : '0',
                enable_faq: req.body.enable_faq ? '1' : '0',
                enable_floating_contact: req.body.enable_floating_contact ? '1' : '0',
                faq_items: (() => {
                    try {
                        const parsed = JSON.parse(String(req.body.faq_items || '[]'));
                        if (!Array.isArray(parsed)) return '[]';
                        return JSON.stringify(parsed
                            .filter(item => item && item.question && item.answer)
                            .slice(0, 20)
                            .map(item => ({
                                question: String(item.question).trim(),
                                answer: formatFaqAnswer(String(item.answer))
                            })));
                    } catch { return '[]'; }
                })(),
                vapid_public_key: req.body.vapid_public_key,
                vapid_private_key: req.body.vapid_private_key,
                sitemap_base_url: req.body.sitemap_base_url,
                // GDPR / Compliance beállítások
                cookie_consent_enabled: req.body.cookie_consent_enabled ? '1' : '0',
                cookie_consent_text: req.body.cookie_consent_text,
                cookie_consent_button_text: req.body.cookie_consent_button_text,
                cookie_consent_decline_text: req.body.cookie_consent_decline_text,
                cookie_consent_link_text: req.body.cookie_consent_link_text,
                cookie_consent_link_url: req.body.cookie_consent_link_url,
                newsletter_gdpr_label: req.body.newsletter_gdpr_label,
                newsletter_gdpr_enabled: req.body.newsletter_gdpr_enabled ? '1' : '0',
                privacy_policy_url: req.body.privacy_policy_url,
                company_legal_name: req.body.company_legal_name,
                company_reg_number: req.body.company_reg_number,
                company_tax_number: req.body.company_tax_number,
                company_data_contact: req.body.company_data_contact,
                // Előtte/Utána szekció beállítások
                before_after_enabled: req.body.before_after_enabled ? '1' : '0',
                before_after_section_title: req.body.before_after_section_title,
                before_after_section_subtitle: req.body.before_after_section_subtitle
            });
            res.redirect(`/admin?tab=${moduleName}&msg=Mentve`);
        } catch (err) { next(err); }
    });

    // Beállítási képek kezelése: hero háttér + 'Építész Iroda' galéria kép
    // Feltöltés / csere: kiválasztott fájlt webp-be menti, a régi upload fájlt törli.
    const SITE_IMAGE_FIELDS = { hero: 'hero_image_url', about: 'about_image_url' };

    router.post("/site-image/:field", requireLogin, requireNotViewer, upload.single('image'), requireCsrf, async (req, res, next) => {
        try {
            const fieldKey = SITE_IMAGE_FIELDS[req.params.field];
            if (!fieldKey) return res.redirect("/admin?tab=marketing&msg=Ismeretlen");
            if (!req.file || !ALLOWED_MIME.has(String(req.file.mimetype || '').toLowerCase())) {
                return res.redirect("/admin?tab=marketing&msg=Csak_kepfajl");
            }
            const filename = await processAndSaveImage(req.file);
            const url = '/uploads/' + filename;
            const settings = await getSettingsMap();
            const oldUrl = settings[fieldKey];
            if (oldUrl && oldUrl.startsWith('/uploads/')) {
                await deleteImage(path.basename(oldUrl));
            }
            await updateSettingsMap({ [fieldKey]: url });
            res.redirect("/admin?tab=marketing&msg=Kep_feltoltve");
        } catch (err) { next(err); }
    });

    router.post("/delete-site-image/:field", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            const fieldKey = SITE_IMAGE_FIELDS[req.params.field];
            if (!fieldKey) return res.redirect("/admin?tab=marketing&msg=Ismeretlen");
            const settings = await getSettingsMap();
            const oldUrl = settings[fieldKey];
            if (oldUrl && oldUrl.startsWith('/uploads/')) {
                await deleteImage(path.basename(oldUrl));
            }
            await updateSettingsMap({ [fieldKey]: '' });
            res.redirect("/admin?tab=marketing&msg=Kep_torolve");
        } catch (err) { next(err); }
    });

    /**
     * Médiafájl törlése a fizikai tárhelyről
     * POST /admin/media/delete
     */
    router.post("/media/delete", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            const { filename } = req.body;
            if (!filename) return res.status(400).send("Hiányzó fájlnév!");

            // Alapvető biztonsági ellenőrzés (ne lehessen kilépni az uploads mappából)
            if (filename.includes('/') || filename.includes('\\') || filename.startsWith('..')) {
                return res.status(403).send("Érvénytelen fájlnév!");
            }

            const filePath = path.join(__dirname, "../public/uploads", filename);
            await fs.unlink(filePath).catch(e => console.log("Fájl már törölve vagy nem létezik:", filename));

            await activityLog(req, 'delete', `/admin/media/delete`, `Fájl törölve: ${filename}`, 'info');

            res.redirect("/admin?msg=success&tab=media");
        } catch (err) { next(err); }
    });

    /**
     * Új médiafájl feltöltése
     * POST /admin/media/upload
     */
    router.post("/media/upload", requireLogin, requireNotViewer, upload.single('image'), requireCsrf, async (req, res, next) => {
        try {
            if (!req.file) return res.redirect("/admin?tab=media&msg=Nincs_fajl");
            
            const filename = await processAndSaveImage(req.file);
            await activityLog(req, 'upload', `/admin/media/upload`, `Új fájl feltöltve: ${filename}`, 'info');
            
            res.redirect("/admin?msg=success&tab=media");
        } catch (err) { next(err); }
    });

    /* ============================================================
       OLDALAK (pages)
       ============================================================ */
    router.post("/page-create", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            const title = String(req.body.title || '').trim();
            const pageContent = String(req.body.page_content || '[]');
            const status = ['draft', 'published'].includes(String(req.body.status || 'draft')) ? String(req.body.status) : 'draft';
            if (!title) {
                return res.redirect("/admin?tab=pages&msg=Hiba_oldal_cim");
            }
            const slug = slugify(req.body.slug || title);
            const current = await dbGet("SELECT id FROM pages WHERE slug=?", [slug]);
            const finalSlug = current ? `${slug}-${Date.now()}` : slug;

            await dbRun(
                "INSERT INTO pages (title, slug, status, content_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                [title, finalSlug, status, pageContent, new Date().toISOString(), new Date().toISOString()]
            );
            res.redirect("/admin?tab=pages&msg=Oldal_letrehozva");
        } catch (err) { next(err); }
    });

    router.post("/page-update/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            const title = String(req.body.title || '').trim();
            const slug = slugify(req.body.slug || title);
            const status = ['draft', 'published'].includes(String(req.body.status || 'draft')) ? String(req.body.status) : 'draft';
            const pageContent = String(req.body.page_content || '[]');

            if (!title) {
                return res.redirect("/admin?tab=pages&msg=Hiba_oldal_cim");
            }

            const existing = await dbGet("SELECT * FROM pages WHERE id=?", [req.params.id]);
            if (!existing) {
                return res.redirect("/admin?tab=pages&msg=Oldal_nem_letezik");
            }

            const duplicate = await dbGet("SELECT id FROM pages WHERE slug=? AND id!=?", [slug, req.params.id]);
            const finalSlug = duplicate ? `${slug}-${Date.now()}` : slug;

            await dbRun(
                "UPDATE pages SET title=?, slug=?, status=?, content_json=?, updated_at=? WHERE id=?",
                [title, finalSlug, status, pageContent, new Date().toISOString(), req.params.id]
            );
            res.redirect("/admin?tab=pages&msg=Oldal_frissitve");
        } catch (err) { next(err); }
    });

    router.post("/page-delete/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            await dbRun("DELETE FROM pages WHERE id=?", [req.params.id]);
            res.redirect("/admin?tab=pages&msg=Oldal_torolve");
        } catch (err) { next(err); }
    });

    /* ============================================================
       SCHEMA (SEO)
       ============================================================ */
    router.post("/schema-create", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            const name = String(req.body.name || '').trim();
            const type = String(req.body.type || 'Thing').trim() || 'Thing';
            const dataJson = String(req.body.data_json || '').trim();
            if (!name || !dataJson) {
                return res.redirect("/admin?tab=schema&msg=Schema_hiba");
            }

            JSON.parse(dataJson);
            const orderRow = await dbGet("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM schema_entries");
            await dbRun(
                "INSERT INTO schema_entries (name, type, data_json, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [name, type, dataJson, req.body.is_active ? 1 : 0, orderRow.next_order, new Date().toISOString(), new Date().toISOString()]
            );
            res.redirect("/admin?tab=schema&msg=Schema_letrehozva");
        } catch {
            res.redirect("/admin?tab=schema&msg=Schema_hiba");
        }
    });

    router.post("/schema-update/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            const name = String(req.body.name || '').trim();
            const type = String(req.body.type || 'Thing').trim() || 'Thing';
            const dataJson = String(req.body.data_json || '').trim();
            if (!name || !dataJson) {
                return res.redirect("/admin?tab=schema&msg=Schema_hiba");
            }

            JSON.parse(dataJson);
            await dbRun(
                "UPDATE schema_entries SET name=?, type=?, data_json=?, is_active=?, updated_at=? WHERE id=?",
                [name, type, dataJson, req.body.is_active ? 1 : 0, new Date().toISOString(), req.params.id]
            );
            res.redirect("/admin?tab=schema&msg=Schema_frissitve");
        } catch {
            res.redirect("/admin?tab=schema&msg=Schema_hiba");
        }
    });

    router.post("/schema-delete/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            await dbRun("DELETE FROM schema_entries WHERE id=?", [req.params.id]);
            res.redirect("/admin?tab=schema&msg=Schema_torolve");
        } catch (err) { next(err); }
    });

    /* ============================================================
       FELHASZNÁLÓK (users)
       ============================================================ */
    router.post("/add-user", requireAdmin, async (req, res, next) => {
        try {
            const { new_username, new_password } = req.body;
            const role = ['admin', 'editor', 'viewer'].includes(req.body.role) ? req.body.role : 'editor';
            if (!new_username || !new_password || new_password.length < 8) return res.redirect("/admin?tab=users&msg=Jelszo_min_8_karakter");
            await dbRun("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [new_username, bcrypt.hashSync(new_password, 10), role]);
            res.redirect("/admin?tab=users&msg=Felhasznalo_hozzaadva");
        } catch { res.redirect("/admin?tab=users&msg=Hiba_Foglal_Nev"); }
    });

    router.post("/update-user-role/:id", requireAdmin, async (req, res, next) => {
        try {
            const role = ['admin', 'editor', 'viewer'].includes(req.body.role) ? req.body.role : 'editor';
            const target = await dbGet("SELECT id, role FROM users WHERE id=?", [req.params.id]);
            if (!target) return res.redirect("/admin?tab=users&msg=Hiba_Felhasznalo");
            // Az utolsó admin ne veszítse el az admin jogát (hogy ne zárjuk ki magunkat)
            if (target.role === 'admin' && req.session.userId == req.params.id && role !== 'admin') {
                return res.redirect("/admin?tab=users&msg=Sajat_admin_jog_nem_elvetheto");
            }
            await dbRun("UPDATE users SET role=? WHERE id=?", [role, req.params.id]);
            res.redirect("/admin?tab=users&msg=Role_frissitve");
        } catch (err) { next(err); }
    });

    router.post("/del-user/:id", requireAdmin, async (req, res, next) => {
        try {
            const countRow = await dbGet("SELECT COUNT(*) as c FROM users");
            if (countRow.c <= 1) return res.redirect("/admin?tab=users&msg=Utolso_felhasznalo_nem_torolheto");
            await dbRun("DELETE FROM users WHERE id=?", [req.params.id]);
            res.redirect("/admin?tab=users&msg=Torolve");
        } catch (err) { next(err); }
    });

    /* ============================================================
       PROJEKTEK
       ============================================================ */
    router.post("/add-project", requireLogin, requireNotViewer, upload.fields([{name:"cover", maxCount:1}, {name:"gallery", maxCount:15}]), requireCsrf, async (req, res, next) => {
        const t0 = Date.now();
        try {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
            const coverFilename = (req.files['cover'] && req.files['cover'][0]) ? await processAndSaveImage(req.files['cover'][0]) : "";
            const result = await dbRun("INSERT INTO projects (title, category, description, cover, is_featured, client, location, project_year, duration, materials, challenge, solution, result, testimonial) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
                req.body.title, req.body.category, req.body.description, coverFilename, req.body.is_featured ? 1 : 0,
                req.body.client, req.body.location, req.body.project_year, req.body.duration, req.body.materials,
                req.body.challenge, req.body.solution, req.body.result, req.body.testimonial
            ]);
            const galleryCount = req.files['gallery'] ? req.files['gallery'].length : 0;
            if (req.files['gallery']) {
                const galleryFiles = req.files['gallery'];
                // Párhuzamos sharp feldolgozás korlátos konkurenciával (3-asával) — a szekvenciális
                // konverzió 15 képnél több másodpercig is tarthatott volna.
                const CONCURRENCY = 3;
                for (let i = 0; i < galleryFiles.length; i += CONCURRENCY) {
                    const batch = galleryFiles.slice(i, i + CONCURRENCY);
                    const filenames = await Promise.all(batch.map(img => processAndSaveImage(img)));
                    for (let j = 0; j < batch.length; j++) {
                        await dbRun("INSERT INTO project_images (project_id, filename) VALUES (?,?)", [result.lastID, filenames[j]]);
                    }
                }
            }
            const coverSize = (req.files['cover'] && req.files['cover'][0]) ? req.files['cover'][0].size : 0;
            const galleryTotal = req.files['gallery'] ? req.files['gallery'].reduce((s, f) => s + (f.size || 0), 0) : 0;
            await activityLog({ level: 'upload', action: 'add-project', ip, method: 'POST', url: '/admin/add-project', status: 200, message: 'Projekt létrehozva: ' + (req.body.title || ''), details: { projectId: result.lastID, cover: coverFilename || null, galleryCount, coverSize, galleryTotal, title: req.body.title }, duration_ms: Date.now() - t0 });
            res.redirect("/admin?tab=projects&msg=Feltoltve");
        } catch (err) {
            await activityLog({ level: 'error', action: 'add-project', ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '', method: 'POST', url: '/admin/add-project', status: 500, message: err.message || String(err), details: { files: Object.keys(req.files || {}), bodyKeys: Object.keys(req.body || {}) }, duration_ms: Date.now() - t0 });
            res.redirect("/admin?tab=projects&msg=Hiba");
        }
    });

    router.post("/del-project/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            const id = req.params.id;
            const images = await dbAll("SELECT filename FROM project_images WHERE project_id=?", [id]);
            for (const img of images) await deleteImage(img.filename);
            const project = await dbGet("SELECT cover FROM projects WHERE id=?", [id]);
            if (project) await deleteImage(project.cover);

            await dbRun("DELETE FROM project_images WHERE project_id=?", [id]);
            await dbRun("DELETE FROM projects WHERE id=?", [id]);
            res.redirect("/admin?tab=projects&msg=Torolve");
        } catch (err) { next(err); }
    });

    router.post("/project-edit/:id", requireLogin, requireNotViewer, upload.single('cover'), requireCsrf, async (req, res, next) => {
        try {
            const id = req.params.id;
            const title = (req.body.title || '').trim();
            const category = (req.body.category || '').trim();
            const description = (req.body.description || '').trim();
            const isFeatured = req.body.is_featured ? 1 : 0;

            if (!title || !category) {
                return res.redirect("/admin?tab=projects&msg=Hiba_kitoltese");
            }

            if (req.file) {
                const newCover = await processAndSaveImage(req.file);
                const old = await dbGet("SELECT cover FROM projects WHERE id=?", [id]);
                if (old) await deleteImage(old.cover);
                await dbRun("UPDATE projects SET title=?, category=?, description=?, is_featured=?, cover=?, client=?, location=?, project_year=?, duration=?, materials=?, challenge=?, solution=?, result=?, testimonial=? WHERE id=?", [title, category, description, isFeatured, newCover, req.body.client, req.body.location, req.body.project_year, req.body.duration, req.body.materials, req.body.challenge, req.body.solution, req.body.result, req.body.testimonial, id]);
            } else {
                await dbRun("UPDATE projects SET title=?, category=?, description=?, is_featured=?, client=?, location=?, project_year=?, duration=?, materials=?, challenge=?, solution=?, result=?, testimonial=? WHERE id=?", [title, category, description, isFeatured, req.body.client, req.body.location, req.body.project_year, req.body.duration, req.body.materials, req.body.challenge, req.body.solution, req.body.result, req.body.testimonial, id]);
            }
            res.redirect("/admin?tab=projects&msg=Frissitve");
        } catch (err) { next(err); }
    });

    router.post("/add-subimages/:id", requireLogin, requireNotViewer, upload.array('new_images', 15), requireCsrf, async (req, res, next) => {
        const t0 = Date.now();
        try {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
            const files = req.files || [];
            const fileCount = files.length;
            const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);
            const filenames = [];
            // Párhuzamos konverzió korlátos konkurenciával — a szekvenciális sharp feldolgozás
            // 15 képnél több másodperces késleltetést okozott.
            const CONCURRENCY = 3;
            for (let i = 0; i < files.length; i += CONCURRENCY) {
                const batch = files.slice(i, i + CONCURRENCY);
                const batchNames = await Promise.all(batch.map(img => processAndSaveImage(img)));
                for (let j = 0; j < batch.length; j++) {
                    await dbRun("INSERT INTO project_images (project_id, filename) VALUES (?,?)", [req.params.id, batchNames[j]]);
                    filenames.push(batchNames[j]);
                }
            }
            await activityLog({ level: 'upload', action: 'add-subimages', ip, method: 'POST', url: '/admin/add-subimages/' + req.params.id, status: 200, message: fileCount + ' kép feltöltve a ' + req.params.id + '. projekthez', details: { projectId: req.params.id, fileCount, totalSize, filenames }, duration_ms: Date.now() - t0 });
            res.redirect("/admin?tab=projects&msg=Feltoltve");
        } catch (err) {
            await activityLog({ level: 'error', action: 'add-subimages', ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '', method: 'POST', url: '/admin/add-subimages/' + req.params.id, status: 500, message: err.message || String(err), details: { fileCount: (req.files || []).length, projectId: req.params.id }, duration_ms: Date.now() - t0 });
            res.redirect("/admin?tab=projects&msg=Hiba");
        }
    });

    router.post("/replace-subimage/:id", requireLogin, requireNotViewer, upload.single('subimage'), requireCsrf, async (req, res, next) => {
        if (!req.file) return res.redirect("/admin?tab=projects");
        try {
            const newFilename = await processAndSaveImage(req.file);
            const old = await dbGet("SELECT filename FROM project_images WHERE id=?", [req.params.id]);
            if (old) await deleteImage(old.filename);
            await dbRun("UPDATE project_images SET filename=? WHERE id=?", [newFilename, req.params.id]);
            res.redirect("/admin?tab=projects&msg=Frissitve");
        } catch { res.redirect("/admin?tab=projects&msg=Hiba"); }
    });

    router.post("/del-subimage/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            const img = await dbGet("SELECT filename FROM project_images WHERE id=?", [req.params.id]);
            if (img) await deleteImage(img.filename);
            await dbRun("DELETE FROM project_images WHERE id=?", [req.params.id]);
            res.redirect("/admin?tab=projects&msg=Torolve");
        } catch (err) { next(err); }
    });

    /* ============================================================
       VÉLEMÉNYEK (testimonials)
       ============================================================ */
    router.post("/add-testimonial", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            const author = String(req.body.author || '').trim();
            const role = String(req.body.role || '').trim();
            const content = String(req.body.content || '').trim();
            const rating = Math.max(1, Math.min(5, Number(req.body.rating) || 5));
            const avatar = String(req.body.avatar || '').trim();
            const isActive = req.body.is_active ? 1 : 0;

            if (!author || !content) {
                return res.redirect("/admin?tab=testimonials&msg=Hiba_kitoltese");
            }

            const orderRow = await dbGet("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM testimonials");
            await dbRun(
                "INSERT INTO testimonials (author, role, content, rating, avatar, is_active, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [author, role, content, rating, avatar, isActive, orderRow.next_order, new Date().toISOString()]
            );
            res.redirect("/admin?tab=testimonials&msg=Mentve");
        } catch (err) { next(err); }
    });

    router.post("/update-testimonial/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            const author = String(req.body.author || '').trim();
            const role = String(req.body.role || '').trim();
            const content = String(req.body.content || '').trim();
            const rating = Math.max(1, Math.min(5, Number(req.body.rating) || 5));
            const avatar = String(req.body.avatar || '').trim();
            const isActive = req.body.is_active ? 1 : 0;

            if (!author || !content) {
                return res.redirect("/admin?tab=testimonials&msg=Hiba_kitoltese");
            }

            await dbRun(
                "UPDATE testimonials SET author=?, role=?, content=?, rating=?, avatar=?, is_active=? WHERE id=?",
                [author, role, content, rating, avatar, isActive, req.params.id]
            );
            res.redirect("/admin?tab=testimonials&msg=Frissitve");
        } catch (err) { next(err); }
    });

    router.post("/del-testimonial/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            await dbRun("DELETE FROM testimonials WHERE id=?", [req.params.id]);
            res.redirect("/admin?tab=testimonials&msg=Torolve");
        } catch (err) { next(err); }
    });

    /* ============================================================
       ÜZENETEK (messages)
       ============================================================ */
    router.post("/del-msg/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            await dbRun("DELETE FROM messages WHERE id=?", [req.params.id]);
            res.redirect("/admin?tab=messages&msg=Torolve");
        } catch (err) { next(err); }
    });

    router.post("/bulk-messages", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            const ids = (Array.isArray(req.body.ids) ? req.body.ids : [req.body.ids])
                .map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0);
            const action = String(req.body.action || '');
            if (!ids.length || !['read', 'delete'].includes(action)) {
                return res.redirect("/admin?tab=messages&msg=Nincs_kijelolt_uzenet");
            }
            const placeholders = ids.map(() => '?').join(',');
            if (action === 'read') {
                await dbRun(`UPDATE messages SET is_read=1, priority='read' WHERE id IN (${placeholders})`, ids);
            } else {
                await dbRun(`DELETE FROM messages WHERE id IN (${placeholders})`, ids);
            }
            res.redirect("/admin?tab=messages&msg=Mentve");
        } catch (err) { next(err); }
    });

    // CRM LEAD TÖRLÉSE (quote_requests vagy messages)
    router.post("/del-lead/:type/:id", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            const { type, id } = req.params;
            if (type === 'quote') {
                await dbRun("DELETE FROM quote_requests WHERE id=?", [id]);
            } else if (type === 'message') {
                await dbRun("DELETE FROM messages WHERE id=?", [id]);
            } else {
                return res.status(400).send("Érvénytelen lead típus");
            }
            res.redirect("/admin?tab=crm&msg=Lead_torolve");
        } catch (err) { next(err); }
    });

    // ACTIVITY LOG TÖRLÉSE
    router.post("/del-log/:id", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            await dbRun("DELETE FROM activity_logs WHERE id=?", [req.params.id]);
            res.redirect("/admin?tab=logs&msg=Log_torolve");
        } catch (err) { next(err); }
    });

    // MINDEN ACTIVITY LOG TÖRLÉSE (tisztítás)
    router.post("/clear-logs", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            await dbRun("DELETE FROM activity_logs");
            res.redirect("/admin?tab=logs&msg=Logok_torolve");
        } catch (err) { next(err); }
    });

    /* ============================================================
       BLOG KEZELÉS
       ============================================================ */
    router.post("/blog-create", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            const title = String(req.body.title || '').trim();
            const excerpt = String(req.body.excerpt || '').trim();
            const content = String(req.body.content || '').trim();
            const category = String(req.body.category || '').trim();
            const cover = String(req.body.cover || '').trim();
            const status = ['draft', 'published'].includes(req.body.status) ? req.body.status : 'draft';
            if (!title) return res.redirect("/admin?tab=blog&msg=Hiba_cim");
            let slug = slugify(req.body.slug || title);
            const existing = await dbGet("SELECT id FROM blog_posts WHERE slug=?", [slug]);
            if (existing) slug = `${slug}-${Date.now()}`;
            await dbRun("INSERT INTO blog_posts (title, slug, excerpt, content, cover, category, status, author, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                [title, slug, excerpt, content, cover, category, status, req.session.username || 'admin', new Date().toISOString(), new Date().toISOString()]);
            res.redirect("/admin?tab=blog&msg=Blog_letrehozva");
        } catch (err) { next(err); }
    });

    router.post("/blog-update/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            const title = String(req.body.title || '').trim();
            const excerpt = String(req.body.excerpt || '').trim();
            const content = String(req.body.content || '').trim();
            const category = String(req.body.category || '').trim();
            const cover = String(req.body.cover || '').trim();
            const status = ['draft', 'published'].includes(req.body.status) ? req.body.status : 'draft';
            if (!title) return res.redirect("/admin?tab=blog&msg=Hiba_cim");
            let slug = slugify(req.body.slug || title);
            const dup = await dbGet("SELECT id FROM blog_posts WHERE slug=? AND id!=?", [slug, req.params.id]);
            if (dup) slug = `${slug}-${Date.now()}`;
            await dbRun("UPDATE blog_posts SET title=?, slug=?, excerpt=?, content=?, cover=?, category=?, status=?, updated_at=? WHERE id=?",
                [title, slug, excerpt, content, cover, category, status, new Date().toISOString(), req.params.id]);
            res.redirect("/admin?tab=blog&msg=Blog_frissitve");
        } catch (err) { next(err); }
    });

    router.post("/blog-delete/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            await dbRun("DELETE FROM blog_posts WHERE id=?", [req.params.id]);
            res.redirect("/admin?tab=blog&msg=Blog_torolve");
        } catch (err) { next(err); }
    });

    /* ============================================================
       JELSZÓ VÁLTOZTATÁS
       ============================================================ */
    router.post("/change-password", requireLogin, async (req, res, next) => {
        try {
            const { current_password, new_password, confirm_password } = req.body;
            if (!current_password || !new_password) return res.redirect("/admin?tab=users&msg=Hiba_mezo_ures");
            if (new_password.length < 8) return res.redirect("/admin?tab=users&msg=Jelszo_min_8_karakter");
            if (new_password !== confirm_password) return res.redirect("/admin?tab=users&msg=Jelszo_nem_egyezik");
            const user = await dbGet("SELECT * FROM users WHERE id=?", [req.session.userId || 1]);
            if (!user || !bcrypt.compareSync(current_password, user.password)) {
                return res.redirect("/admin?tab=users&msg=Hibas_jelenlegi_jelszo");
            }
            await dbRun("UPDATE users SET password=? WHERE id=?", [bcrypt.hashSync(new_password, 10), user.id]);
            res.redirect("/admin?tab=users&msg=Jelszo_megvaltoztatva");
        } catch (err) { next(err); }
    });

    /* ============================================================
       HÍRLEVÉL
       ============================================================ */
    router.post("/newsletter-send", requireLogin, requireNotViewer, async (req, res, next) => {
        // A küldés ne blokkolja a böngészőt és a szervert — background-ban fut a válasz előtt.
        res.redirect("/admin?tab=newsletter&msg=Kuldes_indult");
        setImmediate(async () => {
            try {
                const subject = String(req.body.subject || '').trim();
                const body = String(req.body.body || '').trim();
                if (!subject || !body) return;
                const subscribers = await dbAll("SELECT email FROM newsletter_subscribers WHERE is_active = 1");
                if (!subscribers.length) return;
                const transport = await getMailTransport();
                if (!transport) return;
                const mailSettings = await getSettingsMap();
                // Korlátos konkurencia (5 párhuzamos) — a nodemailer szekvenciális küldése
                // 500+ feliratkozónál 15-25 perc is lehetne; párhuzamosítva töredékére csökken.
                const POOL_SIZE = 5;
                let i = 0;
                const worker = async () => {
                    while (i < subscribers.length) {
                        const sub = subscribers[i++];
                        try {
                            await transport.sendMail({ from: process.env.MAIL_FROM || mailSettings.mail_from || '', to: sub.email, subject, html: body });
                        } catch (e) { console.error("Hírlevél küldési hiba:", sub.email, e.message); }
                    }
                };
                await Promise.all(Array.from({ length: Math.min(POOL_SIZE, subscribers.length) }, worker));
                console.log("Hírlevél kiküldve:", subscribers.length, "címre");
            } catch (err) { console.error("Hírlevél küldési hiba:", err.message); }
        });
    });

    router.post("/newsletter-delete/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            await dbRun("DELETE FROM newsletter_subscribers WHERE id=?", [req.params.id]);
            res.redirect("/admin?tab=newsletter&msg=Torolve");
        } catch (err) { next(err); }
    });

    /* ============================================================
       ÜZENET / LEAD ÁLLAPOT (CRM)
       ============================================================ */
    router.post("/update-msg-status/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            const nextStatus = String(req.body.status || 'new').toLowerCase();
            if (leadStatuses[nextStatus]) {
                await dbRun("UPDATE messages SET pipeline_status=? WHERE id=?", [nextStatus, req.params.id]);
                return res.redirect("/admin?tab=crm&msg=Frissitve");
            }
            if (!['new', 'read', 'important'].includes(nextStatus)) {
                return res.redirect("/admin?tab=messages&msg=Hiba");
            }

            const isRead = nextStatus === 'read' ? 1 : 0;
            await dbRun("UPDATE messages SET is_read=?, priority=? WHERE id=?", [isRead, nextStatus, req.params.id]);
            res.redirect("/admin?tab=messages&msg=Frissitve");
        } catch (err) { next(err); }
    });

    router.post("/toggle-msg/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            const current = await dbGet("SELECT is_read, priority FROM messages WHERE id=?", [req.params.id]);
            const nextStatus = String(current && current.priority === 'important' ? 'important' : Number(current.is_read) === 1 ? 'new' : 'read');
            const isRead = nextStatus === 'read' ? 1 : 0;
            await dbRun("UPDATE messages SET is_read=?, priority=? WHERE id=?", [isRead, nextStatus, req.params.id]);
            res.redirect("/admin?tab=messages");
        } catch (err) { next(err); }
    });

    // Egységes CRM pipeline a kapcsolatfelvételi és konfigurátoros leadekhez.
    router.post("/update-lead-status/:type/:id", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            const status = leadStatus(req.body.status);
            if (!leadStatuses[req.body.status]) return res.redirect("/admin?tab=crm&msg=Hiba");
            const internalNotes = String(req.body.internal_notes || '').trim().slice(0, 5000);
            if (req.params.type === 'quote') {
                await dbRun("UPDATE quote_requests SET status=?, internal_notes=? WHERE id=?", [status, internalNotes, req.params.id]);
            } else if (req.params.type === 'message') {
                await dbRun("UPDATE messages SET pipeline_status=?, internal_notes=? WHERE id=?", [status, internalNotes, req.params.id]);
            } else {
                return res.redirect("/admin?tab=crm&msg=Hiba");
            }
            res.redirect("/admin?tab=crm&msg=Frissitve");
        } catch (err) { next(err); }
    });

    router.post("/update-quote-status/:id", requireLogin, requireNotViewer, async (req, res, next) => {
        try {
            const status = leadStatus(req.body.status);
            if (!leadStatuses[req.body.status]) return res.redirect("/admin?tab=crm&msg=Hiba");
            await dbRun("UPDATE quote_requests SET status=? WHERE id=?", [status, req.params.id]);
            res.redirect("/admin?tab=crm&msg=Frissitve");
        } catch (err) { next(err); }
    });

    /* ============================================================
       ADMIN API ROUTE-OK (2026-09-05 fejlesztések)
       ============================================================ */

    // --- Galéria képek átrendezése (drag & drop) ---
    router.post("/api/reorder-images", requireLogin, requireNotViewer, requireCsrf, async (req, res) => {
        try {
            const ids = JSON.parse(req.body.ids || "[]");
            if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "No IDs" });
            for (let i = 0; i < ids.length; i++) {
                await dbRun("UPDATE project_images SET sort_order=? WHERE id=?", [i, ids[i]]);
            }
            res.json({ ok: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // --- Vélemények átrendezése ---
    router.post("/api/reorder-testimonials", requireLogin, requireNotViewer, requireCsrf, async (req, res) => {
        try {
            const ids = JSON.parse(req.body.ids || "[]");
            if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "No IDs" });
            for (let i = 0; i < ids.length; i++) {
                await dbRun("UPDATE testimonials SET sort_order=? WHERE id=?", [i, ids[i]]);
            }
            res.json({ ok: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // --- Partnerek átrendezése ---
    router.post("/api/reorder-partners", requireLogin, requireNotViewer, requireCsrf, async (req, res) => {
        try {
            const ids = JSON.parse(req.body.ids || "[]");
            if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "No IDs" });
            for (let i = 0; i < ids.length; i++) {
                await dbRun("UPDATE partners SET sort_order=? WHERE id=?", [i, ids[i]]);
            }
            res.json({ ok: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // --- Kép alt szöveg mentése ---
    router.post("/api/alt-text/:id", requireLogin, requireNotViewer, requireCsrf, async (req, res) => {
        try {
            const altText = String(req.body.alt_text || "").trim();
            await dbRun("UPDATE project_images SET alt_text=? WHERE id=?", [altText, req.params.id]);
            res.json({ ok: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // --- Google PageSpeed Insights proxy ---
    router.get("/api/pagespeed", requireLogin, async (req, res) => {
        try {
            const url = req.query.url || "/";
            const baseUrl = (await getSettingsMap()).sitemap_base_url || "https://www.aula2000.hu";
            const fullUrl = url.startsWith("http") ? url : baseUrl + url;
            let apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(fullUrl)}&category=performance&category=accessibility&category=seo&strategy=mobile`;
            // Opcionális API kulcs: a limit emeléséhez (.env-ből vagy DB-ből). Kulcs nélkül is működik,
            // de a Google napi kvótája nagyon alacsony (ilyenkor 429/502-t kapunk).
            const sMap = await getSettingsMap();
            const apiKey = process.env.PAGESPEED_API_KEY || sMap.pagespeed_api_key;
            if (apiKey) apiUrl += `&key=${encodeURIComponent(apiKey)}`;
            const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(30000) });
            if (!resp.ok) {
                let detail = "";
                try {
                    const body = await resp.json();
                    detail = body?.error?.message || body?.error?.status || "";
                } catch { /* nem JSON hiba */ }
                if (resp.status === 429) {
                    // Kvóta kimerült — visszajelzés a UI-nak, hogy ne tűnjön szerverhibának
                    return res.status(429).json({ error: "A Google PageSpeed API napi kvótája kimerült. Próbáld újra holnap, vagy adj meg PAGESPEED_API_KEY-et a .env-ben." + (detail ? " (" + detail + ")" : "") });
                }
                return res.status(502).json({ error: "PageSpeed API hiba: " + resp.status + (detail ? " — " + detail : "") });
            }
            const data = await resp.json();
            const lh = data.lighthouseResult || {};
            const cats = lh.categories || {};
            res.json({
                url: fullUrl,
                performance: Math.round((cats.performance || {}).score * 100),
                accessibility: Math.round((cats.accessibility || {}).score * 100),
                seo: Math.round((cats.seo || {}).score * 100),
                fcp: lh.audits?.["first-contentful-paint"]?.displayValue || "",
                lcp: lh.audits?.["largest-contentful-paint"]?.displayValue || "",
                tbt: lh.audits?.["total-blocking-time"]?.displayValue || "",
                cls: lh.audits?.["cumulative-layout-shift"]?.displayValue || "",
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // --- Analytics adatok (Chart.js) ---
    router.get("/api/analytics-data", requireLogin, async (req, res) => {
        try {
            const days = Math.min(parseInt(req.query.days) || 30, 365);
            const rows = await dbAll(
                `SELECT date, page, COUNT(*) as hits FROM analytics
                 WHERE date >= date('now', '-${days} days')
                 GROUP BY date, page ORDER BY date ASC`
            );
            // Naponta összesítés
            const daily = {};
            const paths = {};
            for (const r of rows) {
                daily[r.date] = (daily[r.date] || 0) + r.hits;
                if (!r.page || r.page.startsWith("/uploads")) continue;
                paths[r.page] = (paths[r.page] || 0) + r.hits;
            }
            const topPaths = Object.entries(paths).sort((a, b) => b[1] - a[1]).slice(0, 10);
            res.json({ daily, topPaths, totalHits: Object.values(daily).reduce((s, v) => s + v, 0) });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // --- Push értesítés broadcast ---
    router.post("/api/push-broadcast", requireLogin, requireNotViewer, broadcastLimiter, requireCsrf, async (req, res) => {
        try {
            const title = String(req.body.title || "").trim();
            const body = String(req.body.body || "").trim();
            const url = String(req.body.url || "/").trim();
            if (!title || !body) return res.status(400).json({ error: "Cím és szöveg kötelező" });
            const settings = await getSettingsMap();
            const vapidPublic = settings.vapid_public_key || process.env.VAPID_PUBLIC_KEY;
            const vapidPrivate = settings.vapid_private_key || process.env.VAPID_PRIVATE_KEY;
            if (!vapidPublic || !vapidPrivate) return res.status(500).json({ error: "VAPID kulcsok nincsenek beállítva" });
            const webpush = require("web-push");
            webpush.setVapidDetails("mailto:info@aula2000.hu", vapidPublic, vapidPrivate);
            const subs = await dbAll("SELECT endpoint, subscription_json FROM push_subscribers");
            let sent = 0, failed = 0;
            const payload = JSON.stringify({ title, body, url });
            for (const sub of subs) {
                try {
                    const subObj = JSON.parse(sub.subscription_json || "{}");
                    if (subObj && subObj.endpoint) {
                        await webpush.sendNotification(subObj, payload);
                        sent++;
                    }
                } catch { failed++; }
            }
            await activityLog({ level: "info", action: "push-broadcast", method: "POST", url: "/admin/api/push-broadcast", status: 200, message: `${title}: ${sent} elküldve, ${failed} hiba` });
            res.json({ ok: true, sent, failed });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    /* ============================================================
       PARTNEREK CRUD
       ============================================================ */
    router.get("/api/partners", requireLogin, async (req, res) => {
        try {
            const rows = await dbAll("SELECT * FROM partners ORDER BY sort_order ASC, id DESC");
            res.json(rows);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post("/partner-create", requireAdmin, async (req, res, next) => {
        try {
            const name = String(req.body.name || '').trim();
            const logo_url = String(req.body.logo_url || '').trim();
            const website = String(req.body.website || '').trim();
            const is_active = req.body.is_active ? 1 : 0;
            if (!name) return res.redirect("/admin?tab=partners&msg=Hiba_partner_nev");
            const count = await dbGet("SELECT COUNT(*) as c FROM partners");
            await dbRun("INSERT INTO partners (name, logo_url, website, is_active, sort_order, created_at) VALUES (?,?,?,?,?,?)",
                [name, logo_url, website, is_active, count.c, new Date().toISOString()]);
            res.redirect("/admin?tab=partners&msg=Partner_hozzaadva");
        } catch (err) { next(err); }
    });

    router.post("/partner-update/:id", requireAdmin, async (req, res, next) => {
        try {
            const name = String(req.body.name || '').trim();
            const logo_url = String(req.body.logo_url || '').trim();
            const website = String(req.body.website || '').trim();
            const is_active = req.body.is_active ? 1 : 0;
            if (!name) return res.redirect("/admin?tab=partners&msg=Hiba_partner_nev");
            await dbRun("UPDATE partners SET name=?, logo_url=?, website=?, is_active=? WHERE id=?",
                [name, logo_url, website, is_active, req.params.id]);
            res.redirect("/admin?tab=partners&msg=Partner_frissitve");
        } catch (err) { next(err); }
    });

    router.post("/partner-delete/:id", requireAdmin, async (req, res, next) => {
        try {
            await dbRun("DELETE FROM partners WHERE id=?", [req.params.id]);
            res.redirect("/admin?tab=partners&msg=Partner_torolve");
        } catch (err) { next(err); }
    });

    /* ============================================================
       ADATBÁZIS MENTÉS / EXPORT
       ============================================================ */
    router.get("/api/db-backup", requireAdmin, async (req, res) => {
        try {
            // SQLite backup: a nyitott DB-t backuppolja (nem közvetlen fájlmásolás, mert írás közben korrupt lehet)
            const backupPath = path.join(dataDir, "backup.sqlite");
            await new Promise((resolve, reject) => {
                db.backup(backupPath, (err) => err ? reject(err) : resolve());
            });
            const fullPath = path.join(dataDir, "backup.sqlite");
            const stat = await fs.stat(fullPath);
            // Bejelentkezés a meta táblába
            await dbRun("INSERT INTO db_backups (filename, size, created_at) VALUES (?,?,?)",
                ["backup.sqlite", stat.size, new Date().toISOString()]).catch(() => {});
            res.download(fullPath, `aula2000-backup-${new Date().toISOString().slice(0,10)}.sqlite`);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get("/api/db-backup-file/:filename", requireAdmin, async (req, res) => {
        const filename = String(req.params.filename || '');
        if (!/^auto-\d{4}-\d{2}-\d{2}\.sqlite$/.test(filename)) return res.status(400).send('Érvénytelen backup fájlnév.');
        const filePath = path.join(dataDir, 'backups', filename);
        try {
            await fs.access(filePath);
            res.download(filePath, filename);
        } catch { res.status(404).send('A backup nem található.'); }
    });

    router.post("/api/db-backup", requireAdmin, requireCsrf, async (req, res) => {
        try {
            const backupPath = path.join(dataDir, "backup_" + Date.now() + ".sqlite");
            await new Promise((resolve, reject) => {
                db.backup(backupPath, (err) => err ? reject(err) : resolve());
            });
            const stat = await fs.stat(backupPath);
            await dbRun("INSERT INTO db_backups (filename, size, created_at) VALUES (?,?,?)",
                [path.basename(backupPath), stat.size, new Date().toISOString()]).catch(() => {});
            await activityLog({ level: 'info', action: 'db-backup', method: 'POST', url: '/admin/api/db-backup', status: 200, message: 'Manuális DB backup készítve', details: { filename: path.basename(backupPath) } });
            res.json({ ok: true, filename: path.basename(backupPath) });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    /* ============================================================
       GLOBÁLIS ADMIN KERESÉS
       ============================================================ */
    router.get("/api/search", requireLogin, async (req, res) => {
        try {
            const q = String(req.query.q || '').trim();
            if (q.length < 2) return res.json({ projects: [], messages: [], blog: [], pages: [], testimonials: [], partners: [] });
            const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
            const [projects, messages, blog, pages, testimonials, partners] = await Promise.all([
                dbAll("SELECT id, title, category, cover FROM projects WHERE title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' LIMIT 5", [like, like]).catch(() => []),
                dbAll("SELECT id, name, email, message FROM messages WHERE name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\' LIMIT 5", [like, like, like]).catch(() => []),
                dbAll("SELECT id, title, slug, category FROM blog_posts WHERE title LIKE ? ESCAPE '\\' OR excerpt LIKE ? ESCAPE '\\' LIMIT 5", [like, like]).catch(() => []),
                dbAll("SELECT id, title, slug FROM pages WHERE title LIKE ? ESCAPE '\\' LIMIT 5", [like]).catch(() => []),
                dbAll("SELECT id, author, content FROM testimonials WHERE author LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' LIMIT 5", [like, like]).catch(() => []),
                dbAll("SELECT id, name FROM partners WHERE name LIKE ? ESCAPE '\\' LIMIT 5", [like]).catch(() => [])
            ]);
            res.json({ q, projects, messages, blog, pages, testimonials, partners });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    /* ============================================================
       E-MAIL SABLONOK
       ============================================================ */
    router.get("/api/email-templates", requireLogin, async (req, res) => {
        try {
            const rows = await dbAll("SELECT * FROM email_templates ORDER BY id DESC");
            res.json(rows);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post("/email-template-create", requireAdmin, async (req, res, next) => {
        try {
            const name = String(req.body.name || '').trim();
            const subject = String(req.body.subject || '').trim();
            const body = String(req.body.body || '').trim();
            if (!name) return res.redirect("/admin?tab=email&msg=Hiba_sablon_nev");
            await dbRun("INSERT INTO email_templates (name, subject, body, created_at, updated_at) VALUES (?,?,?,?,?)",
                [name, subject, body, new Date().toISOString(), new Date().toISOString()]);
            res.redirect("/admin?tab=email&msg=Sablon_letrehozva");
        } catch (err) { next(err); }
    });

    router.post("/email-template-update/:id", requireAdmin, async (req, res, next) => {
        try {
            const name = String(req.body.name || '').trim();
            const subject = String(req.body.subject || '').trim();
            const body = String(req.body.body || '').trim();
            if (!name) return res.redirect("/admin?tab=email&msg=Hiba_sablon_nev");
            await dbRun("UPDATE email_templates SET name=?, subject=?, body=?, updated_at=? WHERE id=?",
                [name, subject, body, new Date().toISOString(), req.params.id]);
            res.redirect("/admin?tab=email&msg=Sablon_frissitve");
        } catch (err) { next(err); }
    });

    router.post("/email-template-delete/:id", requireAdmin, async (req, res, next) => {
        try {
            await dbRun("DELETE FROM email_templates WHERE id=?", [req.params.id]);
            res.redirect("/admin?tab=email&msg=Sablon_torolve");
        } catch (err) { next(err); }
    });

    router.post("/send-email", requireAdmin, requireCsrf, async (req, res, next) => {
        try {
            const to = String(req.body.to || '').trim();
            const subject = String(req.body.subject || '').trim().slice(0, 200);
            const body = String(req.body.body || '').trim().slice(0, 50000);
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !body) {
                return res.redirect('/admin?tab=messages&msg=Hibas_email');
            }
            const escapeHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const html = body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
            await sendNotificationEmail({ to, subject, text: body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), html: `<div>${html}</div>` });
            await activityLog({ level: 'info', action: 'email-send', method: 'POST', url: '/admin/send-email', status: 200, message: 'Admin email elküldve', details: { to: escapeHtml(to), subject } });
            res.redirect('/admin?tab=messages&msg=Email_elkuldve');
        } catch (err) { next(err); }
    });

    /* ============================================================
       BLOG BETÉTKÉP / BORÍTÓ FELTÖLTÉS (multer)
       ============================================================ */
    router.post("/blog-upload-image", requireLogin, requireNotViewer, upload.single('image'), requireCsrf, async (req, res, next) => {
        try {
            if (!req.file || !ALLOWED_MIME.has(String(req.file.mimetype || '').toLowerCase())) {
                return res.status(400).json({ error: "Csak képfájl tölthető fel" });
            }
            const filename = await processAndSaveImage(req.file);
            const url = '/uploads/' + filename;
            res.json({ url });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post("/blog-cover-upload", requireLogin, requireNotViewer, upload.single('cover'), requireCsrf, async (req, res, next) => {
        try {
            if (!req.file || !ALLOWED_MIME.has(String(req.file.mimetype || '').toLowerCase())) {
                return res.status(400).json({ error: "Csak képfájl tölthető fel" });
            }
            const filename = await processAndSaveImage(req.file);
            res.json({ url: '/uploads/' + filename });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    /* ============================================================
       API KULCS KEZELÉS
       ============================================================ */
    router.post("/update-api-key", requireAdmin, async (req, res, next) => {
        try {
            const key = String(req.body.pagespeed_api_key || '').trim();
            await updateSettingsMap({ pagespeed_api_key: key });
            res.redirect("/admin?tab=settings&msg=Api_kulcs_mentve");
        } catch (err) { next(err); }
    });

    /* ============================================================
       SZOLGÁLTATÁSOK KEZELÉSE
       ============================================================ */
    router.post("/services/create", requireAdmin, upload.single("service_image"), async (req, res, next) => {
        try {
            const title = String(req.body.title || "").trim();
            const slug = req.body.slug ? slugify(req.body.slug) : slugify(title);
            const short_desc = String(req.body.short_desc || "").trim();
            const description = String(req.body.description || "").trim();
            const icon = String(req.body.icon || "").trim();
            const sort_order = parseInt(req.body.sort_order, 10) || 0;
            const is_active = req.body.is_active === 'on' ? 1 : 0;
            const created_at = new Date().toISOString();

            let filename = "";
            if (req.file) {
                filename = await processAndSaveImage(req.file, 1280, 60);
            }

            if (!title) return res.redirect('/admin?tab=services&msg=Hiba_cim_kotelezo');

            await dbRun(
                "INSERT INTO services (title, slug, short_desc, description, icon, image, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [title, slug, short_desc, description, icon, filename, sort_order, is_active, created_at, created_at]
            );
            activityLog("info", "Szolgáltatás létrehozva", req.ip, "POST", req.originalUrl, 302, "ID: n/a", title);
            res.redirect("/admin?tab=services&msg=Szolgaltatas_letrehozva");
        } catch (err) { next(err); }
    });

    router.post("/services/update/:id", requireAdmin, upload.single("service_image"), async (req, res, next) => {
        try {
            const id = req.params.id;
            const svc = await dbGet("SELECT * FROM services WHERE id = ?", [id]);
            if (!svc) return res.redirect("/admin?tab=services&msg=Nem_talalhato");

            const title = String(req.body.title || "").trim();
            const slug = req.body.slug ? slugify(req.body.slug) : svc.slug;
            const short_desc = String(req.body.short_desc || "").trim();
            const description = String(req.body.description || "").trim();
            const icon = String(req.body.icon || "").trim();
            const sort_order = parseInt(req.body.sort_order, 10) || 0;
            const is_active = req.body.is_active === 'on' ? 1 : 0;
            const updated_at = new Date().toISOString();

            let filename = svc.image;
            if (req.file) {
                if (svc.image) await deleteImage(svc.image);
                filename = await processAndSaveImage(req.file, 1280, 60);
            }

            if (!title) return res.redirect('/admin?tab=services&msg=Hiba_cim_kotelezo');

            await dbRun(
                "UPDATE services SET title = ?, slug = ?, short_desc = ?, description = ?, icon = ?, image = ?, sort_order = ?, is_active = ?, updated_at = ? WHERE id = ?",
                [title, slug, short_desc, description, icon, filename, sort_order, is_active, updated_at, id]
            );
            activityLog("info", "Szolgáltatás módosítva", req.ip, "POST", req.originalUrl, 302, `ID: ${id}`, title);
            res.redirect("/admin?tab=services&msg=Szolgaltatas_modositva");
        } catch (err) { next(err); }
    });

    router.post("/services/:id/gallery-add", requireAdmin, upload.single("service_gallery_image"), requireCsrf, async (req, res, next) => {
        try {
            const service = await dbGet("SELECT * FROM services WHERE id = ?", [req.params.id]);
            if (!service || !req.file) return res.redirect('/admin?tab=services&msg=Kep_nem_talalhato');
            let galleryImages = [];
            try { galleryImages = JSON.parse(service.gallery_images || '[]'); } catch { galleryImages = []; }
            galleryImages.push(await processAndSaveImage(req.file, 1280, 60));
            await dbRun("UPDATE services SET gallery_images = ?, updated_at = ? WHERE id = ?", [JSON.stringify(galleryImages), new Date().toISOString(), req.params.id]);
            res.redirect('/admin?tab=services&msg=Kep_hozzaadva');
        } catch (err) { next(err); }
    });

    router.post("/services/:id/gallery-delete", requireAdmin, requireCsrf, async (req, res, next) => {
        try {
            const service = await dbGet("SELECT * FROM services WHERE id = ?", [req.params.id]);
            if (!service) return res.redirect('/admin?tab=services&msg=Nem_talalhato');
            let galleryImages = [];
            try { galleryImages = JSON.parse(service.gallery_images || '[]'); } catch { galleryImages = []; }
            const imageIndex = Number.parseInt(req.body.image_index, 10);
            if (imageIndex >= 0 && imageIndex < galleryImages.length) {
                const [removedImage] = galleryImages.splice(imageIndex, 1);
                if (removedImage && !String(removedImage).startsWith('http')) await deleteImage(removedImage);
                await dbRun("UPDATE services SET gallery_images = ?, updated_at = ? WHERE id = ?", [JSON.stringify(galleryImages), new Date().toISOString(), req.params.id]);
            }
            res.redirect('/admin?tab=services&msg=Kep_torolva');
        } catch (err) { next(err); }
    });

    router.post("/services/delete/:id", requireAdmin, async (req, res, next) => {
        try {
            const id = req.params.id;
            const svc = await dbGet("SELECT * FROM services WHERE id = ?", [id]);
            if (svc) {
                if (svc.image) await deleteImage(svc.image);
                await dbRun("DELETE FROM services WHERE id = ?", [id]);
                activityLog("info", "Szolgáltatás törölve", req.ip, "POST", req.originalUrl, 302, `ID: ${id}`, svc.title);
            }
            res.redirect("/admin?tab=services&msg=Szolgaltatas_torolve");
        } catch (err) { next(err); }
    });

    /* ============================================================
       MUNKAFOLYAMATOK KEZELÉSE
       ============================================================ */
    router.post("/workflows/create", requireAdmin, upload.array("workflow_images", 8), async (req, res, next) => {
        try {
            const title = String(req.body.title || "").trim();
            const slug = req.body.slug ? slugify(req.body.slug) : slugify(title);
            const shortDesc = String(req.body.short_desc || "").trim();
            const description = String(req.body.description || "").trim();
            const icon = String(req.body.icon || "").trim();
            const sortOrder = parseInt(req.body.sort_order, 10) || 0;
            const isActive = req.body.is_active === 'on' ? 1 : 0;
            if (!title) return res.redirect('/admin?tab=workflows&msg=Hiba_cim_kotelezo');
            const files = Array.isArray(req.files) ? req.files : [];
            const processedImages = await Promise.all(files.map(file => processAndSaveImage(file, 1280, 60)));
            const filename = processedImages.shift() || '';
            const now = new Date().toISOString();
            await dbRun(
                "INSERT INTO workflows (title, slug, short_desc, description, icon, image, gallery_images, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [title, slug, shortDesc, description, icon, filename, JSON.stringify(processedImages), sortOrder, isActive, now, now]
            );
            activityLog("info", "Munkafolyamat létrehozva", req.ip, "POST", req.originalUrl, 302, "ID: n/a", title);
            res.redirect('/admin?tab=workflows&msg=Munkafolyamat_letrehozva');
        } catch (err) { next(err); }
    });

    router.post("/workflows/update/:id", requireAdmin, upload.array("workflow_images", 8), async (req, res, next) => {
        try {
            const id = req.params.id;
            const workflow = await dbGet("SELECT * FROM workflows WHERE id = ?", [id]);
            if (!workflow) return res.redirect('/admin?tab=workflows&msg=Nem_talalhato');
            const title = String(req.body.title || "").trim();
            const slug = req.body.slug ? slugify(req.body.slug) : workflow.slug;
            const shortDesc = String(req.body.short_desc || "").trim();
            const description = String(req.body.description || "").trim();
            const icon = String(req.body.icon || "").trim();
            const sortOrder = parseInt(req.body.sort_order, 10) || 0;
            const isActive = req.body.is_active === 'on' ? 1 : 0;
            if (!title) return res.redirect('/admin?tab=workflows&msg=Hiba_cim_kotelezo');
            let filename = workflow.image || '';
            let galleryImages = [];
            try { galleryImages = JSON.parse(workflow.gallery_images || '[]'); } catch { galleryImages = []; }
            const files = Array.isArray(req.files) ? req.files : [];
            if (files.length) {
                if (workflow.image) await deleteImage(workflow.image);
                const processedImages = await Promise.all(files.map(file => processAndSaveImage(file, 1280, 60)));
                filename = processedImages.shift() || filename;
                galleryImages = processedImages;
            }
            await dbRun(
                "UPDATE workflows SET title = ?, slug = ?, short_desc = ?, description = ?, icon = ?, image = ?, gallery_images = ?, sort_order = ?, is_active = ?, updated_at = ? WHERE id = ?",
                [title, slug, shortDesc, description, icon, filename, JSON.stringify(galleryImages), sortOrder, isActive, new Date().toISOString(), id]
            );
            activityLog("info", "Munkafolyamat módosítva", req.ip, "POST", req.originalUrl, 302, `ID: ${id}`, title);
            res.redirect('/admin?tab=workflows&msg=Munkafolyamat_modositva');
        } catch (err) { next(err); }
    });

    router.post("/workflows/:id/gallery-add", requireAdmin, upload.single("workflow_image"), requireCsrf, async (req, res, next) => {
        try {
            const workflow = await dbGet("SELECT * FROM workflows WHERE id = ?", [req.params.id]);
            if (!workflow || !req.file) return res.redirect('/admin?tab=workflows&msg=Kep_nem_talalhato');
            let galleryImages = [];
            try { galleryImages = JSON.parse(workflow.gallery_images || '[]'); } catch { galleryImages = []; }
            const filename = await processAndSaveImage(req.file, 1280, 60);
            galleryImages.push(filename);
            await dbRun("UPDATE workflows SET gallery_images = ?, updated_at = ? WHERE id = ?", [JSON.stringify(galleryImages), new Date().toISOString(), req.params.id]);
            res.redirect('/admin?tab=workflows&msg=Kep_hozzaadva');
        } catch (err) { next(err); }
    });

    router.post("/workflows/:id/gallery-delete", requireAdmin, requireCsrf, async (req, res, next) => {
        try {
            const workflow = await dbGet("SELECT * FROM workflows WHERE id = ?", [req.params.id]);
            if (!workflow) return res.redirect('/admin?tab=workflows&msg=Nem_talalhato');
            let galleryImages = [];
            try { galleryImages = JSON.parse(workflow.gallery_images || '[]'); } catch { galleryImages = []; }
            const imageIndex = Number.parseInt(req.body.image_index, 10);
            if (imageIndex >= 0 && imageIndex < galleryImages.length) {
                const [removedImage] = galleryImages.splice(imageIndex, 1);
                if (removedImage && !String(removedImage).startsWith('http')) await deleteImage(removedImage);
                await dbRun("UPDATE workflows SET gallery_images = ?, updated_at = ? WHERE id = ?", [JSON.stringify(galleryImages), new Date().toISOString(), req.params.id]);
            }
            res.redirect('/admin?tab=workflows&msg=Kep_torolva');
        } catch (err) { next(err); }
    });

    router.post("/workflows/delete/:id", requireAdmin, async (req, res, next) => {
        try {
            const workflow = await dbGet("SELECT * FROM workflows WHERE id = ?", [req.params.id]);
            if (workflow) {
                if (workflow.image) await deleteImage(workflow.image);
                await dbRun("DELETE FROM workflows WHERE id = ?", [req.params.id]);
                activityLog("info", "Munkafolyamat törölve", req.ip, "POST", req.originalUrl, 302, `ID: ${req.params.id}`, workflow.title);
            }
            res.redirect('/admin?tab=workflows&msg=Munkafolyamat_torolve');
        } catch (err) { next(err); }
    });

    /* ============================================================
       ELŐTTE/UTÁNA (Before/After) PROJEKTEK
       ============================================================ */
    router.post("/before-after/add", requireLogin, requireNotViewer, upload.fields([
        { name: 'before_image', maxCount: 1 },
        { name: 'after_image', maxCount: 1 }
    ]), requireCsrf, async (req, res, next) => {
        try {
            const title = String(req.body.title || '').trim();
            if (!title) return res.redirect("/admin?tab=before-after&msg=Cim_kotelezo");
            const description = String(req.body.description || '').trim();
            const sortOrder = parseInt(req.body.sort_order) || 0;
            let beforeImage = '';
            let afterImage = '';
            if (req.files && req.files.before_image && req.files.before_image[0]) {
                beforeImage = await processAndSaveImage(req.files.before_image[0]);
            }
            if (req.files && req.files.after_image && req.files.after_image[0]) {
                afterImage = await processAndSaveImage(req.files.after_image[0]);
            }
            await dbRun(
                "INSERT INTO before_after (title, description, before_image, after_image, is_active, sort_order, created_at, updated_at) VALUES (?,?,?,?,1,?,?,?)",
                [title, description, beforeImage, afterImage, sortOrder, new Date().toISOString(), new Date().toISOString()]
            );
            activityLog("info", "Előtte/Utána projekt hozzáadva", req.ip, "POST", req.originalUrl, 302, title);
            res.redirect("/admin?tab=before-after&msg=Hozzaadva");
        } catch (err) { next(err); }
    });

    router.post("/before-after/update/:id", requireLogin, requireNotViewer, upload.fields([
        { name: 'before_image', maxCount: 1 },
        { name: 'after_image', maxCount: 1 }
    ]), requireCsrf, async (req, res, next) => {
        try {
            const id = req.params.id;
            const title = String(req.body.title || '').trim();
            const description = String(req.body.description || '').trim();
            const sortOrder = parseInt(req.body.sort_order) || 0;
            const isActive = req.body.is_active ? 1 : 0;
            const existing = await dbGet("SELECT * FROM before_after WHERE id = ?", [id]);
            if (!existing) return res.redirect("/admin?tab=before-after&msg=Nem_talalhato");
            let beforeImage = existing.before_image;
            let afterImage = existing.after_image;
            if (req.files && req.files.before_image && req.files.before_image[0]) {
                if (beforeImage && beforeImage.startsWith('/uploads/')) await deleteImage(beforeImage);
                beforeImage = await processAndSaveImage(req.files.before_image[0]);
            }
            if (req.files && req.files.after_image && req.files.after_image[0]) {
                if (afterImage && afterImage.startsWith('/uploads/')) await deleteImage(afterImage);
                afterImage = await processAndSaveImage(req.files.after_image[0]);
            }
            await dbRun(
                "UPDATE before_after SET title=?, description=?, before_image=?, after_image=?, is_active=?, sort_order=?, updated_at=? WHERE id=?",
                [title, description, beforeImage, afterImage, isActive, sortOrder, new Date().toISOString(), id]
            );
            activityLog("info", "Előtte/Utána projekt módosítva", req.ip, "POST", req.originalUrl, 302, `ID: ${id}`, title);
            res.redirect("/admin?tab=before-after&msg=Frissitve");
        } catch (err) { next(err); }
    });

    router.post("/before-after/delete/:id", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            const item = await dbGet("SELECT * FROM before_after WHERE id = ?", [req.params.id]);
            if (item) {
                if (item.before_image && item.before_image.startsWith('/uploads/')) await deleteImage(item.before_image);
                if (item.after_image && item.after_image.startsWith('/uploads/')) await deleteImage(item.after_image);
                await dbRun("DELETE FROM before_after WHERE id = ?", [req.params.id]);
                activityLog("info", "Előtte/Utána projekt törölve", req.ip, "POST", req.originalUrl, 302, `ID: ${req.params.id}`);
            }
            res.redirect("/admin?tab=before-after&msg=Torolve");
        } catch (err) { next(err); }
    });

    router.post("/before-after/toggle/:id", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            const item = await dbGet("SELECT * FROM before_after WHERE id = ?", [req.params.id]);
            if (item) {
                await dbRun("UPDATE before_after SET is_active=?, updated_at=? WHERE id=?", [item.is_active ? 0 : 1, new Date().toISOString(), req.params.id]);
            }
            res.redirect("/admin?tab=before-after&msg=Allapot_valtoztatva");
        } catch (err) { next(err); }
    });

    /* ============================================================
       ÜGYFÉLKAPU — BEÁLLÍTÁSOK
       ============================================================ */
    router.post("/ugyfelkapu/toggle", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            const enabled = req.body.ugyfelkapu_enabled === '1' ? '1' : '0';
            await updateSettingsMap({ ugyfelkapu_enabled: enabled });
            activityLog("info", `Ugyfelkapu ${enabled === '1' ? 'BEKAPCSOLVA' : 'KIKAPCSOLVA'}`, req.ip, "POST", req.originalUrl);
            invalidateContentCache();
            res.redirect("/admin?tab=ugyfelkapu&msg=Ugyfelkapu_beallitva");
        } catch (err) { next(err); }
    });

    router.post("/ugyfelkapu/client-create", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            const { username, password, display_name, email, project_name } = req.body;
            if (!username || !password) return res.redirect("/admin?tab=ugyfelkapu&msg=Hibas_adatok");
            const existing = await dbGet("SELECT id FROM client_users WHERE username=?", [username]);
            if (existing) return res.redirect("/admin?tab=ugyfelkapu&msg=Felhasznalo_letezik");
            const hash = bcrypt.hashSync(String(password), 10);
            await dbRun(
                "INSERT INTO client_users (username, password_hash, display_name, email, project_name, is_active, created_at) VALUES (?,?,?,?,?,1,?)",
                [username, hash, display_name || '', email || '', project_name || '', new Date().toISOString()]
            );
            activityLog("info", `Uj ugyfel felhasznalo: ${username}`, req.ip, "POST", req.originalUrl);
            invalidateContentCache();
            res.redirect("/admin?tab=ugyfelkapu&msg=Ugyfel_letrehozva");
        } catch (err) { next(err); }
    });

    router.post("/ugyfelkapu/client-update/:id", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            const { display_name, email, project_name, new_password } = req.body;
            const id = req.params.id;
            if (new_password && String(new_password).trim().length >= 4) {
                const hash = bcrypt.hashSync(String(new_password).trim(), 10);
                await dbRun("UPDATE client_users SET display_name=?, email=?, project_name=?, password_hash=? WHERE id=?",
                    [display_name || '', email || '', project_name || '', hash, id]);
            } else {
                await dbRun("UPDATE client_users SET display_name=?, email=?, project_name=? WHERE id=?",
                    [display_name || '', email || '', project_name || '', id]);
            }
            activityLog("info", `Ugyfel frissitve: ID ${id}`, req.ip, "POST", req.originalUrl);
            invalidateContentCache();
            res.redirect("/admin?tab=ugyfelkapu&msg=Ugyfel_frissitve");
        } catch (err) { next(err); }
    });

    router.post("/ugyfelkapu/client-delete/:id", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            const id = req.params.id;
            const files = await dbAll("SELECT stored_name FROM client_files WHERE client_user_id=?", [id]);
            if (files && files.length) {
                const fsSync = require("fs");
                for (const f of files) {
                    try { fsSync.unlinkSync(path.join(CLIENT_DIR, f.stored_name)); } catch {}
                }
            }
            await dbRun("DELETE FROM client_users WHERE id=?", [id]);
            activityLog("info", `Ugyfel torolve: ID ${id}`, req.ip, "POST", req.originalUrl);
            invalidateContentCache();
            res.redirect("/admin?tab=ugyfelkapu&msg=Ugyfel_torolve");
        } catch (err) { next(err); }
    });

    router.post("/ugyfelkapu/client-toggle/:id", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            const user = await dbGet("SELECT id, is_active FROM client_users WHERE id=?", [req.params.id]);
            if (user) {
                await dbRun("UPDATE client_users SET is_active=? WHERE id=?", [user.is_active ? 0 : 1, user.id]);
            }
            res.redirect("/admin?tab=ugyfelkapu&msg=Ugyfel_allapot_valtoztatva");
        } catch (err) { next(err); }
    });

    /* ============================================================
       ÜGYFÉLKAPU — PROJEKT FRISSÍTÉSEK + FÁJLOK
       ============================================================ */
    router.post("/ugyfelkapu/update-create", requireLogin, requireNotViewer, clientUpload.array('files', 10), requireCsrf, async (req, res, next) => {
        try {
            const client_user_id = req.body.client_user_id;
            const title = req.body.title || '';
            const body_raw = req.body.body_raw || '';
            const body_html = fmtClientBody ? fmtClientBody(body_raw) : '';
            if (!client_user_id) return res.redirect("/admin?tab=ugyfelkapu&msg=Hibas_adatok");
            const result = await dbRun(
                "INSERT INTO client_project_updates (client_user_id, title, body_raw, body_html, created_at) VALUES (?,?,?,?,?)",
                [client_user_id, title, body_raw, body_html, new Date().toISOString()]
            );
            const updateId = result.lastInsertRowid || result.lastID;
            if (req.files && req.files.length && updateId) {
                const fsSync = require("fs");
                const sharp = require("sharp");
                const crypto = require("crypto");
                try { fsSync.mkdirSync(CLIENT_DIR, { recursive: true }); } catch {}
                try { fsSync.mkdirSync(path.join(CLIENT_DIR, "thumbs"), { recursive: true }); } catch {}
                for (const file of req.files) {
                    const ext = path.extname(file.originalname);
                    const stored = crypto.randomBytes(12).toString("hex") + ext;
                    fsSync.writeFileSync(path.join(CLIENT_DIR, stored), file.buffer);
                    let thumbName = null;
                    const isImage = String(file.mimetype || "").startsWith("image/") && !String(file.mimetype).includes("svg");
                    if (isImage) {
                        try {
                            const thumbFile = crypto.randomBytes(12).toString("hex") + ".webp";
                            await sharp(file.buffer)
                                .resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true })
                                .webp({ quality: 82 })
                                .toFile(path.join(CLIENT_DIR, "thumbs", thumbFile));
                            thumbName = "thumbs/" + thumbFile;
                        } catch (e) { /* keep thumbName null on error */ }
                    }
                    await dbRun(
                        "INSERT INTO client_files (client_user_id, update_id, original_name, stored_name, mime_type, size, thumb_name, created_at) VALUES (?,?,?,?,?,?,?,?)",
                        [client_user_id, updateId, file.originalname, stored, file.mimetype, file.size, thumbName, new Date().toISOString()]
                    );
                }
            }
            activityLog("info", `Projekt frissites letrehozva: ugyfel ID ${client_user_id}`, req.ip, "POST", req.originalUrl);
            invalidateContentCache();
            res.redirect("/admin?tab=ugyfelkapu&msg=Frissites_letrehozva");
        } catch (err) { next(err); }
    });

    router.post("/ugyfelkapu/update-delete/:id", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            const id = req.params.id;
            const files = await dbAll("SELECT stored_name FROM client_files WHERE update_id=?", [id]);
            if (files && files.length) {
                const fsSync = require("fs");
                for (const f of files) {
                    try { fsSync.unlinkSync(path.join(CLIENT_DIR, f.stored_name)); } catch {}
                }
            }
            await dbRun("DELETE FROM client_project_updates WHERE id=?", [id]);
            invalidateContentCache();
            res.redirect("/admin?tab=ugyfelkapu&msg=Frissites_torolve");
        } catch (err) { next(err); }
    });

    router.post("/ugyfelkapu/file-delete/:id", requireLogin, requireNotViewer, requireCsrf, async (req, res, next) => {
        try {
            const file = await dbGet("SELECT * FROM client_files WHERE id=?", [req.params.id]);
            if (file) {
                const fsSync = require("fs");
                try { fsSync.unlinkSync(path.join(CLIENT_DIR, file.stored_name)); } catch {}
                await dbRun("DELETE FROM client_files WHERE id=?", [file.id]);
            }
            invalidateContentCache();
            res.redirect("/admin?tab=ugyfelkapu&msg=Fajl_torolve");
        } catch (err) { next(err); }
    });

    return router;
}

module.exports = { createAdminRouter };
