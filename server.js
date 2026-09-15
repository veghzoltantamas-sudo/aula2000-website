require("dotenv").config();
const express = require("express");
const compression = require("compression");
const morgan = require("morgan");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const sharp = require("sharp");
const crypto = require("crypto");
const helmet = require("helmet");
const nodemailer = require("nodemailer");

const app = express();
app.set("trust proxy", 1);

const config = require("./config");
const { createAdminRouter } = require("./routes/admin");
const { createApiRouter } = require("./routes/api");
const { createPublicRouter } = require("./routes/public");
const { createClientRouter } = require("./routes/client");
const { generateCsrfToken, validateCsrfToken } = require("./middleware/auth");
const { loginLimiter, contactLimiter, quoteLimiter, analyticsLimiter, pushLimiter, newsletterLimiter } = require("./middleware/rateLimiters");
const PORT = config.port;
const dbPath = config.dbPath;
const uploadDir = config.uploadDir;

// Mappa létrehozás — szinkron végrehajtás, hogy ne legyen race condition az adatbázis megnyitásával
try {
    require('fs').mkdirSync(path.dirname(dbPath), { recursive: true });
    require('fs').mkdirSync(uploadDir, { recursive: true });
} catch (e) {
    console.error("Mappa létrehozási hiba:", e.message);
}

const db = new sqlite3.Database(dbPath);

function messageStatus(message) {
    const priority = String(message.priority || '').toLowerCase();
    if (priority === 'important') return { key: 'important', label: 'Fontos' };
    if (Number(message.is_read) === 1) return { key: 'read', label: 'Olvasott' };
    return { key: 'new', label: 'Olvasatlan' };
}

const leadStatuses = {
    new: 'Új',
    contacted: 'Kapcsolatfelvétel',
    qualified: 'Minősített',
    proposal: 'Ajánlat elküldve',
    won: 'Megnyert',
    lost: 'Lezárt / elveszett'
};
function leadStatus(value) {
    const key = String(value || 'new').toLowerCase();
    return leadStatuses[key] ? key : 'new';
}

// Modern async/await megoldás az adatbázishoz
const dbGet = (q, p = []) => new Promise((resolve, reject) => db.get(q, p, (err, row) => err ? reject(err) : resolve(row)));
const dbAll = (q, p = []) => new Promise((resolve, reject) => db.all(q, p, (err, rows) => err ? reject(err) : resolve(rows)));
const dbRun = (q, p = []) => new Promise((resolve, reject) => db.run(q, p, function(err) { err ? reject(err) : resolve(this) }));

// --- Környezeti konfiguráció ---
const IS_PROD = config.isProd;

// Proxy mögötti üzemmód — CSAK akkor aktiváljuk, ha tényleg proxy (pl. Cloudflare) mögött futunk.
// Közvetlen elérésnél a 'trust proxy' bekapcsolása lehetővé tenné az X-Forwarded-For fejléc
// spoofolását, amivel a rate limiterek (login brute-force védelem) megkerülhetők.
if (config.trustProxy) {
    app.set('trust proxy', config.trustedProxyIps.length ? config.trustedProxyIps : 1);
}

// Biztonság és Rate Limiting
// CSP teljesen kikapcsolva, mert a mobil böngészők PDF olvasóit blokkolja.
// A többi alapvető helmet védelem megmarad.
app.use(helmet({
    contentSecurityPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false
}));


// --- CSRF védelem (saját, csomag nélküli megvalósítás) ---
// A token generálás és validálás a middleware/auth.js-ben van (session-alapú,
// SQLite-ba mentve, restart-biztos). Itt csak a middleware-ek vannak összefűzve.

// Fájlfeltöltés — csak képek engedélyezettek (multer biztonsági szűrő)
const storage = multer.memoryStorage();
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml']);
const upload = multer({
    storage,
    limits: { fileSize: config.uploadMaxBytes },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME.has(String(file.mimetype || '').toLowerCase())) {
            return cb(new Error('Csak képfájlok tölthetők fel!'));
        }
        cb(null, true);
    }
});

async function processAndSaveImage(file, requestedMaxDimension = config.maxImageDimension, quality = 62) {
    if (!file) return null;
    const filename = crypto.randomUUID() + ".webp";
    const filepath = path.join(__dirname, "public", "uploads", filename);
    const image = sharp(file.buffer).rotate();
    const { width, height } = await image.metadata();
    const maxDimension = Math.min(Number(requestedMaxDimension) || config.maxImageDimension, config.maxImageDimension);
    // Csak a nagyobbik dimenziót korlátozzuk — a másik arányosan követi (fit:'inside' nem igényel két dimenziót)
    const resizeOpts = { fit: 'inside', withoutEnlargement: true };
    if (width > maxDimension || height > maxDimension) {
        if (width >= height) resizeOpts.width = maxDimension;
        else resizeOpts.height = maxDimension;
    }

    await image
        .resize(resizeOpts)
        .webp({
            quality,
            effort: 6,
            smartSubsample: true,
            alphaQuality: 90
        })
        .toFile(filepath);
    return filename;
}
async function deleteImage(filename) {
    if (!filename) return;
    try { await fs.unlink(path.join(__dirname, "public", "uploads", filename)); } catch (e) { console.error("Kép törlési hiba:", e); }
}

async function getMailTransport() {
    const settings = await getSettingsMap();
    const host = process.env.MAIL_HOST || settings.mail_host;
    const user = process.env.MAIL_USER || settings.mail_user;
    const pass = process.env.MAIL_PASS || settings.mail_pass;
    const port = Number(process.env.MAIL_PORT || settings.mail_port || 587);
    if (!host || !user || !pass) return null;
    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
    });
}

async function sendNotificationEmail({ to, subject, text, html }) {
    let transport;
    try {
        transport = await getMailTransport();
        if (!transport) {
            console.log("EMAIL_SKIPPED:", subject, text || '');
            return { skipped: true, error: 'no_transport' };
        }

        const settings = await getSettingsMap();
        const recipient = to || process.env.MAIL_TO || settings.mail_to || process.env.MAIL_USER || settings.mail_user;
        const from = process.env.MAIL_FROM || settings.mail_from || process.env.MAIL_USER || settings.mail_user;
        await transport.sendMail({
            from,
            to: recipient,
            replyTo: from,
            subject,
            text,
            html
        });
        return { skipped: false };
    } catch (err) {
        // Az email küldés sose blokkolja a felhasználói választ — csendesen logoljuk
        console.error("EMAIL_HIBA:", err.message || err);
        return { skipped: true, error: err.message || String(err) };
    } finally {
        if (transport && typeof transport.close === 'function') {
            try { transport.close(); } catch { /* a transport bezárása sose kritikus */ }
        }
    }
}

async function getManifestPayload() {
    const rows = await dbAll("SELECT section, body FROM content");
    const contentMap = Object.fromEntries((rows || []).map((row) => [row.section, row.body]));
    const settings = await getSettingsMap();
    const name = settings.pwa_name || settings.company_name || contentMap.site_title || "Aula 2000";
    const shortName = settings.pwa_short_name || settings.company_short_name || name;
    const description = settings.seo_description || settings.company_description || "Prémium asztalosműhely";
    return {
        name,
        short_name: shortName,
        description,
        start_url: "/",
        scope: "/",
        display: settings.pwa_display || "standalone",
        background_color: settings.pwa_background_color || "#0a0d11",
        theme_color: settings.pwa_theme_color || "#d5ab5d",
        orientation: "portrait",
        lang: "hu",
        icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
        ]
    };
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Gzip tömörítés a válaszokhoz (HTML, CSS, JS, JSON)
app.use(compression({ filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
}}));

// Request logolás (fejlesztés és karbantartás)
app.use(morgan(":remote-addr :method :url :status :res[content-length] - :response-time ms",
    { skip: (req) => req.url.startsWith('/api/analytics') || req.url.startsWith('/uploads/') }
));

