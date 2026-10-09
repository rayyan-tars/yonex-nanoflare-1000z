// Bundles FutureShift into one self-contained HTML page for publishing as an artifact.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const out = "dist-artifact";
mkdirSync(out, { recursive: true });
await build({
  entryPoints: ["src/futureshift/standalone.tsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  outdir: out,
  entryNames: "futureshift",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const js = readFileSync(`${out}/futureshift.js`, "utf8").replace(/<\/script/gi, "<\\/script");
const css = readFileSync(`${out}/futureshift.css`, "utf8");
const html = `<title>FutureShift: Campus 2050</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Nunito:wght@600;700;800;900&display=swap">
<style>:root{color-scheme:light}html,body{height:100%;margin:0;background:#e6eee9;color:#15232b}#root{height:100%}
${css}</style>
<div id="root"></div>
<script>${js}</script>
`;
writeFileSync(`${out}/futureshift.html`, html);
console.log(`${out}/futureshift.html ${(html.length / 1024).toFixed(0)} KB`);
