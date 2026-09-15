/**
 * Aula 2000 — Rate Limiter konfigurációk (perzisztens SQLite store)
 * ================================================================
 * Az express-rate-limit v8 store interfészét implementáló saját,
 * perzisztens SQLite store — a sqlite3 (5.x) csomagra építve.
 * Így a limiterek PM2-restart után is megmaradnak, és nincs
 * szükség Node 22+ / node:sqlite beépített modulra.
 *
 * MINDEN limiter külön SQLite fájlt kap (data/rate_limits_*.sqlite),
 * hogy a kulcsaik ne ütközzenek.
 */
const path = require("path");
const sqlite3 = require("sqlite3");
const rateLimit = require("express-rate-limit");

/**
 * Perzisztens SQLite store az express-rate-limit v8 számára.
 */
class SqliteStore {
    /**
     * @param {string} location — SQLite fájl elérési útja
     */
    constructor(location) {
        this.location = location;
        this.db = new sqlite3.Database(location);
    }

    _run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) return reject(err);
                resolve(this);
            });
        });
    }

    _get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
        });
    }

    /**
     * Init — tábla létrehozása.
     * Az express-rate-limit v8 ezt hívja a limiter beállításakor.
     */
    async init(options) {
        this.windowMs = options.windowMs;
        await this._run(
            `CREATE TABLE IF NOT EXISTS hits (
                key TEXT PRIMARY KEY,
                hits INTEGER NOT NULL DEFAULT 0,
                expiresAt INTEGER NOT NULL DEFAULT 0
            )`
        );
    }

    /**
     * Increment — növeli a kulcs találatainak számát.
     * Ha a kulcs lejárt, nulláról indul újra.
     * @returns {{ totalHits: number, resetTime: Date | undefined }}
     */
    async increment(key) {
        const now = Date.now();
        const resetTime = new Date(now + this.windowMs);
        const row = await this._get("SELECT hits, expiresAt FROM hits WHERE key = ?", [key]);
        if (!row) {
            await this._run(
                "INSERT INTO hits (key, hits, expiresAt) VALUES (?, 1, ?)",
                [key, resetTime.getTime()]
            );
            return { totalHits: 1, resetTime };
        }
        if (row.expiresAt <= now) {
            // Lejárt — nulláról indul, új lejárati idővel
            await this._run(
                "UPDATE hits SET hits = 1, expiresAt = ? WHERE key = ?",
                [resetTime.getTime(), key]
            );
            return { totalHits: 1, resetTime };
        }
        await this._run(
            "UPDATE hits SET hits = hits + 1 WHERE key = ?",
            [key]
        );
        const updated = await this._get("SELECT hits, expiresAt FROM hits WHERE key = ?", [key]);
        return { totalHits: updated.hits, resetTime: new Date(updated.expiresAt) };
    }

    /**
     * Decrement — sikeres kérés esetén csökkenti a számlálót.
     */
    async decrement(key) {
        await this._run(
            "UPDATE hits SET hits = MAX(hits - 1, 0) WHERE key = ?",
            [key]
        );
    }

    /**
     * ResetKey — kulcs nullázása (pl. sikeres login).
     */
    async resetKey(key) {
        await this._run("DELETE FROM hits WHERE key = ?", [key]);
    }

    /**
     * A kulcsok lokálisan generálódnak (helyi keyGenerator).
     * Custom store esetén az express-rate-limit ezt követeli meg.
     */
    get localKeys() {
        return true;
    }

    /**
     * Lezárás — a limiter shutdown részeként.
     */
    async shutdown() {
        await new Promise((resolve) => this.db.close(resolve));
    }
}

/**
 * Perzisztens SQLite store létrehozása a data/ mappában.
 * A location a modul-úthoz relatív, így a CWD-től függetlenül
 * mindig a projekt data/ könyvtárába kerül.
 * @param {string} filename — a rate_limits fájl neve (kiterjesztés nélkül)
 */
function makeRLStore(filename) {
    return new SqliteStore(path.join(__dirname, "..", "data", `${filename}.sqlite`));
}

// Login: brute-force védelem — 5 próbálkozás / 15 perc
const loginLimiter = rateLimit({ store: makeRLStore('rate_limits_login'), windowMs: 15 * 60 * 1000, max: 5, message: "Túl sok próbálkozás. Várj 15 percet!" });
// Kapcsolatfelvétel: 10 / óra
const contactLimiter = rateLimit({ store: makeRLStore('rate_limits_contact'), windowMs: 60 * 60 * 1000, max: 10 });
// Ajánlatkérés: 5 / óra
const quoteLimiter = rateLimit({ store: makeRLStore('rate_limits_quote'), windowMs: 60 * 60 * 1000, max: 5 });
// Analitika: 30 / perc (enyhe csökkentés a spam ellen)
const analyticsLimiter = rateLimit({ store: makeRLStore('rate_limits_analytics'), windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
// Push feliratkozás: 10 / perc
const pushLimiter = rateLimit({ store: makeRLStore('rate_limits_push'), windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
// Hírlevél feliratkozás: 20 / perc
const newsletterLimiter = rateLimit({ store: makeRLStore('rate_limits_newsletter'), windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
// Push broadcast (admin): 5 / 15 perc
const broadcastLimiter = rateLimit({ store: makeRLStore('rate_limits_broadcast'), windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });

module.exports = {
    makeRLStore,
    loginLimiter,
    contactLimiter,
    quoteLimiter,
    analyticsLimiter,
    pushLimiter,
    newsletterLimiter,
    broadcastLimiter
};