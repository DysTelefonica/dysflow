/**
 * Issue #1992 — `lint_form_code` resolves its source root from `cwd` the way
 * `lint_module` does. `cwd` + `moduleNames` in a configured worktree lints
 * `src/forms/Form_X.cls` with no explicit root; an explicit `destinationRoot`
 * still wins; with nothing to resolve, the error names `cwd`.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VbaFormsLintAdapter } from "../../../src/adapters/vba-sync/vba-forms-lint-adapter";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const FORM_TXT = ["Version =21", "Begin Form", "End", ""].join("\r\n");

// A bare statement call with parentheses: the `bare-function-call-with-parens`
// rule reports it against the `.cls` path, which proves which file was linted.
const CLS_WITH_FINDING = [
  "Option Compare Database",
  "Option Explicit",
  "Public Sub Demo()",
  '    FormInteraction_Mensaje("hola", 1)',
  "End Sub",
  "",
].join("\r\n");

const CLEAN_CLS = ["Option Compare Database", "Option Explicit", ""].join("\r\n");

type LintData = {
  summary: { formsScanned: number };
  diagnostics: Array<{ rule: string; file: string }>;
};

const neverSpawns: VbaManagerExecutor = async () => {
  throw new Error("lint_form_code must not spawn the VBA runner");
};

function adapterAt(cwd: string): VbaSyncAdapter {
  return new VbaSyncAdapter({
    preflightCleanup: noopPreflightCleanup(),
    executor: neverSpawns,
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    cwd,
    env: {},
  });
}

function normalized(path: string): string {
  return path.replace(/\\/g, "/");
}

describe("lint_form_code resolves its source root from cwd (#1992)", () => {
  let worktree: string;

  beforeEach(async () => {
    worktree = await mkdtemp(join(tmpdir(), "dysflow-lint-form-cwd-"));
    await mkdir(join(worktree, ".dysflow"), { recursive: true });
    await writeFile(
      join(worktree, ".dysflow", "project.json"),
      JSON.stringify({ id: "issue-1992", accessPath: "front.accdb", destinationRoot: "src" }),
      "utf8",
    );
    await mkdir(join(worktree, "src", "forms"), { recursive: true });
    await writeFile(join(worktree, "src", "forms", "Form_X.form.txt"), FORM_TXT, "utf8");
    await writeFile(join(worktree, "src", "forms", "Form_X.cls"), CLS_WITH_FINDING, "utf8");
  });

  afterEach(async () => {
    if (worktree) await rm(worktree, { recursive: true, force: true });
  });

  it("lints src/forms/Form_X.cls with cwd + moduleNames and no explicit root", async () => {
    const result = await adapterAt(worktree).execute("lint_form_code", {
      cwd: worktree,
      moduleNames: ["Form_X"],
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    const data = (result as { data: LintData }).data;
    expect(data.summary.formsScanned).toBe(1);
    const finding = data.diagnostics.find((d) => d.rule === "bare-function-call-with-parens");
    expect(normalized(finding?.file ?? "")).toBe(
      normalized(join(worktree, "src", "forms", "Form_X.cls")),
    );
  });

  it("lets an explicit destinationRoot win over the cwd-resolved root", async () => {
    const other = join(worktree, "other");
    await mkdir(join(other, "forms"), { recursive: true });
    await writeFile(join(other, "forms", "Form_X.form.txt"), FORM_TXT, "utf8");
    await writeFile(join(other, "forms", "Form_X.cls"), CLEAN_CLS, "utf8");

    const result = await adapterAt(worktree).execute("lint_form_code", {
      cwd: worktree,
      destinationRoot: other,
      moduleNames: ["Form_X"],
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    const data = (result as { data: LintData }).data;
    expect(data.summary.formsScanned).toBe(1);
    expect(data.diagnostics.map((d) => d.rule)).not.toContain("bare-function-call-with-parens");
  });

  it("names cwd in the error when no source root resolves", async () => {
    const result = await new VbaFormsLintAdapter().lintFormCode({ moduleNames: ["Form_X"] });

    expect(result.ok).toBe(false);
    const error = (result as { error: { code: string; message: string } }).error;
    expect(error.code).toBe("MCP_INPUT_INVALID");
    expect(error.message).toContain("cwd");
  });
});
