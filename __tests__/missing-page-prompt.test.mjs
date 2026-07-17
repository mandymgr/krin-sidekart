import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMissingPagePrompt } from "../src/missing-page-prompt.mjs";

test("buildMissingPagePrompt: kun redirect-kilde -- ber IKKE agenten lese en fil", () => {
  const prompt = buildMissingPagePrompt(
    { target: "/not-built-yet", linkedFrom: ["redirect:/old-a", "redirect:/old-b"] },
    "/tmp/fake-project"
  );
  assert.doesNotMatch(prompt, /Les kildefilen/);
  assert.match(prompt, /next\.config-omdirigering fra \/old-a, \/old-b/);
  assert.doesNotMatch(prompt, /redirect:/);
});

test("buildMissingPagePrompt: blandet kilde -- leser ekte fil, noterer redirect separat uten a be om lesing", () => {
  const prompt = buildMissingPagePrompt(
    { target: "/mixed", linkedFrom: ["app/gateway/Gateway.js", "redirect:/old-c"] },
    "/tmp/fake-project"
  );
  assert.match(prompt, /Les kildefilen\(e\) den er lenket fra/);
  assert.match(prompt, /app\/gateway\/Gateway\.js/);
  assert.match(prompt, /ikke en fil, ikke les den/);
  assert.doesNotMatch(prompt, /redirect:/);
});

test("buildMissingPagePrompt: normal kilde -- uendret oppforsel", () => {
  const prompt = buildMissingPagePrompt(
    { target: "/normal", linkedFrom: ["app/landing/Landing.js"] },
    "/tmp/fake-project"
  );
  assert.match(prompt, /En lenke i app\/landing\/Landing\.js peker til \/normal/);
  assert.doesNotMatch(prompt, /omdirigering/);
});
