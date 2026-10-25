/**
 * Issue #1865 — import_modules must not let a `.cls` silently overwrite a
 * code-behind edit made in the `.form.txt` CodeBehindForm copy.
 *
 * apply:true with a functional divergence is refused with
 * FORM_CODE_BEHIND_DIVERGES before the runner is spawned. The explicit
 * acknowledgement flag lets the .cls win, as today. apply:false only reports.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const CLS_TEXT = [
  'Attribute VB_Name = "Form_Sana"',
  "Option Compare Database",
  "Private Sub Form_Load()",
  '    Debug.Print "cls"',
  "End Sub",
  "",
].join("\r\n");

function formTxt(codeBehind: string): string {
  return [
    "Version =21",
    "Begin Form",
    "    AutoResize = NotDefault",
    "    Begin Section",
    "    End",
    "End",
    "CodeBehindForm",
    codeBehind,
  ].join("\r\n");
}

const DIVERGENT_CODE = [
  'Attribute VB_Name = "Form_Sana"',
  "Option Compare Database",
  "Private Sub Form_Load()",
  '    Debug.Print "edited only in the form"',
  "End Sub",
  "",
].join("\r\n");

const CASE_ONLY_CODE = CLS_TEXT.replace("Private Sub Form_Load()", "PRIVATE SUB FORM_LOAD()");

function buildAdapter(executor: VbaManagerExecutor, destinationRoot: string) {
  return new VbaSyncAdapter({
    preflightCleanup: noopPreflightCleanup(),
    executor,
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    accessPath: "C:/db/front.accdb",
    destinationRoot,
    env: {},
  });
}

function okExecutor(calls: { count: number }): VbaManagerExecutor {
  return async () => {
    calls.count += 1;
    return {
      exitCode: 0,
      stdout: "DYSFLOW_RESULT []",
      stderr: "",
      durationMs: 1,
      timedOut: false,
    };
  };
}

describe("import_modules — form code-behind divergence guard (#1865)", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "dysflow-codebehind-guard-"));
    await mkdir(join(tmpRoot, "forms"), { recursive: true });
    await mkdir(join(tmpRoot, "modules"), { recursive: true });
  });

  afterEach(async () => {
    if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
  });

  async function seed(codeBehind: string): Promise<void> {
    await writeFile(join(tmpRoot, "forms", "Form_Sana.form.txt"), formTxt(codeBehind), "utf8");
    await writeFile(join(tmpRoot, "forms", "Sana.cls"), CLS_TEXT, "utf8");
    await writeFile(join(tmpRoot, "modules", "ModA.bas"), 'Attribute VB_Name = "ModA"\r\n', "utf8");
  }

  it("refuses apply:true with FORM_CODE_BEHIND_DIVERGES and never spawns the runner", async () => {
    await seed(DIVERGENT_CODE);
    const calls = { count: 0 };
    const adapter = buildAdapter(okExecutor(calls), tmpRoot);

    const result = await adapter.execute("import_modules", {
      destinationRoot: tmpRoot,
      moduleNames: ["Form_Sana"],
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("FORM_CODE_BEHIND_DIVERGES");
    expect(result.error.message).toContain("Form_Sana.form.txt");
    expect(calls.count).toBe(0);
  });

  it("imports with the explicit acknowledgement, and the .cls wins", async () => {
    await seed(DIVERGENT_CODE);
    const calls = { count: 0 };
    const adapter = buildAdapter(okExecutor(calls), tmpRoot);

    const result = await adapter.execute("import_modules", {
      destinationRoot: tmpRoot,
      moduleNames: ["Form_Sana"],
      apply: true,
      acknowledgeCodeBehindWins: true,
    });

    expect(result.ok).toBe(true);
    expect(calls.count).toBe(1);
  });

  it("does not refuse a case-only difference between the two copies", async () => {
    await seed(CASE_ONLY_CODE);
    const calls = { count: 0 };
    const adapter = buildAdapter(okExecutor(calls), tmpRoot);

    const result = await adapter.execute("import_modules", {
      destinationRoot: tmpRoot,
      moduleNames: ["Form_Sana"],
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(calls.count).toBe(1);
  });

  it("apply:false reports the divergence as a warning and never runs a write", async () => {
    await seed(DIVERGENT_CODE);
    // The dry run may read the binary through a read-only export (#1878), so the
    // contract is that no write action (Import) reaches the runner.
    const actions: string[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      actions.push(String(request.action));
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    };
    const adapter = buildAdapter(executor, tmpRoot);

    const result = await adapter.execute("import_modules", {
      destinationRoot: tmpRoot,
      moduleNames: ["Form_Sana"],
      apply: false,
    });

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).toContain("FORM_CODE_BEHIND_DIVERGES");
    expect(JSON.stringify(result)).toContain("edited only in the form");
    expect(actions).not.toContain("Import");
  });
});
