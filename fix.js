const fs = require("fs");
let content = fs.readFileSync("views/partials/index-footer.ejs", "utf8");
const includes = '<%- include("partials/sticky-styles") %>\n<%- include("partials/sticky-header") %>\n';
content = content.replace("<footer>", includes + "<footer>");
fs.writeFileSync("views/partials/index-footer.ejs", content);
console.log("Done");