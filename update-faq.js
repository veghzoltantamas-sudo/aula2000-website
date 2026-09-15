const sqlite3 = require("sqlite3");
const db = new sqlite3.Database("/opt/asztalospro/data/database.sqlite");

const faqItems = [
  {
    question: "Mennyibe kerül egy egyedi konyhabútor?",
    answer: "<p>Az egyedi konyhabútorok ára több tényezőtől függ:</p><ul><li>A konyha méretere és alakja</li><li>A választott anyagok (tömörfarészlap, furnér, masszív fa)</li><li>A belső berendezés minősége (Hettich, Blum, Häfele)</li></ul><p><strong>Indikatív árkategóriák:</strong></p><ul><li>Egyszerű konyha: 800 000 - 1 500 000 Ft</li><li>Közép kategóriás: 1 500 000 - 3 000 000 Ft</li><li>Prémium: 3 000 000 Ft felett</li></ul><p>Az ingyenes helyszíni felmérés után pontos árajánlatot adunk 24-48 órán belül!</p>"
  },
  {
    question: "Mennyi idő alatt készül el a bútor?",
    answer: "<p>A gyártási idő a projekt típusától függ:</p><ul><li><strong>Tervezés és egyeztetés:</strong> 1-2 hét</li><li><strong>Gyártás:</strong> 3-6 hét</li><li><strong>Szerelés:</strong> 1-3 nap</li></ul><p><strong>A teljes folyamat általában 6-10 hét.</strong></p>"
  },
  {
    question: "Garanciát vállalnak a munkáikra?",
    answer: "<p>Igen, garanciát vállalunk minden munkára:</p><ul><li><strong>Gyártás garancia:</strong> 2 év a gyártási hibákra</li><li><strong>Szerelés garancia:</strong> 1 év a szerelési munkára</li><li><strong>Felületkezelés:</strong> 1 év a felületi hibákra</li></ul>"
  },
  {
    question: "Készítenek 3D látványtervet?",
    answer: "<p>Igen, minden projekthez készítünk 3D látványtervet.</p><p>A 3D terv előnyei:</p><ul><li>Valóságos képet kap a végeredményről még a gyártás előtt</li><li>Könnyen módosítható a terv</li><li>Pontosabb költségvetés készíthető</li></ul>"
  },
  {
    question: "Milyen anyagokat használnak?",
    answer: "<p>Prémium minőségű európai anyagokat használunk:</p><ul><li><strong>Lapanyagok:</strong> Egger, Kronospan, Swiss Krono</li><li><strong>Masszív fa:</strong> Tölgy, bükk, askotle, dió</li><li><strong>Kiegészítők:</strong> Hettich, Blum, Häfele, Ebált</li></ul>"
  },
  {
    question: "Van lehetőség részletfizetésre?",
    answer: "<p>Igen, részletfizetési lehetőségünk van:</p><ul><li>30% előleg a megrendeléskor</li><li>40% gyártás megkezdéskor</li><li>30% átadáskor</li></ul><p>Kérjen személyes egyeztetést az árajánlatnál!</p>"
  }
];

db.run("UPDATE settings SET value = ? WHERE key = \"faq_items\"", [JSON.stringify(faqItems)], function(err) {
  if (err) {
    console.error("Error:", err);
  } else {
    console.log("FAQ items updated successfully!");
  }
  db.close();
});
