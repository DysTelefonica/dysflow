import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { FORM_NOISE_KEYS } from "../../src/core/services/form-noise-keys.js";
import { stripFormSerializationNoise } from "../../src/core/services/vba-semantic-classifier.js";

/**
 * Issue #1686 — runtime anchor, not a string anchor. `stripFormSerializationNoise`
 * documents which keys it strips and which it retains, but the keys it actually
 * strips come from `FORM_NOISE_KEYS`. Commit eb056c5b moved `NameMap` into that
 * set and updated the set's own docstring, leaving the function's docstring
 * claiming `NameMap` was retained as functional. A consumer agent read that
 * stale claim and filed issue #1685 against export_modules on a false premise.
 *
 * These tests bind the prose to the set so the two cannot drift apart again.
 */

const CLASSIFIER_PATH = "src/core/services/vba-semantic-classifier.ts";
const SHARED_SET_MODULE = "form-noise-keys";

/**
 * Returns the JSDoc block immediately preceding the `stripFormSerializationNoise`
 * declaration — the prose a reader sees when they jump to that function.
 */
function readStripDocstring(source: string): string {
  const declaration = source.indexOf("export function stripFormSerializationNoise");
  expect(
    declaration,
    `${CLASSIFIER_PATH} must declare stripFormSerializationNoise`,
  ).toBeGreaterThan(-1);

  const preceding = source.slice(0, declaration);
  const open = preceding.lastIndexOf("/**");
  const close = preceding.lastIndexOf("*/");
  expect(open, "stripFormSerializationNoise must carry a JSDoc block").toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(open);

  return preceding.slice(open, close + 2);
}

/** Returns the lines under a `* <Heading>:` bullet list inside a JSDoc block. */
function readDocSection(docstring: string, heading: string): string {
  const lines = docstring.split("\n");
  const start = lines.findIndex((line) => line.trim() === `* ${heading}:`);
  if (start === -1) return "";

  const section: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("* -")) break;
    section.push(trimmed);
  }
  return section.join("\n");
}

describe("stripFormSerializationNoise docstring contract (#1686)", () => {
  it("never lists a FORM_NOISE_KEYS member as retained", async () => {
    const source = await readFile(CLASSIFIER_PATH, "utf8");
    const retains = readDocSection(readStripDocstring(source), "Retains");

    for (const key of FORM_NOISE_KEYS) {
      expect(
        retains,
        `"${key}" is in FORM_NOISE_KEYS, so the docstring must not list it under "Retains:"`,
      ).not.toContain(key);
    }
  });

  it("accounts for every FORM_NOISE_KEYS member it strips", async () => {
    const source = await readFile(CLASSIFIER_PATH, "utf8");
    const docstring = readStripDocstring(source);
    const strips = readDocSection(docstring, "Strips");

    // Two honest ways to stay accurate: enumerate the whole set, or point at the
    // module that owns it. A hand-maintained partial copy is what produced #1686.
    const delegates = docstring.includes(SHARED_SET_MODULE);
    if (delegates) return;

    for (const key of FORM_NOISE_KEYS) {
      expect(
        strips,
        `"${key}" is stripped but the docstring neither lists it under "Strips:" nor delegates to ${SHARED_SET_MODULE}.ts`,
      ).toContain(key);
    }
  });

  it("keeps GUID documented as retained, matching the live normalizer", async () => {
    const source = await readFile(CLASSIFIER_PATH, "utf8");
    const retains = readDocSection(readStripDocstring(source), "Retains");

    expect(FORM_NOISE_KEYS.has("GUID")).toBe(false);
    expect(retains).toContain("GUID");
  });
});

describe("stripFormSerializationNoise runtime behavior (#1686)", () => {
  const wrap = (body: string) => `Begin Form\n    Caption ="x"\n${body}End\n`;
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

  it("strips every FORM_NOISE_KEYS member in Begin..End block form", () => {
    const expected = normalize(wrap(""));

    for (const key of FORM_NOISE_KEYS) {
      const withBlock = wrap(`    ${key} = Begin\n        0xdeadbeef\n    End\n`);
      expect(
        normalize(stripFormSerializationNoise(withBlock, "form.txt")),
        `"${key}" must be stripped as a Begin..End block`,
      ).toBe(expected);
    }
  });

  it("strips every FORM_NOISE_KEYS member in scalar form", () => {
    const expected = normalize(wrap(""));

    for (const key of FORM_NOISE_KEYS) {
      const withScalar = wrap(`    ${key} =1234\n`);
      expect(
        normalize(stripFormSerializationNoise(withScalar, "form.txt")),
        `"${key}" must be stripped as a scalar assignment`,
      ).toBe(expected);
    }
  });

  it("retains GUID — it is functional and must never join the noise floor", () => {
    const withGuid = wrap("    GUID = Begin\n        0xc4073da1\n    End\n");

    expect(stripFormSerializationNoise(withGuid, "form.txt")).toContain("GUID");
    expect(stripFormSerializationNoise(withGuid, "form.txt")).toContain("0xc4073da1");
  });

  it("retains unknown Begin..End keys — bias-to-functional", () => {
    const withUnknown = wrap("    SomeFutureAccessKey = Begin\n        0xabc\n    End\n");

    expect(stripFormSerializationNoise(withUnknown, "form.txt")).toContain("SomeFutureAccessKey");
  });
});
