import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { detectFramework, findRoutes, findLinks, matchEdgesToRoutes, loadConfig, generateManifest, detectRedirectChains, detectPossiblyStub, detectPossiblyMockData } from "../src/generate-sitekart.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

test("detectFramework gjenkjenner next-app", () => {
  assert.equal(detectFramework(join(FIXTURES, "next-app-router")), "next-app");
});

test("detectFramework gjenkjenner next-pages", () => {
  assert.equal(detectFramework(join(FIXTURES, "next-pages-router")), "next-pages");
});

test("detectFramework gjenkjenner vite-react-router", () => {
  assert.equal(detectFramework(join(FIXTURES, "vite-react-router")), "vite-react-router");
});

test("detectFramework gjenkjenner static-html", () => {
  assert.equal(detectFramework(join(FIXTURES, "static-html")), "static-html");
});

test("detectFramework feiler tydelig pa ukjent prosjekt", () => {
  assert.throws(() => detectFramework(join(FIXTURES, "unknown")), /Ukjent prosjekttype/);
});

test("next-app: finner page.js-ruter, ekskluderer route-grupper, beholder dynamiske segmenter", () => {
  const routes = findRoutes(join(FIXTURES, "next-app-router"), "next-app");
  const paths = routes.map((r) => r.route).sort();
  assert.deepEqual(paths, ["/", "/gateway", "/guide", "/s/[slug]"]);
});

test("next-pages: finner side-ruter, ekskluderer _app og api/", () => {
  const routes = findRoutes(join(FIXTURES, "next-pages-router"), "next-pages");
  const paths = routes.map((r) => r.route).sort();
  assert.deepEqual(paths, ["/", "/about"]);
});

test("next-app: enrichNextAppRoute ekstraherer dynamic og renders fra page-fil", () => {
  const routes = findRoutes(join(FIXTURES, "next-app-router"), "next-app");
  const gatewayRoute = routes.find((r) => r.route === "/gateway");
  assert(gatewayRoute, "gateway-ruten skal finnes");
  assert.equal(gatewayRoute.dynamic, true, "gateway skal ha dynamic=true");
  assert.equal(gatewayRoute.renders, "Gateway.js", "gateway skal importere fra ./Gateway");
});

test("vite-react-router: leser ruter fra route-config-fil(er)", () => {
  const routes = findRoutes(join(FIXTURES, "vite-react-router"), "vite-react-router");
  const paths = routes.map((r) => r.route).sort();
  assert.deepEqual(paths, ["/", "/about", "/team/:slug"]);
  // Verify deduplication: /about is declared in both routes.jsx and legacy-routes.jsx,
  // but should appear exactly once in the results
  const aboutRoutes = routes.filter((r) => r.route === "/about");
  assert.equal(aboutRoutes.length, 1, "Route /about should appear exactly once despite being in multiple files");
});

test("vite-react-router: object-literal path: i prosjekt UTEN createBrowserRouter noe sted gir ikke falske ruter", () => {
  // Reproduserer ekte funn fra E2E-validering mot KRINS frontend/ (som KUN
  // bruker JSX <Route path=...>, ingen createBrowserRouter/createHashRouter/
  // createRoutesFromElements noe sted): ChangedFiles.jsx har
  // `{ path: "backend/src/server.ts" }`/`{ path: "README.md" }` -- helt
  // urelatert til routing. Siden INGEN fil i dette fixture-prosjektet
  // oppretter en router, skal object-literal path:-regexen ikke kjores i
  // det hele tatt (prosjekt-bred gate), og disse skal ALDRI bli ruter.
  const routes = findRoutes(join(FIXTURES, "vite-react-router-jsx-only"), "vite-react-router");
  const paths = routes.map((r) => r.route).sort();
  assert.deepEqual(paths, ["/", "/about"], "kun de EKTE JSX-deklarerte rutene skal finnes");
  assert.ok(!paths.includes("backend/src/server.ts"), "filsti fra urelatert objekt skal ikke bli en rute");
  assert.ok(!paths.includes("README.md"), "filsti fra urelatert objekt skal ikke bli en rute");
});