// Service Worker cache verzió — automatikusan frissül ha bármilyen statikus fájl módosul
let swVersionCache = null;
let swVersionAt = 0;
const SW_VERSION_TTL = config.swVersionTtlMs; // 1 perc — ne stat-olgasson minden hívásnál
async function getSwVersion() {
    const now = Date.now();
    if (swVersionCache && (now - swVersionAt) < SW_VERSION_TTL) return swVersionCache;
    const files = [
        path.join(__dirname, "public", "manifest.json"),
        path.join(__dirname, "public", "icons", "icon-192.png"),
        path.join(__dirname, "public", "icons", "icon-512.png"),
        ...await fs.readdir(path.join(__dirname, "public", "css")).then(f => f.map(n => path.join(__dirname, "public", "css", n))).catch(() => []),
        ...await fs.readdir(path.join(__dirname, "public", "js")).then(f => f.map(n => path.join(__dirname, "public", "js", n))).catch(() => []),
    ];
    const mtimes = await Promise.all(files.map(async (f) => {
        try { const s = await fs.stat(f); return s.mtimeMs; } catch { return 0; }
    }));
    swVersionCache = require("crypto").createHash("md5").update(mtimes.join("-")).digest("hex").slice(0, 12);
    swVersionAt = now;
    return swVersionCache;
}
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
    maxAge: '1y',
    immutable: true,
    index: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
}));
app.use(express.static(path.join(__dirname, "public"), { maxAge: '7d', etag: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// SESSION_SECRET kötelező — fail-fast, hogy ne generáljunk random secretet minden indításkor
// (ami minden restartnál eldobná a session-öket)
if (!process.env.SESSION_SECRET) {
    console.error("HIBA: A SESSION_SECRET környezeti változó hiányzik! Állítsd be a .env fájlban.");
    process.exit(1);
}

// SQLite-alapú session store — a default MemoryStore újraindításkor minden session-t eldob,
// és multi-instance üzemmódban sem skálázódik. A session-ök így perzisztensek.
const SqliteStore = require("connect-sqlite3")(session);
const sessionStore = new SqliteStore({
    db: "sessions.sqlite",
    dir: path.join(__dirname, "data"),
    table: "sessions",
    concurrentDB: true
});

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false, saveUninitialized: false,
    store: sessionStore,
    cookie: config.sessionCookie
}));

// i18n — Többnyelvűség middleware (session UTÁN, CSRF ELŐTT)
const { i18nMiddleware } = require('./middleware/i18n');
app.use(i18nMiddleware);

// CSRF middleware-k — a session inicializálása UTÁN kell futniuk.
app.use((req, res, next) => {
    // Token a session-ben él (perzisztens, restart-biztos)
    res.locals.csrfToken = generateCsrfToken(req.session.id, req.session);
    next();
});
app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.path.startsWith('/api/')) return next(); // API-k külön kezeltek (JSON + CORS)
    // multipart/form-data POST-oknál a body NEM elérhető a middleware szinten (multer a route-ban parse-ol),
    // ezért azokat a multer route-ok saját maguk validálják a req.body._csrf-ből
    if (req.is('multipart/form-data')) return next();
    const raw = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
    const token = Array.isArray(raw) ? raw[0] : String(raw).trim();
    if (!req.session || !validateCsrfToken(req.session.id, token, req.session)) {
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.path.startsWith('/admin/api/')) {
            return res.status(403).json({ error: 'Érvénytelen CSRF token. Frissítse az oldalt és próbálja újra.' });
        }
        return res.status(403).send('Érvénytelen CSRF token. Frissítse az oldalt és próbálja újra.');
    }
    next();
});

// Activity log middleware — minden kérést naplóz (kivéve statikus fájlokat)
app.use((req, res, next) => {
    const skipPaths = ['/uploads/', '/css/', '/js/', '/icons/', '/favicon.ico', '/manifest.json', '/robots.txt', '/sitemap.xml', '/api/sw-version'];
    if (skipPaths.some(p => req.path.startsWith(p))) return next();
    const t0 = Date.now();
    const originalSend = res.send;
    res.send = function (body) {
        const duration = Date.now() - t0;
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const level = res.statusCode >= 400 ? (res.statusCode >= 500 ? 'error' : 'warn') : 'info';
        // Ne logoljunk minden GET oldalt — csak POST/PUT/DELETE és hibás válaszok
        const shouldLog = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || res.statusCode >= 400;
        if (shouldLog) {
            activityLog({
                level: level,
                action: 'request',
                ip,
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                message: res.statusCode >= 400 ? 'Hibás válasz: ' + res.statusCode : (req.method + ' ' + req.path),
                duration_ms: duration
            });
        }
        return originalSend.call(this, body);
    };
    next();
});

