import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../contracts/index.js";
import { isRecord, readJsonFileAsync, stringValue } from "../utils/index.js";

export type VbaFormServiceOptions = {
  cwd?: string;
  executor?: unknown;
  env?: Record<string, string | undefined>;
  resolveExecutionTarget?: unknown;
  validateStrictContext?: unknown;
};

export class VbaFormService {
  private readonly cwd: string;
  private readonly executor?: unknown;
  private readonly env: Record<string, string | undefined>;
  private readonly resolveExecutionTarget?: unknown;
  private readonly validateStrictContext?: unknown;

  constructor(options: VbaFormServiceOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.executor = options.executor;
    this.env = options.env ?? process.env;
    this.resolveExecutionTarget = options.resolveExecutionTarget;
    this.validateStrictContext = options.validateStrictContext;
  }

  async validateFormSpec(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const spec = await this.resolveFormSpec(params);
    if (!spec.ok) return spec;
    return successResult({
      valid: true,
      name: spec.data.name,
      kind: spec.data.kind,
      controlCount: spec.data.controls.length,
      controls: spec.data.controls,
      specPath: spec.data.specPath,
    });
  }

  async generateForm(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const spec = await this.resolveFormSpec(params);
    if (!spec.ok) return spec;

    const destinationRoot =
      stringValue(params.destinationRoot) || stringValue(params.projectRoot) || this.cwd;
    const formsDir = resolve(destinationRoot, "forms");
    await mkdir(formsDir, { recursive: true });

    const fileName = `${spec.data.name}.${spec.data.kind === "Report" ? "report" : "form"}.json`;
    const outputPath = resolve(formsDir, fileName);
    const payload = JSON.stringify(
      {
        name: spec.data.name,
        kind: spec.data.kind,
        controls: spec.data.controls,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    );
    await writeFile(outputPath, payload, "utf8");

    return successResult({
      generated: true,
      outputPath,
      name: spec.data.name,
      kind: spec.data.kind,
      controlCount: spec.data.controls.length,
    });
  }

  async catalogAddControl(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const spec = await this.resolveFormSpec(params);
    if (!spec.ok) return spec;

    const destinationRoot =
      stringValue(params.destinationRoot) || stringValue(params.projectRoot) || this.cwd;
    const catalogPath =
      stringValue(params.catalogPath) ?? resolve(destinationRoot, "forms", "catalog.json");
    const controlName = stringValue(params.controlName) ?? stringValue(params.name);
    if (controlName === undefined) {
      return failureResult(
        createDysflowError("FORM_SPEC_INVALID", "catalog_add_control requires controlName."),
      );
    }
    const controlType = stringValue(params.controlType) ?? stringValue(params.type);
    if (controlType === undefined) {
      return failureResult(
        createDysflowError("FORM_SPEC_INVALID", "catalog_add_control requires controlType."),
      );
    }
    const catalog = await readJsonFileAsync<Record<string, unknown>>(catalogPath).catch(
      () => ({}) as Record<string, unknown>,
    );
    const forms = isRecord(catalog.forms) ? (catalog.forms as Record<string, unknown>) : {};
    const controls = Array.isArray(forms[spec.data.name])
      ? (forms[spec.data.name] as unknown[])
      : [];
    controls.push({ name: controlName, type: controlType });
    forms[spec.data.name] = controls;
    const updated = { ...catalog, forms };
    try {
      await mkdir(resolve(catalogPath, ".."), { recursive: true });
      await writeFile(catalogPath, JSON.stringify(updated, null, 2), "utf8");
    } catch (err) {
      return failureResult(
        createDysflowError(
          "VBA_CATALOG_WRITE_FAILED",
          err instanceof Error ? err.message : String(err),
        ),
      );
    }

    return successResult({
      catalogPath,
      formName: spec.data.name,
      controlCount: controls.length,
    });
  }

  async harvestFormCatalog(params: Record<string, unknown>): Promise<OperationResult<unknown>> {
    const destinationRoot =
      stringValue(params.destinationRoot) || stringValue(params.projectRoot) || this.cwd;
    const formsDir = resolve(destinationRoot, "forms");
    const reportsDir = resolve(destinationRoot, "reports");
    const catalog: Array<Record<string, unknown>> = [];
    for (const folder of [formsDir, reportsDir]) {
      const kind = folder === reportsDir ? "Report" : "Form";
      const entries = await this.safeReadDir(folder);
      for (const entry of entries) {
        if (!entry.toLowerCase().endsWith(".json")) continue;
        if (
          !entry.toLowerCase().endsWith(".form.json") &&
          !entry.toLowerCase().endsWith(".report.json")
        )
          continue;
        const spec = await readJsonFileAsync<Record<string, unknown>>(resolve(folder, entry)).catch(
          () => undefined,
        );
        if (spec === undefined) continue;
        const controls = Array.isArray(spec.controls) ? spec.controls : [];
        catalog.push({
          name: stringValue(spec.name) ?? entry.replace(/\.(form|report)\.json$/i, ""),
          kind: stringValue(spec.kind) ?? kind,
          controls: controls.length,
          specPath: resolve(folder, entry),
        });
      }
    }

    return successResult({
      destinationRoot,
      forms: catalog.filter((item) => item.kind === "Form"),
      reports: catalog.filter((item) => item.kind === "Report"),
      total: catalog.length,
    });
  }

  private async resolveFormSpec(params: Record<string, unknown>): Promise<
    OperationResult<{
      name: string;
      kind: "Form" | "Report";
      controls: readonly { name: string; type: string }[];
      specPath?: string;
    }>
  > {
    const specFromInput = isRecord(params.spec) ? params.spec : undefined;
    const specPath = stringValue(params.specPath);
    const loaded =
      specFromInput ??
      (specPath ? await readJsonFileAsync<Record<string, unknown>>(specPath) : undefined);
    if (loaded === undefined) {
      return failureResult(
        createDysflowError("FORM_SPEC_MISSING", "validate_form_spec requires spec or specPath."),
      );
    }
    const name = stringValue(loaded.name) ?? stringValue(params.name);
    if (name === undefined) {
      return failureResult(createDysflowError("FORM_SPEC_INVALID", "Form spec requires a name."));
    }
    const kindText =
      stringValue(loaded.kind) ??
      stringValue(params.kind) ??
      (name.startsWith("Report_") ? "Report" : "Form");
    if (kindText !== "Form" && kindText !== "Report") {
      return failureResult(
        createDysflowError("FORM_SPEC_INVALID", `Unsupported form kind: ${kindText}`),
      );
    }
    const controls = Array.isArray(loaded.controls)
      ? loaded.controls
          .filter(isRecord)
          .map((control) => ({
            name: stringValue(control.name) ?? "",
            type: stringValue(control.type) ?? stringValue(control.controlType) ?? "Unknown",
          }))
          .filter((control) => control.name.length > 0)
      : [];

    return successResult({
      name,
      kind: kindText as "Form" | "Report",
      controls,
      specPath,
    });
  }

  private async safeReadDir(path: string): Promise<string[]> {
    try {
      return await readdir(path);
    } catch {
      return [];
    }
  }
}
