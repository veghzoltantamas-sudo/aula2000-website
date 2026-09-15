/* Aula 2000 — quote oldal (ajánlatkérés) JavaScriptje */

// Service Worker regisztráció
(function() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('/sw.js').catch(function(error) {
                console.warn('Service worker registration failed:', error);
            });
        });
    }
})();

// Űrlap helyi mentése (draft) + PDF export
(function() {
    var quoteForm = document.querySelector('form.quote-card');
    var pdfButton = document.getElementById('downloadPdfBtn');
    var draftKey = 'aula2000.quoteDraft';

    if (quoteForm) {
        try {
            var draft = JSON.parse(localStorage.getItem(draftKey) || '{}');
            Object.keys(draft).forEach(function(name) {
                var field = quoteForm.elements.namedItem(name);
                if (field && !field.value) field.value = draft[name];
            });
            quoteForm.addEventListener('input', function() {
                var values = Object.fromEntries([...new FormData(quoteForm).entries()]);
                delete values._csrf;
                localStorage.setItem(draftKey, JSON.stringify(values));
            });
            quoteForm.addEventListener('submit', function() { localStorage.removeItem(draftKey); });
        } catch (error) {
            // A böngésző tiltott tárhelye nem akadályozhatja az űrlap használatát.
        }
    }

    if (pdfButton && quoteForm && window.jspdf) {
        pdfButton.addEventListener('click', function() {
            var formData = new FormData(quoteForm);
            var jsPDF = window.jspdf.jsPDF;
            var doc = new jsPDF();
            var values = Object.fromEntries([...formData.entries()].filter(function(entry) { return String(entry[1]).trim() !== ''; }));
            var owner = values.name || 'ugyfel';

            doc.setFontSize(18);
            doc.text('Aula 2000 - Ajánlatkérés', 14, 20);
            doc.setFontSize(11);

            var y = 32;
            var rows = [
                ['Név', values.name || '—'],
                ['E-mail', values.email || '—'],
                ['Telefon', values.phone || '—'],
                ['Szolgáltatás', values.service_type || '—'],
                ['Projekt', values.project_scope || '—'],
                ['Helyiségek száma', values.room_count || '—'],
                ['Helyiség / méretek', values.dimensions || '—'],
                ['Anyag', values.material || '—'],
                ['Felület / szín', values.finish || '—'],
                ['Költségkeret', values.budget || '—'],
                ['Kezdés', values.timeline || '—'],
                ['Alaprajz / látványterv', values.has_plan || '—'],
                ['Megjegyzés', values.notes || '—']
            ];

            rows.forEach(function(row) {
                var label = row[0], value = row[1];
                var safeValue = String(value).replace(/\n/g, ' ');
                var lines = doc.splitTextToSize(label + ': ' + safeValue, 182);
                if (y + (lines.length * 6) > 278) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(lines, 14, y);
                y += (lines.length * 6) + 3;
            });

            doc.save(String(owner).replace(/\s+/g, '-').toLowerCase() + '-ajanlatkeres.pdf');
        });
    }
})();