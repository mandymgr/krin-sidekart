// Ren, testbar kopi av prompt-bygge-logikken i annotate-workflow.md sin
// "Foreslå manglende sider"-fase. Workflow-scriptet KAN ikke importere
// lokale filer (verktøyet gir ingen filsystem-/import-tilgang inne i
// selve scriptet), så logikken må dupliseres der -- men denne filen gir
// den EN permanent, automatisk testet kilde-til-sannhet for oppførselen.
// Hold begge i sync ved endring.
//
// RETTET 17.07.2026 -- denne fila hadde ALLEREDE driftet fra den ekte, live
// prompten: annotate-workflow.md la til `langNote` ("Skriv svaret på
// NORSK...") i alle tre prompt-varianter, denne fila fikk det aldri. 3/3
// tester var like fullt grønne -- de testet utdatert oppførsel uten å vite
// det (funnet av `/best-losning` mot selve skillet). `__tests__/
// workflow-prompt-parity.test.mjs` sjekker nå AUTOMATISK at prosa-strengene
// i de to filene er identiske, ikke bare at denne fila sin egen logikk
// virker isolert -- en reell drift-detektor, ikke bare en advarende
// kommentar (som beviselig ikke var nok til å hindre driften over).
const LANG_NOTE =
  ` Skriv svaret på NORSK (bokmål) -- unntak: direkte sitat fra ` +
  `en kodekommentar kan beholdes på engelsk.`;

export function buildMissingPagePrompt(missing, projectRoot) {
  const realSources = missing.linkedFrom.filter((f) => !f.startsWith("redirect:"));
  const redirectSources = missing.linkedFrom
    .filter((f) => f.startsWith("redirect:"))
    .map((f) => f.replace(/^redirect:/, ""));
  const redirectNote = redirectSources.length
    ? ` (${missing.target} er også mål for en next.config-omdirigering fra ` +
      `${redirectSources.join(", ")} -- ikke en fil, ikke les den.)`
    : "";
  if (realSources.length) {
    return (
      `En lenke i ${realSources.join(", ")} peker til ${missing.target}, som ikke ` +
      `finnes som side i prosjektet ennå. Les kildefilen(e) den er lenket fra ` +
      `(i ${projectRoot}/) nå for å se konteksten (knappetekst, ` +
      `plassering).${redirectNote} Foreslå kort hva denne siden burde inneholde.${LANG_NOTE}`
    );
  }
  return (
    `${missing.target} finnes ikke som side i prosjektet ennå, men er mål for en ` +
    `next.config-omdirigering fra ${redirectSources.join(", ")}. Ingen kildefil å ` +
    `lese for kontekst her (kun en omdirigering, ikke en ekte lenke fra en side). ` +
    `Foreslå kort hva denne siden burde inneholde, basert på selve rutenavnet.${LANG_NOTE}`
  );
}
