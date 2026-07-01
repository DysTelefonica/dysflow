/**
 * Slice 5 (issue #618) integration test: bench round-trip for the form
 * template cloning engine.
 *
 * Reads the canonical `Form_FormRiesgosGestionRiesgo.form.txt` from
 * `bench-cache/ardelperal-VBA_TOOLKIT_BENCH/` (gitignored; downloaded on
 * demand for slice 4 round-trip evidence) and runs the
 * `cloneFormFromTemplate` engine over a `{{FormName}}` / `{{TitleCaption}}`
 * token map injected at TEST time — no fixture seeding required.
 *
 * Asserts:
 *   - Tokens are applied inside layout scalars (Caption, RecordSource).
 *   - Preserved-metadata bytes (Checksum, Format, PrtDevMode) are byte-equal
 *     between the tokenized source and the cloned output.
 *   - The engine's `result.source` is byte-equivalent to a manual
 *     String#replace on the same tokenized text (the spec scenario).
 *   - Strict policy on a missing token rejects the clone on a real fixture.
 *
 * Mirrors the slice 4 pattern: when the bench cache is absent, the test is
 * skipped via `it.runIf(existsSync(BENCH_FORM_TXT))` so CI without the
 * bench fixture does not flame. The test itself never mutates the bench
 * fixture — token injection happens on the in-memory string only.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cloneFormFromTemplate,
  FormMutationError,
  parseFormTxt,
  serializeFormTxt,
} from "../../src/core/services/form-ir-service";

const BENCH_FORM_TXT = join(
  process.cwd(),
  "bench-cache",
  "ardelperal-VBA_TOOLKIT_BENCH",
  "src",
  "forms",
  "Form_FormRiesgosGestionRiesgo.form.txt",
);

const TOKEN_MAP = {
  FormName: "FormNuevaAuditoria",
  TitleCaption: "Cloned Caption",
} as const;

function manualReplace(text: string, tokenMap: Record<string, string>): string {
  let out = text;
  for (const [token, value] of Object.entries(tokenMap)) {
    out = out.split(`{{${token}}}`).join(value);
  }
  return out;
}

/**
 * Inject `{{FormName}}` and `{{TitleCaption}}` placeholders into the bench
 * source at test time. Inject ONLY into user-visible layout scalars — never
 * touch preserved metadata lines (`Checksum`, `Format`, `PrtDevMode`).
 *
 * The bench has exactly one form-level Caption scalar at indent 4 (the rest
 * of the `Caption =` matches are inside deeper-nested control entries,
 * which the test does not need). The bench has no `RecordSource`, so we
 * append a templated one right after the form-level Caption line.
 *
 * Line endings are normalized to LF to match the engine's serializer output
 * (preserveFormTxt joins with `\n`, and the manual-replace baseline uses
 * `split/join` on the same string — so they MUST share the same line-ending
 * convention or they cannot be byte-equal).
 */