test("vite-react-router: rute-konfig i EN fil, createBrowserRouter-kallet i en HELT ANNEN fil (v6.4+ split-config-monster)", () => {
  // Det kritiske scenarioet revisjonen av forrige fiks avdekket: et svaert
  // vanlig React Router v6.4+-monster der rute-konfigurasjonen ligger i EN
  // fil (routes-config.jsx, kun `export const routes = [{path:...}]`, ingen
  // router-oppretting der selv) mens selve `createBrowserRouter(routes)`-
  // kallet skjer i en HELT ANNEN entry-fil (main.jsx) som importerer den.
  // Et per-fil-gate (forste forsok pa denne fiksen) ga 0 ruter her -- 100%
  // stille datatap, bevist ved direkte reproduksjon under revisjon.
  // Prosjekt-bred gate (endelig losning) skal finne begge rutene korrekt.
  const routes = findRoutes(join(FIXTURES, "vite-react-router-split-config"), "vite-react-router");
  const paths = routes.map((r) => r.route).sort();
  assert.deepEqual(paths, ["/", "/about", "/settings"]);
});

test("static-html: index.html blir rot, andre filer beholder .html", () => {
  const routes = findRoutes(join(FIXTURES, "static-html"), "static-html");
  const paths = routes.map((r) => r.route).sort();
  assert.deepEqual(paths, ["/", "/about.html"]);
});

test("findLinks (next-app): finner lenker i ALLE kildefiler + redirects, ikke bare hub-filer", () => {
  const edges = findLinks(join(FIXTURES, "next-app-router"), "next-app");
  const targets = edges.map((e) => `${e.from}->${e.to}`).sort();
  assert.deepEqual(targets, [
    "app/gateway/Gateway.js->/gateway",
    "app/gateway/Gateway.js->/portal-broken",
    "redirect:/old-guide->/guide",
  ]);
  const redirectEdge = edges.find((e) => e.to === "/guide");
  assert.equal(redirectEdge.redirect, true);
});

test("findLinks (next.config redirects): stotter enkelt/dobbeltfnutt og vilkarlig source/destination-rekkefolge", () => {
  const edges = findLinks(join(FIXTURES, "next-redirect-quotes"), "next-pages");
  const redirects = edges.filter((e) => e.redirect).map((e) => `${e.from}->${e.to}`).sort();
  assert.deepEqual(redirects, [
    "redirect:/double-quotes->/dest-c",
    "redirect:/reversed-order->/dest-b",
    "redirect:/single-quotes->/dest-a",
  ]);
});

test("findLinks (vite-react-router): fanger <Link to=...>", () => {
  const edges = findLinks(join(FIXTURES, "vite-react-router"), "vite-react-router");
  const targets = edges.map((e) => e.to).sort();
  assert.deepEqual(targets, ["/about", "/missing-page"]);
});

test("findLinks (vite-react-router): fanger objekt-literal 'to:' (NavItem[]-mønster, regresjonsvern 17.07.2026)", () => {
  // Uten dette monsteret var KRINS Portal sin SiteShell.tsx (const toolRoutes:
  // NavItem[] = [{ to: "/playground" }, ...], rendret via .map()) usynlig for
  // skanneren -- 12 ekte sidebar-lenker vist som "ikke koblet inn".
  const edges = findLinks(join(FIXTURES, "vite-react-router-navitem-array"), "vite-react-router");
  const targets = edges.map((e) => e.to);
  assert.ok(targets.includes("/playground"), "skal fange to: \"/playground\" i objekt-literalen");
});

test("findLinks (vite-react-router): fanger <Link to={`...`}> (template-literal, symmetrisk med href=\\{`...\\})", () => {
  const edges = findLinks(join(FIXTURES, "vite-react-router-navitem-array"), "vite-react-router");
  const targets = edges.map((e) => e.to);
  // Interpolasjonen kuttes bevisst -- kun det statiske prefikset "/projects" fanges.
  assert.ok(targets.includes("/projects"), "skal fange det statiske prefikset fra to={`/projects/${id}`}");
});

