const fs = require("fs");
let index = fs.readFileSync("views/index.ejs", "utf8");

// Fix 1: Change <%= item.answer %> to <%- item.answer %> to render HTML
index = index.replace("<%= item.answer %>", "<%- item.answer %>");

// Fix 2: Improve FAQ HTML structure  
const oldFaq = `<details class="faq-item">
                <summary><%= item.question %></summary>
                <p><%- item.answer %></p>
            </details>`;

const newFaq = `<details class="faq-item">
                <summary class="faq-question"><%= item.question %></summary>
                <div class="faq-answer"><%- item.answer %></div>
            </details>`;

index = index.replace(oldFaq, newFaq);

fs.writeFileSync("views/index.ejs", index);
console.log("FAQ HTML fixed!");