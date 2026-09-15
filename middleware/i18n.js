const fs = require('fs');
const path = require('path');

/**
 * i18n Middleware — Többnyelvűség kezelése
 * 
 * Nyelv sorrend: ?lang= param → cookie → Accept-Language header → alapértelmezett (hu)
 * Támogatott nyelvek: hu, en, de
 * 
 * Használat EJS-ben: t('nav.home'), t('hero.title') stb.
 * Használat route-ban: req.lang, req.t
 */
const SUPPORTED_LANGS = ['hu', 'en', 'de'];
const DEFAULT_LANG = 'hu';
const COOKIE_NAME = 'aula_lang';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // 1 év

// Fordítások cache-je
const translations = {};
let loadedLangs = new Set();

function loadTranslations(lang) {
    if (loadedLangs.has(lang)) return translations[lang];
    try {
        const filePath = path.join(__dirname, '..', 'locales', `${lang}.json`);
        translations[lang] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        loadedLangs.add(lang);
    } catch (e) {
        console.error(`[i18n] Nem sikerült betölteni: ${lang}`, e.message);
        translations[lang] = {};
    }
    return translations[lang];
}

// Elsődleges nyelv betöltése
loadTranslations(DEFAULT_LANG);
SUPPORTED_LANGS.forEach(l => loadTranslations(l));

/**
 * Egyszerű kulcs szerinti fordítás
 * Supports dot-notation: t('nav.home') → translations[lang].nav.home
 */
function createT(lang) {
    const data = translations[lang] || translations[DEFAULT_LANG] || {};
    return function t(key, fallback) {
        const parts = key.split('.');
        let val = data;
        for (const p of parts) {
            if (val && typeof val === 'object' && p in val) {
                val = val[p];
            } else {
                return fallback || key;
            }
        }
        return typeof val === 'string' ? val : (fallback || key);
    };
}

/**
 * Nyelv detektálás
 */
function detectLang(req) {
    // 1. Query param
    const qLang = req.query && req.query.lang;
    if (qLang && SUPPORTED_LANGS.includes(qLang)) return qLang;

    // 2. Cookie (manual parse, mert nincs cookie-parser)
    let cookieLang = null;
    const cookieHeader = req.headers && req.headers.cookie;
    if (cookieHeader) {
        const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE_NAME + '='));
        if (match) cookieLang = match.split('=')[1];
    }
    if (cookieLang && SUPPORTED_LANGS.includes(cookieLang)) return cookieLang;

    // 3. Accept-Language header
    const acceptLang = req.headers['accept-language'] || '';
    for (const supported of SUPPORTED_LANGS) {
        if (acceptLang.toLowerCase().includes(supported)) return supported;
    }

    return DEFAULT_LANG;
}

/**
 * Express middleware
 */
function i18nMiddleware(req, res, next) {
    const lang = detectLang(req);
    req.lang = lang;
    req.t = createT(lang);

    // Cookie beállítás, ha ?lang= van
    if (req.query && req.query.lang && SUPPORTED_LANGS.includes(req.query.lang)) {
        res.cookie(COOKIE_NAME, req.query.lang, {
            maxAge: COOKIE_MAX_AGE,
            httpOnly: true,
            sameSite: 'lax'
        });
        // Ha URL-ben ?lang= van,_REDIRECT-oljuk le a query nélkül
        if (req.method === 'GET' && !req.xhr) {
            const cleanUrl = req.originalUrl.replace(/[?&]lang=[^&]*/, '').replace(/\?$/, '');
            return res.redirect(cleanUrl);
        }
    }

    // EJS sablonokhoz
    res.locals.lang = lang;
    res.locals.t = req.t;
    res.locals.supportedLangs = SUPPORTED_LANGS;
    res.locals.currentLang = lang;
    res.locals.originalUrl = req.originalUrl;

    next();
}

module.exports = { i18nMiddleware, SUPPORTED_LANGS, DEFAULT_LANG };