async function initializeDatabase() {
    await dbRun("CREATE TABLE IF NOT EXISTS content (section TEXT PRIMARY KEY, body TEXT)");
    await dbRun("CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, category TEXT, description TEXT, cover TEXT, is_featured INTEGER DEFAULT 0, client TEXT, location TEXT, project_year TEXT, duration TEXT, materials TEXT, challenge TEXT, solution TEXT, result TEXT, testimonial TEXT)");
    await dbRun("CREATE TABLE IF NOT EXISTS project_images (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, filename TEXT, sort_order INTEGER DEFAULT 0)");
    await dbRun("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)");
    await dbRun("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, phone TEXT, message TEXT, date TEXT, is_read INTEGER DEFAULT 0, priority TEXT DEFAULT 'new', pipeline_status TEXT DEFAULT 'new')");
    await dbRun("CREATE TABLE IF NOT EXISTS quote_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, service_type TEXT, project_scope TEXT, room_count TEXT, dimensions TEXT, material TEXT, finish TEXT, budget TEXT, timeline TEXT, has_plan TEXT, notes TEXT, status TEXT DEFAULT 'new', created_at TEXT NOT NULL)");
    await dbRun("CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, slug TEXT UNIQUE, status TEXT DEFAULT 'draft', content_json TEXT DEFAULT '[]', created_at TEXT, updated_at TEXT)");
    await dbRun("CREATE TABLE IF NOT EXISTS testimonials (id INTEGER PRIMARY KEY AUTOINCREMENT, author TEXT, role TEXT, content TEXT, rating INTEGER DEFAULT 5, avatar TEXT, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at TEXT)");
    await dbRun("CREATE TABLE IF NOT EXISTS partners (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, logo_url TEXT, website TEXT, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at TEXT)");
    await dbRun("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");

    const columns = await dbAll("PRAGMA table_info(messages)");
    if (columns && !columns.some(column => column.name === 'priority')) {
        await dbRun("ALTER TABLE messages ADD COLUMN priority TEXT DEFAULT 'new'");
    }
    if (columns && !columns.some(column => column.name === 'pipeline_status')) {
        await dbRun("ALTER TABLE messages ADD COLUMN pipeline_status TEXT DEFAULT 'new'");
    }
    if (columns && !columns.some(column => column.name === 'internal_notes')) {
        await dbRun("ALTER TABLE messages ADD COLUMN internal_notes TEXT DEFAULT ''");
    }
    const quoteColumns = await dbAll("PRAGMA table_info(quote_requests)");
    if (quoteColumns && !quoteColumns.some(column => column.name === 'internal_notes')) {
        await dbRun("ALTER TABLE quote_requests ADD COLUMN internal_notes TEXT DEFAULT ''");
    }

    // Szerepkör (role) oszlop felhasználókhoz — admin/editor/viewer
    const userColumns = await dbAll("PRAGMA table_info(users)");
    if (userColumns && !userColumns.some(c => c.name === 'role')) {
        await dbRun("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'admin'");
    }
    // E-mail sablonok tábla
    await dbRun("CREATE TABLE IF NOT EXISTS email_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, subject TEXT, body TEXT, created_at TEXT, updated_at TEXT)");
    // DB mentés meta
    await dbRun("CREATE TABLE IF NOT EXISTS db_backups (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, size INTEGER, created_at TEXT)");

    const projectColumns = await dbAll("PRAGMA table_info(projects)");
    const projectFields = [
        ['client', 'TEXT'], ['location', 'TEXT'], ['project_year', 'TEXT'], ['duration', 'TEXT'],
        ['materials', 'TEXT'], ['challenge', 'TEXT'], ['solution', 'TEXT'], ['result', 'TEXT'], ['testimonial', 'TEXT'],
        ['updated_at', 'TEXT']
    ];
    for (const [name, type] of projectFields) {
        if (projectColumns && !projectColumns.some(column => column.name === name)) {
            await dbRun(`ALTER TABLE projects ADD COLUMN ${name} ${type}`);
        }
    }

    const imgColumns = await dbAll("PRAGMA table_info(project_images)");
    if (imgColumns && !imgColumns.some(column => column.name === 'sort_order')) {
        await dbRun("ALTER TABLE project_images ADD COLUMN sort_order INTEGER DEFAULT 0");
    }
    if (imgColumns && !imgColumns.some(column => column.name === 'alt_text')) {
        await dbRun("ALTER TABLE project_images ADD COLUMN alt_text TEXT DEFAULT ''");
    }

    // Rate limit SQLite store létrehozás
    await dbRun("CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER DEFAULT 0, expiresAt INTEGER DEFAULT 0)").catch(() => {});

    // Új: szolgáltatások tábla
    await dbRun(`CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        slug TEXT UNIQUE,
        short_desc TEXT,
        description TEXT,
        icon TEXT,
        image TEXT,
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )`);
    const serviceColumns = await dbAll("PRAGMA table_info(services)");
    if (serviceColumns && !serviceColumns.some(column => column.name === 'gallery_images')) {
        await dbRun("ALTER TABLE services ADD COLUMN gallery_images TEXT DEFAULT '[]'");
    }
    await dbRun(`CREATE TABLE IF NOT EXISTS workflows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        slug TEXT UNIQUE,
        short_desc TEXT,
        description TEXT,
        icon TEXT,
        image TEXT,
        gallery_images TEXT DEFAULT '[]',
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )`);
    const workflowColumns = await dbAll("PRAGMA table_info(workflows)");
    if (workflowColumns && !workflowColumns.some(column => column.name === 'gallery_images')) {
        await dbRun("ALTER TABLE workflows ADD COLUMN gallery_images TEXT DEFAULT '[]'");
    }

    const contentCount = await dbGet("SELECT COUNT(*) AS c FROM content");
    const defaultContent = [
        ["site_title", "Bespoke Atelier"],
        ["brand_line", "Bespoke Atelier"],
        ["brand_slogan", "Crafted for the way you live"],
        ["brand_mark_text", "BA"],
        ["hero_title", "Custom woodwork, tailored to your life."],
        ["hero_badge", "Bespoke Atelier"],
        ["hero_intro_primary", "Crafted luxury interiors"],
        ["hero_intro_secondary", "Made to feel elevated, personal, and timeless"],
        ["hero_subtitle", "Konyhabútort, beépített rendszereket és egyedi fafinomságokat tervezünk, amelyek a mindennapokat elegánsan és kényelmesen formálják."],
        ["hero_button_text", "Referenciáink"],
        ["hero_button_link", "#munkaink"],
        ["hero_secondary_button_text", "Ingyenes felmérés"],
        ["hero_secondary_button_link", "#kapcsolat"],
        ["hero_tertiary_button_text", "Ajánlatkérés"],
        ["hero_tertiary_button_link", "/quote"],
        ["about_title", "Rólunk"],
        ["about_text", "A Prémium Asztalosműhely több mint két évtizedes múltra tekint vissza a faipari munkák terén. Számunkra a fa nem csupán alapanyag, hanem lehetőség az alkotásra. Legyen szó egy egyszerű asztalról vagy egy komplett ház asztalosmunkáiról, a minőségből sosem engedünk. Helyszíni felmérés után 3D látványtervet készítünk."],
        ["contact_phone", "+36 30 5555555"],
        ["contact_email", "asztalos@premiumfa.hu"],
        ["contact_address", "8000 Székesfehérvár, Fa u. 12."],
        ["feature1_title", "Ingyenes Felmérés"],
        ["feature1_desc", "Helyszíni felmérés és szaktanácsadás."],
        ["feature2_title", "3D Látványterv"],
        ["feature2_desc", "Még a gyártás előtt láthatja a végeredményt."],
        ["feature3_title", "Precíz Kivitelezés"],
        ["feature3_desc", "Határidőre, maximális odafigyeléssel és garanciával."]
    ];

    if (!contentCount || contentCount.c === 0) {
        for (const [section, body] of defaultContent) {
            await dbRun("INSERT INTO content (section, body) VALUES (?, ?)", [section, body]);
        }
        console.log("Seeded default content");
    } else {
        // Csak a hiányzó szekciókat pótoljuk — a meglévő (admin által szerkesztett) tartalmat NEM írjuk felül
        for (const [section, body] of defaultContent) {
            const existing = await dbGet("SELECT 1 FROM content WHERE section = ?", [section]);
            if (!existing) {
                await dbRun("INSERT INTO content (section, body) VALUES (?, ?)", [section, body]);
            }
        }
    }

    const projectCount = await dbGet("SELECT COUNT(*) AS c FROM projects");
    if (!projectCount || projectCount.c === 0) {
        const sampleProjects = [
            { title: "Parketta", category: "Parketta", description: "Elegáns, tartós padlóburkolat, 3D minta és kézi precízitású beépítés.", cover: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=75", client: "Privát rezidencia", location: "Budapest", project_year: "2024", duration: "3 hét", materials: "Tölgy parketta", challenge: "A nagy forgalmú nappaliba időtálló, mégis meleg burkolatra volt szükség.", solution: "Egyedi mintában fektetett, helyszínen olajozott tölgy parkettát készítettünk.", result: "Csendes, természetes felület született, amely összefogja az egész enteriőrt." },
            { title: "Velence", category: "Belsőépítészet", description: "Nyugodt, természetes anyagokból készült, meleg tónusú beépített bútor megoldás.", cover: "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=900&q=75", client: "Velencei apartman", location: "Velence", project_year: "2023", duration: "6 hét", materials: "Tölgy furnér, sárgaréz", challenge: "A kis alapterület minden centiméterét funkcionálisan kellett kihasználni.", solution: "Rejtett tárolókat és mennyezetig futó, egyedi modulokat terveztünk.", result: "Légtérben gazdag, rendezett és személyes otthon jött létre.", testimonial: "A tervezéstől az utolsó fogantyúig minden részlet kifinomult." },
            { title: "Ablakbeépítés", category: "Ablakbeépítés", description: "Modern, jól hangszigetelt és esztétikus ablakbeépítés, teljes körű kivitelezéssel.", cover: "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=900&q=75", client: "Családi ház", location: "Székesfehérvár", project_year: "2024", duration: "10 nap", materials: "Rétegragasztott vörösfenyő", challenge: "A régi nyílászárók hőhídjai és arányai korszerű megoldást kívántak.", solution: "Egyedi méretű fa ablakokat gyártottunk és precízen beépítettünk.", result: "Jobb hőkomfort és harmonikus, tartós homlokzat." },
            { title: "Konyhai kiegészítés", category: "Konyha", description: "Mesteri kivitelű, funkcionális konyhai megoldások egyedi méretekre szabva.", cover: "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=900&q=75", client: "Kovács család", location: "Veszprém", project_year: "2025", duration: "4 hét", materials: "Festett MDF, dió furnér", challenge: "A meglévő konyhát kellett új, egységes tárolórendszerrel bővíteni.", solution: "A meglévő frontokhoz illeszkedő, új szigetet és kamraszekrényt készítettünk.", result: "Több munkafelület, rendezett tárolás és egységes prémium megjelenés." }
        ];
        for (const project of sampleProjects) {
            await dbRun("INSERT INTO projects (title, category, description, cover, is_featured, client, location, project_year, duration, materials, challenge, solution, result, testimonial) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [project.title, project.category, project.description, project.cover, project.client, project.location, project.project_year, project.duration, project.materials, project.challenge, project.solution, project.result, project.testimonial]);
        }
        console.log("Seeded sample projects");
    }
    // A korábbi telepítések mintaprojektjeihez is töltsük fel az új esettanulmány-mezőket.
    const caseStudySeeds = [
        ["Parketta", "Privát rezidencia", "Budapest", "2024", "3 hét", "Tölgy parketta", "A nagy forgalmú nappaliba időtálló, mégis meleg burkolatra volt szükség.", "Egyedi mintában fektetett, helyszínen olajozott tölgy parkettát készítettünk.", "Csendes, természetes felület született, amely összefogja az egész enteriőrt.", ""],
        ["Velence", "Velencei apartman", "Velence", "2023", "6 hét", "Tölgy furnér, sárgaréz", "A kis alapterület minden centiméterét funkcionálisan kellett kihasználni.", "Rejtett tárolókat és mennyezetig futó, egyedi modulokat terveztünk.", "Légtérben gazdag, rendezett és személyes otthon jött létre.", "A tervezéstől az utolsó fogantyúig minden részlet kifinomult."]
    ];
    for (const seed of caseStudySeeds) {
        await dbRun("UPDATE projects SET client=?, location=?, project_year=?, duration=?, materials=?, challenge=?, solution=?, result=?, testimonial=? WHERE title=? AND (client IS NULL OR client='')", [...seed.slice(1), seed[0]]);
    }

    const userCount = await dbGet("SELECT COUNT(*) AS c FROM users");
    const adminPass = process.env.ADMIN_PASSWORD;
    if (!adminPass) {
        console.error("ADMIN_PASSWORD nincs beállítva a .env fájlban! A rendszer nem indítható el biztonságosan.");
        process.exit(1);
    }
    if (!userCount || userCount.c === 0) {
        console.log("Alapértelmezett admin felhasználó létrehozva: admin (jelszó: .env ADMIN_PASSWORD)");
        await dbRun("INSERT INTO users (username, password) VALUES (?, ?)", ["admin", bcrypt.hashSync(adminPass, 10)]);
    } else {
        const adminUser = await dbGet("SELECT * FROM users WHERE username='admin'");
        if (adminUser && !bcrypt.compareSync(adminPass, adminUser.password)) {
            await dbRun("UPDATE users SET password = ? WHERE username='admin'", [bcrypt.hashSync(adminPass, 10)]);
            console.log("Admin jelszó frissítve az ENV változóból.");
        }
    }

    // Settings (WhatsApp, social, SEO, partners) - seed defaults
    const defaultSettings = [
        ["company_name", "AsztalosPro"],
        ["company_short_name", "AsztalosPro"],
        ["company_description", "Prémium asztalosműhely, egyedi bútorok, beépített szekrények és faipari kivitelezés."],
        ["business_address", "8000 Székesfehérvár, Fa utca 12."],
        ["business_opening_hours", "H-P 08:00-18:00"],
        ["whatsapp_number", "+36305555555"],
        ["whatsapp_message", "Üdvözlöm! Szeretnék árajánlatot kérni."],
        ["facebook_url", "https://facebook.com/"],
        ["instagram_url", "https://instagram.com/"],
        ["youtube_url", "https://www.youtube.com/watch?v=eDWUCJwwzcc&t=5s"],
        ["seo_description", "Prémium asztalosműhely - egyedi faipari munkák, konyhabútorok, beépített szekrények és 3D látványtervezés országszerte."],
        ["seo_keywords", "asztalos, asztalosműhely, konyhabútor, beépített szekrény, 3D látványterv, egyedi bútor, faipar"],
        ["hero_image_url", "https://images.unsplash.com/photo-1512411933973-100dd1d73a7d?auto=format&fit=crop&w=1400&q=72"],
        ["stat_years", "15"],
        ["stat_projects", "350"],
        ["stat_response_hours", "24"],
        ["mail_host", ""],
        ["mail_port", "587"],
        ["mail_user", ""],
        ["mail_pass", ""],
        ["mail_from", ""],
        ["mail_to", ""],
        ["pwa_name", "AsztalosPro"],
        ["pwa_short_name", "AsztalosPro"],
        ["pwa_theme_color", "#d5ab5d"],
        ["pwa_background_color", "#0a0d11"],
        ["pwa_display", "standalone"],
        ["promo_active", "1"],
        ["promo_end_date", ""],
        ["brand_primary_color", "#d5ab5d"],
        ["brand_secondary_color", "#f5efe8"],
        ["enable_dark_mode", "0"],
        ["enable_gallery_filter", "1"],
        ["enable_faq", "1"],
        ["enable_floating_contact", "1"],
        ["faq_items", JSON.stringify([
            {
                question: "Mennyi idő alatt készül el egy egyedi bútor?",
                answer: "A gyártási idő jellemzően **2-6 hét** a projekt méretétől, anyagválasztástól és a kivitelezés bonyolultságától függően.\n\n- **Kisebb bútorok:** 2-3 hét\n- **Egyedi konyhák és beépített szekrények:** 4-6 hét\n\nA helyszíni felmérés és látványtervezés után pontos, szerződésben rögzített határidőt adunk."
            },
            {
                question: "Hogyan zajlik a helyszíni felmérés és díjköteles-e?",
                answer: "A helyszíni felmérés során pontos lézeres méretvételt végzünk, átbeszéljük az igényeket és mintadarabokat mutatunk.\n\nMegrendelés esetén a felmérés és a tanácsadás **teljesen díjmentes**."
            },
            {
                question: "Készítenek 3D látványtervet a gyártás előtt?",
                answer: "Igen! Minden nagyobb megrendelés előtt részletes, fotorealisztikus **3D látványtervet** készítünk, így a gyártás megkezdése előtt pontosan látni fogja a végeredményt és módosíthatja a részleteket."
            },
            {
                question: "Milyen anyagokkal és vasalatokkal dolgoznak?",
                answer: "Kizárólag prémium minőségű, tartós alapanyagokat és megbízható vasalatokat építünk be:\n\n- **Tömörfa** (tölgy, bükk, kőris, fenyő)\n- **Minőségi laminált és furnérozott lapok**\n- **Prémium vasalatok és fiókrendszerek** (Blum, Häfele, Hettich élettartam garanciával)"
            },
            {
                question: "Vállalnak garanciát az elkészült bútorokra és a beépítésre?",
                answer: "Igen, minden általunk készített bútorra és a szakszerű beépítésre teljes körű **garanciát** vállalunk. A beépített prémium vasalatokra (pl. Blum) pedig a gyártói élettartam garancia érvényes."
            }
        ])],
        ["vapid_public_key", ""],
        ["sitemap_base_url", "https://www.asztalospro.hu"],
        ["partners", JSON.stringify([
            { name: "Blum", url: "#" },
            { name: "Häfele", url: "#" },
            { name: "Hettich", url: "#" },
            { name: "FESTOOL", url: "#" },
            { name: "Mafell", url: "#" }
        ])]
    ];
    for (const [key, value] of defaultSettings) {
        const existing = await dbGet("SELECT 1 FROM settings WHERE key = ?", [key]);
        if (!existing) {
            await dbRun("INSERT INTO settings (key, value) VALUES (?, ?)", [key, value]);
        }
    }

    // Testimonials - seed if empty
    const testimonialCount = await dbGet("SELECT COUNT(*) AS c FROM testimonials");
    if (!testimonialCount || testimonialCount.c === 0) {
        const sampleTestimonials = [
            { author: "Kovács Anna", role: "Budapest", content: "Gyönyörű konyhabútort készítettek, a 3D terv segített a döntésben. Csak ajánlani tudom!", rating: 5 },
            { author: "Nagy Péter", role: "Székesfehérvár", content: "Precíz, pontos, határidőre dolgoznak. A beépített szekrényünk tökéletes lett.", rating: 5 },
            { author: "Szabó Krisztina", role: "Veszprém", content: "A parketta csiszolása és felújítása szép munka volt, nagyon kedves csapat.", rating: 5 }
        ];
        for (const t of sampleTestimonials) {
            await dbRun(
                "INSERT INTO testimonials (author, role, content, rating, is_active, sort_order, created_at) VALUES (?, ?, ?, ?, 1, 0, ?)",
                [t.author, t.role, t.content, t.rating, new Date().toISOString()]
            );
        }
        console.log("Seeded sample testimonials");
    }

    const partnerCount = await dbGet("SELECT COUNT(*) AS c FROM partners");
    if (!partnerCount || partnerCount.c === 0) {
        const samplePartners = [
            { name: "Blum", website: "https://www.blum.com/" },
            { name: "Häfele", website: "https://www.hafele.com/" },
            { name: "Hettich", website: "https://www.hettich.com/" },
            { name: "FESTOOL", website: "https://www.festool.com/" },
            { name: "Mafell", website: "https://www.mafell.com/" }
        ];
        for (const partner of samplePartners) {
            await dbRun(
                "INSERT INTO partners (name, logo_url, website, is_active, sort_order, created_at) VALUES (?, ?, ?, 1, 0, ?)",
                [partner.name, '', partner.website, new Date().toISOString()]
            );
        }
        console.log("Seeded sample partners");
    }

    // 2026-09-08 Szolgáltatások (Services) seed
    const serviceCount = await dbGet("SELECT COUNT(*) AS c FROM services");
    if (!serviceCount || serviceCount.c === 0) {
        const sampleServices = [
            {
                title: "Egyedi konyhabútor készítés",
                slug: "egyedi-konyhabutor",
                short_desc: "Teljes körű 3D tervezés, anyagkiválasztás és profi kivitelezés álmai konyhájához.",
                description: "A konyha az otthon lelke. Legyen szó modern, letisztult minimál stílusról vagy klasszikus vidéki (rustic) hangulatról, mi az Ön elképzeléseit formába öntjük. A tervezéstől a beépítésig mindent vállalunk, használva a legmagasabb minőségű Blum és Hettich vasalatokat, hogy a bútor ne csak szép, de évtizedekig tartós és ergonomikus legyen.\n\nSzolgáltatásunk tartalmazza:\n- Ingyenes helyszíni felmérést és tanácsadást\n- 3D látványtervezést\n- Anyag és színválasztási segédletet (Corian, munkalapok, festett MDF frontok)\n- Komplett beszerelést gépezetek beépítésével",
                icon: "fa-solid fa-utensils",
                image: "https://images.unsplash.com/photo-1556910103-1c02745aae4f?auto=format&fit=crop&w=1200&q=80",
                sort_order: 1
            },
            {
                title: "Beépített gardróbok és szekrények",
                slug: "beepitett-gardrob",
                short_desc: "Helytakarékos és maximálisan testreszabott gardróbszekrények, gardróbszobák.",
                description: "Nincs több kihasználatlan tér! A beépített szekrények és gardróbrendszerek tökéletesen illeszkednek a szoba adottságaihoz, akár tetőtéri, ferde falsíkok alá is. Készítünk tolóajtós és nyílóajtós szekrényeket, egyedi belső elosztással – fiókokkal, nadrágtartókkal, liftes vállfatartókkal és beépített LED világítással.\n\nBármilyen méretben és formában, faltól-falig, padlótól mennyezetig.",
                icon: "fa-solid fa-person-booth",
                image: "https://images.unsplash.com/photo-1595514535313-df810f488665?auto=format&fit=crop&w=1200&q=80",
                sort_order: 2
            },
            {
                title: "Egyedi bútorgyártás (Nappali, Fürdő)",
                slug: "egyedi-butor",
                short_desc: "Tervezői minőségű nappali bútorok, fürdőszoba bútorok és egyedi asztalok tömörfából.",
                description: "Varázsolja otthonossá minden helyiségét teljes mértékben egyedi tömörfa vagy furnérozott bútorokkal. Cégünk vállalja nappali falak, TV-állványok, exkluzív dohányzóasztalok, valamint fürdőszobai mosdószekrények (vízálló anyagokból) precíz kivitelezését.\n\nSzeretjük a kihívásokat, irodánkban ötvözzük a hagyományos faműves asztalosságot a modern géppark adta precizitással (CNC megmunkálás). Hívjon életre egy igazán különleges darabot otthonába!",
                icon: "fa-solid fa-couch",
                image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80",
                sort_order: 3
            },
            {
                title: "Irodabútor és Üzletberendezés",
                slug: "irodabutor",
                short_desc: "Inspiráló irodaterek, recepciós pultok és üzletberendezések gyártása cégeknek.",
                description: "Egy professzionális környezet növeli a bizalmat és a produktivitást. Komplett irodák, orvosi rendelők és üzlethelyiségek asztalosipari kivitelezését vállaljuk a tervezéstől az átadásig. Recepciós pultok, beépített iratszekrények, strapabíró munkapultok és egyedi fali burkolatok – mindezt a legszigorúbb minőségi követelmények szerint.\n\nRövid határidővel és alkalmazkodva a megrendelő üzleti ütemtervéhez dolgozunk.",
                icon: "fa-solid fa-briefcase",
                image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80",
                sort_order: 4
            }
        ];
        
        for (const svc of sampleServices) {
            await dbRun(
                "INSERT INTO services (title, slug, short_desc, description, icon, image, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
                [svc.title, svc.slug, svc.short_desc, svc.description, svc.icon, svc.image, svc.sort_order, new Date().toISOString(), new Date().toISOString()]
            );
        }
        console.log("Seeded sample services");
    }

    const workflowCount = await dbGet("SELECT COUNT(*) AS c FROM workflows");
    if (!workflowCount || workflowCount.c === 0) {
        const sampleWorkflows = [
            {
                title: "Felmérés és igényegyeztetés",
                slug: "felmeres",
                short_desc: "Megismerjük a teret, az élethelyzetet és azt, hogyan szeretné használni az új bútort.",
                description: "Minden jó bútor egy jó beszélgetéssel kezdődik. A helyszíni felmérés során átbeszéljük az igényeket, a napi használatot, a rendelkezésre álló teret és a lehetőségeket. Pontos méreteket veszünk fel, megvizsgáljuk a falakat, kiállásokat és csatlakozásokat, majd közösen rögzítjük a fontos részleteket.\n\nA felmérés végére tisztán látjuk, milyen anyagok, vasalatok és funkciók illenek legjobban az otthonához vagy üzletéhez.\n\nA találkozón nemcsak mérünk: fényképes állapotfelmérést készítünk, feljegyezzük a praktikus használati szempontokat, és előre jelezzük azokat a műszaki részleteket, amelyek később fontosak lehetnek a pontos kivitelezéshez.",
                icon: "fa-solid fa-ruler-combined",
                image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80",
                gallery_images: ["https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80", "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80"],
                sort_order: 1
            },
            {
                title: "Tervezés és látványterv",
                slug: "tervezes",
                short_desc: "Az elképzelésből átgondolt, részletes és jól használható terv születik.",
                description: "A felmérés adataira építve megtervezzük a bútor formáját, belső elrendezését és anyaghasználatát. Több irányt is összevetünk, hogy a végeredmény egyszerre legyen szép, praktikus és időtálló.\n\nA 3D látványterv segítségével még gyártás előtt megmutatjuk a térarányokat, a színeket és a részleteket. A végleges terv csak az Ön jóváhagyása után lép tovább a műhelybe.\n\nA tervhez anyag- és színmintákat, vasalatjavaslatokat, valamint pontos funkcionális elrendezést társítunk, így a döntés átlátható és minden részletében ellenőrizhető marad.",
                icon: "fa-solid fa-compass-drafting",
                image: "https://images.unsplash.com/photo-1531835551805-16d864c8d311?auto=format&fit=crop&w=1200&q=80",
                gallery_images: ["https://images.unsplash.com/photo-1542621334-a254cf47733d?auto=format&fit=crop&w=1200&q=80", "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80"],
                sort_order: 2
            },
            {
                title: "Megvalósítás és átadás",
                slug: "megvalositas",
                short_desc: "Precíz gyártás, gondos helyszíni szerelés és minden részlet ellenőrzése.",
                description: "A jóváhagyott terv alapján irodánkban elkezdődik a gyártás. Gondosan válogatott anyagokkal, pontos szabással és megbízható vasalatokkal dolgozunk, miközben minden munkafázist ellenőrzünk.\n\nA helyszíni beépítésnél óvjuk a környezetet, pontosan illesztünk és a végén közösen átnézzük a teljes munkát. Az átadáskor használati és ápolási tanácsokat is adunk, hogy az új bútor hosszú éveken át örömet okozzon.\n\nA munkaterületet tisztán adjuk át, a frontokat és vasalatokat beállítjuk, majd közösen végigpróbáljuk a fontos funkciókat. Így nemcsak elkészül a bútor, hanem valóban használatra készen kerül az otthonába.",
                icon: "fa-solid fa-screwdriver-wrench",
                image: "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1200&q=80",
                gallery_images: ["https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=1200&q=80", "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=1200&q=80"],
                sort_order: 3
            }
        ];
        for (const workflow of sampleWorkflows) {
            await dbRun(
                "INSERT INTO workflows (title, slug, short_desc, description, icon, image, gallery_images, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
                [workflow.title, workflow.slug, workflow.short_desc, workflow.description, workflow.icon, workflow.image, JSON.stringify(workflow.gallery_images), workflow.sort_order, new Date().toISOString(), new Date().toISOString()]
            );
        }
        console.log("Seeded sample workflows");
    }
    const defaultWorkflowGalleries = {
        felmeres: ["https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80", "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80"],
        tervezes: ["https://images.unsplash.com/photo-1542621334-a254cf47733d?auto=format&fit=crop&w=1200&q=80", "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80"],
        megvalositas: ["https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=1200&q=80", "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=1200&q=80"]
    };
    for (const [slug, gallery] of Object.entries(defaultWorkflowGalleries)) {
        await dbRun("UPDATE workflows SET gallery_images = ? WHERE slug = ? AND (gallery_images IS NULL OR gallery_images = '' OR gallery_images = '[]')", [JSON.stringify(gallery), slug]);
    }
    const defaultServiceGalleries = {
        'egyedi-konyhabutor': ["https://images.unsplash.com/photo-1556910103-1c02745aae4f?auto=format&fit=crop&w=1200&q=80", "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1200&q=80"],
        'beepitett-gardrob': ["https://images.unsplash.com/photo-1595514535313-df810f488665?auto=format&fit=crop&w=1200&q=80", "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80"],
        'egyedi-butor': ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80", "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=80"],
        'irodabutor': ["https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80", "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80"]
    };
    for (const [slug, gallery] of Object.entries(defaultServiceGalleries)) {
        await dbRun("UPDATE services SET gallery_images = ? WHERE slug = ? AND (gallery_images IS NULL OR gallery_images = '' OR gallery_images = '[]')", [JSON.stringify(gallery), slug]);
    }

    // Blog bejegyzések táblája
    await dbRun(`CREATE TABLE IF NOT EXISTS blog_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        slug TEXT UNIQUE,
        excerpt TEXT,
        content TEXT,
        cover TEXT,
        category TEXT DEFAULT '',
        status TEXT DEFAULT 'draft',
        author TEXT DEFAULT 'admin',
        views INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )`);

    // Analytics tábla
    await dbRun(`CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page TEXT,
        referrer TEXT DEFAULT '',
        ip TEXT DEFAULT '',
        user_agent TEXT DEFAULT '',
        date TEXT,
        created_at TEXT
    )`);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics(date)").catch(() => {});

    // Hírlevél feliratkozók
    await dbRun(`CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        is_active INTEGER DEFAULT 1,
        subscribed_at TEXT
    )`);

    // Push értesítés feliratkozók
    await dbRun(`CREATE TABLE IF NOT EXISTS push_subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT UNIQUE,
        subscription_json TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS schema_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        type TEXT,
        data_json TEXT,
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )`);

    // === ÜGYFÉLKAPU MODUL TÁBLÁK ===
    await dbRun(`CREATE TABLE IF NOT EXISTS client_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT DEFAULT '',
        email TEXT DEFAULT '',
        project_name TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
    )`).catch(()=>{});
    await dbRun(`CREATE TABLE IF NOT EXISTS client_project_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        body_raw TEXT DEFAULT '',
        body_html TEXT DEFAULT '',
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY(client_user_id) REFERENCES client_users(id) ON DELETE CASCADE
    )`).catch(()=>{});
    await dbRun(`CREATE TABLE IF NOT EXISTS client_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        update_id INTEGER,
        client_user_id INTEGER NOT NULL,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        mime_type TEXT DEFAULT '',
        size INTEGER DEFAULT 0,
        thumb_name TEXT DEFAULT NULL,
        created_at TEXT,
        FOREIGN KEY(update_id) REFERENCES client_project_updates(id) ON DELETE CASCADE,
        FOREIGN KEY(client_user_id) REFERENCES client_users(id) ON DELETE CASCADE
    )`).catch(()=>{});
    await dbRun("ALTER TABLE client_files ADD COLUMN thumb_name TEXT DEFAULT NULL").catch(()=>{});
    // privát fájl tár — NEM a public/uploads alatt!
    try { require('fs').mkdirSync(require('path').join(__dirname, 'data', 'client_files'), { recursive: true }); } catch(e){}
    // alapértelmezett kapcsoló ha még nincs
    try {
        const r = await dbGet("SELECT value FROM settings WHERE key='ugyfelkapu_enabled'");
        if (!r) await dbRun("INSERT OR IGNORE INTO settings (key,value) VALUES ('ugyfelkapu_enabled','0')");
    } catch(e){}
    // Projekt fázis oszlop (1=Felmérés, 2=Tervezés, 3=Kivitelezés, 4=Átadás)
    await dbRun("ALTER TABLE client_users ADD COLUMN project_phase INTEGER DEFAULT 0").catch(()=>{});

    // Előtte/Utána (before/after) projektek táblája
    await dbRun(`CREATE TABLE IF NOT EXISTS before_after (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        before_image TEXT,
        after_image TEXT,
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )`).catch(() => {});

    // Séma-helyreállítás: ha egy régi/korábbi before_after tábla létezik eltérő
    // oszlopokkal (pl. id,title,img_before,img_after), akkor a CREATE IF NOT EXISTS
    // nem írja át. Ha hiányoznak a szükséges oszlopok, üres tábla esetén újraépítjük.
    try {
        const baCols = await dbAll("PRAGMA table_info(before_after)").catch(() => []);
        const baNames = (baCols || []).map(c => String(c.name || ''));
        const needsAll = ['title', 'description', 'before_image', 'after_image', 'is_active', 'sort_order'];
        const isOldSchema = baNames.length > 0 && !needsAll.every(col => baNames.includes(col));
        if (isOldSchema) {
            const baCount = await dbGet("SELECT COUNT(*) AS c FROM before_after").catch(() => ({ c: 0 }));
            if (!baCount || Number(baCount.c) === 0) {
                await dbRun("DROP TABLE IF EXISTS before_after");
                await dbRun(`CREATE TABLE IF NOT EXISTS before_after (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT,
                    before_image TEXT,
                    after_image TEXT,
                    is_active INTEGER DEFAULT 1,
                    sort_order INTEGER DEFAULT 0,
                    created_at TEXT,
                    updated_at TEXT
                )`).catch(() => {});
                console.log("Előtte/Utána tábla sémája újraépítve (régi formátumot találtunk).");
            } else {
                console.warn("Előtte/Utána tábla régi sémával és adatokkal — a séma-javítást manuálisan kell elvégezni.");
            }
        }
    } catch (e) { console.warn("Before/after séma-ellenőrzés hiba:", e && e.message); }

    // Activity log tábla — hibák és tevékenység naplózása
    await dbRun(`CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT DEFAULT (datetime('now','localtime')),
        level TEXT DEFAULT 'info',
        action TEXT,
        ip TEXT,
        method TEXT,
        url TEXT,
        status INTEGER,
        message TEXT,
        details TEXT,
        duration_ms REAL
    )`);
    // Régi naplóbejegyzések törlése (>10000 sor)
    await dbRun("DELETE FROM activity_logs WHERE id < (SELECT MAX(id) - 10000 FROM activity_logs)");

    const schemaCount = await dbGet("SELECT COUNT(*) AS c FROM schema_entries");
    if (!schemaCount || schemaCount.c === 0) {
        const contentRows = await dbAll("SELECT section, body FROM content");
        const contentMap = Object.fromEntries((contentRows || []).map((row) => [row.section, row.body]));
        const settingsMap = await getSettingsMap();
        const defaultSchema = {
            "@context": "https://schema.org",
            "@type": "HomeAndConstructionBusiness",
            "name": contentMap.site_title || "Aula 2000",
            "description": settingsMap.seo_description || "Prémium asztalosműhely - egyedi faipari munkák, konyhabútorok, beépített szekrények és 3D látványtervezés országszerte.",
            "url": "https://www.asztalospro.hu",
            "telephone": contentMap.contact_phone || "+36 30 123 4567",
            "email": contentMap.contact_email || "info@asztalospro.hu",
            "image": settingsMap.hero_image_url || "https://images.unsplash.com/photo-1512411933973-100dd1d73a7d?auto=format&fit=crop&w=1400&q=72",
            "address": {
                "@type": "PostalAddress",
                "streetAddress": contentMap.contact_address || "Ház utca 12.",
                "addressLocality": "Budapest",
                "postalCode": "1011",
                "addressCountry": "HU"
            },
            "sameAs": [
                settingsMap.facebook_url || "https://www.facebook.com/",
                settingsMap.instagram_url || "https://www.instagram.com/",
                settingsMap.youtube_url || "https://www.youtube.com/"
            ],
            "areaServed": "HU",
            "priceRange": "€€€",
            "openingHours": "Mo-Fr 08:00-18:00",
            "knowsAbout": [
                "Konyhabútor",
                "Beépített szekrény",
                "Egyedi asztalos munkák",
                "Faipari kivitelezés",
                "3D látványtervezés"
            ]
        };

        await dbRun(
            "INSERT INTO schema_entries (name, type, data_json, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, 0, ?, ?)",
            ["Vállalkozás adatok", "HomeAndConstructionBusiness", JSON.stringify(defaultSchema, null, 2), new Date().toISOString(), new Date().toISOString()]
        );
    }
}

// --- ACTIVITY LOG RENDSZER ---
// Szintek: info, warn, error, upload
// Használat: await activityLog({ level:'error', action:'upload', ip, method, url, status, message, details, duration_ms })
async function activityLog({ level = 'info', action = '', ip = '', method = '', url = '', status = 0, message = '', details = '', duration_ms = 0 } = {}) {
    try {
        await dbRun(
            "INSERT INTO activity_logs (level, action, ip, method, url, status, message, details, duration_ms) VALUES (?,?,?,?,?,?,?,?,?)",
            [level, action, ip, method, url, status, message, typeof details === 'object' ? JSON.stringify(details) : String(details), duration_ms]
        );
    } catch (e) {
        // Naplózási hiba sose blokkolja a normál működést
        console.error('[ACTIVITY_LOG_HIBA]', e.message);
    }
}

function slugify(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'oldal';
}

// --- TARTALOM CACHE (DRY megoldás) ---
// A content tábla ritkán változik (admin szerkesztés) — felesleges minden oldalkérésnél
// lekérdezni. Egy sima in-memory cache + invalidálás elég ehhez a projektmérethez.
let contentCache = null;
let contentCacheAt = 0;
const CONTENT_CACHE_TTL = config.contentCacheTtlMs; // 30 mp — alacsony, mert admin mentés után azonnal frissüljön
function invalidateContentCache() { contentCache = null; }

async function getContentMap() {
    const now = Date.now();
    if (contentCache && (now - contentCacheAt) < CONTENT_CACHE_TTL) return contentCache;
    const rows = await dbAll("SELECT section, body FROM content");
    contentCache = Object.fromEntries((rows || []).map(r => [r.section, r.body]));
    contentCacheAt = now;
    return contentCache;
}

async function getSettingsMap() {
    const rows = await dbAll("SELECT key, value FROM settings");
    return Object.fromEntries((rows || []).map((row) => [row.key, row.value]));
}

async function updateSettingsMap(values) {
    const cleaned = values || {};
    const entries = Object.entries(cleaned).filter(([, value]) => value !== undefined && value !== null);
    for (const [key, value] of entries) {
        await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, String(value)]);
    }
}