function injectTokens(text: string): string {
  let normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const captionIdx = lines.findIndex((l) => /^    Caption ="/.test(l));
  if (captionIdx === -1) {
    throw new Error("Could not find form-level Caption line in bench fixture");
  }
  lines[captionIdx] = '    Caption ="{{TitleCaption}}"';
  lines.splice(captionIdx + 1, 0, '    RecordSource ="SELECT * FROM tbl{{FormName}}"');
  return lines.join("\n");
}

/**
 * Collect every preserved-metadata line from a SaveAsText source.
 * Used to assert the engine does NOT walk Checksum / Format / PrtDevMode.
 */
function preservedPayload(source: string): string[] {
  return source
    .split(/\r?\n/)
    .filter((line) => /^(?:Checksum|Format|PrtDevMode)\b/.test(line.trim()));
}

describe("Form template cloning — bench round-trip (slice 5, issue #618)", () => {
  it.runIf(existsSync(BENCH_FORM_TXT))(
    "byte-equals a manual clone-and-replace on the tokenized bench source",
    () => {
      const original = readFileSync(BENCH_FORM_TXT, "utf8");
      const tokenized = injectTokens(original);
      // Sanity: the injection landed in the source so we are testing something.
      expect(tokenized).toContain("{{TitleCaption}}");
      expect(tokenized).toContain("{{FormName}}");

      const ir = parseFormTxt(tokenized, { name: "FormRiesgosGestionRiesgo" });

      const clone = cloneFormFromTemplate(ir, {
        tokenMap: { ...TOKEN_MAP },
        targetFormName: "Form_FormNuevaAuditoria",
      });

      // Spec scenario 1 (byte-equivalence): engine output matches a manual
      // String#replace on the SAME tokenized source.
      const expected = manualReplace(tokenized, { ...TOKEN_MAP });
      expect(clone.source).toBe(expected);

      // Layout scalars replaced.
      expect(clone.source).toContain('Caption ="Cloned Caption"');
      expect(clone.source).toContain("tblFormNuevaAuditoria");

      // Tokens applied; none missing.
      expect(clone.appliedTokens).toEqual(expect.arrayContaining(["FormName", "TitleCaption"]));
      expect(clone.missingTokens).toEqual([]);

      // Target form name assigned.
      expect(clone.ir.name).toBe("Form_FormNuevaAuditoria");
    },
  );

  it.runIf(existsSync(BENCH_FORM_TXT))(
    "preserves Checksum / Format / PrtDevMode lines byte-equal across the clone",
    () => {
      const original = readFileSync(BENCH_FORM_TXT, "utf8");
      const tokenized = injectTokens(original);

      const ir = parseFormTxt(tokenized, { name: "FormRiesgosGestionRiesgo" });

      const clone = cloneFormFromTemplate(ir, {
        tokenMap: { ...TOKEN_MAP },
        targetFormName: "Form_FormNuevaAuditoria",
      });

      // Spec scenario 2 (preserved metadata safety): every preserved-metadata
      // line in the tokenized source ALSO appears in the cloned output, with
      // byte-equal content. The bench carries real PrtDevMode blobs that we
      // MUST NOT touch.
      const preservedFromTokenized = preservedPayload(tokenized);
      const preservedFromClone = preservedPayload(clone.source);
      expect(preservedFromClone).toEqual(expect.arrayContaining(preservedFromTokenized));

      // Specifically: the bench's checksum value is preserved verbatim.
      const checksumFromOriginal = tokenized.match(/^Checksum\s*=[^\r\n]*/m)?.[0];
      expect(checksumFromOriginal).toBeDefined();
      expect(clone.source).toContain(checksumFromOriginal ?? "____missing____");

      // Specifically: the bench's PrtDevMode blob survives with its body lines
      // unchanged. We assert the begin/end markers AND that no token markers
      // leaked inside the blob body.
      expect(clone.source).toContain("PrtDevMode = Begin");
      expect(clone.source).toContain("End");
      // Pull the body between PrtDevMode = Begin and the matching End.
      const blobBodyMatch = clone.source.match(/PrtDevMode = Begin\s*\r?\n([\s\S]*?)\r?\n\s*End/);
      expect(blobBodyMatch).not.toBeNull();
      const blobBody = blobBodyMatch?.[1] ?? "";
      expect(blobBody).not.toContain("{{FormName}}");
      expect(blobBody).not.toContain("{{TitleCaption}}");
    },
  );

  it.runIf(existsSync(BENCH_FORM_TXT))(
    "serializes back to the same `clone.source` text (round-trip through parseFormTxt)",
    () => {
      const original = readFileSync(BENCH_FORM_TXT, "utf8");
      const tokenized = injectTokens(original);
      const ir = parseFormTxt(tokenized, { name: "FormRiesgosGestionRiesgo" });

      const clone = cloneFormFromTemplate(ir, {
        tokenMap: { ...TOKEN_MAP },
        targetFormName: "Form_FormNuevaAuditoria",
      });

      // The cloned IR's serializer output is identical to the documented
      // `clone.source` field — both are produced by `serializeFormTxt` and
      // the engine never logs the IR twice. Round-trip property holds.
      expect(serializeFormTxt(clone.ir)).toBe(clone.source);
      expect(clone.preservedKeys).toEqual(expect.arrayContaining(["Checksum", "PrtDevMode"]));
    },
  );

  it.runIf(existsSync(BENCH_FORM_TXT))(
    "rejects under strict missing-token policy on a real bench fixture",
    () => {
      const original = readFileSync(BENCH_FORM_TXT, "utf8");
      const tokenized = injectTokens(original);
      const ir = parseFormTxt(tokenized, { name: "FormRiesgosGestionRiesgo" });

      // TitleCaption is intentionally unmapped. Strict policy MUST reject.
      expect(() =>
        cloneFormFromTemplate(ir, {
          tokenMap: { FormName: "FormNuevaAuditoria" },
          targetFormName: "Form_FormNuevaAuditoria",
          missingTokenPolicy: "strict",
        }),
      ).toThrowError(
        expect.objectContaining({
          code: "FORM_MUTATION_INVALID",
        }),
      );
    },
  );

  it.runIf(existsSync(BENCH_FORM_TXT))(
    "warn-pass-through leaves the unmapped token verbatim on a real bench fixture",
    () => {
      const original = readFileSync(BENCH_FORM_TXT, "utf8");
      const tokenized = injectTokens(original);
      const ir = parseFormTxt(tokenized, { name: "FormRiesgosGestionRiesgo" });

      // TitleCaption is intentionally unmapped; warn-pass-through keeps the
      // operation succeeding, records the missing token, and leaves the
      // placeholder text in place.
      const clone = cloneFormFromTemplate(ir, {
        tokenMap: { FormName: "FormNuevaAuditoria" },
        targetFormName: "Form_FormNuevaAuditoria",
        // missingTokenPolicy omitted → defaults to "warn-pass-through"
      });

      expect(clone.missingTokens).toEqual(expect.arrayContaining(["TitleCaption"]));
      expect(clone.source).toContain("{{TitleCaption}}");
      expect(clone.source).toContain("tblFormNuevaAuditoria");
      // A warning line for the missing token is reported.
      expect(clone.warnings.some((w) => w.includes("TitleCaption"))).toBe(true);

      // Sanity: the engine did not throw, and the FormMutationError was never thrown.
      // (Type guard via the success result, not via try/catch.)
      const _never: FormMutationError | undefined = undefined;
      expect(_never).toBeUndefined();
    },
  );
});