test("findLinks (vite-react-router): fanger objekt-literal 'route:' (config-liste rendret dynamisk et annet sted, regresjonsvern 17.07.2026)", () => {
  // Tredje navnekonvensjon for samme klasse hull som 'to:' over -- KRINS
  // Portal sin systems.ts har { route: "/system/x" }, rendret via
  // <Link to={sys.route}> i en HELT ANNEN fil (ren variabel, umulig å
  // spore med regex derfra).
  const edges = findLinks(join(FIXTURES, "vite-react-router-navitem-array"), "vite-react-router");
  const targets = edges.map((e) => e.to);
  assert.ok(targets.includes("/config-driven-route"), "skal fange route: \"/config-driven-route\" i en config-liste");
});

test("findLinks (vite-react-router): fanger <Navigate to=...> (regresjonsvern 12.07.2026)", () => {
  // Uten dette monsteret viste /dashboard som "orphaned" i et ekte prosjekt
  // (Monterosso baatchat/web) sjol om "/" eksplisitt omdirigerer dit via
  // <Navigate to="/dashboard" replace /> som element-prop i en <Route>.
  const edges = findLinks(
    join(FIXTURES, "vite-react-router-navigate-redirect"),
    "vite-react-router"
  );
  const targets = edges.map((e) => e.to).sort();
  assert.deepEqual(targets, ["/dashboard"]);
});

test("generateManifest (vite-react-router-navigate-redirect): /dashboard blir linked via <Navigate>, ikke orphaned", () => {
  const manifest = generateManifest(join(FIXTURES, "vite-react-router-navigate-redirect"));
  const byRoute = Object.fromEntries(manifest.routes.map((r) => [r.route, r]));
  assert.equal(byRoute["/dashboard"].status, "linked");
});

test("findLinks (static-html): fanger href i .html-filer", () => {
  const edges = findLinks(join(FIXTURES, "static-html"), "static-html");
  const targets = edges.map((e) => e.to).sort();
  assert.deepEqual(targets, ["/about.html", "/contact.html"]);
});

test("matchEdgesToRoutes: kobler ekte lenker, markerer orphaned, finner manglende sider", () => {
  const routes = findRoutes(join(FIXTURES, "next-app-router"), "next-app");
  const edges = findLinks(join(FIXTURES, "next-app-router"), "next-app");
  const { routes: result, missingPages } = matchEdgesToRoutes(routes, edges);
  const byRoute = Object.fromEntries(result.map((r) => [r.route, r]));
  assert.equal(byRoute["/"].status, "root");
  assert.equal(byRoute["/gateway"].status, "linked");
  assert.equal(byRoute["/guide"].status, "linked");
  assert.equal(byRoute["/s/[slug]"].status, "orphaned");
  assert.deepEqual(missingPages, [
    { target: "/portal-broken", linkedFrom: ["app/gateway/Gateway.js"] },
  ]);
});

test("matchEdgesToRoutes: renders-alias gjor en importert rute til linket, ikke foreldrelos", () => {
  const routes = [
    { route: "/", file: "app/page.js", dynamic: false, renders: "gateway/Gateway" },
    { route: "/gateway", file: "app/gateway/page.js", dynamic: false, renders: null },
  ];
  const { routes: result } = matchEdgesToRoutes(routes, []);
  const gateway = result.find((r) => r.route === "/gateway");
  assert.equal(gateway.status, "linked");
  assert.deepEqual(gateway.linkedFrom, [{ from: "app/page.js", renders: true }]);
});

