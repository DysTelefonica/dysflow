/**
 * Issue #1867 — the form tools must resolve `formName` through the project context
 * the caller already gave (`cwd`, or the session's resolved project), not only
 * through `projectId`. Today `cwd` + `formName` fails with FORM_SPEC_MISSING even
 * though the config provides the destinationRoot.
 */

import { describe, expect, it } from "vitest";
import { readFormContext } from "../../../src/adapters/vba-sync/vba-forms-read-context";
import { successResult } from "../../../src/core/contracts/index.js";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

const FORM_TXT = 'Version =21\nBegin Form\n    Begin TextBox\n        Name ="txtA"\n    End\nEnd\n';

function fileSystemWith(files: Record<string, string>): FormFileSystemPort {
  return {
    mkdir: async () => undefined,
    readdir: async () => [],
    readFile: async (path) => {
      const normalized = path.replace(/\\/g, "/");
      const hit = Object.keys(files).find((key) => normalized.endsWith(key));
      if (hit === undefined) throw new Error(`ENOENT ${path}`);
      return files[hit] ?? "";
    },
    readJson: async () => {
      throw new Error("not used");
    },
    writeFile: async () => undefined,
  };
}

describe("readFormContext resolves formName through cwd (#1867)", () => {
  it("reads the form from the config destinationRoot when only cwd and formName are given", async () => {
    const fileSystem = fileSystemWith({ "src/forms/Form_Rota.form.txt": FORM_TXT });
    const seen: Record<string, unknown>[] = [];
    const orchestrator = {
      resolveExecutionTarget: async (params: Record<string, unknown>) => {
        seen.push(params);
        return successResult({ destinationRoot: "C:/repo/src", projectRoot: "C:/repo" });
      },
    };

    const result = await readFormContext(
      fileSystem,
      { cwd: "C:/repo", formName: "Form_Rota" },
      orchestrator,
      "form_list_controls",
    );

    expect(seen).toEqual([expect.objectContaining({ cwd: "C:/repo", formName: "Form_Rota" })]);
    expect(result.ok).toBe(true);
  });

  it("still reports FORM_SPEC_MISSING when neither sourcePath nor a context is given", async () => {
    const result = await readFormContext(
      fileSystemWith({}),
      { formName: "Form_Rota" },
      undefined,
      "form_list_controls",
    );
    expect(result.ok).toBe(false);
  });
});
