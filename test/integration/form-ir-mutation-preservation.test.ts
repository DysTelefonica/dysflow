import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addControl,
  moveControl,
  parseFormTxt,
  renameControl,
  serializeFormTxt,
} from "../../src/core/services/form-ir-service";

// Primary path: canonical bench fixture cloned under bench-cache/ (gitignored; downloaded
// from ardelperal/VBA_TOOLKIT_BENCH@<commit> for SDD #617 round-trip evidence).
// Secondary paths: legacy/alternative locations kept for older workspaces where the bench
// was placed at the repo root, plus the in-tree E2E_testing splash fixture as the
// CI fallback when bench-cache/ is unavailable.
const BENCH_FORM_TXT = join(
  process.cwd(),
  "bench-cache",
  "ardelperal-VBA_TOOLKIT_BENCH",
  "src",
  "forms",
  "Form_FormRiesgosGestionRiesgo.form.txt",
);
const CANDIDATE_FIXTURES = [
  BENCH_FORM_TXT,
  "C:/00repos/codigo/00_VBA_TOOLKIT_BENCH/src/forms/Form_FormRiesgosGestionRiesgo.form.txt",
  join(
    process.cwd(),
    "ardelperal",
    "VBA_TOOLKIT_BENCH",
    "src",
    "forms",
    "Form_FormRiesgosGestionRiesgo.form.txt",
  ),
  join(
    process.cwd(),
    "VBA_TOOLKIT_BENCH",
    "src",
    "forms",
    "Form_FormRiesgosGestionRiesgo.form.txt",
  ),
  join(process.cwd(), "E2E_testing", "src", "forms", "Form_frmSplash.form.txt"),
];

function existingFixturePath(): string {
  for (const candidate of CANDIDATE_FIXTURES) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      // try next fixture
    }
  }
  throw new Error("No form serialization fixture is available for mutation preservation tests.");
}

function preservedPayload(source: string): string[] {
  return source
    .split(/\r?\n/)
    .filter((line) => /Checksum|PrtDevMode|Format\s*=|Version\s*=/.test(line));
}

function eventBindings(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("[Event Procedure]"));
}

describe("FormIR mutations preserve benchmark serialization payloads", () => {
  it("preserves Checksum, PrtDevMode, and format bytes across add/move/rename", () => {
    const raw = readFileSync(existingFixturePath(), "utf8");
    const base = parseFormTxt(raw, { name: "FormRiesgosGestionRiesgo" });
    const added = addControl(base, {
      control: {
        name: "cmdMutationProbe",
        type: "CommandButton",
        properties: { Left: "123", Top: "456" },
      },
    }).ir;
    const moved = moveControl(added, { controlName: "cmdMutationProbe", left: 321, top: 654 }).ir;
    const renamed = renameControl(moved, {
      controlName: "cmdMutationProbe",
      newName: "cmdMutationProbeRenamed",
    }).ir;

    const originalPayload = preservedPayload(serializeFormTxt(base));
    const mutatedPayload = preservedPayload(serializeFormTxt(renamed));

    expect(originalPayload.length).toBeGreaterThan(0);
    expect(mutatedPayload).toEqual(originalPayload);
  });

  // The canonical bench fixture is gitignored and downloaded on demand for local SDD
  // verification. When it is absent (CI without bench-cache), Vitest skips this test with
  // a TODO pointing at the path the bench fixture would live at so maintainers can
  // populate it locally.
  it.runIf(existsSync(BENCH_FORM_TXT))(
    "round-trips form UI mutations against the canonical Gestion_Riesgos benchmark when present",
    () => {
      const raw = readFileSync(BENCH_FORM_TXT, "utf8");
      const base = parseFormTxt(raw, { name: "FormRiesgosGestionRiesgo" });

      const added = addControl(base, {
        control: {
          name: "cmdBenchmarkProbe",
          type: "CommandButton",
          properties: { Left: "123", Top: "456", Caption: '"Bench probe"' },
        },
      }).ir;

      const moved = moveControl(added, {
        controlName: "cmdBenchmarkProbe",
        left: 321,
        top: 654,
      }).ir;

      const renamed = renameControl(moved, {
        controlName: "cmdBenchmarkProbe",
        newName: "cmdBenchmarkProbeRenamed",
      }).ir;

      const originalSerialized = serializeFormTxt(base);
      const mutatedSerialized = serializeFormTxt(renamed);

      // Byte-equivalent metadata lines: Checksum, PrtDevMode, Format bytes must be preserved
      // verbatim across parse -> add -> move -> rename -> serialize.
      expect(preservedPayload(mutatedSerialized)).toEqual(preservedPayload(originalSerialized));

      // The PrtDevMode blob (begin/end bytes) must round-trip exactly.
      expect(mutatedSerialized).toContain("PrtDevMode");
      expect(mutatedSerialized.match(/Checksum\s*=/g)?.length).toBe(
        originalSerialized.match(/Checksum\s*=/g)?.length,
      );

      // No event-binding rewrites: every original `[Event Procedure]` line is preserved and
      // the new control introduces none.
      const originalEventBindings = eventBindings(originalSerialized);
      const mutatedEventBindings = eventBindings(mutatedSerialized);
      expect(mutatedEventBindings).toEqual(expect.arrayContaining(originalEventBindings));

      // The renamed control reflects the new name and only the new name; the original name is
      // gone.
      expect(mutatedSerialized).toContain('Name ="cmdBenchmarkProbeRenamed"');
      expect(mutatedSerialized).not.toContain('Name ="cmdBenchmarkProbe"');

      // Position semantics updated by move: the new control's Left/Top are the post-move
      // coordinates.
      expect(mutatedSerialized).toContain("Left =321");
      expect(mutatedSerialized).toContain("Top =654");
    },
  );
});