test("routeMatchesTarget: escapes regex-metacharacter (.html), blokkerer falske treff", () => {
  // Routes with .html should NOT match unrelated targets like /aboutXhtml
  const routes = [
    { route: "/about.html", file: "about.html", dynamic: false, renders: null },
    { route: "/s/[slug]", file: "app/s/[slug]/page.js", dynamic: false, renders: null },
  ];

  const edges = [
    { from: "index.html", to: "/about.html" },     // exact match
    { from: "index.html", to: "/aboutXhtml" },     // should NOT match (X != .)
    { from: "index.html", to: "/s/andrea" },       // should match dynamic [slug]
  ];

  const { routes: result, missingPages } = matchEdgesToRoutes(routes, edges);

  const aboutRoute = result.find((r) => r.route === "/about.html");
  const slugRoute = result.find((r) => r.route === "/s/[slug]");

  // /about.html should be linked (from exact match only)
  assert.equal(aboutRoute.status, "linked");
  assert.equal(aboutRoute.linkedFrom.length, 1);
  assert.equal(aboutRoute.linkedFrom[0].from, "index.html");

  // /s/[slug] should be linked (from /s/andrea)
  assert.equal(slugRoute.status, "linked");
  assert.equal(slugRoute.linkedFrom.length, 1);
  assert.equal(slugRoute.linkedFrom[0].from, "index.html");

  // /aboutXhtml should be in missingPages (no route matched it)
  const missing = missingPages.find((m) => m.target === "/aboutXhtml");
  assert(missing, "/aboutXhtml should be in missingPages");
  assert.deepEqual(missing.linkedFrom, ["index.html"]);
});

test("loadConfig: default nar ingen config-fil finnes", () => {
  assert.deepEqual(loadConfig(join(FIXTURES, "next-pages-router")), {
    previewOverrides: {},
    baseUrl: null,
    plannedPages: [],
  });
});

test("loadConfig: leser previewOverrides og baseUrl", () => {
  const config = loadConfig(join(FIXTURES, "with-config"));
  assert.equal(config.baseUrl, "http://localhost:4000");
  assert.deepEqual(config.previewOverrides, { "/s/[slug]": "/s/andrea" });
});

test("loadConfig: leser plannedPages", () => {
  const config = loadConfig(join(FIXTURES, "with-planned-pages"));
  assert.deepEqual(config.plannedPages, [
    { route: "/pricing", note: "Kommer i Q3 - prisliste" },
    { route: "/", note: "Skal aldri dukke opp - / finnes allerede" },
  ]);
});

test("loadConfig: feiler tydelig pa ugyldig JSON", () => {
  assert.throws(() => loadConfig(join(FIXTURES, "bad-config")), /Ugyldig sidekart\.config\.json/);
});

test("generateManifest: full pipeline for next-app-fixture", () => {
  const manifest = generateManifest(join(FIXTURES, "next-app-router"));
  assert.equal(manifest.framework, "next-app");
  assert.equal(manifest.totalRoutes, 4);
  assert.equal(manifest.linkedCount, 2);
  assert.equal(manifest.orphanedCount, 1);
  assert.equal(manifest.missingPages.length, 1);
  assert.equal(manifest.routes[0].route < manifest.routes[1].route, true);
});

test("generateManifest: alle 4 rammeverk kjorer uten a kaste", () => {
  for (const [dir, framework] of [
    ["next-app-router", "next-app"],
    ["next-pages-router", "next-pages"],
    ["vite-react-router", "vite-react-router"],
    ["static-html", "static-html"],
  ]) {
    const manifest = generateManifest(join(FIXTURES, dir));
    assert.equal(manifest.framework, framework);
    assert.ok(manifest.totalRoutes > 0);
  }
});

test("generateManifest: clickDepth er BFS-avstand fra / over ekte navigasjon (redirects telles ikke)", () => {
  const manifest = generateManifest(join(FIXTURES, "next-app-click-depth"));
  const byRoute = Object.fromEntries(manifest.routes.map((r) => [r.route, r]));
  assert.equal(byRoute["/"].clickDepth, 0);
  assert.equal(byRoute["/a"].clickDepth, 1);
  assert.equal(byRoute["/b"].clickDepth, 2);
  assert.equal(byRoute["/unreachable"].clickDepth, null);
});

