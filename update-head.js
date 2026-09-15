const fs = require("fs");
let head = fs.readFileSync("views/partials/index-head.ejs", "utf8");

head = head.replace(
  "<title><%= content.site_title %></title>",
  `<title><%= content.site_title %></title>
    <link rel="canonical" href="https://www.asztalospro.hu/">
    <meta name="title" content="<%= content.site_title %> | Prémium Asztalosműhely">
    <meta property="og:site_name" content="<%= content.site_title %>">
    <meta property="og:locale" content="hu_HU">
    <meta property="og:url" content="https://www.asztalospro.hu/">
    <meta name="twitter:title" content="<%= content.site_title %> | Prémium Asztalosműhely">`
);

head = head.replace("</head>", "<%- include(partials/sticky-styles) %>\n</head>");

fs.writeFileSync("views/partials/index-head.ejs", head);
console.log("Head updated!");
