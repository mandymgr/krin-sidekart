import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function computeContentHash(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function loadAnnotationCache(cachePath) {
  if (!existsSync(cachePath)) return {};
  try {
    return JSON.parse(readFileSync(cachePath, "utf8"));
  } catch (e) {
    throw new Error(`Ugyldig ${cachePath}: ${e.message}`);
  }
}

export function isCacheFresh(cache, file, contentHash) {
  return cache[file] !== undefined && cache[file].contentHash === contentHash;
}

export function writeAnnotationCache(cachePath, cache) {
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}
