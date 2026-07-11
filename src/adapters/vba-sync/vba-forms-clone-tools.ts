import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import type { FormIR } from "../../core/models/form-ir.js";
import {
  cloneFormFromTemplate as cloneFormFromTemplateCore,
  FormMutationError,
  parseFormTxt,
} from "../../core/services/form-ir-service.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import { isPathInside } from "../../core/utils/path-containment.js";
import { isWithinRuntime } from "../../shared/runtime-dir.js";
import { applyGuardedFormWrite } from "./vba-forms-guarded-write.js";
import {
  deriveFormName,
  hasManagedFormExtension,
  normalizePathForDetails,
  resolveMutationPath,
} from "./vba-forms-paths.js";
import type {
  FormsExecutionTarget,
  ManagedFormSource,
  VbaFormsOrchestrator,
} from "./vba-forms-types.js";

// create_form_from_template — slice 5 (issue #618)
//
// Pipeline:
//   1. Resolve `sourceForm` against the bench cache first, then the resolved
//      projectRoot (OQ2). Read the source `.form.txt` and parse via
//      `parseFormTxt` — the engine is pure, the adapter owns I/O.
//   2. Run `cloneFormFromTemplate(sourceIr, opts)` over the bench source.
//   3. Resolve `targetForm` to the SAME root as the source — bench if bench,
//      projectRoot otherwise. Read it to check existence.
//   4. If `targetExisted && !overwrite` → FORM_TARGET_EXISTS, no write.
//   5. Dry-run: return the post-replacement preview + token summary.
//      Apply: write target, route through `import_modules` LoadFromText gate.
//      On gate failure, best-effort restore the original target content.
//
// The restore-on-failure captures `originalTargetText` (empty string when the
// target was newly created) and writes it back best-effort. Slice 4
// `form_deserialize` mirrors this pattern on the source path.
export async function cloneFormFromTemplate(args: {
  orchestrator: VbaFormsOrchestrator;
  fileSystem: FormFileSystemPort;
  benchCacheRoot: string;
  params: Record<string, unknown>;
}): Promise<OperationResult<unknown>> {
  const { orchestrator, fileSystem, benchCacheRoot, params } = args;
  const sourceForm = stringValue(params.sourceForm);
  const targetForm = stringValue(params.targetForm);
  if (!sourceForm) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "create_form_from_template requires sourceForm (form name).",
      ),
    );
  }
  if (!targetForm) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "create_form_from_template requires targetForm (form name).",
      ),
    );
  }
  if (
    !hasManagedFormExtension(`${sourceForm}.form.txt`) ||
    !hasManagedFormExtension(`${targetForm}.form.txt`)
  ) {
    return failureResult(
      createDysflowError(
        "INVALID_INPUT",
        "create_form_from_template requires sourceForm and targetForm to start with 'Form_' or 'Report_'.",
      ),
    );
  }

  // Structural validation of tokenMap happens here so we never read source files for an
  // obviously-invalid request. The engine's `validateTokenMap` is the gate that throws
  // FORM_TOKEN_MAP_INVALID for malformed keys/values — it WILL still be reached for any
  // missed checks (engine defense in depth).
  const tokenMapResult = readTokenMap(params.tokenMap);
  if (!tokenMapResult.ok) {
    return failureResult(createDysflowError("FORM_TOKEN_MAP_INVALID", tokenMapResult.message));
  }
  const tokenMap = tokenMapResult.tokenMap;

  const strictMissingTokens = params.strictMissingTokens === true;
  const requestedPolicy = stringValue(params.missingTokenPolicy);
  const missingTokenPolicy: "warn-pass-through" | "strict" =
    strictMissingTokens || requestedPolicy === "strict" ? "strict" : "warn-pass-through";
  const overwrite = params.overwrite === true;
  const apply = params.apply === true || params.dryRun === false;

  // Resolve the orchestrator target early so we can build both candidate paths (bench-first,
  // projectRoot-fallback).
  const targetResolution = await orchestrator.resolveExecutionTarget(params);
  if (!targetResolution.ok) return targetResolution;
  const targetData = targetResolution.data as FormsExecutionTarget;
  const destinationRoot = normalizePathForDetails(targetData.destinationRoot);
  const realProjectRoot =
    targetData.projectRoot !== undefined
      ? normalizePathForDetails(targetData.projectRoot)
      : undefined;
  const projectRoot =
    targetData.projectRoot !== undefined
      ? normalizePathForDetails(targetData.projectRoot)
      : normalizePathForDetails(targetData.destinationRoot);

  // 1) bench-first resolve for the source.
  const benchSourcePath = resolveMutationPath(benchCacheRoot, `${sourceForm}.form.txt`);
  let sourcePath: string;
  let sourceRoot: "bench" | "projectRoot";
  let sourceText: string;
  try {
    sourceText = await fileSystem.readFile(benchSourcePath);
    sourcePath = normalizePathForDetails(benchSourcePath);
    sourceRoot = "bench";
  } catch {
    // 2) projectRoot fallback for the source.
    const projectSourcePath = resolveMutationPath(
      destinationRoot,
      `forms/${sourceForm}.form.txt`,
      realProjectRoot,
    );
    try {
      sourceText = await fileSystem.readFile(projectSourcePath);
      sourcePath = normalizePathForDetails(projectSourcePath);
      sourceRoot = "projectRoot";
    } catch {
      return failureResult(
        createDysflowError(
          "FORM_NOT_FOUND",
          `Cannot resolve source form "${sourceForm}" in bench-cache or projectRoot.`,
        ),
      );
    }
  }

  const runtimeEnv =
    orchestrator.env ??
    (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } })
      .process?.env ??
    {};

  if (isWithinRuntime(sourcePath, runtimeEnv)) {
    return failureResult(
      createDysflowError(
        "INVALID_INPUT",
        "Refusing to clone a form whose source lives inside the dysflow production runtime.",
      ),
    );
  }
  // #675 — also reject source paths that escape the resolved root.
  // The runtime check above is not enough: a path outside the runtime
  // could still traverse out of the bench-cache / projectRoot.
  const sourceRootForContainment = sourceRoot === "bench" ? benchCacheRoot : projectRoot;
  if (!isPathInside(sourcePath, sourceRootForContainment)) {
    return failureResult(
      createDysflowError(
        "INVALID_INPUT",
        `create_form_from_template sourcePath must be inside the resolved source root. sourcePath=${sourcePath}; root=${sourceRootForContainment}.`,
      ),
    );
  }

  // Parse the source IR — pure.
  let sourceIr: FormIR;
  try {
    sourceIr = parseFormTxt(sourceText, { name: deriveFormName(sourcePath) });
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_PARSE_ERROR",
        `Failed to parse "${sourcePath}": ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  // Target lives in the SAME root as the source (bench or projectRoot).
  const targetPath =
    sourceRoot === "bench"
      ? normalizePathForDetails(resolveMutationPath(benchCacheRoot, `${targetForm}.form.txt`))
      : normalizePathForDetails(
          resolveMutationPath(destinationRoot, `forms/${targetForm}.form.txt`, realProjectRoot),
        );

  // #675 — replace the dead `hasManagedFormExtension` suffix-only
  // validation with a real path-containment check on the target.
  // The previous check only verified the `.form.txt` / `.report.txt`
  // suffix, which let a caller pass `targetForm = "../etc/passwd"`
  // and escape the bench-cache / projectRoot.
  const targetRoot = sourceRoot === "bench" ? benchCacheRoot : projectRoot;
  if (!isPathInside(targetPath, targetRoot)) {
    return failureResult(
      createDysflowError(
        "INVALID_INPUT",
        `create_form_from_template targetPath must be inside the resolved source root. targetPath=${targetPath}; root=${targetRoot}.`,
      ),
    );
  }

  if (isWithinRuntime(targetPath, runtimeEnv)) {
    return failureResult(
      createDysflowError(
        "INVALID_INPUT",
        "Refusing to write a cloned form inside the dysflow production runtime.",
      ),
    );
  }

  // 3) Check target existence (capture original for restore-on-failure).
  let targetExisted = false;
  let originalTargetText = "";
  try {
    originalTargetText = await fileSystem.readFile(targetPath);
    targetExisted = true;
  } catch {
    // not present — newly created
  }
  if (targetExisted && !overwrite) {
    return failureResult(
      createDysflowError(
        "FORM_TARGET_EXISTS",
        `Target form "${targetForm}" already exists at "${targetPath}". Pass overwrite:true to replace it via the gated restore path.`,
      ),
    );
  }

  // 4) Run the clone engine.
  let cloneResult: ReturnType<typeof cloneFormFromTemplateCore>;
  try {
    cloneResult = cloneFormFromTemplateCore(sourceIr, {
      tokenMap,
      targetFormName: targetForm,
      missingTokenPolicy,
    });
  } catch (err) {
    if (err instanceof FormMutationError) {
      return failureResult(createDysflowError(err.code, err.message));
    }
    return failureResult(
      createDysflowError("FORM_MUTATION_INVALID", err instanceof Error ? err.message : String(err)),
    );
  }

  if (!apply) {
    const outputMode = stringValue(params.outputMode) ?? "full";
    if (outputMode === "summary") {
      return successResult({
        mode: "dry-run",
        sourcePath,
        targetPath,
        targetExisted,
        importGate: "not-run",
        appliedTokens: cloneResult.appliedTokens,
        missingTokens: cloneResult.missingTokens,
        warnings: cloneResult.warnings,
        preservedKeys: cloneResult.preservedKeys,
      });
    } else if (outputMode === "file") {
      return successResult({
        sourcePath,
        targetPath,
        targetSource: cloneResult.source,
      });
    } else {
      return successResult({
        mode: "dry-run",
        sourcePath,
        targetPath,
        targetExisted,
        importGate: "not-run",
        appliedTokens: cloneResult.appliedTokens,
        missingTokens: cloneResult.missingTokens,
        warnings: cloneResult.warnings,
        preservedKeys: cloneResult.preservedKeys,
        targetSource: cloneResult.source,
      });
    }
  }

  // 5) Apply: write the target, then route through import_modules.
  const cloneSource: ManagedFormSource = {
    sourcePath: targetPath,
    destinationRoot:
      sourceRoot === "bench" ? benchCacheRoot : normalizePathForDetails(targetData.destinationRoot),
    moduleName: deriveFormName(targetPath),
  };
  const write = await applyGuardedFormWrite({
    orchestrator,
    fileSystem,
    source: cloneSource,
    newSource: cloneResult.source,
    originalSource: originalTargetText,
    targetExisted,
    forwardedParams: params,
  });
  if (!write.ok) return write;
  const importResultData = write.data.importResult;

  const outputMode = stringValue(params.outputMode) ?? "full";
  if (outputMode === "summary") {
    return successResult({
      mode: "apply",
      sourcePath,
      targetPath,
      targetExisted,
      importGate: "passed",
      appliedTokens: cloneResult.appliedTokens,
      missingTokens: cloneResult.missingTokens,
      warnings: cloneResult.warnings,
      preservedKeys: cloneResult.preservedKeys,
      importResult: importResultData,
    });
  } else if (outputMode === "file") {
    return successResult({
      sourcePath,
      targetPath,
      targetSource: cloneResult.source,
    });
  } else {
    return successResult({
      mode: "apply",
      sourcePath,
      targetPath,
      targetExisted,
      importGate: "passed",
      appliedTokens: cloneResult.appliedTokens,
      missingTokens: cloneResult.missingTokens,
      warnings: cloneResult.warnings,
      preservedKeys: cloneResult.preservedKeys,
      targetSource: cloneResult.source,
      importResult: importResultData,
    });
  }
}

/**
 * Read and structurally validate the token map at the adapter boundary so we
 * never read source files for an obviously-bad request. Returns either a
 * parsed `Record<string, string>` or an actionable error message. The engine's
 * `validateTokenMap` is the contract — engine defense-in-depth will catch any
 * slipped-through value via the same FORM_TOKEN_MAP_INVALID code path.
 */
function readTokenMap(
  value: unknown,
): { ok: true; tokenMap: Readonly<Record<string, string>> } | { ok: false; message: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, message: "tokenMap must be an object of token -> string mappings." };
  }
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof key !== "string" || key.length === 0) {
      return {
        ok: false,
        message: `Token map keys must be non-empty strings; received ${JSON.stringify(key)}.`,
      };
    }
    if (typeof v !== "string") {
      return {
        ok: false,
        message: `Token "${key}" maps to a non-string value (${typeof v}). Token values must be strings.`,
      };
    }
    out[key] = v;
  }
  return { ok: true, tokenMap: out };
}
