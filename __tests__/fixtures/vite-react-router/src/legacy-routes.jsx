// Legacy route definitions (for backward compatibility)
// NOTE: /about is declared here AND in routes.jsx
// The deduplication logic should keep only one entry
//
// Must contain its OWN createBrowserRouter(...) call: object-literal `path:`
// keys are only scanned in files that actually create a router (guards
// against false positives from unrelated objects with a `path` key
// elsewhere in a real codebase -- see generate-sitekart.mjs).

import { createBrowserRouter } from "react-router-dom";
import OldAbout from "./OldAbout";

export const legacyRoutes = [
  { path: "/about", element: <OldAbout /> },
];

export const legacyRouter = createBrowserRouter(legacyRoutes);