test("generateManifest: clickDepth propagerer gjennom en renders-alias (/ rendrer /gateway direkte)", () => {
  const manifest = generateManifest(join(FIXTURES, "next-app-click-depth-alias"));
  const byRoute = Object.fromEntries(manifest.routes.map((r) => [r.route, r]));
  assert.equal(byRoute["/"].clickDepth, 0);
  assert.equal(byRoute["/gateway"].clickDepth, 1);
  assert.equal(byRoute["/deep"].clickDepth, 2);
});

test("generateManifest: delt-skall-lenker (>=2 seksjoner fra en fil uten katalog-eier) far dybde 1 fra roten", () => {
  const manifest = generateManifest(join(FIXTURES, "next-app-click-depth-shell"));
  const byRoute = Object.fromEntries(manifest.routes.map((r) => [r.route, r]));
  assert.equal(byRoute["/"].clickDepth, 0);
  assert.equal(byRoute["/foo"].clickDepth, 1);
  assert.equal(byRoute["/bar"].clickDepth, 1);
});

test("generateManifest: en fil uten katalog-eier som KUN lenker innad i én seksjon regnes IKKE som skall", () => {
  const manifest = generateManifest(join(FIXTURES, "next-app-click-depth-shell"));
  const byRoute = Object.fromEntries(manifest.routes.map((r) => [r.route, r]));
  // AdminHub.js lenker kun til /admin/child (1 seksjon: "admin") -- ikke nok
  // spredning til a regnes som globalt skall, og "/admin" finnes ikke som
  // egen rute her -- skal derfor forbli reelt utilgjengelig (null), IKKE
  // fa en syntetisk dybde slik root-fallbacken for regresjonen gjorde.
  assert.equal(byRoute["/admin/child"].clickDepth, null);
  assert.equal(byRoute["/admin/child"].status, "linked");
});

test("detectRedirectChains: enkelt-redirect rapporteres IKKE som kjede", () => {
  const edges = [{ from: "redirect:/old", to: "/new", redirect: true }];
  const { chains, loops } = detectRedirectChains(edges);
  assert.deepEqual(chains, []);
  assert.deepEqual(loops, []);
});

test("detectRedirectChains: finner en kjede pa 2+ hopp (A->B->C)", () => {
  const edges = [
    { from: "redirect:/a", to: "/b", redirect: true },
    { from: "redirect:/b", to: "/c", redirect: true },
  ];
  const { chains, loops } = detectRedirectChains(edges);
  assert.deepEqual(chains, [{ path: ["/a", "/b", "/c"] }]);
  assert.deepEqual(loops, []);
});

test("detectRedirectChains: finner en loop (A->B->A)", () => {
  const edges = [
    { from: "redirect:/a", to: "/b", redirect: true },
    { from: "redirect:/b", to: "/a", redirect: true },
  ];
  const { chains, loops } = detectRedirectChains(edges);
  assert.deepEqual(chains, []);
  assert.deepEqual(loops, [{ path: ["/a", "/b", "/a"], loopStart: "/a" }]);
});

test("detectRedirectChains: finner en direkte selv-loop (A->A)", () => {
  const edges = [{ from: "redirect:/a", to: "/a", redirect: true }];
  const { chains, loops } = detectRedirectChains(edges);
  assert.deepEqual(chains, []);
  assert.deepEqual(loops, [{ path: ["/a", "/a"], loopStart: "/a" }]);
});

test("detectPossiblyStub: markorord (TODO) flagges som stub", () => {
  const file = join(FIXTURES, "next-app-stub", "app", "todo-page", "page.js");
  assert.equal(detectPossiblyStub(file), true);
});

test("detectPossiblyStub: side med reelt innhold flagges IKKE som stub", () => {
  const file = join(FIXTURES, "next-app-stub", "app", "done-page", "page.js");
  assert.equal(detectPossiblyStub(file), false);
});

test("detectPossiblyStub: <input placeholder=\"...\"> flagges IKKE (regresjon 17.07.2026)", () => {
  // "placeholder" som HTML/JSX-attributt-navn er vanlig i ferdig bygde
  // skjemaer -- ikke et markorord for uferdig innhold. Bevist mot ekte
  // KRINS frontend (Projects/List.tsx, 221 linjer) som ble feilaktig
  // flagget utelukkende pa grunn av <input placeholder="Search...">.
  const file = join(FIXTURES, "next-app-stub", "app", "input-with-placeholder", "page.js");
  assert.equal(detectPossiblyStub(file), false);
});

