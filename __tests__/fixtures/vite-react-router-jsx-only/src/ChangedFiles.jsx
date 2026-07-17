// Reproduserer det EKTE funnet fra E2E-validering mot KRINS frontend/
// (src/pages/Projects/Detail.tsx): et objekt med en "path"-nokkel som ikke
// har NOE med routing a gjore, i et prosjekt som IKKE bruker
// createBrowserRouter/createHashRouter/createRoutesFromElements noe sted
// (kun JSX <Route path=...>-formen, som frontend/ faktisk gjor).

export const changedFiles = [
  { path: "backend/src/server.ts", additions: 12 },
  { path: "README.md", additions: 3 },
];
