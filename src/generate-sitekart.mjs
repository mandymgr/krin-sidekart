import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

// Bump denne (dato, ikke semver -- matcher resten av okosystemets
// dato-baserte konvensjon) hver gang templates/-mappen (denne fila ELLER
// sidekart-live.html) endres. Eneste formal: la EKSTERNE, vendored kopier
// (Monterosso -- egen repo, eget Vercel-bygg, kan strukturelt IKKE referere
// denne fila direkte, se 16.07.2026-avgjorelsen om monorepo-vs-ekstern) bli
// sjekket for drift av scripts/sidekart-drift-check.mjs uten a matte diffe
// hele filinnholdet.
export const SIDEKART_TEMPLATE_VERSION = "2026-07-17";

// RETTET 17.07.2026: en tidligere /best-losning-runde mot skillet selv
// hevdet at .turbo/.cache/.output/.pnpm/.vercel manglet her og la dem til --
// FEIL, verifisert ved faktisk lesing av walkFiles under: `entry.name.
// startsWith(".")` ekskluderer ALLEREDE ethvert punktum-prefikset navn
// UBETINGET, FØR EXCLUDE_DIRS.has() i det hele tatt sjekkes. De fem nye
// oppføringene (og de tre punktum-prefikserte fra før: .git/.next/.vite)
// er derfor 100% dødt, uvirksomt innhold i dette settet -- ren
// dokumentasjon, ingen faktisk filtrerings-effekt. Fjernet igjen. Eneste
// oppføringer som FAKTISK gjør noe her er de UTEN punktum-prefiks
// (node_modules/dist/build/out/coverage), siden de ikke fanges av
// startsWith(".")-sjekken.
const EXCLUDE_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage"]);

// RETTET 17.07.2026 (/best-losning mot selve skillet): findRoutesViteReactRouter
// og findLinks skannet FØR helt uavhengig av hverandre -- to separate fulle
// katalog-vandringer OG to separate readFileSync per fil, over (nesten)
// samme filsett, i HVER generateManifest()-kjøring. For et prosjekt med
// tusenvis av filer dobler dette disk-I/O unødvendig. Denne cachen
// (Map<absolutt sti, innhold|null>) deles nå mellom begge funksjonene --
// leser en fil kun én gang uansett hvor mange steg som trenger innholdet.
// Valgfri parameter (default ny Map) slik at eksisterende
// tester/direkte-kall fungerer identisk uten å måtte sende en cache inn.
function readFileCached(cache, file) {
  if (cache.has(file)) return cache.get(file);
  let content = null;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    content = null;
  }
  cache.set(file, content);
  return content;
}

function walkFiles(dir, predicate, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, predicate, out);
    else if (predicate(entry.name)) out.push(full);
  }
  return out;
}

function findHtmlFiles(rootDir) {
  return walkFiles(rootDir, (name) => name.endsWith(".html"));
}

export function detectFramework(rootDir) {
  const pkgPath = join(rootDir, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.next && existsSync(join(rootDir, "app"))) return "next-app";
    if (deps.next && existsSync(join(rootDir, "pages"))) return "next-pages";
    if ((deps["react-router-dom"] || deps["react-router"]) && deps.vite) {
      return "vite-react-router";
    }
    throw new Error(
      `Ukjent prosjekttype i ${rootDir} -- fant package.json men ingen kjent ` +
      `rammeverk-signatur (Next.js app/pages-router, eller Vite+react-router).`
    );
  }
  if (findHtmlFiles(rootDir).length > 0) return "static-html";
  throw new Error(
    `Ukjent prosjekttype i ${rootDir} -- ingen package.json og ingen .html-filer funnet.`
  );
}

function fileToRouteNextApp(file, appDir) {
  const rel = relative(appDir, file).replace(/\\/g, "/");
  const stripped = rel.replace(/(^|\/)page\.(js|jsx|ts|tsx)$/, "");
  if (stripped === "") return "/";
  const segments = stripped.split("/").filter((s) => s && !/^\(.*\)$/.test(s));
  return "/" + segments.join("/");
}

// Billig, mekanisk forhandssignal for "denne siden er sannsynligvis en uferdig
// stub" -- FOR AI-annotering trenger a lese noe som helst, slik at lag 2 kan
// bekrefte/avkrefte i stedet for a matte oppdage det fra bunnen av selv.
// To heuristikker, begge bevisst brede (falske positiver er billigere enn a
// aldri flagge en ekte stub): eksplisitte markorord (TODO/FIXME/"coming
// soon" osv.), ELLER et reelt innhold pa under 120 tegn etter import-
// klausuler er fjernet (fanger tomme/nesten-tomme komponenter uten
// markorord -- INKLUDERT en fil som er 100% tom etter stripping, ikke bare
// "kort men ikke-tom": bevist nodvendig 16.07.2026 mot en EKTE fil i KRINS
// frontend (`Settings.tsx`, `export default function Settings(){ return
// <div>Settings</div> }`) som en tidligere `length > 0`-vakt feilaktig
// UNNTOK fra a bli flagget -- den mest apenbare stuben av alle ble avvist
// fordi resultatet var TOMT, ikke "kort".
// "placeholder" MA ha en negativ lookahead mot "=" eller ":" -- ellers
// treffer regexen enhver <input placeholder="Sok..."/> eller { placeholder:
// "..." }, som er en helt vanlig, ekte HTML/JSX-attributt-navn i FERDIG
// bygde skjemaer, ikke et markorord for uferdig innhold. Bevist 17.07.2026:
// Projects/List.tsx (221 linjer ekte, ferdig innhold) ble feilaktig flagget
// som stub utelukkende pa grunn av `<input placeholder="Search projects...">`.
const STUB_MARKERS_RE = /\b(TODO|FIXME|coming soon|under construction|lorem ipsum)\b|\bplaceholder\b(?!\s*[:=])/i;
const MIN_REAL_CONTENT_LENGTH = 120;
// Importer strippes med en KLAUSUL-basert regex (matcher "import ... from
// '...'" uansett linjeskift inni), IKKE en linje-anker (^...$). Bevist
// nodvendig 16.07.2026 mot to EKTE filer i KRINS frontend som begge er
// skrevet som ÉN fysisk linje uten linjeskift (`Settings.tsx`,
// `Styleguide.tsx`) -- en linje-anker-regex tolker DA hele filen (import OG
// resten av det ekte JSX-innholdet pa samme fysiske linje) som "én
// import-linje" og stripper bort ALT, ikke bare selve importen. Export
// strippes bevisst IKKE lenger (var ogsa linje-ankret, samme svakhet) --
// overhead fra "export default function X(){ return" er uansett for lite
// til a pavirke 120-tegns-terskelen i praksis, og a droppe det fjerner hele
// linje-anker-sarbarheten uten a bytte den ut med en tilsvarende skjor
// regex for export.
const IMPORT_WITH_FROM_RE = /import\s+[\s\S]*?from\s+['"][^'"]*['"]\s*;?/g;
const IMPORT_SIDE_EFFECT_RE = /import\s+['"][^'"]*['"]\s*;?/g;