test("detectPossiblyMockData: reelt innhold UTEN fetch/axios/useSWR flagges som mulig demo-data", () => {
  const file = join(FIXTURES, "next-app-stub", "app", "hardcoded-data", "page.js");
  assert.equal(detectPossiblyMockData(file, false), true);
});

test("detectPossiblyMockData: side med fetch() flagges IKKE", () => {
  const file = join(FIXTURES, "next-app-stub", "app", "live-data", "page.js");
  assert.equal(detectPossiblyMockData(file, false), false);
});

test("detectPossiblyMockData: en stub har ingen data a vurdere -- alltid false uansett innhold", () => {
  const file = join(FIXTURES, "next-app-stub", "app", "hardcoded-data", "page.js");
  assert.equal(detectPossiblyMockData(file, true), false);
});

test("detectPossiblyStub: manglende fil gir false (ikke kast)", () => {
  assert.equal(detectPossiblyStub(join(FIXTURES, "next-app-stub", "app", "finnes-ikke.js")), false);
});

test("detectPossiblyStub: fullstendig tomt resultat etter stripping ER en stub (regresjon 16.07.2026)", () => {
  // Bevist mot en EKTE fil i KRINS frontend (Settings.tsx): en tidligere
  // `bodyOnly.length > 0`-vakt unntok feilaktig det MEST apenbare
  // stub-tilfellet -- en fil hvor ALT (inkl. selve returnen) sto pa samme
  // fysiske linje som import/export og dermed strippet til "".
  const file = join(FIXTURES, "next-app-stub", "app", "single-line-stub", "page.js");
  assert.equal(detectPossiblyStub(file), true);
});

test("detectPossiblyStub: reelt innhold pa EN fysisk linje flagges IKKE (regresjon 16.07.2026)", () => {
  // Bevist mot en EKTE fil i KRINS frontend (Styleguide.tsx): en tidligere
  // linje-anker-regex (^...$/gm) tolket HELE den fysiske linjen (import OG
  // det ekte JSX-innholdet pa samme linje) som "én import-linje" og
  // strippet bort ALT -- ikke bare selve importen.
  const file = join(FIXTURES, "next-app-stub", "app", "single-line-real", "page.js");
  assert.equal(detectPossiblyStub(file), false);
});

test("generateManifest: possiblyStub propagerer til route-objektet", () => {
  const manifest = generateManifest(join(FIXTURES, "next-app-stub"));
  const byRoute = Object.fromEntries(manifest.routes.map((r) => [r.route, r]));
  assert.equal(byRoute["/todo-page"].possiblyStub, true);
  assert.equal(byRoute["/done-page"].possiblyStub, false);
});

test("generateManifest: plannedPages fra config blir missingPages med planned:true", () => {
  // with-planned-pages har ingen egen app/pages-struktur -- bruk next-app-stub
  // sine ekte ruter, men lan config-fila via en midlertidig sammenslatt sti
  // er unodvendig komplisert. Test loadConfig-integrasjonen direkte via en
  // fixture som har BADE ekte ruter OG plannedPages.
  const manifest = generateManifest(join(FIXTURES, "next-app-planned"));
  const planned = manifest.missingPages.find((m) => m.target === "/pricing");
  assert.ok(planned, "/pricing skal vaere i missingPages");
  assert.equal(planned.planned, true);
  assert.equal(planned.note, "Kommer i Q3 - prisliste");
  assert.deepEqual(planned.linkedFrom, []);
});

test("generateManifest: plannedPages som allerede er en ekte rute blir IKKE duplisert", () => {
  const manifest = generateManifest(join(FIXTURES, "next-app-planned"));
  const rootPlanned = manifest.missingPages.find((m) => m.target === "/");
  assert.equal(rootPlanned, undefined, "/ finnes allerede som ekte rute, skal ikke dukke opp som planned");
});
