import {
  buildResolutionDiagnostic,
  resolveFormSourceCandidates,
} from "../../core/config/form-source-resolver.js";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import type { FormIR } from "../../core/models/form-ir.js";
import {
  normalizeLineEndings,
  parseFormTxt,
  serializeFormTxt,
} from "../../core/services/form-ir-service.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import { resolveManagedMutationSource } from "./vba-forms-managed-source.js";
import { deriveFormName } from "./vba-forms-paths.js";
import { captureRollbackOutcome } from "./vba-forms-rollback.js";
import { FORMS_MAPPINGS } from "./vba-forms-tool-mappings.js";
import type { VbaFormsOrchestrator } from "./vba-forms-types.js";

// Slice 3 (#616) — opaque metadata keys reported by form_serialize
// as the "preserved" set the round-trip is contracted to keep byte-equal.
// These are the keys whose values are opaque blobs (Begin…End blocks) that
// the serializer must reproduce verbatim for byte-equal round-trips.
const PRESERVED_METADATA_KEYS_FOR_SERIALIZE = [
  "Checksum",
  "Format",
  "PrtDevMode",
  "PrtDevModeW",
  "PrtDevNames",
  "PrtDevNamesW",
  "PrtMip",
  "RecSrcDt",
] as const;

/**
 * Read-only round-trip serializer (#616 slice 3). Parses the .form.txt at
 * `sourcePath`, re-serializes the resulting FormIR, and reports whether the
 * serialized output is byte-equal to the normalized original (LF endings).
 * No Access is opened, no binary is touched, no file is written. Apply is
 * ignored — this tool is intentionally read-only.
 */
export async function serializeForm(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
  orchestrator?: VbaFormsOrchestrator,
): Promise<OperationResult<unknown>> {
  let sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
  const projectId = stringValue(params.projectId);
  const formName = stringValue(params.formName) ?? stringValue(params.name);

  if (projectId && formName) {
    if (orchestrator === undefined) {
      return failureResult(
        createDysflowError(
          "MCP_INPUT_INVALID",
          "orchestrator is required when projectId is specified.",
        ),
      );
    }
    const target = await orchestrator.resolveExecutionTarget({ projectId, formName });
    if (!target.ok) return target;
    const targetData = target.data as { destinationRoot: string; projectRoot?: string };
    const candidates = resolveFormSourceCandidates({
      sourceRoot: targetData.destinationRoot,
      projectRoot: targetData.projectRoot,
      formName,
    });
    let resolvedPath: string | undefined;
    for (const candidate of candidates) {
      try {
        await fileSystem.readFile(candidate.absolutePath);
        resolvedPath = candidate.absolutePath;
        break;
      } catch {
        // try next
      }
    }
    if (resolvedPath === undefined) {
      const diagnostic = buildResolutionDiagnostic(
        {
          sourceRoot: targetData.destinationRoot,
          projectRoot: targetData.projectRoot,
          formName,
        },
        candidates,
        projectId,
      );
      return failureResult(createDysflowError("FORM_NOT_FOUND", diagnostic.remediation));
    }
    sourcePath = resolvedPath;
  }

  if (!sourcePath) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "form_serialize requires sourcePath (path to the .form.txt file).",
      ),
    );
  }

  let originalText: string;
  try {
    originalText = await fileSystem.readFile(sourcePath);
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_NOT_FOUND",
        `Cannot read form file at "${sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  const name =
    stringValue(params.formName) ??
    deriveFormName(sourcePath) ??
    stringValue(params.name) ??
    "Form";

  let ir: FormIR;
  try {
    ir = parseFormTxt(originalText, { name });
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_PARSE_ERROR",
        `Failed to parse "${sourcePath}": ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  const serialized = serializeFormTxt(ir);
  // byteEqual compares the serialized output against the LF-normalized
  // original (per the round-trip guarantee documented on `serializeFormTxt`:
  // `serializeFormTxt(parseFormTxt(x)) === normalizeLineEndings(x)`). CRLF
  // originals therefore normalize to LF before comparison, so a clean
  // round-trip reports byteEqual:true even when the on-disk line endings are
  // CRLF — byteDiff reflects the post-normalization delta, so it stays at 0
  // for a clean round-trip and grows only on real content mutations (BOM,
  // whitespace, etc.).
  const normalizedOriginal = normalizeLineEndings(originalText);
  const byteEqual = serialized === normalizedOriginal;
  const byteDiff = Math.abs(
    Buffer.byteLength(serialized, "utf8") - Buffer.byteLength(normalizedOriginal, "utf8"),
  );
  const opaqueCount = countOpaqueEntries(ir);

  let outputMode = stringValue(params.outputMode);
  if (!outputMode) {
    const includeSerialized =
      stringValue(params.includeSerialized) === "true" || params.includeSerialized === true;
    outputMode = includeSerialized ? "full" : "summary";
  }

  const data: Record<string, unknown> = {
    name: ir.name,
    kind: ir.kind,
  };

  if (outputMode === "summary") {
    data.byteEqual = byteEqual;
    data.byteDiff = byteDiff;
    data.metadataReport = {
      preservedKeys: PRESERVED_METADATA_KEYS_FOR_SERIALIZE,
      byteDiff,
      opaqueCount,
    };
  } else if (outputMode === "file") {
    data.serialized = serialized;
  } else {
    // "full"
    data.serialized = serialized;
    data.byteEqual = byteEqual;
    data.byteDiff = byteDiff;
    data.metadataReport = {
      preservedKeys: PRESERVED_METADATA_KEYS_FOR_SERIALIZE,
      byteDiff,
      opaqueCount,
    };
  }

  return successResult(data);
}

