import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeContentHash,
  loadAnnotationCache,
  isCacheFresh,
  writeAnnotationCache,
} from "../src/annotate-cache.mjs";

test("computeContentHash er deterministisk og endrer seg med innhold", () => {
  assert.equal(computeContentHash("hello"), computeContentHash("hello"));
  assert.notEqual(computeContentHash("hello"), computeContentHash("hello!"));
});

test("loadAnnotationCache returnerer tomt objekt nar fil mangler", () => {
  const dir = mkdtempSync(join(tmpdir(), "sidekart-cache-"));
  assert.deepEqual(loadAnnotationCache(join(dir, "ikke-finnes.json")), {});
  rmSync(dir, { recursive: true });
});

test("isCacheFresh sjekker hash-match", () => {
  const cache = { "app/page.js": { contentHash: "abc123" } };
  assert.equal(isCacheFresh(cache, "app/page.js", "abc123"), true);
  assert.equal(isCacheFresh(cache, "app/page.js", "annen-hash"), false);
  assert.equal(isCacheFresh(cache, "app/missing.js", "abc123"), false);
});

test("writeAnnotationCache skriver og loadAnnotationCache leser samme data", () => {
  const dir = mkdtempSync(join(tmpdir(), "sidekart-cache-"));
  const path = join(dir, "sitekart-annotations.json");
  const data = { "app/page.js": { contentHash: "xyz", summary: "Forsiden" } };
  writeAnnotationCache(path, data);
  assert.deepEqual(loadAnnotationCache(path), data);
  rmSync(dir, { recursive: true });
});

test("loadAnnotationCache feiler tydelig pa korrupt JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "sidekart-cache-"));
  const path = join(dir, "korrupt.json");
  writeFileSync(path, "{ikke gyldig json");
  assert.throws(() => loadAnnotationCache(path), /Ugyldig .*korrupt\.json/);
  rmSync(dir, { recursive: true });
});
