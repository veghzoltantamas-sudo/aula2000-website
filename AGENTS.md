# AsztalosPro — AI Agent Útmutató

## Projekt áttekintés
A **AsztalosPro** egy faipari műhely/asztalos cég weboldala, amely **Node.js + Express + EJS + SQLite** stackkel működik. A felhasználói felület magyar nyelvű, adminisztrációs felülettel rendelkezik.

- **Futási parancs:** `node server.js` (port: 3000)
- **Fejlesztési mód:** `npm start` indítja a szervert
- **Adatbázis:** SQLite — `data/database.sqlite`

## Architektúra
- **Backend:** Express.js szerver (`server.js`)
- **Sablonmotor:** EJS (`views/` mappa)
- **Statisztikus fájlok:** `public/` (CSS, JS, képek, feltöltések)
- **Adatbázis:** SQLite, migráció és seedelés a `initializeDatabase()` függvényben
- **Fájlfeltöltés:** `multer` + `sharp` (WebP konvertálás, átméretezés, max 10MB)
- **Biztonság:** `helmet`, `express-rate-limit`, bcrypt jelszóhasholás, session auth

## Fontos könyvtárak és fájlok
| Fájl/Csoport | Szerep |
|---|---|
| `server.js` | Fő szerverfájl, útvonalak, adatbázis kezelés |
| `views/*.ejs` | EJS sablonok (index, admin, login, quote, project, page) |
| `public/css/`, `public/js/` | Elsődleges statikus eszközök |
| `public/uploads/` | Feltöltött képek (WebP formátum) |
| `data/database.sqlite` | Adatbázis fájl (automatikusan létrejön) |

## Adatbázis táblák
| Tábla | Leírás |
|---|---|
| `content` | Oldaltartalmak (kulcs-érték párok, pl. `site_title`, `hero_title`) |
| `projects` | Referenciák, esettanulmányok (bővített mezők: client, location, project_year, materials, challenge, solution, result, testimonial) |
| `project_images` | Projektképek, `sort_order` mezővel |
| `users` | Admin felhasználók (username, bcrypt jelszó) |
| `messages` | Kapcsolat űrlap üzenetek, `is_read`, `priority`, `pipeline_status` |
| `quote_requests` | Ajánlatkérő konfigurátor bejegyzései |
| `pages` | Dinamikus oldalak (`content_json` blokkok tömbje) |
| `testimonials` | Ügyfél vélemények |
| `partners` | Partnerek logókkal |
| `settings` | Rendszerbeállítások (WhatsApp, SEO, statisztikák, partnerek) |

## Kulcsfontosságú koncepciók
- **Oldalsablonok (`pages`):** `content_json` tömb, amely `heading`, `paragraph`, `list`, `quote`, `image`, `button`, `feature`, `stats`, `cta` típusú blokkokat tartalmaz. A renderelés a `renderPageBlocks()` segítségével történik.
- **CRM pipeline:** Minden üzenet és ajánlatkérő rendelkezik `pipeline_status`-szal (`new`, `contacted`, `qualified`, `proposal`, `won`, `lost`). Az admin felület összefoglalást készít a csővezetékről.
- **Képfeldolgozás:** `processAndSaveImage()` WebP formátumra alakít, max 1600px-es oldalhosszúsággal, minőség 62.
- **Rate limiting:** Külön limiter loginhez (5 kísérlet / 15 perc), kapcsolathoz (10/óra), ajánlatkéréshez (5/óra).
- **Session:** `express-session`, httpOnly cookie, 24 órás lejárat.

## Konvenciók és buktatók
- **Magyar nyelv:** Minden UI szöveg magyar. Új funkciók esetén magyar címkéket használj.
- **Admin belépés:** Alapértelmezett admin jelszó `admin123` (ENV: `ADMIN_PASSWORD`). Gyártásban kötelező megváltoztatni.
- **Adatbázis migráció:** A `initializeDatabase()` automatikusan hozzáadja a hiányzó oszlopokat (pl. `priority`, `pipeline_status`, `sort_order`).
- **Environment változók:** `.env` fájl szükséges (`SESSION_SECRET`, `ADMIN_PASSWORD`, `PORT`). Lásd `dotenv`.
- **Képek törlése:** Ha egy projektet vagy képet törölsz, a `deleteImage()` törli a fájlt a `public/uploads/` mappából is.
- **EJS sablonok:** Az adatokat `res.render()` adja át. A globális `res.locals.msg` üzenetekhez használatos (pl. `?msg=Mentve`).
- **Hibák kezelése:** Minden útvonal `try/catch` blokkba van helyezve, az hibát `next(err)` továbbítja az Express hibakezelőjéhez.

