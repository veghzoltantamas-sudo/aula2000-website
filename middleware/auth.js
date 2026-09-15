/**
 * AsztalosPro — Hitelesítési és jogosultság-ellenőrző middleware-ek
 * =====================================================
 * A session-alapú bejelentkezés- és szerepkör-ellenőrzéseket
 * tartalmazza, valamint a saját (csomag nélküli) CSRF token
 * kezelést és a multipart (multer) útvonalakhoz készült CSRF
 * validáló helper-t.
 *
 * Minden függvény a hiányzó jogosultság esetén a megfelelő
 * hibaválasszal / átirányítással tér vissza, így közvetlenül
 * route middleware-ként használhatók.
 */
const crypto = require("crypto");

/**
 * CSRF token generálás — a token a SESSION-ben él (SQLite-ba mentve,
 * restart-biztos). Nem in-memory Map-ben: szerver-restart után a tokenek
 * elvesznének, de a session cookie életben maradna → minden feltöltés/form
 * 403-at adna.
 *
 * FONTOS: a tokent NEM frissítjük időalapon, amíg a session él. Korábban
 * 1 órás TTL volt — ha a felhasználó 2+ admin lapot tart nyitva, és az egyik
 * lapon a szerver új tokent generált (TTL lejárt), a másik lap régi tokene
 * érvénytelen lett → CSRF 403 → az oldal "villódzott"/újratöltődött.
 * A token mostantól a session élettartamáig (24h) stabil.
 */
function generateCsrfToken(sessionId, session) {
    const existing = session._csrf;
    if (existing && existing.token && (Date.now() - (existing.createdAt || 0)) < 24 * 60 * 60 * 1000) {
        return existing.token;
    }
    const token = crypto.randomBytes(32).toString('hex');
    session._csrf = { token, createdAt: Date.now() };
    return token;
}

/**
 * CSRF token validálás — a teljes session-élettartamban érvényes (24h).
 * Nincs időalapú frissítés, így a több lapon nyitott admin nem kap 403-at.
 */
function validateCsrfToken(sessionId, token, session) {
    if (!token || !session || !session._csrf) return false;
    const entry = session._csrf;
    const actualToken = Array.isArray(token) ? token[0] : String(token).trim();
    return entry.token === actualToken && (Date.now() - (entry.createdAt || 0)) < 24 * 60 * 60 * 1000;
}

/**
 * Bejelentkezés ellenőrzés — be nem jelentkezett felhasználót
 * az admin-login oldalra irányít.
 */
function requireLogin(req, res, next) {
    if (!req.session.loggedIn) return res.redirect("/admin-login");
    next();
}

/**
 * Admin-only: csak admin szerepkörrel rendelkezők férhetnek hozzá.
 */
function requireAdmin(req, res, next) {
    if (!req.session.loggedIn) return res.redirect("/admin-login");
    if (req.session.userRole !== 'admin') return res.status(403).render("error", { code: 403, message: "Nincs jogosultság ehhez a művelethez", backUrl: "/admin" });
    next();
}

/**
 * Viewer-n TILTVA: csak admin és editor szerkeszthet.
 */
function requireNotViewer(req, res, next) {
    if (!req.session.loggedIn) return res.redirect("/admin-login");
    if (req.session.userRole === 'viewer') return res.status(403).render("error", { code: 403, message: "A megtekintő szerepkör nem jogosult szerkesztésre", backUrl: "/admin" });
    next();
}

/**
 * CSRF validáló helper a multipart (multer) route-okhoz — a body már
 * parse-olva van itt. A `validateCsrfToken`-t ugyanazzal a forrással
 * használja, mint a server.js középső CSRF middleware-e, így a tokenek
 * konzisztensek maradnak.
 */
function requireCsrf(req, res, next) {
    const raw = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
    const token = Array.isArray(raw) ? raw[0] : String(raw).trim();
    if (!req.session || !validateCsrfToken(req.session.id, token, req.session)) {
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.path.startsWith('/admin/api/')) {
            return res.status(403).json({ error: 'Érvénytelen CSRF token. Frissítse az oldalt és próbálja újra.' });
        }
        return res.status(403).send('Érvénytelen CSRF token. Frissítse az oldalt és próbálja újra.');
    }
    next();
}

module.exports = {
    generateCsrfToken,
    validateCsrfToken,
    requireLogin,
    requireAdmin,
    requireNotViewer,
    requireCsrf
};
