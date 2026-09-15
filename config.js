// Központi konfiguráció — környezeti változók és konstansok egy helyen.
// Így a server.js nem kell, hogy minden beállítást szétszórva kezeljen.
const path = require("path");

module.exports = {
    isProd: process.env.NODE_ENV === "production",

    port: Number(process.env.PORT) || 3000,

    // Session
    sessionSecret: process.env.SESSION_SECRET,
    sessionCookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.COOKIE_SECURE === "1",
        maxAge: 24 * 60 * 60 * 1000
    },

    // Adatbázis és fájlok
    dbPath: path.join(__dirname, "data", "database.sqlite"),
    uploadDir: path.join(__dirname, "public", "uploads"),

    // Proxy (Cloudflare stb.) — csak akkor bízzunk a fejlécben, ha be van kapcsolva
    trustProxy: process.env.TRUST_PROXY === "1" || process.env.CF_TRUST === "1",
    trustedProxyIps: (process.env.CF_IPS || "").split(",").map(s => s.trim()).filter(Boolean),

    // Képfeldolgozás
    maxImageDimension: 1600,
    uploadMaxBytes: 10 * 1024 * 1024,

    // Tartalom cache
    contentCacheTtlMs: 30 * 1000,

    // CSRF
    csrfTtlMs: 60 * 60 * 1000,

    // Service Worker verzió cache
    swVersionTtlMs: 60 * 1000
};