// Ren, innholds-basert kjernelogikk -- ingen fil-lesing her. Delt mellom
// detectPossiblyStub(file) (leser selv, for test-/CLI-bruk der bare en
// filsti er tilgjengelig) og generateManifest sin routesWithStub-mapping
// (som allerede MÅ lese fila for possiblyMockData like under, og derfor kan
// sende det samme innholdet til begge uten å lese fila to ganger -- se
// RETTET 17.07.2026-notatet ved possiblyMockData under).
function stubFromContent(content) {
  if (STUB_MARKERS_RE.test(content)) return true;
  const bodyOnly = content
    .replace(IMPORT_WITH_FROM_RE, "")
    .replace(IMPORT_SIDE_EFFECT_RE, "")
    .trim();
  return bodyOnly.length < MIN_REAL_CONTENT_LENGTH;
}

export function detectPossiblyStub(file) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  return stubFromContent(content);
}

// Lagt til 17.07.2026 etter et EKTE funn i KRINS Portal: en side med
// substansielt, ferdig bygget innhold (ikke possiblyStub) kan likevel vise
// UTELUKKENDE hardkodet demo-/mock-tall -- presentert identisk med ekte,
// live-hentet data, uten noe visuelt skille. Investor/Home.tsx viser "$2.4M
// ARR" som en ren literal i `useState({revenue: '$2.4M', ...})`; INGEN
// fetch/axios/useSWR/useQuery-kall finnes noe sted i fila. Kun et HINT
// (samme filosofi som possiblyStub) -- en komponent som mottar data via
// PROPS fra en forelder som selv henter det, vil false-positive her; AI-
// annoteringslaget bekrefter alltid ved faktisk lesing, akkurat som stub.
const LIVE_DATA_RE = /\b(fetch\s*\(|axios\.|useSWR\s*\(|useQuery\s*\(|useMutation\s*\(|supabase\.|prisma\.)/;

// RETTET 17.07.2026 (/best-losning mot selve skillet): denne funksjonen og
// detectPossiblyStub leste samme fil TO GANGER per rute (én readFileSync
// hver, rett etter hverandre, for identisk innhold) -- ren, unødvendig
// I/O introdusert samme kveld denne heuristikken ble lagt til.
// generateManifest sin routesWithStub-mapping leser nå fila ÉN gang og
// sender innholdet til begge via *FromContent-hjelperne; denne
// fil-lesende varianten beholdes for test-/CLI-bruk der kun en filsti er
// tilgjengelig (bevisst ikke fjernet -- samme mønster som
// detectPossiblyStub over).
function mockDataFromContent(content, possiblyStub) {
  if (possiblyStub) return false; // en stub har ingen "data" a vurdere ennå
  return !LIVE_DATA_RE.test(content);
}

export function detectPossiblyMockData(file, possiblyStub) {
  if (possiblyStub) return false;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  return mockDataFromContent(content, possiblyStub);
}

function enrichNextAppRoute(file) {
  let content = "";
  try {
    content = readFileSync(file, "utf8");
  } catch (e) {
    console.warn(`sidekart: kunne ikke lese ${file}, behandler som tom (${e.message})`);
  }
  const dynamic = /export const dynamic\s*=\s*["']force-dynamic["']/.test(content);
  const importMatch = content.match(/import\s+(\w+)\s+from\s+["']\.\/(\S+)["']/);
  return { dynamic, renders: importMatch ? importMatch[2] : null };
}

function findRoutesNextApp(rootDir) {
  const appDir = join(rootDir, "app");
  const files = walkFiles(appDir, (name) => /^page\.(js|jsx|ts|tsx)$/.test(name));
  return files.map((file) => ({
    route: fileToRouteNextApp(file, appDir),
    file: relative(rootDir, file).replace(/\\/g, "/"),
    ...enrichNextAppRoute(file),
  }));
}

function findRoutesNextPages(rootDir) {
  const pagesDir = join(rootDir, "pages");
  const files = walkFiles(pagesDir, (name) => /\.(js|jsx|ts|tsx)$/.test(name));
  const routes = [];
  for (const file of files) {
    const rel = relative(pagesDir, file).replace(/\\/g, "/");
    if (rel.startsWith("api/")) continue;
    const base = rel.replace(/\.(js|jsx|ts|tsx)$/, "");
    if (/^_(app|document)$/.test(base)) continue;
    if (/^(404|500)$/.test(base)) continue;
    const route = base === "index" ? "/" : "/" + base.replace(/\/index$/, "");
    routes.push({
      route,
      file: relative(rootDir, file).replace(/\\/g, "/"),
      dynamic: false,
      renders: null,
    });
  }
  return routes;
}

// object-literal "path:" er for bred til a skanne overalt -- ethvert objekt
// med en "path"-nokkel (f.eks. en filsti-liste i en helt urelatert
// komponent) matcher. Bevist i praksis mot et ekte Vite+react-router-
// prosjekt: en "endrede filer"-visning med `{ path: "backend/src/server.ts" }`
// ga 6 falske "ruter". Gate derfor object-literal-regexen til prosjekter som
// FAKTISK oppretter en router et sted (createBrowserRouter/createHashRouter/
// createRoutesFromElements) -- JSX-formen (`<Route path=`) er allerede
// spesifikk nok (krever den bokstavelige react-router-komponenten) til a
// skannes overalt uten samme fare.
//
// VIKTIG: gaten sjekkes PROSJEKT-BREDT (finnes kallet i NOEN fil), ikke
// per-fil. Et per-fil-forsok ble first, men det knuste stille et svaert
// vanlig React Router v6.4+-monster: rute-konfigurasjonen ligger i én fil
// (f.eks. routes-config.jsx med `export const routes = [{path:...}]`), mens
// selve `createBrowserRouter(routes)`-kallet skjer i en HELT ANNEN
// entry-fil (main.jsx) som importerer den -- per-fil-sjekken ga da 0 ruter
// (100% datatap), bevist med en direkte reproduksjon under revisjon av
// denne fiksen. Prosjekt-bred sjekk fanger dette riktig, pa bekostning av
// en smalere (og allerede akseptert, samme kategori som ovenfor) falsk-
// positiv-risiko: hvis et prosjekt BADE bruker createBrowserRouter ett sted
// OG har urelaterte path:-objekter et annet sted, kan disse na dukke opp
// igjen. Gitt at stille totalt datatap er langt verre enn noen ekstra
// falske positiver, er dette den riktige avveiningen.
const ROUTER_CREATION_RE = /createBrowserRouter\s*\(|createHashRouter\s*\(|createRoutesFromElements\s*\(/;

// Bygger en map { KomponentNavn -> relativ-import-sti } fra ALLE default-
// imports i en fil ("import X from './pages/X'"). Brukt til a spore
// <Route element={<X/>}> -> import X -> ekte filsti (se resolveComponentFile).
function buildImportMap(content) {
  const map = new Map();
  const re = /import\s+(\w+)\s+from\s+["'](\.[^"']+)["']/g;
  let m;
  while ((m = re.exec(content))) map.set(m[1], m[2]);
  return map;
}

// KJERNEFIKS 17.07.2026: for sentraliserte router-oppsett (ALLE ruter
// deklarert i EN fil, f.eks. main.tsx) var route.file ALLTID rute-konfig-
// fila selv -- aldri den faktiske sidekomponenten. To ekte, uavhengige
// symptomer pa SAMME rotarsak: (1) possiblyStub ble et no-op (leste
// main.tsx N ganger, aldri sidens eget innhold -- se SKILL.md sin kjente
// begrensning fra 16.07.2026), og (2) computeClickDepths sin katalog-
// baserte eierskap fant ingen eier for sider hvis navigasjon lever i en
// DELT hub-/shell-fil utenfor rutens (feilaktige) egen fil-mappe -- derav
// fallback-lagene i computeClickDepths, som na blir et sikkerhetsnett i
// stedet for eneste forsvar. Sporer <Route path="X" element={<Comp/>}> (JSX)
// eller { path: "X", element: <Comp/> } (objekt-literal) -> import Comp fra
// EGEN fil -> ekte filsti pa disk. Faller tilbake til rute-konfig-fila
// (tidligere, alltid-riktige oppforsel) hvis sporingen ikke lykkes --
// aldri en regresjon, kun en forbedring nar den lykkes.
function resolveComponentFile(importerAbsFile, componentName, importMap) {
  const importPath = importMap.get(componentName);
  if (!importPath) return null;
  const base = join(dirname(importerAbsFile), importPath);
  const candidates = [
    base + ".tsx", base + ".ts", base + ".jsx", base + ".js",
    join(base, "index.tsx"), join(base, "index.ts"), join(base, "index.jsx"), join(base, "index.js"),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // fila finnes ikke -- prov neste kandidat
    }
  }
  return null;
}

function findRoutesViteReactRouter(rootDir, cache = new Map()) {
  const srcDir = existsSync(join(rootDir, "src")) ? join(rootDir, "src") : rootDir;
  const files = walkFiles(srcDir, (name) => /\.(jsx?|tsx?)$/.test(name));
  const fileContents = files.map((file) => {
    const content = readFileCached(cache, file);
    if (content === null) {
      console.warn(`sidekart: kunne ikke lese ${file}, hopper over`);
      return null;
    }
    return { file, content };
  }).filter(Boolean);
  const projectCreatesRouter = fileContents.some(({ content }) => ROUTER_CREATION_RE.test(content));
  const routes = [];
  const seen = new Set();
  for (const { file, content } of fileContents) {
    const relFile = relative(rootDir, file).replace(/\\/g, "/");
    const importMap = buildImportMap(content);
    const addRoute = (routePath, componentName) => {
      if (seen.has(routePath)) return;
      seen.add(routePath);
      const resolved = componentName ? resolveComponentFile(file, componentName, importMap) : null;
      routes.push({
        route: routePath,
        file: resolved ? relative(rootDir, resolved).replace(/\\/g, "/") : relFile,
        dynamic: false,
        renders: null,
      });
    };

    // JSX-form MED komponent rett etter (element={<Comp) -- forsoker a lose
    // den ekte sidefila. Kjores FOR den plain varianten under slik at den
    // far forste forsok pa a resolve fila.
    const jsxWithElementRe = /<Route\s+path=["']([^"']+)["']\s+element=\{<(\w+)/g;
    let m;
    while ((m = jsxWithElementRe.exec(content))) addRoute(m[1], m[2]);

    // JSX-form UTEN component-match rett etter <Route -- uvanlig, men
    // identisk fallback-oppforsel med FOR denne fiksen (relFile).
    const jsxPlainRe = /<Route\s+path=["']([^"']+)["']/g;
    while ((m = jsxPlainRe.exec(content))) addRoute(m[1], null);

    if (projectCreatesRouter) {
      // Objekt-literal-form: skann HELE { ... }-blokken (samme mønster som
      // next.config-redirect-skanningen lenger ned) sa path: og element:
      // kan sta i vilkarlig rekkefolge/avstand innad i samme objekt.
      const objRe = /\{[^{}]*\}/g;
      let om;
      while ((om = objRe.exec(content))) {
        const obj = om[0];
        const pathM = /path:\s*["']([^"']+)["']/.exec(obj);
        if (!pathM) continue;
        const elM = /element:\s*<(\w+)/.exec(obj);
        addRoute(pathM[1], elM ? elM[1] : null);
      }
    }
  }
  return routes;
}

function findRoutesStaticHtml(rootDir) {
  return findHtmlFiles(rootDir).map((file) => {
    const rel = relative(rootDir, file).replace(/\\/g, "/");
    const parts = rel.split("/");
    const base = parts.pop();
    const dir = parts.join("/");
    const route = base === "index.html" ? (dir ? "/" + dir + "/" : "/") : "/" + rel;
    return { route, file: rel, dynamic: false, renders: null };
  });
}

export function findRoutes(rootDir, framework, cache = new Map()) {
  switch (framework) {
    case "next-app":
      return findRoutesNextApp(rootDir);
    case "next-pages":
      return findRoutesNextPages(rootDir);
    case "vite-react-router":
      return findRoutesViteReactRouter(rootDir, cache);
    case "static-html":
      return findRoutesStaticHtml(rootDir);
    default:
      throw new Error(`findRoutes: ukjent rammeverk "${framework}"`);
  }
}

const LINK_PATTERNS = [
  /href="(\/[^"]*)"/g,
  /href=\{`(\/[a-zA-Z0-9_-]*)/g,
  // <Link to={`/x/${id}`}> -- react-router sin EGEN JSX-form med
  // template-literal, symmetrisk med href=\{`...\} over. Kun det statiske
  // prefikset fanges (interpolasjonen kuttes bevisst, samme filosofi som
  // href-mønsteret -- se regresjonstesten for avkuttede fragmenter).
  /to=\{`(\/[a-zA-Z0-9_-]*)/g,
  /href:\s*["'](\/[^"']*)["']/g,
  /<Link\s+to=["'](\/[^"']*)["']/g,
  // Objekt-literal `to:` (NavItem[]-mønsteret: { label: "...", to: "/x",
  // icon }), typisk en data-drevet nav-liste rendret via .map() -- IKKE
  // JSX <Link to=...> direkte, derfor eget mønster. Samme aksepterte
  // heuristikk-klasse som href: over (en generisk nøkkel kan i sjeldne
  // tilfeller peke på noe annet enn en rute), men bevist nødvendig 17.07.2026:
  // KRINS Portal sin SiteShell.tsx har 12 sidebar-lenker (playground,
  // workflows, agents, knowledge, evaluations, domain-packs, logs, inbox,
  // roadmap, admin/users, settings, admin/system) UTELUKKENDE i to
  // `const xRoutes: NavItem[] = [{ to: "/..." }]`-arrays -- uten dette
  // mønsteret var alle 12 usynlige for skanneren, og sidekartet viste dem
  // som "ikke koblet inn" sjøl om de er ekte, klikkbare sidebar-lenker.
  /to:\s*["'](\/[^"']*)["']/g,
  // Tredje navnekonvensjon for samme mønster: en config-liste (f.eks.
  // systems.ts: { id, route: "/system/x" }) rendret dynamisk et helt ANNET
  // sted (<Link to={sys.route}> i SystemSwitcher.tsx -- ren variabel,
  // strukturelt umulig for noe regex å løse derfra). Selve strengverdien
  // ligger likevel literal i config-fila. Bevist 17.07.2026: KRINS Portal
  // sin systems.ts har 16 `route:`-oppføringer, inkl. /system/core1-extension
  // som ellers var usynlig for skanneren på nøyaktig samme måte som
  // to:-hullet over.
  /route:\s*["'](\/[^"']*)["']/g,
  /router\.push\(["'](\/[^"']+)["']\)/g,
  /navigate\(["'](\/[^"']+)["']\)/g,
  // <Navigate to="/x"> -- react-router sin deklarative redirect-komponent,
  // vanlig brukt som element={<Navigate to=... />} inne i en <Route>. Uten
  // dette mønsteret viste den faktiske hovedsiden i et ekte Vite+react-router-
  // prosjekt (Monterosso baatchat/web, 12.07.2026) som "orphaned" sjøl om "/"
  // eksplisitt omdirigerer dit -- den mest besøkte siden i hele appen ble
  // feilklassifisert som glemt/ubrukt.
  /<Navigate\s+to=["'](\/[^"']*)["']/g,
];

function scanFileForLinks(file, rootDir, cache = new Map()) {
  const content = readFileCached(cache, file);
  if (content === null) {
    console.warn(`sidekart: kunne ikke lese ${file}, hopper over lenke-skann`);
    return [];
  }
  const relFile = relative(rootDir, file).replace(/\\/g, "/");
  const targets = new Set();
  for (const re of LINK_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content))) {
      const target = m[1].replace(/\?.*$/, "").replace(/#.*$/, "");
      if (!target || target === "/") continue;
      targets.add(target);
    }
  }
  return [...targets].map((to) => ({ from: relFile, to }));
}

// Skanner ett redirect-objekt av gangen (avgrenset av { ... } uten nestede
// klammer) slik at source/destination kan stå i vilkårlig rekkefølge og med
// enten '- eller "-anførselstegn -- next.config-forfattere bruker begge om
// hverandre, og noen legger permanent/basePath mellom feltene.
const REDIRECT_OBJECT_RE = /\{[^{}]*\}/g;
const REDIRECT_FIELD_RE = /(source|destination)\s*:\s*["']([^"']+)["']/g;

function findRedirects(rootDir) {
  const edges = [];
  for (const name of ["next.config.mjs", "next.config.js"]) {
    const full = join(rootDir, name);
    if (!existsSync(full)) continue;
    const content = readFileSync(full, "utf8");
    REDIRECT_OBJECT_RE.lastIndex = 0;
    let objMatch;
    while ((objMatch = REDIRECT_OBJECT_RE.exec(content))) {
      const obj = objMatch[0];
      let source, destination;
      REDIRECT_FIELD_RE.lastIndex = 0;
      let fieldMatch;
      while ((fieldMatch = REDIRECT_FIELD_RE.exec(obj))) {
        if (fieldMatch[1] === "source") source = fieldMatch[2];
        else destination = fieldMatch[2];
      }
      if (source && destination) {
        edges.push({ from: `redirect:${source}`, to: destination, redirect: true });
      }
    }
  }
  return edges;
}

const SOURCE_EXTENSIONS = {
  "next-app": [".js", ".jsx", ".ts", ".tsx"],
  "next-pages": [".js", ".jsx", ".ts", ".tsx"],
  "vite-react-router": [".js", ".jsx", ".ts", ".tsx"],
  "static-html": [".html"],
};

export function findLinks(rootDir, framework, cache = new Map()) {
  const exts = SOURCE_EXTENSIONS[framework];
  if (!exts) throw new Error(`findLinks: ukjent rammeverk "${framework}"`);
  const files = walkFiles(rootDir, (name) => exts.some((ext) => name.endsWith(ext)));
  const edges = files.flatMap((file) => scanFileForLinks(file, rootDir, cache));
  if (framework === "next-app" || framework === "next-pages") {
    edges.push(...findRedirects(rootDir));
  }
  return edges;
}

function routeMatchesTarget(routePattern, target) {
  if (routePattern === target) return true;
  const pattern = routePattern
    .split(/(\[[^\]]+\]|:[A-Za-z0-9_]+)/)
    .map((part) =>
      /^(\[[^\]]+\]|:[A-Za-z0-9_]+)$/.test(part)
        ? "[^/]+"
        : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    )
    .join("");
  return new RegExp(`^${pattern}$`).test(target);
}

// Next.js App Router-spesifikt: en side som direkte rendrer en ANNEN rutes
// komponent er reelt en alias -- ingen href-skann kan se dette, det er et
// komponent-import, ikke navigasjon. Delt mellom matchEdgesToRoutes (avgjor
// linked/orphaned-status) og computeClickDepths (avgjor na-barhet i
// klikk-grafen) -- samme relasjon, to ulike bruksomrader. Holdt som ÉN
// funksjon etter at revisjon 10.07.2026 fant dette duplisert uavhengig to
// steder: en fremtidig fiks her (f.eks. stotte for dypere renders-stier)
// propagerer na automatisk til begge.
function findRendersAliasTarget(route, routes) {
  if (!route.renders) return null;
  const renderedDir = route.renders.split("/")[0];
  return routes.find(
    (other) => other !== route && other.file.startsWith(`app/${renderedDir}/`)
  );
}

// RETTET 17.07.2026 (npm-pakke-migreringen, portet FRA cinque-terre sin
// egen sitekart-core.mjs -- dens 13.07.2026-audit fant dette FØR denne
// pakken fantes, og migreringen ville stille mistet fiksen uten denne
// portingen). Uten dette filteret ble ETHVERT umatchet href-mål rapportert
// som "manglende side" -- bevist mot cinque-terre: asset-stier
// (/backgrounds/x.webp, /discover/rss.xml), API-ruter (/api/...) og
// trunkerte prefikser av en rute som FAKTISK finnes ett hakk dypere
// (href={`/s/${slug}`} sitt statiske "/s"-fragment, mens "/s/[slug]" er en
// ekte rute) dukket alle opp som falske "manglende sider".
function looksLikeRealPageTarget(target, routes) {
  if (target.startsWith("/api/")) return false;
  const lastSegment = target.split("/").pop() || "";
  if (lastSegment.includes(".")) return false;
  const isTruncatedPrefix = routes.some((r) => r.route.startsWith(target + "/"));
  if (isTruncatedPrefix) return false;
  return true;
}

export function matchEdgesToRoutes(routes, edges) {
  const enriched = routes.map((r) => ({ ...r, linkedFrom: [] }));
  const missingMap = new Map();

  for (const edge of edges) {
    const hit = enriched.find((r) => routeMatchesTarget(r.route, edge.to));
    if (hit) {
      if (!hit.linkedFrom.some((l) => l.from === edge.from)) {
        hit.linkedFrom.push({ from: edge.from, redirect: !!edge.redirect });
      }
    } else if (looksLikeRealPageTarget(edge.to, enriched)) {
      if (!missingMap.has(edge.to)) missingMap.set(edge.to, new Set());
      missingMap.get(edge.to).add(edge.from);
    }
  }

  for (const r of enriched) {
    const target = findRendersAliasTarget(r, enriched);
    if (target && !target.linkedFrom.some((l) => l.from === r.file)) {
      target.linkedFrom.push({ from: r.file, renders: true });
    }
  }

  for (const r of enriched) {
    r.status = r.route === "/" ? "root" : r.linkedFrom.length > 0 ? "linked" : "orphaned";
  }

  // VIKTIG -- ulik form pa samme feltnavn: routes[].linkedFrom er
  // Array<{from, redirect?, renders?}> (objekter, se linje 297/308 over),
  // men missingPages[].linkedFrom under er Array<string> (rene filstier/
  // "redirect:..."-prefikser, uten wrapper-objekt) -- missingMap samler kun
  // edge.from-strenger, aldri hele edge-objektet, siden det ikke finnes noe
  // "status" a bunte dem med for en side som ikke eksisterer ennå. Samme
  // feltnavn, ulik struktur -- en fremtidig forbruker av manifestet ma IKKE
  // anta samme form pa begge. Bevisst slik, ikke fikset til samme form,
  // siden annotate-workflow.md allerede konsumerer missingPages[].linkedFrom
  // som rene strenger (`.join(', ')`) -- a endre formen na ville krevd en
  // tilsvarende endring der. Dokumentert her etter at revisjon 10.07.2026
  // fant det som en reell forvirrings-felle, ikke en bug i seg selv.
  const missingPages = [...missingMap.entries()].map(([target, sources]) => ({
    target,
    linkedFrom: [...sources],
  }));

  return { routes: enriched, missingPages };
}

// Klikk-dybde: BFS fra "/" over det EKTE navigasjonsgrafen (hvilken rute
// EIER filen en lenke kommer fra, ikke bare "hvilken fil"). Samme
// eier-oppslag som sidekart-live.html sin ownerRouteOf gjorde tidligere kun
// i nettleseren -- flyttet hit slik at dybden kan leveres som ferdig data,
// ikke rekomputeres klient-side. Redirects telles ikke som et faktisk klikk
// en bruker utforer, derfor ekskludert fra grafen.
function computeClickDepths(routes, edges) {
  const ownerByDir = new Map(
    routes.map((r) => [r.file.split("/").slice(0, -1).join("/"), r.route])
  );
  const graph = new Map(routes.map((r) => [r.route, new Set()]));
  for (const edge of edges) {
    if (edge.redirect) continue;
    const dir = edge.from.split("/").slice(0, -1).join("/");
    const ownerRoute = ownerByDir.get(dir);
    if (!ownerRoute || !graph.has(ownerRoute)) continue;
    const target = routes.find((r) => routeMatchesTarget(r.route, edge.to));
    if (target) graph.get(ownerRoute).add(target.route);
  }
  // Renders-alias (samme findRendersAliasTarget-relasjon som
  // matchEdgesToRoutes bruker for linked-status): en rute som direkte
  // rendrer en ANNEN rutes komponent gjor den ruten reelt na-bar fra seg
  // selv -- uten denne kanten forblir alt bak en slik alias-side uendelig
  // utilgjengelig (null-dybde), sjøl om en bruker faktisk SER de lenkene
  // idet de besøker alias-siden. Bevist i praksis mot Monterosso
  // 10.07.2026: "/" rendrer "/gateway"s komponent, og alt Gateway.js lenker
  // til fikk feilaktig null-dybde uten dette. BFS-en tar seg av resten
  // transitivt.
  for (const r of routes) {
    const target = findRendersAliasTarget(r, routes);
    if (target && graph.has(r.route)) graph.get(r.route).add(target.route);
  }
  // Delt-skall-fallback: en fil UTEN katalog-eier (samme situasjon som over)
  // hvis lenker sprer seg over >=2 ULIKE topp-niva-seksjoner (f.eks. /chat
  // OG /krin OG /overview -- helt urelaterte deler av appen) er mest
  // sannsynlig et GLOBALT app-skall (sidebar/header, rendret på HVER side),
  // ikke en enkelt sides eget innhold -- slike lenker er derfor reelt 1
  // klikk unna FRA ROTEN, siden global navigasjon er synlig overalt.
  // Motsetning, bevisst IKKE dekket her: en fil hvis lenker ALLE peker
  // innad i SAMME seksjon (f.eks. kun /admin/*) er en seksjons-hub, ikke et
  // skall -- da skal IKKE roten late som noe er klikkbart nar seksjonens
  // egen indeksside beviselig mangler innkommende lenke (KRINS Portal
  // 17.07.2026: /admin og /investor har linkedFrom=[] -- et EKTE hull i
  // appens navigasjon, ikke en sidekart-artefakt å late som ikke finnes).
  const edgesByFrom = new Map();
  for (const edge of edges) {
    if (edge.redirect) continue;
    if (!edgesByFrom.has(edge.from)) edgesByFrom.set(edge.from, []);
    edgesByFrom.get(edge.from).push(edge);
  }
  for (const [from, fromEdges] of edgesByFrom) {
    const dir = from.split("/").slice(0, -1).join("/");
    if (ownerByDir.has(dir)) continue;
    const families = new Set(fromEdges.map((e) => e.to.split("/").filter(Boolean)[0] || "/"));
    if (families.size < 2 || !graph.has("/")) continue;
    for (const edge of fromEdges) {
      const target = routes.find((r) => routeMatchesTarget(r.route, edge.to));
      if (target) graph.get("/").add(target.route);
    }
  }
  // URL-sti-hierarki-fallback: dekker sentraliserte router-oppsett (React
  // Router v6.4+ data-router med ALLE ruter deklarert i EN fil, f.eks.
  // main.tsx) der ownerByDir over er blind -- ingen rute EIER katalogen til
  // delte shell-/hub-komponenter (SiteShell.tsx i src/components/, eller
  // Admin/Home.tsx i src/pages/Admin/), sa hver eneste lenke funnet DER blir
  // droppet av "if (!ownerRoute...) continue" over, sjolv om linkedFrom
  // korrekt registrerte dem som "linked". Bevist mot ekte KRINS Portal-data
  // 17.07.2026: 40 av 41 ruter fikk clickDepth=null (kun roten hadde 0),
  // uavhengig av at 17 av dem hadde en helt korrekt linkedFrom-kant.
  // Fallbacken legger til en kant fra naermeste EKSISTERENDE foreldre-sti
  // (strip siste sti-segment til noe matcher en kjent rute) -- en rimelig
  // antagelse for enhver sitemap-generator nar kode-sporing ikke strekker
  // til, og alltid en forbedring over a droppe kanten helt (null-dybde =
  // "uendelig langt unna", mens sti-foreldre oftest er 1 klikk unna i
  // praksis). Kun et TILLEGG til graf-kantene over, aldri en erstatning --
  // BFF-en under finner uansett KORTESTE vei, sa en ekte kode-kant med
  // kortere avstand vinner alltid over fallback-gjetningen.
  // KUN for NØSTEDE stier (>=2 segmenter, f.eks. /admin/backup under
  // /admin) OG kun ruter som FAKTISK er lenket i kode (linkedFrom.length > 0,
  // satt av matchEdgesToRoutes FOR dette kallet) -- to bevisste avgrensninger:
  // (1) ekte foreldrelose ruter (ingen fil lenker til dem noe sted) skal
  // IKKE fa en syntetisk dybde her, ellers later fallbacken som om noe er
  // klikkbart nar det beviselig ikke er det. (2) faller ALDRI helt til roten
  // ("/") for flate enkelt-segment-ruter -- det ville feilaktig kortslutte
  // ekte flersteg-navigasjon (bevist av regresjon i next-app-click-depth-
  // fixturen: /b er en FLAT rute lenket fra /a, ikke en nøstet /a/b -- uten
  // denne avgrensningen fikk /b syntetisk dybde 1 istedenfor korrekte 2).
  // Fallbacken løser dermed KUN det spesifikke, bevisbare hullet: en
  // nøstet rute hvis eksakte foreldre-sti FINNES som kjent rute, men hvis
  // lenke ikke kunne katalog-attribueres (delte hub-/seksjonskomponenter
  // utenfor rutens egen fil-mappe -- se KRINS Portal 17.07.2026).
  const routeSet = new Set(routes.map((r) => r.route));
  for (const r of routes) {
    if (!r.linkedFrom || r.linkedFrom.length === 0) continue;
    const segments = r.route.split("/").filter(Boolean);
    for (let i = segments.length - 1; i >= 1; i--) {
      const parentPath = "/" + segments.slice(0, i).join("/");
      if (routeSet.has(parentPath) && graph.has(parentPath)) {
        graph.get(parentPath).add(r.route);
        break;
      }
    }
  }
  const depths = new Map(routes.some((r) => r.route === "/") ? [["/", 0]] : []);
  // parents: SAMME BFS, samme kant-kilder (fil-eierskap, renders-alias,
  // sti-hierarki, delt-skall) som depths over -- fanget her slik at
  // sidekart-live.html kan bygge det VISUELLE treet av EKSAKT samme
  // eierskaps-avgjorelse som avgjor klikk-dybden, i stedet for a
  // rekomputere sin egen (og dermed uunngaelig drifte fra denne, slik
  // ownerRouteOf() i sidekart-live.html gjorde til 17.07.2026 -- den brukte
  // en EGEN kopi av kun det aller forste, katalog-baserte eierskapstrinnet,
  // uten renders-alias/sti-hierarki/skall-fallbackene under, og fortsatte
  // derfor a vise disse rutene som "ikke koblet inn" i selve treet lenge
  // etter at clickDepth-tallet var korrekt reparert her).
  const parents = new Map();
  const queue = [...depths.keys()];
  while (queue.length) {
    const current = queue.shift();
    const depth = depths.get(current);
    for (const next of graph.get(current) || []) {
      if (!depths.has(next)) {
        depths.set(next, depth + 1);
        parents.set(next, current);
        queue.push(next);
      }
    }
  }
  return { depths, parents };
}

// Folger hver redirect-kilde til den ikke lenger peker pa en ny redirect.
// En vanlig enkelt-redirect (A->B, B er ikke selv en redirect-kilde) er
// normalt og rapporteres IKKE -- kun kjeder pa 2+ hopp (A->B->C) og looper
// (A->B->A, eller en direkte A->A) regnes som reelle funn.
export function detectRedirectChains(edges) {
  const redirectMap = new Map(
    edges.filter((e) => e.redirect).map((e) => [e.from.replace(/^redirect:/, ""), e.to])
  );
  const chains = [];
  const loops = [];
  const reported = new Set();
  for (const source of redirectMap.keys()) {
    if (reported.has(source)) continue;
    const path = [source];
    const seenIndex = new Map([[source, 0]]);
    let current = source;
    let loopStart = -1;
    while (redirectMap.has(current)) {
      const next = redirectMap.get(current);
      path.push(next);
      if (seenIndex.has(next)) {
        loopStart = seenIndex.get(next);
        break;
      }
      seenIndex.set(next, path.length - 1);
      current = next;
    }
    path.forEach((p) => reported.add(p));
    if (loopStart >= 0) {
      loops.push({ path, loopStart: path[loopStart] });
    } else if (path.length > 2) {
      chains.push({ path });
    }
  }
  return { chains, loops };
}

export function loadConfig(rootDir) {
  const configPath = join(rootDir, "sidekart.config.json");
  if (!existsSync(configPath)) return { previewOverrides: {}, baseUrl: null, plannedPages: [] };
  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (e) {
    throw new Error(`Ugyldig sidekart.config.json i ${rootDir}: ${e.message}`);
  }
  return {
    previewOverrides: raw.previewOverrides || {},
    baseUrl: raw.baseUrl || null,
    // plannedPages: Array<{route, note?}> -- sider som IKKE finnes som fil OG
    // ikke er lenket fra noe sted ennå (rene fremtidsplaner). Kan ikke
    // oppdages mekanisk (ingen edge, ingen fil) -- eneste kilde er
    // brukeren selv. Adskilt fra previewOverrides med vilje: ulik semantikk
    // (eksempel-URL for en EKSISTERENDE dynamisk rute vs. en rute som ikke
    // finnes ennå i det hele tatt), å presse dem inn i samme felt ville
    // forvirre mer enn det forenkler.
    plannedPages: raw.plannedPages || [],
  };
}

export function generateManifest(rootDir) {
  const framework = detectFramework(rootDir);
  // ÉN delt fil-innhold-cache for hele kjøringen (se readFileCached over) --
  // findRoutes (vite-react-router) og findLinks skannet FØR helt uavhengig
  // av hverandre, med to separate readFileSync per fil for samme innhold.
  // routesWithStub sin egen lesing under gjenbruker NA OGSÅ denne cachen:
  // for vite-react-router er r.file (etter route.file-sporingsfiksen)
  // typisk allerede lest av findRoutesViteReactRouter, så det blir ofte en
  // ren cache-treff i stedet for ENDA en disk-lesing.
  const fileCache = new Map();
  const rawRoutes = findRoutes(rootDir, framework, fileCache);
  const routesWithStub = rawRoutes.map((r) => {
    const absFile = join(rootDir, r.file);
    // MÅ skille eksplisitt mellom "fila finnes ikke" (begge heuristikkene
    // skal gi false, som FØR possiblyMockData-fiksen 17.07.2026) og "fila
    // finnes og ER tom" (stubFromContent skal reelt få vurdere den -- en
    // 0-bytes fil ER en ekte stub). Å bare falle tilbake til content=""
    // ved lese-feil ville forvekslet de to og feilaktig flagget manglende
    // filer som stub (bodyOnly.length 0 < 120 → true).
    const content = readFileCached(fileCache, absFile);
    const possiblyStub = content === null ? false : stubFromContent(content);
    return {
      ...r,
      possiblyStub,
      possiblyMockData: content === null ? false : mockDataFromContent(content, possiblyStub),
    };
  });
  const edges = findLinks(rootDir, framework, fileCache);
  const { routes, missingPages } = matchEdgesToRoutes(routesWithStub, edges);
  const { depths: clickDepths, parents: clickParents } = computeClickDepths(routes, edges);
  const routesWithDepth = routes.map((r) => ({
    ...r,
    clickDepth: clickDepths.has(r.route) ? clickDepths.get(r.route) : null,
    // parentRoute: den EKSAKTE eier-avgjorelsen BFS-en over brukte for a na
    // denne ruten -- eneste kilde sidekart-live.html trenger for a bygge det
    // visuelle treet. IKKE rekomputer denne i nettleseren (se advarselen i
    // computeClickDepths over): en fremtidig fiks i eierskaps-logikken
    // propagerer da automatisk til visningen, uten a matte holde to kopier
    // synkronisert.
    parentRoute: clickParents.has(r.route) ? clickParents.get(r.route) : null,
  }));
  const { chains: redirectChains, loops: redirectLoops } = detectRedirectChains(edges);
  const config = loadConfig(rootDir);
  const sorted = routesWithDepth.sort((a, b) => a.route.localeCompare(b.route));

  // plannedPages fra config har verken en fil eller en oppdaget lenke -- de
  // kan derfor aldri kollidere med matchEdgesToRoutes sin edge-drevne
  // missingPages-liste pa annen mate enn ved rutenavn. Dedupe mot BEGGE:
  // ekte ruter (allerede bygget -- planen er innfridd) og allerede oppdagede
  // manglende sider (samme rute nevnt av en ekte lenke OG i config -- den
  // ekte lenken vinner, planned ville bare vaert en duplikat-oppforing uten
  // ny informasjon).
  const existingRoutes = new Set(sorted.map((r) => r.route));
  const alreadyMissing = new Set(missingPages.map((m) => m.target));
  const plannedMissing = (config.plannedPages || [])
    .filter((p) => p && p.route && !existingRoutes.has(p.route) && !alreadyMissing.has(p.route))
    .map((p) => ({ target: p.route, linkedFrom: [], planned: true, note: p.note || null }));
  const allMissingPages = [...missingPages, ...plannedMissing];

  return {
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/generate-sitekart.mjs",
    framework,
    baseUrl: config.baseUrl,
    previewOverrides: config.previewOverrides,
    redirectChains,
    redirectLoops,
    totalRoutes: sorted.length,
    linkedCount: sorted.filter((r) => r.status === "linked").length,
    orphanedCount: sorted.filter((r) => r.status === "orphaned").length,
    routes: sorted,
    missingPages: allMissingPages,
  };
}

// CLI-inngangen (isMain-blokken) er flyttet til bin/cli.mjs — denne fila er
// nå ren bibliotekskode (delt npm-pakke, 17.07.2026-migreringen bort fra
// kopier+drift-check, se README.md). bin/cli.mjs importerer generateManifest
// herfra og kopierer sidekart-live.html med sine egne node:fs/node:url-import.
