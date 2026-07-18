/**
 * Issue #958 — TS pre-import quality gate for form/report sources.
 *
 * `import_all` / `import_modules` must refuse to spawn the PowerShell runner
 * (and therefore never touch the Access binary) when a planned `.form.txt` /
 * `.report.txt` is STRUCTURALLY broken (unbalanced Begin/End tree, not a
 * SaveAsText file at all). Metadata-only legacy defects (e.g. a pre-v2.14.0
 * export missing the `AutoResize = NotDefault` marker) are NOT rejected here:
 * the PowerShell import path self-heals them (WU1) — the gate only blocks
 * damage that cannot be repaired automatically.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";

const VALID_FORM_TXT = [
  "Version =21",
  "Begin Form",
  "    AutoResize = NotDefault",
  "    Begin Section",
  "        Begin TextBox",
  '            Name ="txtSano"',
  "        End",
  "    End",
  "End",
  "CodeBehindForm",
  'Attribute VB_Name = "Form_Sana"',
  "Option Compare Database",
  "",
].join("\r\n");

/** Legacy pre-v2.14.0 export: no AutoResize marker — repairable metadata, NOT structural damage. */
const LEGACY_METADATA_ONLY_FORM_TXT = [
  "Version =21",
  "Begin Form",
  "    RecordSelectors = NotDefault",
  "    Begin Section",
  "    End",
  "End",
  "CodeBehindForm",
  'Attribute VB_Name = "Form_Legacy"',
  "Option Compare Database",
  "",
].join("\r\n");

/** Unbalanced tree: the TextBox Begin never closes. */
const MALFORMED_FORM_TXT = [
  "Version =21",
  "Begin Form",
  "    AutoResize = NotDefault",
  "    Begin Section",
  "        Begin TextBox",
  '            Name ="txtRoto"',
  "    End",
  "End",
  "CodeBehindForm",
  'Attribute VB_Name = "Form_Rota"',
  "",
].join("\r\n");

function buildAdapter(executor: VbaManagerExecutor, destinationRoot: string) {
  return new VbaSyncAdapter({
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

describe("import_all / import_modules — form source quality gate (#958)", () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "dysflow-quality-gate-"));
    await mkdir(join(tmpRoot, "forms"), { recursive: true });
    await mkdir(join(tmpRoot, "modules"), { recursive: true });
  });

  afterEach(async () => {
    if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
  });

  it("import_all fails with FORM_SOURCE_MALFORMED and never spawns the runner when a .form.txt is structurally broken", async () => {
    await writeFile(join(tmpRoot, "forms", "Form_Rota.form.txt"), MALFORMED_FORM_TXT, "utf8");
    await writeFile(join(tmpRoot, "modules", "ModA.bas"), 'Attribute VB_Name = "ModA"\r\n', "utf8");
    const calls = { count: 0 };
    const adapter = buildAdapter(okExecutor(calls), tmpRoot);

    const result = await adapter.execute("import_all", { destinationRoot: tmpRoot, apply: true });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("FORM_SOURCE_MALFORMED");
    expect(result.error.message).toContain("Form_Rota.form.txt");
    expect(calls.count).toBe(0);
  });

  it("import_all proceeds to the runner when every form source is structurally valid", async () => {
    await writeFile(join(tmpRoot, "forms", "Form_Sana.form.txt"), VALID_FORM_TXT, "utf8");
    await writeFile(join(tmpRoot, "modules", "ModA.bas"), 'Attribute VB_Name = "ModA"\r\n', "utf8");
    const calls = { count: 0 };
    const adapter = buildAdapter(okExecutor(calls), tmpRoot);

    const result = await adapter.execute("import_all", { destinationRoot: tmpRoot, apply: true });

    expect(result.ok).toBe(true);
    expect(calls.count).toBe(1);
  });

  it("does NOT reject a legacy metadata-only .form.txt (missing AutoResize) — the PS layer self-heals it", async () => {
    await writeFile(
      join(tmpRoot, "forms", "Form_Legacy.form.txt"),
      LEGACY_METADATA_ONLY_FORM_TXT,
      "utf8",
    );
    const calls = { count: 0 };
    const adapter = buildAdapter(okExecutor(calls), tmpRoot);

    const result = await adapter.execute("import_all", { destinationRoot: tmpRoot, apply: true });

    expect(result.ok).toBe(true);
    expect(calls.count).toBe(1);
  });

  it("import_modules gates only the targeted modules: a broken untargeted form does not block a .bas import", async () => {
    await writeFile(join(tmpRoot, "forms", "Form_Rota.form.txt"), MALFORMED_FORM_TXT, "utf8");
    await writeFile(join(tmpRoot, "modules", "ModA.bas"), 'Attribute VB_Name = "ModA"\r\n', "utf8");
    const calls = { count: 0 };
    const adapter = buildAdapter(okExecutor(calls), tmpRoot);

    const result = await adapter.execute("import_modules", {
      destinationRoot: tmpRoot,
      moduleNames: ["ModA"],
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(calls.count).toBe(1);
  });

  it("import_modules fails closed when a targeted form module is structurally broken", async () => {
    await writeFile(join(tmpRoot, "forms", "Form_Rota.form.txt"), MALFORMED_FORM_TXT, "utf8");
    const calls = { count: 0 };
    const adapter = buildAdapter(okExecutor(calls), tmpRoot);

    const result = await adapter.execute("import_modules", {
      destinationRoot: tmpRoot,
      moduleNames: ["Form_Rota"],
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("FORM_SOURCE_MALFORMED");
    expect(calls.count).toBe(0);
  });

  it("dryRun plan surfaces the malformed file under errors instead of failing the envelope", async () => {
    await writeFile(join(tmpRoot, "forms", "Form_Rota.form.txt"), MALFORMED_FORM_TXT, "utf8");
    const calls = { count: 0 };
    const adapter = buildAdapter(okExecutor(calls), tmpRoot);

    const result = await adapter.execute("import_all", {
      destinationRoot: tmpRoot,
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected plan success");
    const plan = result.data as { errors: readonly string[] };
    expect(plan.errors.join("\n")).toContain("Form_Rota.form.txt");
    expect(calls.count).toBe(0);
  });
});
