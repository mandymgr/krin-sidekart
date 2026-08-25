import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ok = (msg) => console.log(`✓ ${msg}`);
const warn = (msg) => console.log(`⚠ ${msg}`);

const has = (p) => existsSync(p);

if (has('.nvmrc')) {
  const expected = readFileSync('.nvmrc', 'utf8').trim();
  const actual = execSync('node -v', { encoding: 'utf8' }).trim().replace(/^v/, '');
  if (expected === actual) ok(`Node ${actual} matches .nvmrc`);
  else warn(`Node ${actual} does not match .nvmrc (${expected})`);
}

if (has('.env.example')) ok('.env.example exists');
if (has('.husky/pre-commit')) ok('.husky/pre-commit exists');
if (has('.husky/commit-msg')) ok('.husky/commit-msg exists');
if (has('commitlint.config.mjs')) ok('commitlint config exists');
if (has('.github/workflows/ci.yml')) ok('CI workflow exists');
if (has('SECURITY.md')) ok('SECURITY.md exists');
if (has('.editorconfig')) ok('.editorconfig exists');
if (has('.prettierrc')) ok('.prettierrc exists');
if (has('.prettierignore')) ok('.prettierignore exists');
