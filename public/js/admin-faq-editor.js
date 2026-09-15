/* Aula 2000 — Admin FAQ szerkesztő (kártyás UI)
   A válaszok plain textként tárolódnak, a szerver formázza megjelenítéskor:
   **félkövér**, *dőlt*, - lista, 1. számozott lista, ## Cím */
(function() {
    var fl = document.getElementById("faqList");
    var ft = document.getElementById("faqItems");
    var ab = document.getElementById("addFaqBtn");
    if (!fl || !ft || !ab) return;

    function render() {
        try {
            var items = JSON.parse(ft.value || "[]");
            fl.innerHTML = "";
            items.forEach(function(it, n) {
                addItem(it.question || "", it.answer || "", n);
            });
        } catch (e) {
            fl.innerHTML = "";
        }
    }

    function addItem(q, an, idx) {
        var d = document.createElement("div");
        d.className = "card mb-3";
        d.innerHTML = '<div class="card-body"><div class="d-flex justify-content-between mb-2"><span class="badge bg-warning text-dark">#' + (idx + 1) + '</span><button type="button" class="btn btn-sm btn-outline-danger df"><i class="fa-solid fa-trash"></i></button></div><div class="mb-3"><label class="form-label fw-bold">Kérdés</label><input type="text" class="form-control fq" value="' + q.replace(/"/g, "&quot;") + '"></div><div class="mb-2"><label class="form-label fw-bold">Válasz (egyszerű szöveg)</label><textarea class="form-control fa" rows="4" placeholder="**félkövér** · *dőlt* · - lista · 1. számozott · ## Cím">' + an.replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</textarea></div><div class="form-text">Formázási segédlet: **félkövér**, *dőlt*, - lista elem, 1. számozott elem, ## Címsor, üres sor = új bekezdés</div></div>';
        fl.appendChild(d);
        d.querySelector(".df").onclick = function() { d.remove(); sync(); };
        d.querySelector(".fq").oninput = sync;
        d.querySelector(".fa").oninput = sync;
    }

    function sync() {
        var items = [];
        fl.querySelectorAll(".card").forEach(function(it) {
            var q = it.querySelector(".fq").value.trim();
            var an = it.querySelector(".fa").value.trim();
            if (q && an) items.push({ question: q, answer: an });
        });
        ft.value = JSON.stringify(items);
    }

    ab.onclick = function() { addItem("", "", fl.children.length); };
    render();
})();