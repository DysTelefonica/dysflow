import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../contracts/index.js";
import { isRecord, stringValue, truthy } from "../utils/index.js";
import { logSwallowedIoError } from "../utils/log-swallowed-io-error.js";

// ---------------------------------------------------------------------------
// I/O Port interfaces — owned by core, implemented by adapters
// ---------------------------------------------------------------------------

export interface FormFileSystemPort {
  mkdir(path: string, options: { recursive: true }): Promise<string | undefined>;
  readdir(path: string): Promise<string[]>;
  readJson<T>(path: string): Promise<T>;
  writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
}

export interface FormClockPort {
  nowIso(): string;
}

// ---------------------------------------------------------------------------
// Service options — only real, typed dependencies
// ---------------------------------------------------------------------------

export type VbaFormServiceOptions = {
  cwd?: string;
  fileSystem?: FormFileSystemPort;
  clock?: FormClockPort;
};

// ---------------------------------------------------------------------------
// Default Node.js port implementations (used when no explicit port is injected)
// ---------------------------------------------------------------------------

const nodeFileSystem: FormFileSystemPort = {
  mkdir: (path, options) => mkdir(path, options),
  readdir: (path) => readdir(path),
  readJson: async <T>(path: string): Promise<T> => {
    const raw = await readFile(path, "utf8");
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(`Invalid JSON file: ${path}`);
    }
  },
  writeFile: (path, data, encoding) => writeFile(path, data, encoding),
};

const nodeClock: FormClockPort = {
  nowIso: () => new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// VbaFormService
// ---------------------------------------------------------------------------

export class VbaFormService {
  private readonly cwd: string;
  private readonly fileSystem: FormFileSystemPort;
  private readonly clock: FormClockPort;

  constructor(options: VbaFormServiceOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.fileSystem = options.fileSystem ?? nodeFileSystem;
    this.clock = options.clock ?? nodeClock;
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
    const fileName = `${spec.data.name}.${spec.data.kind === "Report" ? "report" : "form"}.json`;
    const outputPath = resolve(formsDir, fileName);

    if (truthy(params.dryRun) && !truthy(params.apply)) {
      return successResult({
        dryRun: true,
        generated: false,
        wouldGenerate: true,
        outputPath,
        name: spec.data.name,
        kind: spec.data.kind,
        controlCount: spec.data.controls.length,
      });
    }

    await this.fileSystem.mkdir(formsDir, { recursive: true });
    const payload = JSON.stringify(
      {
        name: spec.data.name,
        kind: spec.data.kind,
        controls: spec.data.controls,
        generatedAt: this.clock.nowIso(),
      },
      null,
      2,
    );
    await this.fileSystem.writeFile(outputPath, payload, "utf8");

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
    let catalog: Record<string, unknown> = {};
    try {
      catalog = (await this.fileSystem.readJson<Record<string, unknown>>(catalogPath)) as Record<
        string,
        unknown
      >;
    } catch (err) {
      logSwallowedIoError("vba-form-service:catalog-read", err);
    }
    const forms = isRecord(catalog.forms) ? (catalog.forms as Record<string, unknown>) : {};
    const controls = Array.isArray(forms[spec.data.name])
      ? (forms[spec.data.name] as unknown[])
      : [];
    controls.push({ name: controlName, type: controlType });
    forms[spec.data.name] = controls;
    const updated = { ...catalog, forms };
    try {
      await this.fileSystem.mkdir(resolve(catalogPath, ".."), { recursive: true });
      await this.fileSystem.writeFile(catalogPath, JSON.stringify(updated, null, 2), "utf8");
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
        let spec: Record<string, unknown> | undefined;
        try {
          spec = await this.fileSystem.readJson<Record<string, unknown>>(resolve(folder, entry));
        } catch (err) {
          if (isMissingPathError(err)) {
            spec = undefined;
          } else {
            logSwallowedIoError("vba-form-service:spec-read", err);
            spec = undefined;
          }
        }
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
      (specPath ? await this.fileSystem.readJson<Record<string, unknown>>(specPath) : undefined);
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
      return await this.fileSystem.readdir(path);
    } catch {
      return [];
    }
  }
}

function isMissingPathError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}
