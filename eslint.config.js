const globals = require("globals");

// globals: node
module.exports = [
    {
        files: ["**/*.js"],
        ignores: ["node_modules/**", "public/uploads/**", "public/js/**", "public/sw.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                // env: { node: true } ekvivalense flat configban —
                // felismeri az összes Node.js globált, köztük a fetch-et is
                ...globals.node,
                require: "readonly",
                module: "readonly",
                exports: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                process: "readonly",
                console: "readonly",
                Buffer: "readonly",
                setTimeout: "readonly",
                setInterval: "readonly",
                clearTimeout: "readonly",
                clearInterval: "readonly",
                setImmediate: "readonly",
                clearImmediate: "readonly",
                URL: "readonly",
                URLSearchParams: "readonly",
                TextEncoder: "readonly",
                TextDecoder: "readonly",
                AbortController: "readonly",
                AbortSignal: "readonly",
                global: "readonly",
                queueMicrotask: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^(next|_|err)$" }],
            "no-undef": "error",
            "no-dupe-keys": "error",
            "no-constant-condition": "warn",
            "prefer-const": "warn"
        }
    }
];