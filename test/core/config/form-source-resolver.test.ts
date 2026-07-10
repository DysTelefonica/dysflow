import { describe, expect, it } from "vitest";
import {
  buildResolutionDiagnostic,
  type FormSourceInput,
  resolveFormSourceCandidates,
} from "../../../src/core/config/form-source-resolver.js";

describe("resolveFormSourceCandidates", () => {
  // Task 1.1 — projectId-driven resolution (spec: "projectId-only caller resolves to the correct file").
  it("resolves formName against sourceRoot to the correct absolute path and candidate list", () => {
    const input: FormSourceInput = {
      sourceRoot: "C:/Projects/Acme/src",
      projectRoot: "C:/Projects/Acme",
      formName: "MyForm",
    };

    const candidates = resolveFormSourceCandidates(input);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      absolutePath: "C:/Projects/Acme/src/forms/Form_MyForm.form.txt",
      relativePath: "forms/Form_MyForm.form.txt",
      strategy: "identity",
    });
  });

  it("resolves formName for kind='report' against reports/Report_<name>.report.txt", () => {
    const input: FormSourceInput = {
      sourceRoot: "C:/Projects/Acme/src",
      projectRoot: "C:/Projects/Acme",
      formName: "Summary",
      kind: "report",
    };

    const candidates = resolveFormSourceCandidates(input);

    expect(candidates[0]?.absolutePath).toBe(
      "C:/Projects/Acme/src/reports/Report_Summary.report.txt",
    );
    expect(candidates[0]?.strategy).toBe("identity");
  });

  // Task 1.2 — idempotent join, no double-`src` nesting, `normalize` pre-step
  // for `./src`, `src//forms`, and `\`.
  describe("Case B — idempotent source-root join (split project)", () => {
    const sourceRoot = "C:/Projects/Acme/src";
    const projectRoot = "C:/Projects/Acme";

    it("does not double-nest when sourcePath already starts with the source-root segment", () => {
      const candidates = resolveFormSourceCandidates({
        sourceRoot,
        projectRoot,
        sourcePath: "src/forms/Form_MyForm.form.txt",
      });

      const top = candidates[0];
      expect(top?.strategy).toBe("idempotent-join");
      expect(top?.absolutePath).toBe("C:/Projects/Acme/src/forms/Form_MyForm.form.txt");
      expect(top?.absolutePath).not.toBe("C:/Projects/Acme/src/src/forms/Form_MyForm.form.txt");
    });

    it("retains the naive (double-nested) join as a trailing backward-compat candidate", () => {
      const candidates = resolveFormSourceCandidates({
        sourceRoot,
        projectRoot,
        sourcePath: "src/forms/Form_MyForm.form.txt",
      });

      expect(candidates).toHaveLength(2);
      expect(candidates[1]).toEqual({
        absolutePath: "C:/Projects/Acme/src/src/forms/Form_MyForm.form.txt",
        relativePath: "src/forms/Form_MyForm.form.txt",
        strategy: "naive-join",
      });
    });

    it("joins normally when sourcePath does NOT start with the source-root segment", () => {
      const candidates = resolveFormSourceCandidates({
        sourceRoot,
        projectRoot,
        sourcePath: "forms/Form_MyForm.form.txt",
      });

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toEqual({
        absolutePath: "C:/Projects/Acme/src/forms/Form_MyForm.form.txt",
        relativePath: "forms/Form_MyForm.form.txt",
        strategy: "identity",
      });
    });

    it("normalizes a leading './src' before detecting the collision", () => {
      const candidates = resolveFormSourceCandidates({
        sourceRoot,
        projectRoot,
        sourcePath: "./src/forms/Form_MyForm.form.txt",
      });

      expect(candidates[0]?.strategy).toBe("idempotent-join");
      expect(candidates[0]?.absolutePath).toBe("C:/Projects/Acme/src/forms/Form_MyForm.form.txt");
    });

    it("normalizes doubled separators 'src//forms' before detecting the collision", () => {
      const candidates = resolveFormSourceCandidates({
        sourceRoot,
        projectRoot,
        sourcePath: "src//forms/Form_MyForm.form.txt",
      });

      expect(candidates[0]?.strategy).toBe("idempotent-join");
      expect(candidates[0]?.absolutePath).toBe("C:/Projects/Acme/src/forms/Form_MyForm.form.txt");
    });

    it("normalizes backslash separators before detecting the collision", () => {
      const candidates = resolveFormSourceCandidates({
        sourceRoot,
        projectRoot,
        sourcePath: "src\\forms\\Form_MyForm.form.txt",
      });

      expect(candidates[0]?.strategy).toBe("idempotent-join");
      expect(candidates[0]?.absolutePath).toBe("C:/Projects/Acme/src/forms/Form_MyForm.form.txt");
    });

    // Finding 3 (gatekeeper review) — none of the original Case B tests
    // varied casing between sourceRoot and sourcePath. The collision
    // detection is documented as case-insensitive on Windows; lock it in
    // both directions.
    it("strips the split segment case-insensitively when sourceRoot's segment casing differs from sourcePath's", () => {
      const candidates = resolveFormSourceCandidates({
        sourceRoot: "C:/Projects/Acme/SRC",
        projectRoot: "C:/Projects/Acme",
        sourcePath: "src/forms/Form_MyForm.form.txt",
      });

      expect(candidates[0]?.strategy).toBe("idempotent-join");
      expect(candidates[0]?.absolutePath).toBe("C:/Projects/Acme/SRC/forms/Form_MyForm.form.txt");
    });

    it("strips the split segment case-insensitively when sourcePath's segment casing differs from sourceRoot's", () => {
      const candidates = resolveFormSourceCandidates({
        sourceRoot: "C:/Projects/Acme/src",
        projectRoot: "C:/Projects/Acme",
        sourcePath: "SRC/forms/Form_MyForm.form.txt",
      });

      expect(candidates[0]?.strategy).toBe("idempotent-join");
      expect(candidates[0]?.absolutePath).toBe("C:/Projects/Acme/src/forms/Form_MyForm.form.txt");
    });

    // Finding 4 (nice-to-have) — trailing-slash roots must not produce
    // double slashes or break collision detection.
    it("handles trailing-slash sourceRoot/projectRoot without double slashes", () => {
      const candidates = resolveFormSourceCandidates({
        sourceRoot: "C:/Projects/Acme/src/",
        projectRoot: "C:/Projects/Acme/",
        sourcePath: "src/forms/Form_MyForm.form.txt",
      });

      expect(candidates[0]?.strategy).toBe("idempotent-join");
      expect(candidates[0]?.absolutePath).toBe("C:/Projects/Acme/src/forms/Form_MyForm.form.txt");
    });
  });

  // Task 1.3 — non-split basename-collision guard: a project directory whose
  // own basename equals the sourcePath's leading segment must NEVER be
  // stripped when destinationRoot === projectRoot (no real split).
  it("does not strip a leading segment in a non-split project even on a basename collision", () => {
    const nonSplitRoot = "C:/Projects/Forms";

    const candidates = resolveFormSourceCandidates({
      sourceRoot: nonSplitRoot,
      projectRoot: nonSplitRoot,
      sourcePath: "forms/Form_MyForm.form.txt",
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      absolutePath: "C:/Projects/Forms/forms/Form_MyForm.form.txt",
      relativePath: "forms/Form_MyForm.form.txt",
      strategy: "identity",
    });
  });

  // Task 1.4 — raw destinationRoot/sourceRoot caller (no projectId/formName,
  // and no projectRoot known) matches the pre-existing join behavior.
  it("joins a raw sourceRoot + relative sourcePath with no projectRoot known, matching legacy join", () => {
    const candidates = resolveFormSourceCandidates({
      sourceRoot: "C:/Projects/Legacy/src",
      sourcePath: "forms/Form_Existing.form.txt",
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      absolutePath: "C:/Projects/Legacy/src/forms/Form_Existing.form.txt",
      relativePath: "forms/Form_Existing.form.txt",
      strategy: "identity",
    });
  });

  // Task 1.5 — literal sourcePath passthrough reserved for Group A read-only
  // tools. Documents that an ABSOLUTE sourcePath is NEVER re-joined against
  // sourceRoot, regardless of what sourceRoot/projectRoot are supplied. Group
  // A tools (inspect_form/compare_form/form_serialize) never even call this
  // resolver when neither projectId nor formName is supplied (design.md,
  // "Group A is NOT uniform"); this test locks the passthrough contract this
  // function would honor if they did.
  it("passes an absolute sourcePath through verbatim, never re-joining against sourceRoot", () => {
    const candidates = resolveFormSourceCandidates({
      sourceRoot: "C:/Projects/Acme/src",
      projectRoot: "C:/Projects/Acme",
      sourcePath: "D:/elsewhere/custom/Form_Custom.form.txt",
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      absolutePath: "D:/elsewhere/custom/Form_Custom.form.txt",
      relativePath: "D:/elsewhere/custom/Form_Custom.form.txt",
      strategy: "absolute",
    });
  });

  // Task 1.7 — resolver purity: identical inputs produce identical output
  // (deterministic, no I/O — this module imports no node:fs/net/etc, so
  // there is nothing to hit; determinism is the port-level, behavioral proof).
  it("is pure: repeated calls with equivalent inputs produce deep-equal results", () => {
    const input: FormSourceInput = {
      sourceRoot: "C:/Projects/Acme/src",
      projectRoot: "C:/Projects/Acme",
      sourcePath: "src/forms/Form_MyForm.form.txt",
    };

    const first = resolveFormSourceCandidates({ ...input });
    const second = resolveFormSourceCandidates({ ...input });

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });

  // Finding 4 (nice-to-have) — empty-string formName/sourcePath and
  // formName-wins precedence when both are supplied.
  it("treats an empty-string formName as absent and falls through to sourcePath", () => {
    const candidates = resolveFormSourceCandidates({
      sourceRoot: "C:/Projects/Acme/src",
      projectRoot: "C:/Projects/Acme",
      formName: "",
      sourcePath: "forms/Form_MyForm.form.txt",
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      absolutePath: "C:/Projects/Acme/src/forms/Form_MyForm.form.txt",
      relativePath: "forms/Form_MyForm.form.txt",
      strategy: "identity",
    });
  });

  it("returns no candidates when both formName and sourcePath are absent/empty", () => {
    const candidates = resolveFormSourceCandidates({
      sourceRoot: "C:/Projects/Acme/src",
      formName: "",
    });

    expect(candidates).toEqual([]);
  });

  it("prefers formName over sourcePath when both are supplied (formName-wins precedence)", () => {
    const candidates = resolveFormSourceCandidates({
      sourceRoot: "C:/Projects/Acme/src",
      projectRoot: "C:/Projects/Acme",
      formName: "Winner",
      sourcePath: "forms/Form_Loser.form.txt",
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      absolutePath: "C:/Projects/Acme/src/forms/Form_Winner.form.txt",
      relativePath: "forms/Form_Winner.form.txt",
      strategy: "identity",
    });
  });
});

