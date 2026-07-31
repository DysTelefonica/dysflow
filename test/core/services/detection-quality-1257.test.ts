import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeFormFileSystem } from "../../../src/adapters/services/node-form-file-system";
import { VbaFormService } from "../../../src/core/services/vba-form-service";
import { detectDeadCode } from "../../../src/core/services/vba-procedure-service";

describe("issue #1257 detection quality", () => {
  it("T14 does not report an Access form control event as dead code", () => {
    const report = detectDeadCode(
      {
        FormEntryModule: ["Option Explicit", "", "Public Sub CmdSave_Click()", "End Sub"].join(
          "\r\n",
        ),
      },
      { scope: "source" },
    );

    expect(report?.findings.some((finding) => finding.symbol === "CmdSave_Click")).toBe(false);
  });

  it("T37 harvests a catalog from .form.txt sources without generated JSON companions", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-harvest-form-txt-"));
    const formsDir = join(root, "forms");
    await mkdir(formsDir, { recursive: true });
    await writeFile(
      join(formsDir, "Form_Entry.form.txt"),
      [
        "Version =21",
        "Begin Form",
        "    Begin Section",
        "        Begin CommandButton",
        '            Name ="CmdSave"',
        "        End",
        "    End",
        "End",
      ].join("\r\n"),
      "utf8",
    );

    const service = new VbaFormService({ cwd: root, fileSystem: nodeFormFileSystem });
    const result = await service.harvestFormCatalog({ destinationRoot: root });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      total: 1,
      forms: [{ name: "Form_Entry", kind: "Form", controls: 1 }],
      reports: [],
    });
  });

  it("T37 skips malformed .form.txt sources instead of failing the catalog", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-harvest-invalid-form-txt-"));
    const formsDir = join(root, "forms");
    await mkdir(formsDir, { recursive: true });
    await writeFile(join(formsDir, "Broken.form.txt"), "not Access SaveAsText", "utf8");

    const service = new VbaFormService({ cwd: root, fileSystem: nodeFormFileSystem });
    const result = await service.harvestFormCatalog({ destinationRoot: root });

    expect(result).toMatchObject({ ok: true, data: { total: 0, forms: [], reports: [] } });
  });

  it("T37 prefers a generated JSON companion without duplicating its .form.txt source", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-harvest-companion-"));
    const formsDir = join(root, "forms");
    await mkdir(formsDir, { recursive: true });
    await writeFile(
      join(formsDir, "Form_Entry.form.json"),
      JSON.stringify({ name: "Form_Entry", kind: "Form", controls: [{ name: "FromJson" }] }),
      "utf8",
    );
    await writeFile(
      join(formsDir, "Form_Entry.form.txt"),
      ["Version =21", "Begin Form", "End"].join("\r\n"),
      "utf8",
    );

    const service = new VbaFormService({ cwd: root, fileSystem: nodeFormFileSystem });
    const result = await service.harvestFormCatalog({ destinationRoot: root });

    expect(result).toMatchObject({
      ok: true,
      data: {
        total: 1,
        forms: [{ name: "Form_Entry", kind: "Form", controls: 1 }],
        reports: [],
      },
    });
  });
});
