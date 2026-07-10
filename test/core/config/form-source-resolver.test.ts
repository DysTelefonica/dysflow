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

    expect(candidates[0]?.absolutePath).toBe("C:/Projects/Acme/src/reports/Report_Summary.report.txt");
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
});
