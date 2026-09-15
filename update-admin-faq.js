const fs = require("fs");
let admin = fs.readFileSync("views/admin.ejs", "utf8");

const newFaqSection = `<div class="card mb-4" id="faqCard"><div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2"><h5 class="fw-bold mb-0"><i class="fa-solid fa-question-circle me-2 text-warning"></i> Gyakori Kérdések</h5><div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" name="enable_faq" id="enableFaq" <%= settings.enable_faq == '1' ? 'checked' : '' %>><label class="form-check-label" for="enableFaq">Bekapcsolás</label></div></div><div class="card-body"><div id="faqList"></div><button type="button" class="btn btn-outline-warning btn-sm mt-3" id="addFaqBtn"><i class="fa-solid fa-plus me-1"></i> Új kérdés</button><textarea name="faq_items" id="faqItems" class="d-none"><%= settings.faq_items || '[]' %></textarea></div></div><script>(function(){var fl=document.getElementById("faqList"),ft=document.getElementById("faqItems"),ab=document.getElementById("addFaqBtn");function l(){try{var i=JSON.parse(ft.value||"[]");fl.innerHTML="";i.forEach(function(it,n){a(it.question||"",it.answer||"",n)})}catch(e){fl.innerHTML=""}}function a(q,an,idx){var d=document.createElement("div");d.className="card mb-3";d.innerHTML='<div class="card-body"><div class="d-flex justify-content-between mb-2"><span class="badge bg-warning text-dark">#'+(idx+1)+'</span><button type="button" class="btn btn-sm btn-outline-danger df"><i class="fa-solid fa-trash"></i></button></div><div class="mb-3"><label class="form-label fw-bold">Kérdés</label><input type="text" class="form-control fq" value="'+q.replace(/"/g,"&quot;")+'"></div><div class="mb-2"><label class="form-label fw-bold">Válasz</label><textarea class="form-control fa" rows="3">'+an.replace(/</g,"&lt;").replace(/>/g,"&gt;")+"</textarea></div></div>";fl.appendChild(d);d.querySelector(".df").onclick=function(){d.remove();s()};d.querySelector(".fq").oninput=s;d.querySelector(".fa").oninput=s}function s(){var i=[];fl.querySelectorAll(".card").forEach(function(it){var q=it.querySelector(".fq").value.trim(),an=it.querySelector(".fa").value.trim();if(q&&an)i.push({question:q,answer:an})});ft.value=JSON.stringify(i)}ab.onclick=function(){a("","",fl.children.length)};l()})()</script>`;

const lines = admin.split('\n');
let start = -1, end = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('FAQ kérdések')) start = i - 1;
    if (start > 0 && lines[i].includes('</div>') && i > start + 3) { end = i; break; }
}
if (start > 0 && end > start) {
    lines.splice(start, end - start + 1, newFaqSection);
    fs.writeFileSync("views/admin.ejs", lines.join('\n'));
    console.log("Done! Lines " + start + "-" + end + " replaced");
} else {
    console.log("Not found");
}