/**
 * Issue #1169 — destinationRoot override plumbing for every write-class
 * tool.
 *
 * The seven write-class tools that can read or write managed source files
 * (`export_modules`, `export_all`, `import_modules`, `import_all`,
 * `sync_binary`, `form_deserialize`, `form_serialize`) MUST honor a
 * caller-supplied `params.destinationRoot` for the duration of the call.
 * When the override is supplied, the success envelope MUST surface the
 * EFFECTIVE path used (`resolvedDestinationRoot`) and the provenance
 * (`destinationRootSource: "override" | "config" | "projectRoot" | "cwd"`)
 * so a consuming agent can verify the resolution without re-running
 * `resolveExecutionTarget`.
 *
 * This suite is the authoritative cross-tool gate. Each tool is exercised
 * with a `destinationRoot` override and the assertion is identical
 * (resolved path equals the override, source field is "override"). The
 * failure path is also covered: when no override is supplied, the result
 * still reports `resolvedDestinationRoot` (the configured value) with
 * `destinationRootSource: "config"`.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";

const FAKE_FORM_TXT = [
  "Version =21",
  "Begin Form",
  "    AutoResize = NotDefault",
  "    Begin Section",
  "    End",
  "End",
  "CodeBehindForm",
  'Attribute VB_Name = "Form_DemoForm"',
  "Option Compare Database",
  "",
].join("\r\n");

function okExecutor(): VbaManagerExecutor {
  return async () => ({
    exitCode: 0,
    stdout: 'DYSFLOW_RESULT {"ok":true,"exported":["Form_DemoForm"]}',
    stderr: "",
    durationMs: 1,
    timedOut: false,
  });
}

describe("destinationRoot override (#1169) — every write-class tool honors the override", () => {
  let configuredRoot: string;
  let overrideRoot: string;

  beforeEach(async () => {
    configuredRoot = await mkdtemp(join(tmpdir(), "dysflow-1169-cfg-"));
    overrideRoot = await mkdtemp(join(tmpdir(), "dysflow-1169-ovr-"));
    for (const root of [configuredRoot, overrideRoot]) {
      await mkdir(join(root, "modules"), { recursive: true });
      await mkdir(join(root, "classes"), { recursive: true });
      await mkdir(join(root, "forms"), { recursive: true });
    }
    await writeFile(join(overrideRoot, "forms", "Form_DemoForm.form.txt"), FAKE_FORM_TXT, "utf8");
  });

  afterEach(async () => {
    if (configuredRoot) await rm(configuredRoot, { recursive: true, force: true });
    if (overrideRoot) await rm(overrideRoot, { recursive: true, force: true });
  });

  function buildAdapter() {
    return new VbaSyncAdapter({
      executor: okExecutor(),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: configuredRoot,
      env: {},
    });
  }

  type OverrideSurface = {
    resolvedDestinationRoot: unknown;
    destinationRootSource: unknown;
  };

  function assertOverrideHonored(
    data: unknown,
    label: string,
  ): asserts data is OverrideSurface & Record<string, unknown> {
    const surface = data as OverrideSurface;
    expect(
      surface.resolvedDestinationRoot,
      `${label}: resolvedDestinationRoot must equal the override`,
    ).toBe(overrideRoot);
    expect(
      surface.destinationRootSource,
      `${label}: destinationRootSource must equal "override"`,
    ).toBe("override");
  }

  it("export_modules honors destinationRoot override and reports resolvedDestinationRoot=override", async () => {
    const adapter = buildAdapter();
    const result = await adapter.execute("export_modules", {
      moduleNames: ["Form_DemoForm"],
      destinationRoot: overrideRoot,
      apply: true,
    });
    expect(result.ok, `export_modules failed: ${JSON.stringify(result)}`).toBe(true);
    if (!result.ok) return;
    assertOverrideHonored(result.data, "export_modules");
  });

  it("export_all honors destinationRoot override and reports resolvedDestinationRoot=override", async () => {
    const adapter = buildAdapter();
    const result = await adapter.execute("export_all", {
      destinationRoot: overrideRoot,
      apply: true,
    });
    expect(result.ok, `export_all failed: ${JSON.stringify(result)}`).toBe(true);
    if (!result.ok) return;
    assertOverrideHonored(result.data, "export_all");
  });

  it("import_modules honors destinationRoot override and reports resolvedDestinationRoot=override", async () => {
    const adapter = buildAdapter();
    const result = await adapter.execute("import_modules", {
      moduleNames: ["Form_DemoForm"],
      destinationRoot: overrideRoot,
      apply: true,
    });
    expect(result.ok, `import_modules failed: ${JSON.stringify(result)}`).toBe(true);
    if (!result.ok) return;
    assertOverrideHonored(result.data, "import_modules");
  });

  it("import_all honors destinationRoot override and reports resolvedDestinationRoot=override", async () => {
    const adapter = buildAdapter();
    const result = await adapter.execute("import_all", {
      destinationRoot: overrideRoot,
      apply: true,
    });
    expect(result.ok, `import_all failed: ${JSON.stringify(result)}`).toBe(true);
    if (!result.ok) return;
    assertOverrideHonored(result.data, "import_all");
  });

  it("sync_binary honors destinationRoot override and reports resolvedDestinationRoot=override", async () => {
    const adapter = buildAdapter();
    const result = await adapter.execute("sync_binary", {
      direction: "binary-to-src",
      destinationRoot: overrideRoot,
      dryRun: true,
    });
    expect(result.ok, `sync_binary failed: ${JSON.stringify(result)}`).toBe(true);
    if (!result.ok) return;
    assertOverrideHonored(result.data, "sync_binary");
  });

  it("form_serialize honors destinationRoot override and reports resolvedDestinationRoot=override", async () => {
    const adapter = buildAdapter();
    const formPath = join(overrideRoot, "forms", "Form_DemoForm.form.txt");
    const result = await adapter.execute("form_serialize", {
      sourcePath: formPath,
      destinationRoot: overrideRoot,
    });
    expect(result.ok, `form_serialize failed: ${JSON.stringify(result)}`).toBe(true);
    if (!result.ok) return;
    assertOverrideHonored(result.data, "form_serialize");
  });

  it("form_deserialize honors destinationRoot override and reports resolvedDestinationRoot=override", async () => {
    const adapter = buildAdapter();
    const formPath = join(overrideRoot, "forms", "Form_DemoForm.form.txt");
    const result = await adapter.execute("form_deserialize", {
      sourcePath: formPath,
      destinationRoot: overrideRoot,
      ir: { name: "Form_DemoForm", kind: "Form", root: { entries: [], children: [] } },
      dryRun: true,
    });
    expect(result.ok, `form_deserialize failed: ${JSON.stringify(result)}`).toBe(true);
    if (!result.ok) return;
    assertOverrideHonored(result.data, "form_deserialize");
  });

  it("when no override is supplied, the configured destinationRoot is reported with source=config", async () => {
    const adapter = buildAdapter();
    const result = await adapter.execute("export_modules", {
      moduleNames: ["Form_DemoForm"],
      apply: true,
    });
    expect(result.ok, `export_modules failed: ${JSON.stringify(result)}`).toBe(true);
    if (!result.ok) return;
    const data = result.data as OverrideSurface;
    expect(data.resolvedDestinationRoot).toBe(configuredRoot);
    expect(data.destinationRootSource).toBe("config");
  });
});