/**
 * Write-gated FormIR -> .form.txt deserializer (#616 slice 3). Re-serializes
 * the supplied `ir` to text, writes it to `sourcePath` on apply, and invokes
 * the existing `import_modules` LoadFromText gate. On gate failure the
 * original source is restored best-effort (same pattern as slice 4 mutation
 * tools). Defaults to dry-run (no write, no import).
 */
export async function deserializeForm(args: {
  orchestrator: VbaFormsOrchestrator;
  fileSystem: FormFileSystemPort;
  params: Record<string, unknown>;
}): Promise<OperationResult<unknown>> {
  const { orchestrator, fileSystem, params } = args;
  const sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
  if (!sourcePath) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "form_deserialize requires sourcePath (path to the .form.txt file).",
      ),
    );
  }

  const ir = readFormIR(params.ir);
  if (ir === undefined) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "form_deserialize requires an `ir` parameter (FormIR object).",
      ),
    );
  }

  const source = await resolveManagedMutationSource({
    orchestrator,
    toolName: "form_deserialize",
    params,
    rawSourcePath: sourcePath,
  });
  if (!source.ok) return source;

  let originalSource: string;
  try {
    originalSource = await fileSystem.readFile(source.data.sourcePath);
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_NOT_FOUND",
        `Cannot read form file at "${source.data.sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  const serializedText = serializeFormTxt(ir);
  const apply = params.apply === true || params.dryRun === false;

  if (!apply) {
    const outputMode = stringValue(params.outputMode) ?? "full";
    if (outputMode === "summary") {
      return successResult({
        mode: "dry-run",
        sourcePath: source.data.sourcePath,
        written: false,
        appliedChecksumBefore: undefined,
        appliedChecksumAfter: undefined,
        loadFromTextGate: "skipped",
      });
    } else if (outputMode === "file") {
      return successResult({
        sourcePath: source.data.sourcePath,
        preview: serializedText,
      });
    } else {
      return successResult({
        mode: "dry-run",
        sourcePath: source.data.sourcePath,
        written: false,
        appliedChecksumBefore: undefined,
        appliedChecksumAfter: undefined,
        loadFromTextGate: "skipped",
        preview: serializedText,
      });
    }
  }

  try {
    await fileSystem.writeFile(source.data.sourcePath, serializedText, "utf8");
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_WRITE_FAILED",
        `Cannot write form file at "${source.data.sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  const importParams = {
    ...params,
    sourcePath: source.data.sourcePath,
    destinationRoot: source.data.destinationRoot,
    moduleNames: [source.data.moduleName],
    importMode: "Auto",
    apply: true,
    dryRun: false,
  };
  const importResult = await orchestrator.executeMappedTool(
    "import_modules",
    importParams,
    FORMS_MAPPINGS.import_modules_gate,
  );
  if (!importResult.ok) {
    // Capture rollback outcome for consumer visibility (#692).
    // source always existed here (readFile succeeded above).
    const rollbackOutcome = await captureRollbackOutcome(
      () => fileSystem.writeFile(source.data.sourcePath, originalSource, "utf8"),
      true, // targetExisted — source file always exists in deserializeForm
    );
    return failureResult(
      createDysflowError(
        "FORM_IMPORT_GATE_FAILED",
        `import_modules apply gate failed for "${source.data.sourcePath}": ${importResult.error.message}`,
        { details: { cause: importResult.error, rollback: rollbackOutcome } },
      ),
    );
  }

  return successResult({
    mode: "apply",
    sourcePath: source.data.sourcePath,
    written: true,
    appliedChecksumBefore: undefined,
    appliedChecksumAfter: undefined,
    loadFromTextGate: "passed",
    importResult: importResult.data,
  });
}

/** Count opaque (blob) entries in a FormIR — used for the metadata report. */
function countOpaqueEntries(ir: FormIR): number {
  let count = 0;
  const walk = (node: FormIR["root"]): void => {
    for (const entry of node.entries) {
      if (entry.kind === "blob") count++;
    }
    for (const child of node.children) walk(child);
  };
  walk(ir.root);
  return count;
}

/**
 * Read a FormIR-shaped object from the deserializer input. Permissive: any
 * object with a `root` property of the right shape is accepted (the round-trip
 * tool contract is structural, not nominal). Returns undefined for anything
 * that cannot be coerced to a FormIR.
 */
function readFormIR(value: unknown): FormIR | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const candidate = value as { name?: unknown; kind?: unknown; root?: unknown };
  if (typeof candidate.root !== "object" || candidate.root === null) return undefined;
  const kind = candidate.kind === "Report" ? "Report" : "Form";
  const name = typeof candidate.name === "string" ? candidate.name : "Form";
  // The slice-1 FormIR contract carries preamble/root/codeBehind; we keep the
  // caller's `preamble` and `codeBehind` if provided, otherwise default to
  // empty/null so the re-serialized output stays minimal and deterministic.
  const ir: FormIR = {
    name,
    kind,
    preamble: Array.isArray((candidate as { preamble?: unknown }).preamble)
      ? ((candidate as { preamble: unknown[] }).preamble as FormIR["preamble"])
      : [],
    root: candidate.root as FormIR["root"],
    codeBehind:
      typeof (candidate as { codeBehind?: unknown }).codeBehind === "string"
        ? (candidate as { codeBehind: string }).codeBehind
        : null,
  };
  return ir;
}
