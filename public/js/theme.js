/* ============================================
   ASZTALOSPRO — TÉMA SZÍNEK (theme.js)
   ============================================
   A dinamikus márka színeket (admin beállításokból)
   futásidőben állítja be CSS custom property-ként
   a <html> (documentElement) elemre.

   Miért kell ez a fájl?
   Az oldal korábban EJS-sel írta be a színeket az
   inline <style> blokkba (pl. --gold: <%= settings... %>).
   Mivel a CSP már tiltja az inline stílusokat
   (style-src 'unsafe-inline' nélkül), a dinamikus
   értékeket a szerver <meta> tagekben adja át,
   ez a fájl pedig átteszi őket a CSS változókba.

   Eredeti leképezések (index-head.ejs):
     --gold        = brand_primary
     --gold-strong = brand_primary
     --gold-soft   = brand_secondary
     --text        = brand_secondary

   CSP-kompatibilis: külső JS fájl, CSSOM módosítás
   (documentElement.style.setProperty) — ehhez NINCS
   szükség 'unsafe-inline'-re.
   ============================================ */
(function () {
    'use strict';

    var root = document.documentElement;

    function meta(name) {
        var el = document.querySelector('meta[name="' + name + '"]');
        return el ? el.getAttribute('content') : null;
    }

    var primary = meta('brand-primary');
    var secondary = meta('brand-secondary');

    if (primary) {
        root.style.setProperty('--gold', primary);
        root.style.setProperty('--gold-strong', primary);
    }
    if (secondary) {
        root.style.setProperty('--gold-soft', secondary);
        root.style.setProperty('--text', secondary);
    }
})();