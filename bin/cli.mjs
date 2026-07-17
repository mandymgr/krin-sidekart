#!/usr/bin/env node
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { generateManifest } from "../src/generate-sitekart.mjs";

const root = process.argv[2] || process.cwd();
const manifest = generateManifest(root);
const outFile = join(root, "public", "sitekart-data.json");
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(manifest, null, 2));

// sidekart-live.html er ALLTID et BYGG-ARTEFAKT, aldri en hand-vedlikeholdt
// kopi -- skrevet fra pakkens egen src/sidekart-live.html på HVER kjøring.
// Etter 17.07.2026-migreringen til delt npm-pakke finnes det kun ÉN sannhet
// (denne fila), uansett hvilket av de 3 konsument-prosjektene som kjører CLI-en.
const templateHtml = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "sidekart-live.html");
copyFileSync(templateHtml, join(root, "public", "sidekart-live.html"));

console.log(
  `Sidekart generert: ${manifest.totalRoutes} ruter, ${manifest.linkedCount} lenket, ` +
  `${manifest.orphanedCount} foreldreløse, ${manifest.missingPages.length} manglende sider.`
);
const issueCount = manifest.redirectChains.length + manifest.redirectLoops.length;
if (issueCount > 0) {
  console.log(
    `⚠️  ${manifest.redirectChains.length} omdirigerings-kjede(r), ` +
    `${manifest.redirectLoops.length} loop(er) -- se redirectChains/redirectLoops i dataen.`
  );
}
const deepest = manifest.routes.reduce(
  (best, r) => (typeof r.clickDepth === "number" && r.clickDepth > best.clickDepth ? r : best),
  { clickDepth: -1, route: null }
);
if (deepest.route) {
  console.log(`Dypeste rute: ${deepest.route} (${deepest.clickDepth} klikk fra /)`);
}
console.log(`-> ${relative(root, outFile)}`);
