

---

## 🔒 Robustness Standard (obligatorisk fra 2026-08)

Alle commits i dette repoet går gjennom automatiserte quality gates.

### Pre-commit hooks (lokal)
- **husky** blokkerer commit hvis lint feiler
- **lint-staged** kjører `eslint --fix` + `tsc --noEmit` på staged filer
- **commitlint** krever format: `feat:`, `fix:`, `docs:`, `chore:`, `style:`, `refactor:`, `test:`

### CI (remote, blokkerer PR-merge)
- `npm run lint -- --max-warnings=0`
- `npm test`
- `npm run build`
- `npm audit --audit-level=moderate`

### Obligatoriske filer (alle tilstede)
- `.nvmrc` — Node-versjon pinnet
- `.editorconfig` — IDE-konsistens
- `.prettierrc` — kodeformatering
- `commitlint.config.mjs` — commit-validering
- `.github/CODEOWNERS` — `@mandymgr` godkjenner alle PRs
- `.github/workflows/ci.yml` — GitHub Actions quality gate
- `SECURITY.md` — CRITICAL 24h, HIGH sprint, MODERATE backlog

### Sjekkscript
```bash
for f in .nvmrc .editorconfig .prettierrc commitlint.config.mjs .github/CODEOWNERS .github/workflows/ci.yml SECURITY.md; do
  test -f $f && echo "✓ $f" || echo "✗ $f MANGLER"
done
```


## Master-huskefil

Start her for nye sesjoner: `~/Desktop/REPO-HELPER-KIT/MASTER-HUSKEFIL.md`