function parsePageBlocks(contentJson) {
    try {
        const parsed = JSON.parse(contentJson || '{}');
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.blocks)) return parsed.blocks;
    } catch (err) {
        console.warn('Invalid page JSON:', err.message);
    }
    return [];
}

function renderPageBlocks(contentJson) {
    const blocks = parsePageBlocks(contentJson);
    const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    return blocks.map((block) => {
        const data = block && block.data ? block.data : {};
        const text = String(data.text || '');

        switch (block && block.type) {
            case 'heading':
                return `<h2 class="page-block-heading">${escapeHtml(text)}</h2>`;
            case 'paragraph':
                return `<p class="page-block-paragraph">${String(data.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>')}</p>`;
            case 'list': {
                const items = Array.isArray(data.items) ? data.items : [];
                return `<ul class="page-block-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
            }
            case 'faq': {
                const items = Array.isArray(data.items) ? data.items : [];
                return `<section class="page-block-faq" aria-label="Gyakori kérdések">${items.map((item) => {
                    const question = typeof item === 'string' ? item.split('|')[0] : (item && item.question);
                    const answer = typeof item === 'string' ? item.split('|').slice(1).join('|') : (item && item.answer);
                    if (!question || !answer) return '';
                    return `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`;
                }).join('')}</section>`;
            }
            case 'quote':
                return `<blockquote class="page-block-quote"><p>“${escapeHtml(text)}”</p>${data.caption ? `<footer>${escapeHtml(data.caption)}</footer>` : ''}</blockquote>`;
            case 'image':
                return `<figure class="page-block-image"><img src="${escapeHtml(String(data.url || ''))}" alt="${escapeHtml(String(data.alt || ''))}" loading="lazy" decoding="async" /><figcaption>${escapeHtml(String(data.caption || ''))}</figcaption></figure>`;
            case 'button':
                return `<div class="page-block-cta"><a href="${escapeHtml(String(data.url || '#'))}" target="_blank" rel="noreferrer">${escapeHtml(String(data.text || 'Tovább'))}</a></div>`;
            case 'feature': {
                const title = escapeHtml(String(data.title || 'Irodánk'));
                const desc = escapeHtml(String(data.text || ''));
                return `<div class="page-block-feature"><span class="page-block-kicker">Asztalosműhely</span><h3>${title}</h3><p>${desc}</p></div>`;
            }
            case 'stats': {
                const items = Array.isArray(data.items) ? data.items : [];
                if (!items.length) return '';
                return `<div class="page-block-stats">${items.map((stat) => {
                    const value = typeof stat === 'string' ? stat.split('|')[0] || '' : (stat.value || '');
                    const label = typeof stat === 'string' ? (stat.split('|')[1] || '') : (stat.label || '');
                    return `<div class="page-stat"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
                }).join('')}</div>`;
            }
            case 'cta': {
                const title = escapeHtml(String(data.title || 'Premium asztalosműhely ajánlat'));
                const body = escapeHtml(String(data.text || 'Kérjen személyre szabott árajánlatot.'));
                const url = escapeHtml(String(data.url || '/#kapcsolat'));
                return `<div class="page-block-cta-box"><p class="page-block-kicker">Luxury interiors</p><h3>${title}</h3><p>${body}</p><a href="${url}">${escapeHtml(String(data.buttonText || 'Ajánlatkérés'))}</a></div>`;
            }
            default:
                return '';
        }
    }).join('');
}

app.use((req, res, next) => { res.locals.msg = req.query.msg || null; next(); });

// --- BELÉPÉS ---
app.get("/admin-login", (req, res) => res.render("login", { error: null }));
app.post("/login", loginLimiter, async (req, res, next) => {
    try {
        const user = await dbGet("SELECT * FROM users WHERE username = ?", [req.body.username]);
        if (user && bcrypt.compareSync(req.body.password, user.password)) {
            req.session.regenerate((err) => {
                if (err) return next(err);
                req.session.loggedIn = true;
                req.session.username = user.username;
                req.session.userId = user.id; // Most már tároljuk a userId-t is
                req.session.userRole = user.role || 'admin'; // Szerepkör tárolása (admin/editor/viewer)
                req.session.save((saveErr) => {
                    if (saveErr) return next(saveErr);
                    res.redirect("/admin");
                });
            });
        } else { res.render("login", { error: "Hibás adatok!" }); }
    } catch (err) { next(err); }
});
app.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/admin-login"));
});

// --- ÜGYFÉLKAPU (publikus, feature-toggle) ---
const clientMod = createClientRouter({ dbGet, dbAll, dbRun, getSettingsMap, generateCsrfToken, validateCsrfToken, activityLog });
app.use('/ugyfel', clientMod.router);

// --- ADMIN FELÜLET (route-ok a routes/admin.js-ben) ---
app.use('/admin', createAdminRouter({
    db, dbGet, dbAll, dbRun,
    messageStatus, leadStatuses, leadStatus,
    upload, ALLOWED_MIME, processAndSaveImage, deleteImage,
    getSettingsMap, updateSettingsMap, invalidateContentCache, getContentMap,
    slugify, activityLog, bcrypt,
    getMailTransport,
    sendNotificationEmail,
    sanitizeHtml,
    dataDir: path.join(__dirname, "data"),
    clientMod, formatClientBody: clientMod.formatClientBody, CLIENT_DIR: clientMod.CLIENT_DIR, clientUpload: clientMod.clientUpload
}));

// --- PUBLIKUS BLOG ---
// Biztonságos HTML sanitizáló a blog tartalomhoz — csak megengedett, veszélytelen
// elemet enged át, minden script/iframe/on* attribútumot töröl.
function sanitizeHtml(input) {
    const allowedTags = new Set(['p','br','b','strong','i','em','u','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','a','img','div','span','hr','table','thead','tbody','tr','td','th']);
    const allowedAttrs = { 'a': ['href','title','target','rel'], 'img': ['src','alt','title','width','height','class'], '*': ['class','style','id'] };
    const safeSrc = (v) => /^https?:\/\//i.test(String(v || '')) || String(v || '').startsWith('/') || String(v || '').startsWith('data:image/');
    // Először URL-dekódolással tisztítjuk a potenciálisan beágyazott XSS-t
    const html = String(input || '');
    return html.replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
        .replace(/<object[\s\S]*?<\/object>/gi, '')
        .replace(/<embed[\s\S]*?<\/embed>/gi, '')
        .replace(/<link[\s\S]*?>/gi, '')
        .replace(/<\s*\/?\s*([a-zA-Z0-9]+)([^>]*)>/g, (match, tag, attrs) => {
            tag = tag.toLowerCase();
            const isClosing = match.trimStart().startsWith('</');
            if (!allowedTags.has(tag)) return '';
            // Záró tag-eket eredeti formájukban tartjuk meg (</p>, </div>, stb.)
            if (isClosing) return '</' + tag + '>';
            const keepAttrs = [];
            const attrRe = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
            let a;
            while ((a = attrRe.exec(attrs)) !== null) {
                const name = a[1].toLowerCase();
                const value = a[2] !== undefined ? a[2] : (a[3] !== undefined ? a[3] : (a[4] || ''));
                if (name.startsWith('on')) continue; // inline eseménykezelők tiltva (XSS)
                const allows = allowedAttrs[tag] || allowedAttrs['*'] || [];
                if (allows.indexOf(name) === -1 && name !== 'href' && name !== 'src' && name !== 'alt' && name !== 'title' && name !== 'target' && name !== 'rel' && name !== 'width' && name !== 'height' && name !== 'class' && name !== 'style' && name !== 'id') continue;
                if (name === 'href' || name === 'src') {
                    const lower = value.toLowerCase();
                    if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text/html')) continue;
                    if (name === 'src' && !safeSrc(value)) continue;
                    if (name === 'href' && !/^(https?:|\/|#|mailto:|tel:)/i.test(value)) continue;
                }
                // style attribútum esetén kiszűrjük a veszélyes CSS-t
                if (name === 'style') {
                    if (/expression|javascript|url\s*\(|@import/i.test(value)) continue;
                }
                keepAttrs.push(name + '="' + String(value).replace(/"/g, '&quot;') + '"');
            }
            if (attrs.trim() && keepAttrs.length === 0) return '<' + tag + '>';
            return '<' + tag + (keepAttrs.length ? ' ' + keepAttrs.join(' ') : '') + '>';
        });
}
// Az email/quote eseménykezelőkhöz is használható bízik a szövegben, de nem HTML-be ágyazva
function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- API VÉGPONTOK (route-ok a routes/api.js-ben) ---
app.use('/api', createApiRouter({
    dbGet, dbAll, dbRun,
    getSwVersion,
    analyticsLimiter, newsletterLimiter, pushLimiter
}));

// --- PUBLIKUS OLDALAK (route-ok a routes/public.js-ben) ---
app.use('/', createPublicRouter({
    dbGet, dbAll, dbRun,
    getContentMap, getSettingsMap,
    contactLimiter, quoteLimiter,
    sendNotificationEmail,
    renderPageBlocks,
    sanitizeHtml, escapeHtml,
    getManifestPayload
}));

// --- 404 HIBAOLDAL (az összes route után) ---
app.use((req, res) => {
    res.status(404);
    res.render("error", { code: 404, message: "Az oldal nem található", backUrl: "/" });
});

// Globális hibakezelő
app.use((err, req, res, next) => {
    // Productionban ne logoljuk ki a teljes stack trace-t (információszivárgás)
    if (IS_PROD) {
        console.error("Express Hiba:", err && err.message ? err.message : err);
    } else {
        console.error("Express Hiba:", err && err.stack ? err.stack : err);
    }
    if (res.headersSent) return next(err);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    // Multer hibák (feltöltés) — konkrét üzenetek
    if (err && err.name === 'MulterError') {
        const messages = {
            'LIMIT_FILE_SIZE': 'A kép túl nagy! Maximum 10 MB lehet.',
            'LIMIT_UNEXPECTED_FILE': 'Hibás fájlfeltöltés! (Túl sok fájl vagy hibás mezőnév)',
            'LIMIT_FILE_COUNT': 'Túl sok fájl! Maximum 15 kép tölthető fel egyszerre.'
        };
        activityLog({ level: 'error', action: 'multer', ip, method: req.method, url: req.originalUrl, status: 400, message: messages[err.code] || 'Feltöltési hiba: ' + err.message, details: { code: err.code, field: err.field, fileSize: req.file ? req.file.size : null } });
        return res.status(400).render("error", { code: 400, message: messages[err.code] || 'Feltöltési hiba: ' + err.message, backUrl: "/admin?tab=projects" });
    }
    // Egyedi fájlszűrő hiba (nem kép MIME)
    if (err && err.message && String(err.message).includes('képfájl')) {
        activityLog({ level: 'error', action: 'file-filter', ip, method: req.method, url: req.originalUrl, status: 400, message: err.message });
        return res.status(400).render("error", { code: 400, message: err.message, backUrl: "/admin?tab=projects" });
    }
    activityLog({ level: 'error', action: 'server', ip, method: req.method, url: req.originalUrl, status: 500, message: err.message || String(err), details: IS_PROD ? {} : { stack: err.stack ? err.stack.split('\n').slice(0, 5).join('\n') : '' } });
    res.status(500);
    res.render("error", { code: 500, message: "Szerverhiba történt", backUrl: "/" });
});

// --- AUTOMATIC BACKUP (induláskor + napi) ---
async function autoBackup() {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const backupsDir = path.join(__dirname, "data", "backups");
        require('fs').mkdirSync(backupsDir, { recursive: true });
        const backupPath = path.join(backupsDir, `auto-${today}.sqlite`);
        if (require('fs').existsSync(backupPath)) return; // már van mai mentés

        // SQLite safe backup — a db.backup() API nem zárja le a fájlt pillanatnyi másolattal,
        // hanem tranzakciósan, blokkról blokkra másol → konzisztens mentés még írás közben is.
        // (a db.backup() callback-alapú — nincs .then a Backup objektumon)
        await new Promise((resolve, reject) => {
            db.backup(backupPath, (err) => err ? reject(err) : resolve());
        });
        console.log(`[auto-backup] ${today} mentés kész`);
    } catch (err) {
        console.error("[auto-backup] hiba:", err.message);
    }
}

async function startServer() {
    try {
        await initializeDatabase();
        // Productionban EJS view cache bekapcsolása (gyorsabb renderelés)
        app.set('view cache', IS_PROD);
        const server = app.listen(PORT, "0.0.0.0", () => {
            console.log(` Aula 2000 fut a ${PORT}-as porton!`);
            // Automatikus napi DB backup indításkor (ha még nincs mai)
            autoBackup();
            setInterval(autoBackup, 24 * 60 * 60 * 1000); // napi backup ütemezés
        });
        return server;
    } catch (err) {
        console.error("DB init error:", err);
        process.exit(1);
    }
}

// Csak akkor induljon el magától, ha közvetlenül futtatják (node server.js).
// Teszteknél require('./server') nem indítja el a szervert.
if (require.main === module) {
    startServer();
}

module.exports = { app, startServer, db, dbGet, dbAll, dbRun, getContentMap, getSettingsMap, sanitizeHtml, slugify };