## Gyakori feladatok
- **Új oldal létrehozása:** Admin felület → „Oldalak” fül → Új oldal (cím, slug, tartalom JSON tömb formájában).
- **Referencia hozzáadása:** Admin → „Referenciák” → Új projekt (borítókép + galéria feltöltése).
- **Beállítások módosítása:** Admin → „Beállítások” fül (WhatsApp, SEO, statisztikák, partnerek).
- **Üzenetek kezelése:** Admin → „Üzenetek” fül, pipálható olvasottként, jelölhető fontosként, állapot változtatható.
- **Blog bejegyzés szerkesztése:** Admin → „Blog” fül → ceruza ikon a bejegyzés sorában → módosítsd a mezőket → Módosítások mentése.
- **Új blog bejegyzés:** Admin → „Blog” fül → „Új bejegyzés” gomb.

## Hasznos parancsok
- Szerver indítása: `node server.js`
- Csomag frissítése: `npm install <csomag>`
- Adatbázis törlése (frissítéshez): töröld `data/database.sqlite`-t, majd indítsd újra a szervert.

## Jelenlegi projektállapot — 2026-09-02
- A weboldal működő, fejlesztés alatt álló MVP/üzleti bemutatkozó oldal állapotban van.
- A publikus felület, a referencia/projektoldalak, a kapcsolatfelvétel és az ajánlatkérő konfigurátor alapfunkciói elkészültek.
- Az admin felület működő tartalomkezelő és CRM jellegű felülettel rendelkezik: projektek, oldalak, üzenetek, ajánlatkérések, vélemények, partnerek és beállítások kezelhetők.
- **2026-09-02 új funkciók:** Blog rendszer, Analytics dashboard, oldalon belüli keresés (Ctrl+K), Sitemap.xml generálás, 404/500 hibaoldalak, Admin jelszó-változtatás, Hírlevél feliratkozás, Galéria kategória szűrő, Push értesítések, CSS/JS külön fájlokba szervezés.
- **Blog tartalom:** 6 publikált, asztalossággal kapcsolatos blog bejegyzés az adatbázisban (kategóriák: Tippek, Szakmai tanácsok, Inspiráció, Műhely).
- **Blog szerkesztés az admin felületen:** A blog táblázatban minden sornál ceruza ikon (✎) nyitja meg a `#blogEditModal`-t, amely feltölti a mezőket a bejegyzés adataival. Mentés a `/admin/blog-update/:id` útvonalra mutat. Nincs külön szerkesztő útvonal kód — a `blog-update` útvonal már létezett, a modal és a JS tölti fel az adatokat.
- **PWA támogatás:** Service Worker (hash-alapú automatikus cache verzió), Manifest, Splash screen, Install banner, Push notifications.
- **Email:** Nodemailer SMTP integráció (ajánlatkérés, kapcsolat, hírlevél értesítés).
- **SEO:** Schema.org JSON-LD, Sitemap.xml, dinamikus meta leírások.
- A rendszer lokálisan futtatható Node.js + Express szerverként a 3000-es porton; az adatokat SQLite tárolja.
- A projekt GitHub-tárolója szinkronban van a `main` ággal. A legutóbbi ismert commit: `89aa714`.
- A projekt aktuális munkakönyvtára: `/opt/asztalospro`.
- Következő munkáknál először a tényleges fájlállapotot és a Git állapotát kell ellenőrizni; a dokumentumban szereplő állapot tájékoztató jellegű, a kód az elsődleges forrás.

## Tartós projektmemória
Ez a fájl szolgál a projekt folytatásához szükséges, verziókezelt emlékeztetőként. Új munkamenetben az asszisztensnek ezt a fájlt, a Git előzményt és a jelenlegi kódot kell áttekintenie, hogy a korábbi fejlesztési állapotból folytasson. A változásokat és a fejlettségi szintet minden jelentősebb mérföldkő után frissíteni kell.