describe("buildResolutionDiagnostic", () => {
  // Task 1.6 — failure diagnostic shape, no absolute path substring anywhere.
  it("returns a typed diagnostic with no absolute path substring in any field", () => {
    const input: FormSourceInput = {
      sourceRoot: "C:/Projects/Acme/src",
      projectRoot: "C:/Projects/Acme",
      formName: "Missing",
    };
    const candidates = resolveFormSourceCandidates(input);

    const diagnostic = buildResolutionDiagnostic(input, candidates, "acme-project");

    expect(diagnostic.projectId).toBe("acme-project");
    expect(diagnostic.sourceRootRelative).toBe("src");
    expect(diagnostic.attemptedRelative).toEqual(["forms/Form_Missing.form.txt"]);
    expect(diagnostic.remediation).toContain("acme-project");
    expect(diagnostic.remediation).toContain("forms/Form_Missing.form.txt");

    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain("C:/Projects/Acme");
    expect(serialized).not.toContain("C:\\Projects\\Acme");
  });

  it("omits an absolute-strategy candidate's raw path from attemptedRelative", () => {
    const input: FormSourceInput = {
      sourceRoot: "C:/Projects/Acme/src",
      projectRoot: "C:/Projects/Acme",
      sourcePath: "D:/elsewhere/custom/Form_Custom.form.txt",
    };
    const candidates = resolveFormSourceCandidates(input);

    const diagnostic = buildResolutionDiagnostic(input, candidates);

    expect(diagnostic.attemptedRelative).toEqual(["(absolute path omitted)"]);
    expect(JSON.stringify(diagnostic)).not.toContain("D:/elsewhere");
  });

  it("falls back to '.' for sourceRootRelative when projectRoot is unknown", () => {
    const input: FormSourceInput = {
      sourceRoot: "C:/Projects/Legacy/src",
      formName: "Missing",
    };
    const candidates = resolveFormSourceCandidates(input);

    const diagnostic = buildResolutionDiagnostic(input, candidates);

    expect(diagnostic.sourceRootRelative).toBe(".");
    expect(diagnostic.projectId).toBeUndefined();
  });

  // Finding 1 (gatekeeper BLOCKER) — the sourcePath branch guarded
  // isAbsolutePath, but the formName identity branch did not, leaking a
  // path-shaped formName straight into attemptedRelative/remediation.
  // formName must be redacted the SAME way an absolute sourcePath is.
  describe("Finding 1 — path-shaped formName is redacted like an absolute sourcePath", () => {
    it("redacts the exact reported reproduction (Windows-absolute formName)", () => {
      const input: FormSourceInput = {
        sourceRoot: "C:/Projects/Acme/src",
        projectRoot: "C:/Projects/Acme",
        formName: "C:\\Secret\\Leak",
      };
      const candidates = resolveFormSourceCandidates(input);

      const diagnostic = buildResolutionDiagnostic(input, candidates);

      expect(diagnostic.attemptedRelative).toEqual(["(absolute path omitted)"]);
      const serialized = JSON.stringify(diagnostic);
      expect(serialized).not.toContain("Secret");
      expect(serialized).not.toContain("Leak");
    });

    it("redacts a Windows-drive-shaped formName (single segment)", () => {
      const input: FormSourceInput = {
        sourceRoot: "C:/Projects/Acme/src",
        projectRoot: "C:/Projects/Acme",
        formName: "C:\\WinMarker",
      };
      const candidates = resolveFormSourceCandidates(input);

      const diagnostic = buildResolutionDiagnostic(input, candidates);

      expect(diagnostic.attemptedRelative).toEqual(["(absolute path omitted)"]);
      expect(JSON.stringify(diagnostic)).not.toContain("WinMarker");
    });

    it("redacts a UNC-shaped formName", () => {
      const input: FormSourceInput = {
        sourceRoot: "C:/Projects/Acme/src",
        projectRoot: "C:/Projects/Acme",
        formName: "\\\\UncMarker",
      };
      const candidates = resolveFormSourceCandidates(input);

      const diagnostic = buildResolutionDiagnostic(input, candidates);

      expect(diagnostic.attemptedRelative).toEqual(["(absolute path omitted)"]);
      expect(JSON.stringify(diagnostic)).not.toContain("UncMarker");
    });

    it("redacts a POSIX-absolute-shaped formName", () => {
      const input: FormSourceInput = {
        sourceRoot: "C:/Projects/Acme/src",
        projectRoot: "C:/Projects/Acme",
        formName: "/PosixMarker",
      };
      const candidates = resolveFormSourceCandidates(input);

      const diagnostic = buildResolutionDiagnostic(input, candidates);

      expect(diagnostic.attemptedRelative).toEqual(["(absolute path omitted)"]);
      expect(JSON.stringify(diagnostic)).not.toContain("PosixMarker");
    });

    it("still surfaces a normal, non-path-shaped formName in remediation", () => {
      const input: FormSourceInput = {
        sourceRoot: "C:/Projects/Acme/src",
        projectRoot: "C:/Projects/Acme",
        formName: "MyForm",
      };
      const candidates = resolveFormSourceCandidates(input);

      const diagnostic = buildResolutionDiagnostic(input, candidates);

      expect(diagnostic.attemptedRelative).toEqual(["forms/Form_MyForm.form.txt"]);
      expect(diagnostic.remediation).toContain("MyForm");
    });
  });

  // Finding 2 (CRITICAL gap) — attemptedRelative for a split-project
  // sourcePath MISS must carry both the idempotent-join and naive-join
  // candidates, in order; and the zero-candidate branch must be covered.
  describe("Finding 2 — attemptedRelative ordering and empty-candidate branch", () => {
    it("orders a split-project sourcePath miss as [idempotent-join, naive-join]", () => {
      const input: FormSourceInput = {
        sourceRoot: "C:/Projects/Acme/src",
        projectRoot: "C:/Projects/Acme",
        sourcePath: "src/forms/Form_Missing.form.txt",
      };
      const candidates = resolveFormSourceCandidates(input);

      expect(candidates.map((c) => c.strategy)).toEqual(["idempotent-join", "naive-join"]);

      const diagnostic = buildResolutionDiagnostic(input, candidates, "acme-project");

      expect(diagnostic.attemptedRelative).toEqual([
        "forms/Form_Missing.form.txt",
        "src/forms/Form_Missing.form.txt",
      ]);
    });

    it("reports 'No candidate paths were attempted' when neither formName nor sourcePath is supplied", () => {
      const input: FormSourceInput = {
        sourceRoot: "C:/Projects/Acme/src",
        projectRoot: "C:/Projects/Acme",
      };
      const candidates = resolveFormSourceCandidates(input);
      expect(candidates).toEqual([]);

      const diagnostic = buildResolutionDiagnostic(input, candidates);

      expect(diagnostic.attemptedRelative).toEqual([]);
      expect(diagnostic.remediation).toContain("No candidate paths were attempted.");
    });
  });
});
