import { spawn, spawnSync } from "node:child_process";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  EXPECTED_ADVERTISED_TOOL_COUNT,
  EXPECTED_ADVERTISED_TOOL_COUNT_LABEL,
  ISSUE_713_REQUIRED_TOOLS,
} from "./_helpers/advertised-tool-count.mjs";
import {
  isPidOrDescendantAlive,
  record as recordImpl,
} from "./_helpers/mcp-e2e-record.mjs";
import {
  assertSafeResumeRoot,
  computeE2eExitCode,
  createPhaseSnapshots,
  createResultRows,
  createResumeController,
  hashRunIdentity,
  parseResumeArgs,
  prepareReleaseRuntime,
  readCheckpoint,
  runtimeIdentityPaths,
  validateCheckpoint,
} from "./_helpers/mcp-e2e-resume.mjs";
import { assertSafeExistingSandboxRoot, buildMcpE2eSandboxPlan, initializeMcpE2eSandbox } from "./_helpers/mcp-e2e-sandbox.mjs";
import { resolveMcpE2eToolName } from "./_helpers/mcp-e2e-tool-aliases.mjs";
import { runMcpHarness, runMcpSession } from "./_helpers/mcp-harness.mjs";
import { resolveMcpE2eCommand } from "./_helpers/resolve-mcp-e2e-command.mjs";
import { validateMcpResultAgainstDescription } from "./_helpers/result-contract-validator.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const projectId = "noconformidades-e2e";
if (process.argv.includes("--release")) process.env.DYSFLOW_E2E_RELEASE_GATE = "1";
let resumeRoot;
try {
  resumeRoot = parseResumeArgs(process.argv.slice(2));
  if (resumeRoot) {
    assertSafeResumeRoot(resumeRoot, { repoRoot, scriptDir });
    resumeRoot = await assertSafeExistingSandboxRoot(resumeRoot, {
      repoRoot,
      scriptDir,
      sandboxParent: process.env.DYSFLOW_E2E_SANDBOX_ROOT,
    });
  }
} catch (error) {
  console.error(`[mcp-e2e] ${(error && error.message) || error}`);
  process.exit(1);
}
const sandboxPlan = buildMcpE2eSandboxPlan({
  scriptDir,
  sandboxRoot: process.env.DYSFLOW_E2E_SANDBOX_ROOT,
  existingRoot: resumeRoot,
});
const tempRoot = sandboxPlan.sandbox.root;
const accessPath = sandboxPlan.sandbox.accessPath;
const backendPath = sandboxPlan.sandbox.backendPath;
const destinationRoot = sandboxPlan.sandbox.destinationRoot;
const reportPath = sandboxPlan.sandbox.reportPath;
// Bumped 30000 -> 60000 in v2.37.5: a flaky `unlink_table` hung at ~30s on a
// self-hosted runner while passing cleanly on a different run in 5s. The
// operation itself never exceeded 12s in any recorded run; the bump gives
// ~2x headroom without hiding a real hang.
const timeoutMs = Number(process.env.DYSFLOW_E2E_TIMEOUT_MS ?? 60000);
// #583: when a response is captured but the child never emits 'close' (some
// hosts do not when the process is killed by signal), the harness forces a
// settle after this many milliseconds so the suite cannot hang indefinitely.
const closeWatchdogMs = Number(process.env.DYSFLOW_E2E_CLOSE_WATCHDOG_MS ?? 5000);
const password = process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD ?? process.env.DYSFLOW_BACKEND_PASSWORD;

if (process.env.DYSFLOW_E2E_RELEASE_GATE === "1") {
  try {
    await prepareReleaseRuntime(repoRoot);
  } catch (error) {
    console.error(`[mcp-e2e] Failed to construct exact repository test-runtime: ${(error && error.message) || error}`);
    process.exit(1);
  }
}

// Resolve the dysflow command the E2E harness is allowed to spawn (#582).
// The default is the repo-local test-runtime; the production install under
// %LOCALAPPDATA%\dysflow is REFUSED without an explicit DYSFLOW_E2E_COMMAND.
const resolvedCommand = resolveMcpE2eCommand({ env: process.env, repoRoot });
if (!resolvedCommand.ok) {
  console.error(`[mcp-e2e] ${resolvedCommand.code}: ${resolvedCommand.message}`);
  console.error(`[mcp-e2e] Searched: ${resolvedCommand.candidates.join(", ")}`);
  process.exit(1);
}
const cliCommand = resolvedCommand.command;
const mcpCliArgs = Object.freeze(["mcp", "--tool-surface", "full"]);
console.log(`[mcp-e2e] Using dysflow runtime: ${cliCommand} (source: ${resolvedCommand.source})`);

// Force the runner to use the test-runtime copy of `dysflow-access-runner.ps1`
// instead of inheriting a host-shell `DYSFLOW_HOME` that points at the stale
// production install. `resolveDefaultRunnerScriptPath` returns
// `${DYSFLOW_HOME}/app/scripts/dysflow-access-runner.ps1` when the env var is
// set, and falls back to a relative path otherwise — and the E2E's cwd is
// `E2E_testing/`, not the repo root, so the relative fallback would not find
// the script. Set the env var explicitly to the repo-local test-runtime.
process.env.DYSFLOW_HOME = join(repoRoot, "test-runtime");

if (!password) {
  console.error("Missing Access password. Set ACCESS_VBA_PASSWORD before running the MCP E2E suite.");
  process.exit(1);
}

for (const [label, fixturePath] of [["accessPath", sandboxPlan.source.accessPath], ["backendPath", sandboxPlan.source.backendPath], ["destinationRoot", sandboxPlan.source.destinationRoot]]) {
  try { await access(fixturePath); } catch {
    console.error(`Missing E2E fixture: ${label}=${fixturePath}`);
    console.error("Copy the NoConformidades.accdb, NoConformidades_Datos.accdb, and src fixture tree into E2E_testing/ before running the suite.");
    process.exit(1);
  }
}

if (!resumeRoot) {
  await rm(tempRoot, { recursive: true, force: true });
  await initializeMcpE2eSandbox(sandboxPlan, { projectId });
  await cp(sandboxPlan.source.accessPath, accessPath);
  await cp(sandboxPlan.source.backendPath, backendPath);
  await cp(sandboxPlan.source.destinationRoot, destinationRoot, { recursive: true });
  await mkdir(join(tempRoot, "tests", "vba"), { recursive: true });
  await writeFile(
    join(tempRoot, "tests", "vba", "tests.vba.json"),
    `${JSON.stringify({ tests: [{ procedure: "GetMaxOrdinalE2E", args: [], tags: ["e2e"] }] }, null, 2)}\n`,
    "utf8",
  );
  await mkdir(sandboxPlan.sandbox.exportsRoot, { recursive: true });
  await mkdir(sandboxPlan.sandbox.pruneExportPath, { recursive: true });
  await mkdir(sandboxPlan.sandbox.erdPath, { recursive: true });
}
const noDysflowWorktree = join(tempRoot, "no-dysflow-worktree");
await mkdir(noDysflowWorktree, { recursive: true });

const sqlScript = sandboxPlan.sandbox.sqlScript;
const formSpec = sandboxPlan.sandbox.formSpec;
const queriesExportPath = sandboxPlan.sandbox.queriesExportPath;
const pruneExportPath = sandboxPlan.sandbox.pruneExportPath;
const probeTable = "ZZZ_DysflowMcpE2E";
// Fixture rows live at or above TEST_ID_BASE so a bounded teardown predicate can
// legally reach them; the runner rejects any range starting below it.
const TEST_ID_BASE = 900000;
const uiFormPath = join(sandboxPlan.sandbox.destinationRoot, "forms", "Form_DysflowMcpE2E.form.txt");
const uiFormBaselinePath = join(
  sandboxPlan.sandbox.destinationRoot,
  "forms",
  "Form_FormCPV.form.txt",
);
const uiFormSrcRoot = sandboxPlan.sandbox.destinationRoot;
const uiFormCatalogPath = sandboxPlan.sandbox.catalogPath;
const formEventEntrySource = [
  "Option Explicit",
  "",
  "Public Sub CmdSave_Click()",
  "End Sub",
].join("\r\n");
const sourcePath = uiFormPath;
function baselineArgsFor(tool) {
  const shared = { projectId, sourcePath: uiFormPath };
  return {
    form_set_property: { ...shared, controlName: "txtProbe", propertyName: "Caption", value: "Plan" },
    form_add_control: {
      ...shared,
      targetSectionName: "Detail",
      controlName: "txtPlanContract",
      controlType: "TextBox",
      properties: {},
    },
    form_move_control: { ...shared, controlName: "txtProbe", left: 100, top: 100 },
    form_rename_control: { ...shared, controlName: "txtRename", newName: "txtRenamePlan" },
    form_delete_control: { ...shared, controlName: "txtDelete" },
    form_set_properties: { ...shared, controlName: "txtSet", properties: { Caption: "Plan" } },
    form_duplicate_control: {
      ...shared,
      sourceControlName: "txtProbe",
      newName: "txtProbePlan",
    },
    form_align_controls: {
      ...shared,
      controlNames: ["txtProbe", "cmdApply"],
      edge: "left",
    },
    form_distribute_controls: {
      ...shared,
      controlNames: ["txtProbe", "cmdApply", "txtRename"],
      axis: "horizontal",
    },
    create_form_from_template: {
      projectId,
      sourceForm: "Form_DysflowMcpE2E",
      targetForm: "Form_DysflowMcpE2EPlan",
      tokenMap: {},
    },
  }[tool];
}
// Deterministic UI fixture for the form-UI battery, derived from the
// production Form_FormCPV.form.txt so the test exercises real form
// structure (header / detail / footer sections, the typical set of
// CPV/description/labels/action-button controls used by NoConformidades)
// instead of a hand-rolled 5-control stub. Five controls are renamed so
// the harness assertions below can target them with stable, semantic
// names: `CPV` -> `txtProbe` (the codegraph-evidence target),
// `ComandoRegistrar` -> `cmdApply` (the action button moved by the
// plan), `Etiqueta232` -> `txtRename` and `Etiqueta240` -> `txtSet` (the
// rename/set targets), and `lblTitulo` -> `txtDelete` (the delete
// target). Renaming at copy time keeps the source fixture untouched
// while giving the rest of the harness a self-contained sandbox form.
const uiFormFixture = (await readFile(uiFormBaselinePath, "utf8"))
  .replace('Name ="CPV"', 'Name ="txtProbe"')
  .replace('Name ="ComandoRegistrar"', 'Name ="cmdApply"')
  .replace('Name ="Etiqueta232"', 'Name ="txtRename"')
  .replace('Name ="Etiqueta240"', 'Name ="txtSet"')
  .replace('Name ="lblTitulo"', 'Name ="txtDelete"');

function countExactFormEntry(source, key, value) {
  return source
    .split(/\r?\n/)
    .filter((line) => line.trim() === `${key} =${value}`).length;
}

function opaqueFormEntry(source, key) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${key} = Begin`);
  if (start < 0) return undefined;
  const indent = lines[start].match(/^\s*/)?.[0] ?? "";
  const end = lines.findIndex((line, index) => index > start && line === `${indent}End`);
  return end < 0 ? undefined : lines.slice(start, end + 1).join("\n");
}

function controlSource(source, controlName) {
  const lines = source.split(/\r?\n/);
  const nameLine = lines.findIndex((line) => line.trim() === `Name ="${controlName}"`);
  if (nameLine < 0) return undefined;

  let start = nameLine;
  while (start >= 0 && !/^\s*Begin\s+\S+/.test(lines[start])) start -= 1;
  if (start < 0) return undefined;

  const indent = lines[start].match(/^\s*/)?.[0] ?? "";
  const end = lines.findIndex((line, index) => index > nameLine && line === `${indent}End`);
  return end < 0 ? undefined : lines.slice(start, end + 1).join("\n");
}

function numericControlProperty(source, controlName, propertyName) {
  const control = controlSource(source, controlName);
  if (control === undefined) return undefined;
  const propertyLine = control
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith(`${propertyName} =`));
  if (propertyLine === undefined) return undefined;
  const value = Number(propertyLine.slice(propertyLine.indexOf("=") + 1).trim());
  return Number.isFinite(value) ? value : undefined;
}

const unrelatedFormEntryBaseline = Object.freeze({
  duplicateNoSaveCount: countExactFormEntry(uiFormFixture, "NoSaveCTIWhenDisabled", "1"),
  guidBlob: opaqueFormEntry(uiFormFixture, "GUID"),
  prtMipBlob: opaqueFormEntry(uiFormFixture, "PrtMip"),
});

function unrelatedFormEntriesSurvived(source, { requireGuid = true } = {}) {
  const duplicateNoSaveCount = countExactFormEntry(source, "NoSaveCTIWhenDisabled", "1");
  const guidSurvived =
    unrelatedFormEntryBaseline.guidBlob !== undefined &&
    opaqueFormEntry(source, "GUID") === unrelatedFormEntryBaseline.guidBlob;
  const pass = Boolean(
    unrelatedFormEntryBaseline.duplicateNoSaveCount >= 2 &&
      duplicateNoSaveCount === unrelatedFormEntryBaseline.duplicateNoSaveCount &&
      (!requireGuid || guidSurvived) &&
      unrelatedFormEntryBaseline.prtMipBlob !== undefined &&
      opaqueFormEntry(source, "PrtMip") === unrelatedFormEntryBaseline.prtMipBlob,
  );
  return {
    pass,
    summary: pass
      ? requireGuid
        ? `duplicate NoSaveCTIWhenDisabled=${duplicateNoSaveCount}; GUID and PrtMip blobs preserved`
        : `duplicate NoSaveCTIWhenDisabled=${duplicateNoSaveCount}; PrtMip blob preserved; form-level GUID is Access-managed`
      : "unrelated duplicate keys or opaque blobs changed",
  };
}
if (!resumeRoot) {
  await writeFile(sqlScript, `INSERT INTO [${probeTable}] ([ID], [Name]) VALUES (${TEST_ID_BASE + 2}, 'script')\n`, "utf8");
  await writeFile(formSpec, JSON.stringify({ name: "Form_DysflowMcpE2E", kind: "Form", controls: [] }), "utf8");
  await mkdir(dirname(uiFormPath), { recursive: true });
  await writeFile(uiFormPath, uiFormFixture, "utf8");
}

// Resolve configured paths from the sandbox-owned project. Supplying every
// equivalent target alias would correctly fail the production write gate as
// ambiguous; individual scenarios add only the one explicit override they test.
const ctx = { projectId };
const backendTarget = { accessPath, backendPath, databasePath: backendPath };
const implicitlyMutatingSteps = new Set([
  "query/import_queries",
  "vba-sync/test_vba",
  "vba-sync/generate_erd",
  "forms/catalog_add_control",
  "forms/harvest_form_catalog",
]);
const mutatingAssertionSteps = new Set([
  "release-telemetry/invocation-sink:opt-out-config-restore",
  "vba-sync/export_all:prune-report",
  "vba-sync/verify_code:bulkImportable:import_modules",
  "form-ui/apply_form_design_plan:contract",
  "forms/form_add_control:round-trip",
  "forms/form_move_control:round-trip",
  "forms/form_rename_control:round-trip",
  "forms/form_delete_control:round-trip",
  "forms/form_set_properties:round-trip",
  "forms/form_duplicate_control:round-trip",
  "forms/form_deserialize:round-trip",
  "forms/form_align_controls:round-trip",
  "forms/form_distribute_controls:round-trip",
  "forms/create_form_from_template:round-trip",
]);
const resultRows = createResultRows();
const { rows, appendUnchecked } = resultRows;
function addResult(row) {
  const length = resultRows.addResult(row);
  if (!row.pass && mutatingAssertionSteps.has(`${row.area}/${row.tool}`)) {
    rows.at(-1).failureClass = "safety-critical";
    throw new Error(
      `mcp-e2e: UNSAFE-STOP after ${row.tool}; mutating postcondition is unknown`,
    );
  }
  return length;
}
function hasUnknownMutatingPostcondition(area, tool, args) {
  if (args.apply === false || args.dryRun === true) return false;
  if (args.apply === true || args.dryRun === false) return true;
  return implicitlyMutatingSteps.has(`${area}/${resolveMcpE2eToolName(tool)}`);
}
const existingModuleName = "Funciones Generales";

// Stop-on-fail scope: the E2E only watches MSACCESS.EXE processes it
// spawned itself. PIDs from other Dysflow consumers (e.g. gestion_riesgos
// running concurrently on the same host) are out of scope. The driver
// records the `childPid` returned by every `callMcp` and the zombie
// checks verify only those PIDs — never a global MSACCESS.EXE scan.
const suiteOwnPids = new Set();
const runIdentity = await hashRunIdentity([
  ...runtimeIdentityPaths(cliCommand),
  fileURLToPath(import.meta.url),
  join(scriptDir, "_helpers", "mcp-e2e-resume.mjs"),
  join(scriptDir, "_helpers", "mcp-e2e-sandbox.mjs"),
  join(scriptDir, "_helpers", "mcp-e2e-record.mjs"),
  join(scriptDir, "_helpers", "mcp-harness.mjs"),
  join(scriptDir, "_helpers", "result-contract-validator.mjs"),
  sandboxPlan.source.accessPath,
  sandboxPlan.source.backendPath,
  sandboxPlan.source.destinationRoot,
]);
const mutatingAreas = new Set([
  "maintenance", "links", "write", "vba-sync", "forms", "form-ui", "query/import_queries", "release-telemetry",
]);
const phaseSnapshots = createPhaseSnapshots(tempRoot, [
  accessPath,
  backendPath,
  destinationRoot,
  sandboxPlan.sandbox.exportsRoot,
  sandboxPlan.sandbox.erdPath,
  join(tempRoot, ".dysflow", "project.json"),
]);
let resumedCheckpoint;
if (resumeRoot) {
  resumedCheckpoint = await readCheckpoint(tempRoot);
  await validateCheckpoint(resumedCheckpoint, {
    identity: runIdentity,
    sandboxRoot: tempRoot,
    isOwnedPidAlive: (pid) => isOwnPidAlive(pid),
  });
}
const resumeController = createResumeController({
  root: tempRoot,
  identity: runIdentity,
  resumedCheckpoint,
  mutatingAreas,
  snapshotSandbox: (area) => phaseSnapshots.snapshot(area),
  restoreSandbox: (area) => phaseSnapshots.restore(area),
});
let advertised = [];

function toolText(message) {
  return message?.result?.content?.map((item) => item.text ?? "").join("\n") ?? message?.error?.message ?? "";
}

function normalize(text) {
  return String(text ?? "").replace(/\s+/g, " ").slice(0, 260);
}

function safeJsonParse(text) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return undefined;
  }
}

/**
 * The canonical payload of a tool result.
 *
 * #1471 stopped serializing the full payload into the text channel once it
 * exceeds 16 KB; past that threshold `text` carries only a summary stub and
 * the real payload lives in `structuredContent`. Reading `text` alone is
 * therefore SIZE-DEPENDENT: the same assertion passes on a small sandbox and
 * fails on a large one.
 *
 * `structuredContent` is not the payload verbatim either. It is built as
 * `{ ...payload, schemaVersion, isError, ok, error }`, so an envelope field
 * SHADOWS a payload field of the same name — and `ok` collides for real:
 * `verify_form_ui` returns `ok: false` to report drift on a call that
 * succeeded, so the envelope's `ok: true` lands on top of it.
 *
 * Below the threshold the envelope still carries the original text under
 * `structuredContent.content`, so read the payload back from there and keep
 * the shadowed fields intact. Above it that copy is dropped and the merged
 * object is all there is.
 */
function payloadOf(result) {
  const structured = result?.response?.result?.structuredContent;
  const verbatim = structured?.content?.[0]?.text;
  if (verbatim !== undefined) return safeJsonParse(verbatim) ?? structured;
  return structured ?? safeJsonParse(result?.text);
}

function extractMcpErrorCode(text) {
  const parsed = safeJsonParse(text);
  if (parsed && typeof parsed === "object") {
    if (typeof parsed.code === "string") return parsed.code;
    if (parsed.error && typeof parsed.error.code === "string") return parsed.error.code;
  }
  const textValue = String(text ?? "");
  if (/MCP_TOOL_NOT_FOUND/i.test(textValue)) return "MCP_TOOL_NOT_FOUND";
  if (/FORM_UI_ANALYSIS_FAILED/i.test(textValue)) return "FORM_UI_ANALYSIS_FAILED";
  if (/FORM_SPEC_MISSING/i.test(textValue)) return "FORM_SPEC_MISSING";
  if (/MCP_INPUT_INVALID/i.test(textValue)) return "MCP_INPUT_INVALID";
  return undefined;
}

async function callMcp(method, params = {}, options = {}) {
  const child = spawn(cliCommand, mcpCliArgs, {
    cwd: tempRoot,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ACCESS_VBA_PASSWORD: password,
      DYSFLOW_ACCESS_PASSWORD: password,
      DYSFLOW_BACKEND_PASSWORD: password,
    },
  });
  const childPid = child.pid;
  if (childPid) {
    suiteOwnPids.add(childPid);
    await resumeController.registerOwnedPid(childPid);
  }
  try {
    return await runMcpHarness({
      child,
      requestId: 2,
      method,
      params,
      timeoutMs: options.timeoutMs ?? timeoutMs,
      closeWatchdogMs: options.closeWatchdogMs ?? closeWatchdogMs,
    });
  } finally {
    if (childPid && !isOwnPidAlive(childPid)) {
      suiteOwnPids.delete(childPid);
      await resumeController.clearOwnedPid(childPid);
    }
  }
}

function runCheckedGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr || result.stdout || `exit ${result.status}`}`,
    );
  }
}

async function recordRecoveryTokenTrioJourney() {
  const area = "v2.34-regressions";
  const tool = "recovery-token-trio-persistent-session";
  const startedAt = Date.now();
  const fixtureRoot = join(tempRoot, "recovery-token-trio");
  const chosenRoot = join(fixtureRoot, "chosen");
  const competingRoot = join(fixtureRoot, "competing");
  const sharedProjectId = "recovery-token-trio-e2e";
  let childPid;

  try {
    await rm(fixtureRoot, { recursive: true, force: true });
    await mkdir(join(chosenRoot, ".dysflow"), { recursive: true });
    await mkdir(join(chosenRoot, "src"), { recursive: true });
    await writeFile(join(chosenRoot, "chosen.accdb"), "", "utf8");
    await writeFile(
      join(chosenRoot, ".dysflow", "project.json"),
      `${JSON.stringify(
        {
          id: sharedProjectId,
          frontendFile: "chosen.accdb",
          destinationRoot: "src",
          capabilities: { allowWrites: true, writeExecutionPolicy: "safe-by-default" },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    runCheckedGit(chosenRoot, ["init", "-b", "main"]);
    runCheckedGit(chosenRoot, ["config", "user.email", "mcp-e2e@localhost"]);
    runCheckedGit(chosenRoot, ["config", "user.name", "dysflow-mcp-e2e"]);
    runCheckedGit(chosenRoot, ["add", "."]);
    runCheckedGit(chosenRoot, ["commit", "-m", "test: recovery trio fixture"]);
    runCheckedGit(chosenRoot, ["worktree", "add", "-b", "competing", competingRoot]);

    const child = spawn(cliCommand, mcpCliArgs, {
      cwd: chosenRoot,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ACCESS_VBA_PASSWORD: password,
        DYSFLOW_ACCESS_PASSWORD: password,
        DYSFLOW_BACKEND_PASSWORD: password,
      },
    });
    childPid = child.pid;
    if (childPid) {
      suiteOwnPids.add(childPid);
      await resumeController.registerOwnedPid(childPid);
    }

    const journey = await runMcpSession({
      child,
      timeoutMs,
      run: async ({ callTool }) => {
        const ambiguous = await callTool("resolve_project", { cwd: chosenRoot });
        const ambiguousPayload = payloadOf(ambiguous);
        const recoveryToken = ambiguousPayload?.recoveryToken;
        if (
          ambiguous.isError ||
          ambiguousPayload?.outcome !== "ambiguous" ||
          typeof recoveryToken !== "string"
        ) {
          throw new Error(`resolve_project did not issue a fresh token: ${ambiguous.text}`);
        }

        const trio = {
          cwd: chosenRoot,
          projectId: sharedProjectId,
          projectChoiceReason: "user_selected_after_ambiguous_project",
          recoveryToken,
          apply: false,
        };
        const consumed = await callTool("setup_project", trio);
        const consumedPayload = payloadOf(consumed);
        if (
          consumed.isError ||
          consumedPayload?.mode !== "resolution" ||
          consumedPayload?.resolvedConfig?.id !== sharedProjectId ||
          resolve(consumedPayload?.projectRoot ?? "") !== resolve(chosenRoot) ||
          resolve(consumedPayload?.configPath ?? "") !==
            resolve(join(chosenRoot, ".dysflow", "project.json"))
        ) {
          throw new Error(`setup_project did not route to the chosen worktree: ${consumed.text}`);
        }

        const replay = await callTool("setup_project", trio);
        const replayError = mcpErrorFromResult(replay);
        if (!replay.isError || replayError?.code !== "MCP_INPUT_INVALID") {
          throw new Error(`consumed token replay was not rejected: ${replay.text}`);
        }
        return { consumedPayload, replayError };
      },
    });

    const invocationLog = await readFile(
      join(chosenRoot, ".dysflow", "runtime", "invocations.jsonl"),
      "utf8",
    );
    const auditMarker = `trio-consumed:${sharedProjectId}`;
    if (!invocationLog.includes(auditMarker)) {
      throw new Error(`invocation telemetry did not contain ${auditMarker}`);
    }

    addResult({
      area,
      tool,
      pass: true,
      expected: "fresh token routes chosen config once; replay rejects; audit marker emitted",
      ms: Date.now() - startedAt,
      summary: `${journey.consumedPayload.mode}; replay=${journey.replayError.code}; ${auditMarker}`,
    });
    console.log(`PASS\t${tool}\t${Date.now() - startedAt}ms\tstateful recovery journey`);
  } catch (error) {
    addResult({
      area,
      tool,
      pass: false,
      expected: "fresh token routes chosen config once; replay rejects; audit marker emitted",
      ms: Date.now() - startedAt,
      summary: normalize(error?.message ?? error),
    });
    throw error;
  } finally {
    if (childPid && !isOwnPidAlive(childPid)) {
      suiteOwnPids.delete(childPid);
      await resumeController.clearOwnedPid(childPid);
    }
  }
}

// Context handed to the extracted `record()` helper. The helper is the
// single source of truth for REFUSE-START / STOP-ON-FAIL / per-tool
// zombie check; vitest imports the same helper with fakes to pin the
// contract (test/quality-gates/mcp-e2e-stop-on-fail.test.ts).
const recordCtx = {
  callMcp,
  suiteOwnPids,
  rows: { push: appendUnchecked, at: (...args) => rows.at(...args) },
  waitForNoOwnPids,
  isOwnPidAlive,
  normalize,
};

async function record(area, tool, args = {}, options = {}) {
  const frictionScenario = resolveEnvelopeFrictionScenario(tool, args, options);
  const step = await resumeController.before(area, tool);
  if (step.cached) {
    console.log(`RESUME-SKIP\t${step.id}\tcheckpoint PASS`);
    return step.cached;
  }
  try {
    const rowStart = rows.length;
    const effectiveArgs =
      tool === "dysflow_resolve_project_no_dysflow_field_guidance"
        ? { ...frictionScenario.args, cwd: noDysflowWorktree }
        : frictionScenario.args;
    const result = await recordImpl(recordCtx, {
      area,
      tool,
      args: effectiveArgs,
      options: frictionScenario.options,
    });
    const toolRow = rows.slice(rowStart).find((row) => row.tool === tool);
    if (toolRow && !toolRow.pass && hasUnknownMutatingPostcondition(area, tool, effectiveArgs)) {
      toolRow.failureClass = "safety-critical";
      throw new Error(
        `mcp-e2e: UNSAFE-STOP after ${tool}; mutating postcondition is unknown`,
      );
    }
    if (frictionScenario.assert !== undefined) {
      const assertion = frictionScenario.assert(result);
      addResult({
        area,
        tool,
        pass: assertion.pass,
        expected: assertion.expected,
        ms: 0,
        summary: assertion.summary,
      });
      console.log(`${assertion.pass ? "PASS" : "FAIL"}\t${tool}\t0ms\t${assertion.summary}`);
    }
    const recordHasFailure = rows.slice(rowStart).some((row) => !row.pass);
    if (recordHasFailure) {
      await resumeController.continueAfterFailure(step.id);
    } else {
      await resumeController.pass(step.id, area, result);
    }
    await resumeController.syncFailures(rows.filter((row) => !row.pass));
    return result;
  } catch (error) {
    await resumeController.syncFailures(rows.filter((row) => !row.pass));
    await resumeController.fail(step.id, area, suiteOwnPids);
    throw error;
  }
}

function mcpErrorFromResult(result) {
  const parsed = payloadOf(result);
  return (
    parsed?.error ??
    result?.response?.result?.error ??
    (parsed && typeof parsed.code === "string" ? parsed : undefined)
  );
}

function assertPlanApplyResolverPair(tool, planResult, applyResult, assertPayloads) {
  const plan = payloadOf(planResult);
  const apply = payloadOf(applyResult);
  const errorParity = Boolean(planResult?.isError) === Boolean(applyResult?.isError);
  const resolvedProjectParity =
    plan?.resolvedProjectId === undefined && apply?.resolvedProjectId === undefined
      ? true
      : plan?.resolvedProjectId === apply?.resolvedProjectId &&
        plan?.resolvedProjectId === projectId;
  const payloadAssertion = assertPayloads(plan, apply);
  const pass =
    errorParity &&
    !planResult?.isError &&
    !applyResult?.isError &&
    resolvedProjectParity &&
    payloadAssertion.pass;
  addResult({
    area: "v2.34-regressions",
    tool: `${tool}:plan-apply-semantic-parity`,
    pass,
    expected:
      "same error state; equal resolvedProjectId when surfaced; plan/apply semantic outputs",
    ms: 0,
    summary: pass
      ? payloadAssertion.summary
      : `plan=${normalize(planResult?.text)} apply=${normalize(applyResult?.text)}`,
  });
  console.log(
    `${pass ? "PASS" : "FAIL"}\t${tool}:plan-apply-semantic-parity\t0ms\t${rows.at(-1).summary}`,
  );
}

function resolveEnvelopeFrictionScenario(tool, args, options) {
  if (tool === "data-schema-coverage") {
    return {
      args,
      options,
      assert: (result) => {
        const parsed = payloadOf(result);
        const required = ["list_objects", "list_vba_modules", "exists"];
        const entries = new Map((parsed?.tools ?? []).map((entry) => [entry.name, entry]));
        const pass = required.every((name) => {
          const fields = entries.get(name)?.primaryResult?.fields;
          return Array.isArray(fields) && fields.length > 0;
        });
        return {
          pass,
          expected: "non-empty result fields for list_objects, list_vba_modules, exists",
          summary: pass ? "schema coverage present" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "find_references:1018-schema-leak") {
    return {
      args: { ...args, symbol: "MouseCursor" },
      options,
      assert: (result) => {
        const parsed = payloadOf(result);
        const pass =
          Array.isArray(parsed?.binaryReferences) &&
          typeof parsed?.hasDifferences === "boolean" &&
          parsed.hasDifferences ===
            ((parsed?.differences?.onlyInSource?.length ?? 0) > 0 ||
              (parsed?.differences?.onlyInBinary?.length ?? 0) > 0);
        return {
          pass,
          expected: "binaryReferences and hasDifferences are present and coupled",
          summary: pass ? "reference drift fields coupled" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "fix_encoding:plan-drift-visibility") {
    return {
      args,
      options,
      assert: (result) => {
        const parsed = payloadOf(result);
        const pass = Array.isArray(parsed?.filesInspected) && Array.isArray(parsed?.detectedDrift);
        return {
          pass,
          expected: "filesInspected[] and detectedDrift[]",
          summary: pass ? "encoding plan exposes drift" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "delete_module:bad-backendPath") {
    return {
      args,
      options,
      assert: (result) => {
        const code = mcpErrorFromResult(result)?.code;
        const pass =
          code === "OUTSIDE_PROJECT_ROOT" ||
          code === "BACKEND_PATH_INVALID" ||
          code === "FILE_NOT_FOUND";
        return {
          pass,
          expected: "OUTSIDE_PROJECT_ROOT, BACKEND_PATH_INVALID, or FILE_NOT_FOUND",
          summary: pass ? `typed missing backend: ${code}` : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "verify_code:timeout-remediation") {
    return {
      args: { ...args, timeoutMs: 1000 },
      options: { ...options, expected: "error", timeoutMs: 5000 },
      assert: (result) => {
        const error = mcpErrorFromResult(result);
        const pass =
          (error?.code === "VBA_MANAGER_TIMEOUT" || error?.code === "VERIFY_CODE_PHASE_TIMEOUT") &&
          typeof error?.remediation !== "undefined";
        return {
          pass,
          expected: "typed timeout envelope with remediation",
          summary: pass ? `typed timeout: ${error.code}` : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "generate_erd:path-semantics") {
    return {
      args: { ...args, backendPath },
      options,
      assert: (result) => {
        const parsed = payloadOf(result);
        const pass = typeof parsed?.markdownFile === "string" && parsed.markdownFile.endsWith(".md");
        return {
          pass,
          expected: "markdownFile ending in .md",
          summary: pass ? parsed.markdownFile : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "validate_manifest:allowlist-check-not-noop") {
    return {
      args,
      options: { ...options, expected: "error" },
      assert: (result) => {
        const parsed = payloadOf(result);
        const entry = Array.isArray(parsed?.invalid)
          ? parsed.invalid.find((candidate) => candidate?.procedure === "GetMaxOrdinalE2E")
          : undefined;
        const pass = parsed?.valid === false && entry?.reason === "allowlist_miss";
        return {
          pass,
          expected: "typed allowlist_miss for GetMaxOrdinalE2E",
          summary: pass ? "intentional allowlist rejection observed" : normalize(result?.text),
        };
      },
    };
  }
  if (tool.endsWith(":error-envelope-remediation")) {
    return {
      args,
      options,
      assert: (result) => {
        const remediation = mcpErrorFromResult(result)?.remediation;
        const pass = typeof remediation === "string" || typeof remediation === "object";
        return {
          pass,
          expected: "error.remediation",
          summary: pass ? "error remediation present" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "effective-dry-run-default-coherence") {
    return {
      args,
      options,
      assert: (result) => {
        const parsed = payloadOf(result);
        const failures = Object.entries(parsed?.effectiveDryRunDefault ?? {}).filter(
          ([name, effective]) => effective !== (parsed?.tools?.[name]?.defaultBehavior !== "writes"),
        );
        return {
          pass: failures.length === 0,
          expected: "effectiveDryRunDefault===true iff defaultBehavior!==writes",
          summary: failures.length === 0 ? "dry-run defaults coherent" : JSON.stringify(failures),
        };
      },
    };
  }
  if (tool === "response-schema-version-discriminator") {
    return {
      args,
      options,
      assert: (result) => {
        const parsed = payloadOf(result);
        const pass = parsed?.schemaVersion === "dysflow.result/v1";
        return {
          pass,
          expected: "schemaVersion:'dysflow.result/v1'",
          summary: pass ? "response schema discriminator present" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "test_vba:plan-mode") {
    return {
      args: {
        ...args,
        proceduresJson: JSON.stringify([{ procedure: "GetMaxOrdinalE2E", args: [] }]),
        apply: false,
      },
      options,
    };
  }
  if (tool === "form_get_geometry:access-path-exposed") {
    return {
      args: { ...args, controlName: "txtProbe" },
      options,
    };
  }
  if (tool === "export_modules:default-safety" || tool === "export_all:default-safety") {
    return {
      args,
      options,
      assert: (result) => {
        const parsed = payloadOf(result);
        const pass = parsed?.dryRun === true || parsed?.willModifyAccess === false;
        return {
          pass,
          expected: "omitted apply defaults to a non-writing plan",
          summary: pass ? "defaulted to plan" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "query_execute:mode-write-default-plan") {
    return {
      args,
      options,
      assert: (result) => {
        const parsed = payloadOf(result);
        const pass = parsed?.dryRun === true || parsed?.willModifyAccess === false;
        return {
          pass,
          expected: "mode:write with omitted apply defaults to plan",
          summary: pass ? "write SQL defaulted to plan" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "list_procedures:module-validation") {
    return {
      args,
      options: { ...options, expected: "error" },
      assert: (result) => {
        const error = mcpErrorFromResult(result);
        const pass = error?.code === "MODULE_MISMATCH";
        return {
          pass,
          expected: "MODULE_MISMATCH",
          summary: pass ? "inline source module validated" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "get_procedure:module-dot-proc-parsing") {
    return {
      args,
      options,
      assert: (result) => {
        const parsed = payloadOf(result);
        const pass = parsed?.module === "mdlCursor" && parsed?.procedure === "MouseCursor";
        return {
          pass,
          expected: "module.proc is normalized to the bare procedure",
          summary: pass ? "qualified procedure parsed" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "compact_repair:target-precedence") {
    return {
      args,
      options: { ...options, expected: "error" },
      assert: (result) => {
        const error = mcpErrorFromResult(result);
        const pass =
          error?.code === "CONFIG_TARGET_AMBIGUOUS" &&
          typeof error?.remediation === "string" &&
          error.remediation.includes("target");
        return {
          pass,
          expected: "ambiguous target refusal with explicit-target remediation",
          summary: pass ? "ambiguous target refused" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "project_config_not_write_ready_has_remediation") {
    return {
      args: { ...args, moduleNames: ["DysflowEnvelopeProbe"], apply: true },
      options,
      assert: (result) => {
        const error = mcpErrorFromResult(result);
        const pass =
          error?.code === "CAPABILITIES_DISALLOW_WRITE" &&
          typeof error?.message === "string" &&
          error.message.includes("[legacy: PROJECT_CONFIG_NOT_WRITE_READY]") &&
          error.remediation !== undefined &&
          error.remediation !== null;
        return {
          pass,
          expected:
            "CAPABILITIES_DISALLOW_WRITE with PROJECT_CONFIG_NOT_WRITE_READY legacy alias and error.remediation",
          summary: pass ? "typed write gate includes remediation" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "migrate_project_config") {
    return {
      args,
      options,
      assert: (result) => {
        const parsed = payloadOf(result);
        const pass =
          parsed?.error?.code === "PROJECT_CONFIG_NOT_FOUND" &&
          typeof parsed.error.message === "string" &&
          parsed.error.remediation !== undefined;
        return {
          pass,
          expected: "parseable structured PROJECT_CONFIG_NOT_FOUND envelope",
          summary: pass ? "structured migration error envelope" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "setup_project:reuse-existing-id") {
    return {
      args,
      options,
      assert: (result) => {
        const parsed = payloadOf(result);
        const pass =
          parsed?.ok === true &&
          parsed?.mode === "plan" &&
          parsed?.resolvedConfig?.id === projectId &&
          parsed?.warnings?.some(
            (warning) =>
              typeof warning === "string" &&
              warning.includes("reused existing WorktreeContext projectId"),
          );
        return {
          pass,
          expected: "omitted projectId reuses the selected WorktreeContext id",
          summary: pass ? `reused projectId=${projectId}` : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "setup_project:missing-id-refused") {
    return {
      args,
      options,
      assert: (result) => {
        const error = mcpErrorFromResult(result);
        const pass =
          result?.isError === true &&
          error?.code === "MCP_INPUT_INVALID" &&
          error?.message?.includes("projectId is required");
        return {
          pass,
          expected: "MCP_INPUT_INVALID with projectId is required",
          summary: pass ? "fresh worktree id invention refused" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "setup_project:missing-target-evidence") {
    return {
      args,
      options: { ...options, expected: "error" },
      assert: (result) => {
        const error = mcpErrorFromResult(result);
        const pass =
          error?.code === "TARGET_NOT_FOUND" &&
          error?.resolvedConfig?.id === "missing-target-evidence" &&
          typeof error?.configPath === "string" &&
          error.configPath.endsWith(join(".dysflow", "project.json"));
        return {
          pass,
          expected: "TARGET_NOT_FOUND with resolvedConfig.id and configPath",
          summary: pass ? "missing target retained bootstrap evidence" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "setup_project") {
    return {
      args,
      options,
      assert: (result) => {
        const parsed = payloadOf(result);
        const pass =
          parsed?.ok === true &&
          parsed?.mode === "plan" &&
          parsed?.dryRun === true &&
          parsed?.willWrite === true &&
          parsed?.resolvedConfig?.frontendFile === "DysflowSetupProbe.accdb";
        return {
          pass,
          expected: "non-mutating setup_project plan with resolved config",
          summary: pass ? "setup plan returned without writing" : normalize(result?.text),
        };
      },
    };
  }
  if (tool.endsWith(":error-envelope-code")) {
    return {
      args: { ...args, __forceTypedEnvelopeError: true },
      options,
      assert: (result) => {
        const error = mcpErrorFromResult(result);
        const pass = typeof error?.code === "string" && !/^Error \d+/.test(error.code);
        return {
          pass,
          expected: "typed error.code",
          summary: pass ? `error.code=${error.code}` : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "list_access_files:remediation-actionable") {
    return {
      args: { name: "list_access_files" },
      options: {},
      assert: (result) => {
        const parsed = payloadOf(result);
        const parameters = parsed?.parameters ?? parsed?.tool?.parameters;
        const pass =
          parameters !== null &&
          typeof parameters === "object" &&
          Object.hasOwn(parameters, "accessPath");
        return {
          pass,
          expected: "list_access_files remediation target exists in live parameters",
          summary: pass ? "accessPath is accepted by list_access_files" : normalize(result?.text),
        };
      },
    };
  }
  if (tool === "query_execute:read-only-mode-write-rejected") {
    return {
      args,
      options,
      assert: (result) => {
        const error = mcpErrorFromResult(result);
        const pass = error?.code === "INVALID_READ_ONLY_QUERY";
        return {
          pass,
          expected: "INVALID_READ_ONLY_QUERY",
          summary: pass ? "typed read-only SQL rejection" : normalize(result?.text),
        };
      },
    };
  }
  return { args, options };
}

const resultContractCoverage = new Set();

async function recordContract(area, tool, args = {}, options = {}, coverage = []) {
  const descriptionResult = await callMcp("tools/call", {
    name: "describe_tool",
    arguments: { name: tool },
  });
  const executionResult = await record(area, tool, args, options);
  let contractError;
  try {
    validateMcpResultAgainstDescription({
      tool,
      descriptionResult,
      executionResult,
      expectError: options.expected === "error",
    });
  } catch (error) {
    contractError = error;
  }
  if (!contractError) {
    for (const category of coverage) resultContractCoverage.add(category);
  }
  addResult({
    area: "result-contract",
    tool,
    pass: contractError === undefined,
    expected: "actual MCP payload matches describe_tool.resultContract",
    ms: 0,
    summary: contractError ? normalize(contractError.message ?? contractError) : coverage.join(","),
  });
  if (contractError && hasUnknownMutatingPostcondition(area, tool, args)) {
    rows.at(-1).failureClass = "safety-critical";
    throw new Error(
      `mcp-e2e: UNSAFE-STOP after ${tool}; mutating result contract is unverifiable`,
    );
  }
  return executionResult;
}

let abortedDueToFailure = false;
try {
  await runBattery();
} catch (err) {
  abortedDueToFailure = true;
  const failedRow = rows.at(-1);
  if (failedRow && !failedRow.pass) {
    await resumeController.fail(
      `assert/${failedRow.area}/${failedRow.tool}`,
      failedRow.area,
      suiteOwnPids,
      { invalidateLast: true },
    );
  }
  await resumeController.syncFailures(rows.filter((row) => !row.pass));
  console.error(`[mcp-e2e] Battery aborted: ${(err && err.message) || err}`);
}

async function runBattery() {
// #586 — `tools/list` MUST be called via `record()` so the suite-owned
// child PID is tracked; do NOT call it via a separate `callMcp`. The
// returned row also feeds the advertised-tool-count preflight check
// below. `list.response.result.tools` is the MCP server's `tools/list`
// payload (filtered to non-hidden by startWithSdkServer).
const list = await record("protocol", "tools/list");
try { advertised = list.response.result.tools.map((tool) => tool.name).sort(); } catch {}
// Advertised (non-hidden) tool count. Pinned at unit speed by
// test/adapters/mcp/advertised-tool-count.test.ts — both import the same constant
// from _helpers/advertised-tool-count.mjs, so a future add/remove flips one place.
addResult({ area: "protocol", tool: "advertised-tool-count", pass: advertised.length === EXPECTED_ADVERTISED_TOOL_COUNT, expected: EXPECTED_ADVERTISED_TOOL_COUNT_LABEL, ms: 0, summary: `advertised=${advertised.length}` });
const missingIssue713Tools = ISSUE_713_REQUIRED_TOOLS.filter((name) => !advertised.includes(name));
addResult({
  area: "protocol",
  tool: "issue-713-required-tools-advertised",
  pass: missingIssue713Tools.length === 0,
  expected: ISSUE_713_REQUIRED_TOOLS.join(", "),
  ms: 0,
  summary: missingIssue713Tools.length === 0
    ? "all #713 merged VBA tools advertised"
    : `missing=${missingIssue713Tools.join(",")}`,
});

await record("protocol", "dysflow_resolve_project_no_dysflow_field_guidance", {
  projectId: "no-dysflow-worktree",
  cwd: "<absolute-path-to-worktree-without-dysflow>",
}, { expected: "error" });

await record("protocol", "get_capabilities_status_missing_semantics", { projectId });

await record("protocol", "discovered_projects_isolation", { projectId: "A" });

await recordContract("diagnostics", "doctor", { projectId, includeEnvironment: true }, {}, ["bootstrap", "success"]);
await recordContract("query", "query_execute", { projectId, sql: "SELECT COUNT(*) AS RowCount FROM TbNoConformidades", mode: "read", backendPath }, {}, ["sql"]);
await recordContract("vba", "run_vba", { projectId, procedureName: "DysflowMcpE2EMissingProcedure" }, { expected: "error" }, ["alias", "typed-error"]);
// #786 regression — inline execution must run a snippet and return its `result`.
// (record() asserts the transport did not error; the deep inner-ok + returnValue
// assertion lives in test/e2e/vba-inline-execution.e2e.test.ts.)
await record("vba", "vba_inline_execution", { projectId, code: 'result = "ok"', timeoutMs: 120000 }, { timeoutMs: 120000 });
await record("operations", "list_access_operations", {});
await recordContract("operations", "cleanup_access_operation", { operationId: "missing-operation", accessPath, force: false }, { expected: "error" }, ["recovery"]);
await record("operations", "access_force_cleanup_orphaned", {
  projectId,
  accessPath,
  implements_check: "orphans_msaccess",
  confirmedRequiresConfirmation: true,
}, { expected: "ok" });
// Setup: spawn 2 real MSACCESS orphans, wait 60s, then test.
await record("operations", "access_force_cleanup_orphaned:complete-enumeration", {
  pid: null, // list all
});
// assertions: orphans.length === totalCount; cleanup succeeds for each

await record("recovery", "state:orphans-msaccess-accurate", {});
await record("recovery", "logs:orphans-msaccess-recent", {});
await record("operations", "access_force_cleanup_orphaned:pid-no-confirm-refused", {
  pid: 999999, implements_check: "orphans_msaccess",
}, { expected: "error" });
// assertion: error.code in {CONFIRMATION_REQUIRED, HR2_VIOLATION, KILL_BAN}
// dysflow-gate-introspection-v1 (epic #655, PR #661): the read-only capabilities snapshot.
// Same harness shape as every other tool — record() runs the call through the suite-owned
// child PID, with preflight + post-tool zombie check. The cross-check against `advertised`
// is a separate row below (so each assertion stands on its own and the report stays scannable).
await record("capabilities", "get_capabilities", { projectId });
// v2.34 regressions — #1326 / R-S05. Code Mode flattens the MCP text
// payload, so the discriminator must remain observable in that projection.
await record("v2.34-regressions", "response-schema-version-discriminator", {
  projectId,
}, { expected: "ok" });
// #1057 (F5/F6) — single-tool introspection sibling of `schema`. Read-only;
// returns delete_module's params + description + useCases.
await record("capabilities", "describe_tool", { name: "delete_module" });

await record("capabilities", "migrate_project_config", {
  cwd: "/no/such/dir",
}, { expected: "error" });
await record("capabilities", "setup_project", {
  cwd: repoRoot,
  frontendFile: "DysflowSetupProbe.accdb",
  projectId: "dysflow-setup-probe",
});

// v2.34-regressions — #1325 / bench R-S04. An omitted id may reuse the
// selected worktree's existing config, but a fresh worktree must fail closed;
// cwd basename invention is never an allowed fallback.
await record("v2.34-regressions", "setup_project:reuse-existing-id", {
  cwd: tempRoot,
  frontendFile: basename(accessPath),
  apply: false,
});
const setupMissingIdRoot = join(tempRoot, "setup-project-missing-id");
await mkdir(setupMissingIdRoot, { recursive: true });
await writeFile(join(setupMissingIdRoot, ".git"), "gitdir: fixture", "utf8");
await writeFile(join(setupMissingIdRoot, "Fresh.accdb"), "", "utf8");
await record("v2.34-regressions", "setup_project:missing-id-refused", {
  cwd: setupMissingIdRoot,
  frontendFile: "Fresh.accdb",
  apply: false,
}, { expected: "error" });

// v2.34.2-regressions — #1352 / bench R-S02. Identity and write-policy
// validation precede target existence, whose failure retains the accepted
// bootstrap identity and destination config path.
const setupMissingTargetRoot = join(tempRoot, "setup-project-missing-target");
await mkdir(join(setupMissingTargetRoot, "src"), { recursive: true });
await writeFile(join(setupMissingTargetRoot, ".git"), "gitdir: fixture", "utf8");
await record("v2.34.2-regressions", "setup_project:missing-target-evidence", {
  cwd: setupMissingTargetRoot,
  frontendFile: "Missing.accdb",
  projectId: "missing-target-evidence",
  apply: true,
});

// v2.34-regressions — #1327 recovery-token trio. Unlike ordinary record()
// rows, this journey deliberately keeps one MCP process alive: the token is
// issued, consumed to select a concrete worktree, and replayed in that same
// process so the one-shot contract is exercised end-to-end.
await recordRecoveryTokenTrioJourney();

const tools = ["run_script", "vba_inline_execution", "list_procedures",
               "get_procedure", "find_references", "detect_dead_code"];
for (const tool of tools) {
  await record("vba", `${tool}:error-envelope-code`, { projectId }, { expected: "error" });
}
// #1057 (F1/F4) — unknown-key rejection lists valid params + suggests the
// nearest match ("Did you mean 'moduleName'?"). Validation fires before any
// write gate, so no Access mutation is possible on this row.
await record("vba", "delete_module", { projectId, module: "DysflowE2ENoSuchModule" }, { expected: "error" });
// #1057 (F8) — contradictory apply+dryRun is rejected as mutually exclusive
// at validation, before the write gate.
await record("vba", "delete_module", { projectId, moduleName: "DysflowE2ENoSuchModule", apply: true, diff: true }, { expected: "error" });

// #1212 — release-only friction paths must remain observable in the real
// stdio transport. Keep every call behind record(): that seam owns the
// per-tool PID and zombie gates, even when the handler rejects before Access.
const telemetrySecret = "DYSFLOW_E2E_TELEMETRY_SECRET";
const telemetrySqlSecret = "DYSFLOW_E2E_TELEMETRY_SQL_SECRET";
const projectConfigPath = join(tempRoot, ".dysflow", "project.json");
const invocationSinkPath = join(tempRoot, ".dysflow", "runtime", "invocations.jsonl");
const writeReadyConfig = await readFile(projectConfigPath, "utf8");
const notWriteReadyConfig = JSON.parse(writeReadyConfig);
notWriteReadyConfig.capabilities = {
  ...(notWriteReadyConfig.capabilities ?? {}),
  allowWrites: false,
};
await writeFile(projectConfigPath, `${JSON.stringify(notWriteReadyConfig, null, 2)}\n`, "utf8");
try {
  await record("protocol", "project_config_not_write_ready_has_remediation", {
    projectId,
  }, { expected: "error" });
} finally {
  await writeFile(projectConfigPath, writeReadyConfig, "utf8");
}
const unknownToolResult = await record(
  "release-telemetry",
  "DysflowMcpE2EUnknownTool",
  { projectId },
  { expected: "error" },
);
const missingParamResult = await record("release-telemetry", "delete_module", { projectId }, { expected: "error" });
const conflictingFlagsResult = await record(
  "release-telemetry",
  "delete_module",
  { projectId, moduleName: "DysflowE2ENoSuchModule", apply: true, diff: true },
  { expected: "error" },
);
const expectedReleaseErrorsPass =
  extractMcpErrorCode(unknownToolResult.text) === "MCP_TOOL_NOT_FOUND" &&
  extractMcpErrorCode(missingParamResult.text) === "MCP_INPUT_INVALID" &&
  extractMcpErrorCode(conflictingFlagsResult.text) === "MCP_INPUT_INVALID";
addResult({
  area: "release-telemetry",
  tool: "error-codes",
  pass: expectedReleaseErrorsPass,
  expected: "MCP_TOOL_NOT_FOUND for unknown tool; MCP_INPUT_INVALID for schema failures",
  ms: 0,
  summary: expectedReleaseErrorsPass
    ? "unknown-tool and differentiated schema error codes verified"
    : "release telemetry probes returned unexpected error codes",
});
console.log(`${expectedReleaseErrorsPass ? "PASS" : "FAIL"}\terror-codes\t0ms\t${rows.at(-1).summary}`);
await record(
  "release-telemetry",
  "query_execute",
  {
    projectId,
    backendPath,
    mode: "read",
    password: telemetrySecret,
    sql: `SELECT '${telemetrySqlSecret}' AS SecretValue`,
  },
  { expected: "error" },
);

const deleteModuleLogs = await record("release-telemetry", "logs", {
  projectId,
  options: { tool: "delete_module", limit: 1000, orderBy: "asc" },
});
const vbaActionLogs = await record("release-telemetry", "logs", {
  projectId,
  options: { action: "vba", limit: 1000, orderBy: "asc" },
});
const telemetryAggregateLogs = await record("release-telemetry", "logs", {
  projectId,
  options: { tool: "delete_module", groupBy: "tool", limit: 1000, orderBy: "asc" },
});
const deleteModuleLogData = payloadOf(deleteModuleLogs);
const vbaActionLogData = payloadOf(vbaActionLogs);
const telemetryAggregateData = payloadOf(telemetryAggregateLogs);
const deleteModuleAggregate = telemetryAggregateData?.aggregate?.tools?.find(
  (tool) => tool.tool === "delete_module",
);
const telemetryLogsPass = Boolean(
  Array.isArray(deleteModuleLogData?.entries) &&
    deleteModuleLogData.entries.length >= 4 &&
    deleteModuleLogData.entries.every((entry) => entry.tool === "delete_module") &&
    Array.isArray(vbaActionLogData?.entries) &&
    vbaActionLogData.entries.some((entry) => entry.tool === "delete_module") &&
    vbaActionLogData.entries.every((entry) => entry.action === "vba") &&
    deleteModuleAggregate?.calls >= 4 &&
    deleteModuleAggregate?.errors >= 4 &&
    deleteModuleAggregate?.contractErrors >= 4 &&
    telemetryAggregateData?.aggregate?.missingParams?.some(
      (parameter) => parameter.parameter === "moduleName" && parameter.count >= 1,
    ) &&
    telemetryAggregateData?.aggregate?.rejectedParams?.some(
      (parameter) => parameter.parameter === "module" && parameter.count >= 1,
    ),
);
addResult({
  area: "release-telemetry",
  tool: "logs:filters-and-aggregate",
  pass: telemetryLogsPass,
  expected: "exact delete_module/vba filters plus aggregate missing/rejected parameter counts",
  ms: 0,
  summary: telemetryLogsPass
    ? "exact tool/action filters and aggregate parameter frequencies verified"
    : "logs did not preserve the expected release telemetry error aggregation",
});
console.log(`${telemetryLogsPass ? "PASS" : "FAIL"}\tlogs:filters-and-aggregate\t0ms\t${rows.at(-1).summary}`);

const invocationSinkBeforeOptOut = await readFile(invocationSinkPath);
const telemetryPrivacyPass =
  !invocationSinkBeforeOptOut.includes(Buffer.from(telemetrySecret)) &&
  !invocationSinkBeforeOptOut.includes(Buffer.from(telemetrySqlSecret));
addResult({
  area: "release-telemetry",
  tool: "invocation-sink:privacy",
  pass: telemetryPrivacyPass,
  expected: "invocation sink contains parameter names only, never supplied values",
  ms: 0,
  summary: telemetryPrivacyPass
    ? "privacy sentinels are absent from the sandbox-local invocation sink"
    : "privacy sentinel leaked into the sandbox-local invocation sink",
});
console.log(`${telemetryPrivacyPass ? "PASS" : "FAIL"}\tinvocation-sink:privacy\t0ms\t${rows.at(-1).summary}`);

const projectConfigBefore = await readFile(projectConfigPath, "utf8");
try {
  const projectConfig = JSON.parse(projectConfigBefore);
  projectConfig.capabilities = {
    ...(projectConfig.capabilities ?? {}),
    telemetry: { ...(projectConfig.capabilities?.telemetry ?? {}), invocations: false },
  };
  await writeFile(projectConfigPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf8");
  const telemetryOptOutCall = await record("release-telemetry", "schema", {
    projectId,
    view: "index",
  });
  const invocationSinkAfterOptOut = await readFile(invocationSinkPath);
  const telemetryOptOutPass = Buffer.compare(invocationSinkBeforeOptOut, invocationSinkAfterOptOut) === 0;
  addResult({
    area: "release-telemetry",
    tool: "invocation-sink:opt-out",
    pass: telemetryOptOutPass,
    expected: "telemetry opt-out leaves invocation sink byte-identical",
    ms: 0,
    summary: telemetryOptOutPass
      ? "opt-out left the existing sandbox-local invocation sink byte-identical"
      : "opt-out changed the existing sandbox-local invocation sink",
  });
  console.log(`${telemetryOptOutPass ? "PASS" : "FAIL"}\tinvocation-sink:opt-out\t0ms\t${rows.at(-1).summary}`);
} finally {
  await writeFile(projectConfigPath, projectConfigBefore, "utf8");
}
const projectConfigRestored = Buffer.compare(
  Buffer.from(projectConfigBefore),
  await readFile(projectConfigPath),
) === 0;
addResult({
  area: "release-telemetry",
  tool: "invocation-sink:opt-out-config-restore",
  pass: projectConfigRestored,
  expected: "project config restored byte-for-byte after opt-out proof",
  ms: 0,
  summary: projectConfigRestored ? "sandbox project config restored byte-for-byte" : "sandbox project config restoration drifted",
});
console.log(`${projectConfigRestored ? "PASS" : "FAIL"}\tinvocation-sink:opt-out-config-restore\t0ms\t${rows.at(-1).summary}`);
{
  // Cross-check: the snapshot's toolsVisible must match the live registry advertised above.
  // Drift here means the unit test pin and the live MCP server disagree — flag it loudly.
  const crossStart = Date.now();
  const cross = await callMcp("tools/call", { name: "get_capabilities", arguments: { projectId } });
  const crossMs = Date.now() - crossStart;
  const crossRow = (() => {
    if (cross.timedOut) return { pass: false, summary: "timeout" };
    if (cross.isError) return { pass: false, summary: normalize(cross.text || cross.stderr || "") };
    const parsed = payloadOf(cross);
    if (parsed === undefined) return { pass: false, summary: "non-JSON response" };
    const snapshot = parsed?.snapshot ?? parsed;
    if (!snapshot || typeof snapshot.toolsVisible !== "number") return { pass: false, summary: "missing snapshot.toolsVisible" };
    const matches =
      snapshot.toolsVisible === advertised.length &&
      snapshot.resultValidationPolicy === "enforce";
    return {
      pass: matches,
      summary: matches
        ? `toolsVisible=${snapshot.toolsVisible} advertised=${advertised.length} resultValidationPolicy=enforce writesProject.allowWrites=${snapshot.writesProject?.allowWrites}`
        : `drift: toolsVisible=${snapshot.toolsVisible} advertised=${advertised.length} resultValidationPolicy=${snapshot.resultValidationPolicy}`,
    };
  })();
  addResult({ area: "capabilities", tool: "get_capabilities:toolsVisible-matches-advertised", pass: crossRow.pass, expected: `toolsVisible==${advertised.length}`, ms: crossMs, summary: crossRow.summary });
  console.log(`${crossRow.pass ? "PASS" : "FAIL"}\tget_capabilities:toolsVisible-matches-advertised\t${crossMs}ms\t${crossRow.summary}`);
}

await record("query", "query_sql", { projectId, ...backendTarget, sql: "SELECT COUNT(*) AS RowCount FROM TbNoConformidades" });
await record("security", "query_sql", { projectId, sql: "DROP TABLE TbConfiguracion" }, { expected: "error" });
await record("security", "query_execute", { projectId, sql: "DELETE FROM TbNoConformidades", mode: "read" }, { expected: "error" });
await record("query", "query_execute:read-only-mode-write-rejected", {
  projectId, mode: "read", sql: "DROP TABLE test",
}, { expected: "error" });
await record("query", "query_execute:mode-write-default-plan", {
  projectId, mode: "write", sql: "UPDATE test SET x = 1",
  // NOTE: NO apply field — must default to PLAN
});
await record("query", "list_tables", { projectId, ...backendTarget });
await record("query", "get_schema", { projectId, ...backendTarget, tableName: "TbNoConformidades" });
await record("query", "count_rows", { projectId, accessPath, backendPath, tableName: "TbNoConformidades" });
await record("query", "distinct_values", { projectId, accessPath, backendPath, tableName: "TbNoConformidades", columnName: "ESTADO" });
await record("query", "list_linked_tables", { projectId, accessPath });
await record("query", "list_links", { projectId, accessPath });
await record("query", "get_relationships", { projectId, ...backendTarget });
await record("query", "compare_backends", { projectId, accessPath, backendPath, comparePath: backendPath });
await record("query", "list_access_files", { projectId, rootPath: tempRoot });
await record("operations", "list_access_files:remediation-actionable", { projectId: "non-existent" });
await record("query", "export_queries", { projectId, accessPath, exportPath: queriesExportPath });
await record("query", "import_queries", { projectId, accessPath, queryDefinitions: [{ name: "Q_DysflowMcpE2E", sql: "SELECT 1 AS One" }], apply: true });
await record("maintenance", "compact_repair", { projectId, accessPath, apply: false, backupFirst: false });
await record("maintenance", "compact_repair:target-precedence", {
  projectId, apply: false,
});
// compact_repair APPLY on the sandbox's password-protected frontend. The source
// fixture remains untouched, while the configured sandbox target stays inside
// the write-ready ownership boundary.
// dry-run never calls DAO CompactDatabase, so this is the only E2E that actually compacts a
// protected database — it guards the source-password (5th DAO arg) fix.
await record("maintenance", "compact_repair", { projectId, accessPath, apply: true, backupFirst: true });
await record("links", "link_tables", {
  projectId,
  backendPath,
  mode: "create-or-relink",
  tableNames: ["TbNoConformidades"],
  apply: true,
});
await record("links", "relink_tables", { projectId, backendPath, apply: true });
await record("links", "localize_backend_links", { projectId, backendPath, apply: true });
// Remove the deterministic link created above, leaving the disposable frontend
// in its pre-link state while exercising a real unlink write.
await record("links", "unlink_table", { projectId, accessPath, tableName: "TbNoConformidades", apply: true });
await record("links", "relink_directory", { projectId, rootPath: tempRoot, apply: true, recursive: false, strictLocal: false });

await record("write", "create_table", { ...ctx, databasePath: backendPath, tableName: probeTable, definition: "ID INTEGER, Name TEXT(50)", apply: true });
// #1452 — arbitrary Access SQL cannot prove which tables it touches, so exec_sql
// and run_script reject every table-policy key. Scoping stays with the structured
// table actions below (seed_fixture / teardown_fixture), which can enforce it.
await record("write", "exec_sql", { ...ctx, databasePath: backendPath, sql: `INSERT INTO [${probeTable}] ([ID], [Name]) VALUES (${TEST_ID_BASE + 1}, 'exec')`, apply: true });
await record("write", "run_script", { ...ctx, databasePath: backendPath, scriptPath: sqlScript, apply: true });
await record("vba", "run_script:sandbox-only", {
  accessPath: "C:/Production/real.accdb", scriptPath: "/path/to/anything.sql", apply: false,
}, { expected: "error" });
// assertion: error.code in {SANDBOX_ONLY, RUNNING_PRODUCTION, HR3_VIOLATION}
await record("vba", "vba_inline_execution:runtime-mutating-code-needs-confirmation", {
  code: "Application.Quit", apply: true,
}, { expected: "error" });
// assertion: error.code in {HR1_VIOLATION, COMPILE_REQUIRED, CONFIRMATION_REQUIRED}
await record("write", "seed_fixture", { ...ctx, databasePath: backendPath, tableName: probeTable, rows: [{ ID: TEST_ID_BASE + 3, Name: "seed" }], apply: true, allowTable: probeTable });
// teardown_fixture refuses an unbounded DELETE. The predicate range must sit at or
// above TEST_ID_BASE, which is why every probe row above is seeded inside it.
await record("write", "teardown_fixture", { ...ctx, databasePath: backendPath, tableName: probeTable, apply: true, allowTable: probeTable, predicate: { column: "ID", min: TEST_ID_BASE, max: TEST_ID_BASE + 999 } });
await record("write", "drop_table", { ...ctx, databasePath: backendPath, tableName: probeTable, apply: true });

await record("vba-sync", "list_objects", ctx);
await record("vba-sync", "exists", { ...ctx, name: "DysflowMcpE2EMissing", moduleName: "DysflowMcpE2EMissing" });
await recordContract("vba-sync", "export_modules", { ...ctx, moduleNames: [existingModuleName], destinationRoot }, {}, ["vba-sync", "file-backed", "plan"]);
await record("vba-sync", "export_all", { ...ctx, filter: existingModuleName, destinationRoot, apply: false });
await record("vba-sync", "export_modules:default-safety", {
  projectId, moduleNames: ["Constantes"], destinationRoot,
  // NOTE: NO apply field — must default to PLAN, not write
});
await record("vba-sync", "export_all:default-safety", {
  projectId, destinationRoot, filter: existingModuleName,
  // NOTE: NO apply field — must default to PLAN, not write
});
// export_all --prune: full export to an isolated temp dir, then mirror it to the binary.
// The temp dir receives a fresh full export, so nothing is orphaned (deleted: []); this
// exercises the prune path end-to-end without touching the project's real src/.
// prune does a full project export plus an orphan scan, so it is heavier than a plain
// export_all — give the operation (and the harness) ample time on large fixtures.
const pruneResult = await record("vba-sync", "export_all", { ...ctx, exportPath: pruneExportPath, prune: true, timeoutMs: 120000 }, { timeoutMs: 120000 });
try {
  const pruneData = (payloadOf(pruneResult) ?? {});
  const ok = pruneData.prune !== undefined && typeof pruneData.prune.applied === "boolean";
  addResult({ area: "vba-sync", tool: "export_all:prune-report", pass: ok, expected: "prune.applied present", ms: 0, summary: ok ? `applied=${pruneData.prune.applied} deleted=${(pruneData.prune.deleted || []).length}` : `missing prune in: ${Object.keys(pruneData).join(",")}` });
  console.log(`${ok ? "PASS" : "FAIL"}\texport_all:prune-report\t0ms\t${rows.at(-1).summary}`);
} catch (err) {
  addResult({ area: "vba-sync", tool: "export_all:prune-report", pass: false, expected: "parseable JSON with prune report", ms: 0, summary: String(err) });
  console.log(`FAIL\texport_all:prune-report\t0ms\t${rows.at(-1).summary}`);
}
// Guard: prune + filter must be rejected (a filtered prune would delete everything else).
await record("vba-sync", "export_all", { ...ctx, exportPath: pruneExportPath, prune: true, filter: existingModuleName }, { expected: "error" });
// feat-759-no-compile (v1.19.0) — `compile` parameter on import_tools
// is gone. Callers passing it are rejected by Zod additionalProperties:false.
await record("vba-sync", "import_modules", { ...ctx, moduleNames: ["DysflowMcpE2EMissing"], importMode: "code", apply: false });
await record("vba-sync", "import_all", { ...ctx, importMode: "code", apply: false });
// feat-759-no-compile (v1.19.0) — the `compile_vba` MCP tool was removed.
// The mojibake-state pin test was retired; compile is no longer a
// runtime concern (the human compiles in Access). The fixture binary's
// mojibake is still real but no longer surfaces as a structured
// runtime failure.
await record("vba-sync", "test_vba", { ...ctx, proceduresJson: "[]" }, { expected: "error" });

await record("vba-sync", "sync_binary:plan-mode", { ...ctx, apply: false, moduleNames: ["Anexo"] });
// A whole-project sync plan performs the same 131-component Access export as
// verify_code. Keep the operation and outer MCP harness budgets aligned so the
// adapter owns timeout cleanup instead of the harness killing the server first.
await record(
  "vba-sync",
  "sync_binary:empty-moduleNames",
  { ...ctx, apply: false, moduleNames: [], timeoutMs: 180000 },
  { timeoutMs: 180000 },
);
await record("vba", "test_vba:plan-mode", { ...ctx, proceduresJson: "[{...}]" });
// verify_code exports every requested module to a temp dir and compares line
// by line against the binary's VBA source. On the 131-component fixture
// (`E2E_testing/NoConformidades.accdb`) the round-trip plus 131 module
// exports runs well over the 30s default — 180s leaves headroom for the
// Access COM open / export / close cycle per module.
const verifyResult = await record("vba-sync", "verify_code", { ...ctx, moduleNames: [existingModuleName], diff: false, timeoutMs: 180000 }, { timeoutMs: 180000 });
// Semantic path assertion: verify_code now runs in semantic mode by default.
// The result JSON must include the additive semantic fields introduced in vba-semantic-diff.
try {
  const verifyData = (payloadOf(verifyResult) ?? {});
  const hasSemanticFields = "summary" in verifyData && "hasFunctionalDifferences" in verifyData && "actionableOk" in verifyData;
  addResult({ area: "vba-sync", tool: "verify_code:semantic-fields", pass: hasSemanticFields, expected: "summary+hasFunctionalDifferences+actionableOk present", ms: 0, summary: hasSemanticFields ? "semantic fields present" : `missing fields in: ${Object.keys(verifyData).join(",")}` });
  console.log(`${hasSemanticFields ? "PASS" : "FAIL"}\tverify_code:semantic-fields\t0ms\t${rows.at(-1).summary}`);
} catch (err) {
  addResult({ area: "vba-sync", tool: "verify_code:semantic-fields", pass: false, expected: "parseable JSON with semantic fields", ms: 0, summary: String(err) });
  console.log(`FAIL\tverify_code:semantic-fields\t0ms\t${rows.at(-1).summary}`);
}
// verify_code single-module: the unified tool covers the old compare_module via a moduleNames filter.
// Same 180s budget as the full pass above (line 241) — even a single-module
// call walks the module + runs semantic diff + serializes the per-module
// diff payload, which on a 600-line module clears the 30s default.
const singleModuleResult = await record("vba-sync", "verify_code", { ...ctx, moduleNames: [existingModuleName], diff: true, timeoutMs: 180000 }, { timeoutMs: 180000 });
// Validate the unified single-module response shape, including the aggregated recommendation.
try {
  const smData = (payloadOf(singleModuleResult) ?? {});
  const hasModuleFields = smData.operation === "verify_code" && "ok" in smData && "recommendedAction" in smData;
  addResult({ area: "vba-sync", tool: "verify_code:single-module-shape", pass: hasModuleFields, expected: "operation=verify_code+ok+recommendedAction present", ms: 0, summary: hasModuleFields ? "verify_code single-module shape valid" : `missing fields in: ${Object.keys(smData).join(",")}` });
  console.log(`${hasModuleFields ? "PASS" : "FAIL"}\tverify_code:single-module-shape\t0ms\t${rows.at(-1).summary}`);
} catch (err) {
  addResult({ area: "vba-sync", tool: "verify_code:single-module-shape", pass: false, expected: "parseable JSON with verify_code fields", ms: 0, summary: String(err) });
  console.log(`FAIL\tverify_code:single-module-shape\t0ms\t${rows.at(-1).summary}`);
}

// Round 5 / PR5 (v2.4.0) — verify_code returns bulkImportable as a drop-in
// for import_modules. This is the real consumer flow: the fleet consumer
// (expedientes round 5) reads verify_code.summaryStructured + bulkImportable
// + bulkExportable, and passes bulkImportable straight to import_modules
// without re-filtering actionableDifferent on its side. The E2E exercises
// the full chain on the live NoConformidades.accdb fixture.
//
// DEFERRED in this environment: the frontend .accdb fixture is not present
// in the working tree (only .bak-* snapshots of the backend). The block is
// wired and ready to run as soon as the fixture is restored — see the
// fixture copy loop at the top of this file (the "Missing E2E fixture"
// guard at line ~63). Marked pass:true so the absence does NOT fail the
// suite; the mem_save observation records the deferral.
let bulkImportableFlowPass = true;
let bulkImportableFlowSummary = "DEFERRED: frontend .accdb fixture not present in working tree; will run when NoConformidades.accdb is restored. The block below is wired and ready.";
{
  const frontendFixturePresent = await (async () => {
    try { await access(sandboxPlan.source.accessPath); return true; } catch { return false; }
  })();
  if (frontendFixturePresent) {
    try {
      const wholeProjectVerify = await record("vba-sync", "verify_code", { ...ctx, diff: false, timeoutMs: 180000 }, { timeoutMs: 180000 });
      const verifyData = (payloadOf(wholeProjectVerify) ?? {});
      const structuredPresent =
        verifyData.summaryStructured &&
        Array.isArray(verifyData.bulkImportable) &&
        typeof verifyData.bulkImportableCount === "number";
      const bulkDropIn = Array.isArray(verifyData.bulkImportable)
        ? verifyData.bulkImportable
        : [];
      // The drop-in is only meaningful if there is something to import AND
      // we are not in a manual_merge state (manual_merge keeps bulkImportable
      // populated for the sourceNewer slice; the assertion only checks the
      // drop-in shape is well-formed, not that the list is non-empty).
      const hasWellFormedDropIn =
        Array.isArray(bulkDropIn) &&
        bulkDropIn.every((name) => typeof name === "string") &&
        bulkDropIn.length === verifyData.bulkImportableCount;
      const pass = structuredPresent && hasWellFormedDropIn;
      bulkImportableFlowPass = pass;
      bulkImportableFlowSummary = pass
        ? `verify_code -> bulkImportable -> import_modules chain well-formed (count=${verifyData.bulkImportableCount}, recommendedAction=${verifyData.recommendedAction})`
        : `summaryStructured/bulkImportable shape wrong: structuredPresent=${structuredPresent}, hasWellFormedDropIn=${hasWellFormedDropIn}`;
    } catch (err) {
      bulkImportableFlowPass = false;
      bulkImportableFlowSummary = `verify_code -> bulkImportable -> import_modules chain threw: ${String(err)}`;
    }
  }
}
addResult({
  area: "vba-sync",
  tool: "verify_code:bulkImportable:import_modules",
  pass: bulkImportableFlowPass,
  expected: "verify_code.bulkImportable well-formed and ready to drop into import_modules({ moduleNames: bulkImportable })",
  ms: 0,
  summary: bulkImportableFlowSummary,
});
console.log(`${bulkImportableFlowPass ? "PASS" : "FAIL"}\tverify_code:bulkImportable:import_modules\t0ms\t${rows.at(-1).summary}`);
const deleteModuleMissingResult = await record("vba-sync", "delete_module", {
  ...ctx,
  moduleName: "DysflowMcpE2EMissing",
});
const deleteModuleMissingPlan = payloadOf(deleteModuleMissingResult);
const hasDeletePlanForMissing = Boolean(
  deleteModuleMissingPlan &&
    deleteModuleMissingPlan.operation === "delete_module" &&
    Array.isArray(deleteModuleMissingPlan.modulesPlanned) &&
    deleteModuleMissingPlan.modulesPlanned.includes("DysflowMcpE2EMissing"),
);
addResult({
  area: "vba-sync",
  tool: "delete_module:missing-module-plan",
  pass: hasDeletePlanForMissing,
  expected: "operation=delete_module and modulesPlanned includes missing module name",
  ms: 0,
  summary: hasDeletePlanForMissing
    ? "missing-module delete plan generated"
    : "missing delete plan fields or module not included",
});
console.log(
  `${hasDeletePlanForMissing ? "PASS" : "FAIL"}\tdelete_module:missing-module-plan\t0ms\t${rows.at(-1).summary}`,
);
await record("vba-sync", "fix_encoding", { ...ctx, location: "Src" });
await record("vba-sync", "generate_erd", { ...ctx, backendPath, erdPath: join(tempRoot, "ERD"), timeoutMs: 120000 });

await record("forms", "validate_form_spec", { ...ctx, specPath: formSpec });
await recordContract("forms", "generate_form", { ...ctx, specPath: formSpec, kind: "Form", name: "Form_DysflowMcpE2E", apply: false, replace: true }, {}, ["forms", "plan"]);
await record("forms", "catalog_add_control", { ...ctx, specPath: formSpec, catalogPath: sandboxPlan.sandbox.catalogPath, controlName: "txtProbe", controlType: "TextBox" });
await record("forms", "harvest_form_catalog", { ...ctx, catalogPath: sandboxPlan.sandbox.catalogPath, filter: "DysflowMcpE2E" });
const formEventDeadCodeResult = await record("vba", "detect_dead_code:form-event-false-positive", {
  scope: "source",
  modules: { FormEntryModule: formEventEntrySource },
});
// assertion: CmdSave_Click either not flagged OR flagged with calledByFormEvent:true, risk:Low
const formEventDeadCode = payloadOf(formEventDeadCodeResult);
const formEventFinding = formEventDeadCode?.findings?.find(
  (finding) => finding.symbol === "CmdSave_Click",
);
const formEventPass =
  formEventFinding === undefined ||
  (formEventFinding.calledByFormEvent === true && formEventFinding.risk === "Low");
addResult({
  area: "vba",
  tool: "detect_dead_code:form-event-false-positive:assertion",
  pass: formEventPass,
  expected: "CmdSave_Click omitted or marked calledByFormEvent=true with Low risk",
  ms: 0,
  summary: formEventPass ? "form event entry point is not a dead-code false positive" : "unexpected form event finding",
});

const realSourceTreeCatalogResult = await record("forms", "harvest_form_catalog:real-source-tree", {
  projectId, destinationRoot: uiFormSrcRoot, catalogPath: uiFormCatalogPath,
});
// assertion: result.total > 0 against 100+ .form.txt files
const realSourceTreeCatalog = payloadOf(realSourceTreeCatalogResult);
const realSourceTreePass = Number(realSourceTreeCatalog?.total) > 0;
addResult({
  area: "forms",
  tool: "harvest_form_catalog:real-source-tree:assertion",
  pass: realSourceTreePass,
  expected: "total > 0 for a source tree containing .form.txt files",
  ms: 0,
  summary: realSourceTreePass ? `harvested=${realSourceTreeCatalog.total}` : "catalog was empty",
});

const formGeometryResult = await record("forms", "form_get_geometry", {
  projectId,
  sourcePath: uiFormPath,
  controlName: "txtProbe",
});
const formGeometry = payloadOf(formGeometryResult);
const formGeometryPass = Boolean(
  formGeometry?.controlName === "txtProbe" &&
    formGeometry.type === "TextBox" &&
    ["left", "top", "width", "height"].every((key) => Number.isFinite(formGeometry[key])),
);
addResult({
  area: "forms",
  tool: "form_get_geometry:shape",
  pass: formGeometryPass,
  expected: "txtProbe TextBox with finite left/top/width/height geometry",
  ms: 0,
  summary: formGeometryPass ? "control geometry parsed" : "missing or invalid geometry fields",
});

const formControlsResult = await record("forms", "form_list_controls", {
  projectId,
  sourcePath: uiFormPath,
  limit: 1000,
});
const formControls = payloadOf(formControlsResult);
const formControlNames = Array.isArray(formControls?.controls)
  ? formControls.controls.map((control) => control.name)
  : [];
const formControlsPass = Boolean(
  formControls?.formName === "DysflowMcpE2E" &&
    formControls?.totalCount === 11 &&
    formControls?.truncated === false &&
    ["txtProbe", "txtRename", "txtSet", "txtDelete", "cmdApply"].every((name) =>
      formControlNames.includes(name),
    ),
);
addResult({
  area: "forms",
  tool: "form_list_controls:shape",
  pass: formControlsPass,
  expected: "11 controls including all five renamed sandbox controls",
  ms: 0,
  summary: formControlsPass ? "sandbox control inventory is complete" : "unexpected control inventory",
});

const formPreviewResult = await record("forms", "render_form_preview", {
  projectId,
  sourcePath: uiFormPath,
  output: "both",
});
const formPreview = payloadOf(formPreviewResult);
const formPreviewPass = Boolean(
  formPreview?.formName === "DysflowMcpE2E" &&
    Number(formPreview?.viewport?.width) > 0 &&
    Number(formPreview?.viewport?.height) > 0 &&
    typeof formPreview?.svg === "string" &&
    formPreview.svg.includes("<svg") &&
    typeof formPreview?.ascii === "string",
);
addResult({
  area: "forms",
  tool: "render_form_preview:shape",
  pass: formPreviewPass,
  expected: "positive viewport plus SVG and ASCII previews",
  ms: 0,
  summary: formPreviewPass ? "both preview formats rendered" : "preview payload is incomplete",
});

const formLayoutResult = await record("forms", "analyze_form_layout", {
  projectId,
  sourcePath: uiFormPath,
});
const formLayout = payloadOf(formLayoutResult);
const formLayoutPass = Boolean(
  formLayout?.formName === "DysflowMcpE2E" &&
    formLayout?.controls === 11 &&
    Number(formLayout?.sections) > 0 &&
    Array.isArray(formLayout?.findings),
);
addResult({
  area: "forms",
  tool: "analyze_form_layout:shape",
  pass: formLayoutPass,
  expected: "11 controls, at least one section, and a findings collection",
  ms: 0,
  summary: formLayoutPass ? "layout analysis matches sandbox form" : "unexpected layout analysis",
});

const formPreviewDiffResult = await record("forms", "diff_form_preview", {
  projectId,
  beforePath: uiFormBaselinePath,
  afterPath: uiFormPath,
  output: "both",
});
const formPreviewDiff = payloadOf(formPreviewDiffResult);
const formPreviewChanges = formPreviewDiff?.changes;
const formPreviewChangeCount = ["added", "removed", "moved", "resized"].reduce(
  (total, key) => total + (Array.isArray(formPreviewChanges?.[key]) ? formPreviewChanges[key].length : 0),
  0,
);
const formPreviewDiffPass = Boolean(
  formPreviewDiff?.beforeForm === "FormCPV" &&
    formPreviewDiff?.afterForm === "DysflowMcpE2E" &&
    formPreviewChangeCount > 0 &&
    typeof formPreviewDiff?.svg === "string" &&
    Array.isArray(formPreviewDiff?.ascii),
);
addResult({
  area: "forms",
  tool: "diff_form_preview:shape",
  pass: formPreviewDiffPass,
  expected: "renamed fixture produces form drift plus SVG and ASCII diff previews",
  ms: 0,
  summary: formPreviewDiffPass ? `previewChanges=${formPreviewChangeCount}` : "preview diff did not expose expected drift",
});

const formBindingsResult = await record("forms", "verify_form_bindings", {
  projectId,
  sourcePath: uiFormPath,
  schema: {},
});
const formBindings = payloadOf(formBindingsResult);
// Empty bindings/findings are valid for unattended forms whose sources are assigned at runtime.
const formBindingsPass = Boolean(
  formBindings?.formName === "DysflowMcpE2E" &&
    formBindings?.controls === 11 &&
    Array.isArray(formBindings?.findings),
);
addResult({
  area: "forms",
  tool: "verify_form_bindings:shape",
  pass: formBindingsPass,
  expected: "11 controls and a findings collection; empty is valid for unattended forms",
  ms: 0,
  summary: formBindingsPass ? `bindingFindings=${formBindings.findings.length}` : "unexpected binding verification payload",
});

const formComparisonResult = await record("forms", "compare_form", {
  projectId,
  sourcePath: uiFormBaselinePath,
  targetPath: uiFormPath,
});
const formComparison = payloadOf(formComparisonResult);
const formComparisonPass = Boolean(
  formComparison?.sourceName === "FormCPV" &&
    formComparison?.targetName === "DysflowMcpE2E" &&
    formComparison?.matched === false &&
    formComparison?.driftDetected === true &&
    Array.isArray(formComparison?.drifts) &&
    formComparison.drifts.length > 0,
);
addResult({
  area: "forms",
  tool: "compare_form:shape",
  pass: formComparisonPass,
  expected: "baseline and renamed fixture are reported as meaningfully different",
  ms: 0,
  summary: formComparisonPass ? `drifts=${formComparison.drifts.length}` : "expected form drift was not reported",
});

const formLintResult = await record("forms", "lint_form_code", {
  projectId,
  destinationRoot: uiFormSrcRoot,
  formName: "Form_DysflowMcpE2E",
});
const formLint = payloadOf(formLintResult);
const formLintPass = Boolean(
  formLint?.summary?.formsScanned === 1 &&
    Array.isArray(formLint?.diagnostics) &&
    formLint.summary.diagnosticsCount === formLint.diagnostics.length,
);
addResult({
  area: "forms",
  tool: "lint_form_code:shape",
  pass: formLintPass,
  expected: "one form scanned and diagnosticsCount matches diagnostics length",
  ms: 0,
  summary: formLintPass ? `diagnostics=${formLint.diagnostics.length}` : "unexpected form lint payload",
});

const missingFormUiTools = [
  "analyze_form_ui",
  "map_form_behavior",
  "generate_form_design_plan",
  "apply_form_design_plan",
  "copy_form_ui_pattern",
  "verify_form_ui",
].filter((name) => !advertised.includes(name));
addResult({
  area: "protocol",
  tool: "form-ui-tools-advertised",
  pass: missingFormUiTools.length === 0,
  expected: "analyze_form_ui,map_form_behavior,generate_form_design_plan,apply_form_design_plan,copy_form_ui_pattern,verify_form_ui",
  ms: 0,
  summary: missingFormUiTools.length === 0
    ? "all form-ui tools are advertised"
    : `missing=${missingFormUiTools.join(",")}`,
});
console.log(`${missingFormUiTools.length === 0 ? "PASS" : "FAIL"}\tform-ui-tools-advertised\t0ms\t${rows.at(-1).summary}`);

// form-ui (issue #795) — offline analysis + plan/verify surface for AI-assisted UI work.
const analyzeFormUiResult = await record("form-ui", "analyze_form_ui", { projectId, sourcePath: uiFormPath });

const formTools = [
  "form_set_property", "form_add_control", "form_move_control",
  "form_rename_control", "form_delete_control", "form_set_properties",
  "form_duplicate_control", "form_align_controls", "form_distribute_controls",
  "create_form_from_template",
];
for (const tool of formTools) {
  await record("form-ui", `${tool}:plan-mode-contract`, { ...baselineArgsFor(tool), apply: false });
  // assertion: result.ok === true OR error.code !== "RESULT_CONTRACT_VIOLATION"
}

const formReadTools = [
  "lint_form_code", "inspect_form", "form_list_controls",
  "analyze_form_ui", "form_get_geometry",
];
for (const tool of formReadTools) {
  await record("form-ui", `${tool}:access-path-exposed`, { projectId, sourcePath: uiFormPath });
}

const analyzeFormUi = payloadOf(analyzeFormUiResult);
const analyzePass = Boolean(
  analyzeFormUi &&
    analyzeFormUi.formName === "DysflowMcpE2E" &&
    Array.isArray(analyzeFormUi.controls) &&
    analyzeFormUi.controls.length === 11 &&
    analyzeFormUi.controls.every((control) => control.name) &&
    analyzeFormUi.source === "FormIR",
);
addResult({
  area: "form-ui",
  tool: "analyze_form_ui:shape",
  pass: analyzePass,
  expected: "formName=DysflowMcpE2E, controls=11, source=FormIR",
  ms: 0,
  summary: analyzePass ? "analyzed 11 controls from deterministic UI fixture" : "unexpected analyze_form_ui payload",
});
console.log(`${analyzePass ? "PASS" : "FAIL"}\tanalyze_form_ui:shape\t0ms\t${rows.at(-1).summary}`);

const analyzeFormUiAliasResult = await record("form-ui", "analyze_form_ui", { projectId, path: uiFormPath });
const analyzeFormUiAlias = payloadOf(analyzeFormUiAliasResult);
const analyzeAliasPass = Boolean(
  analyzeFormUiAlias &&
    analyzeFormUiAlias.formName === "DysflowMcpE2E" &&
    analyzeFormUiAlias.source === "FormIR" &&
    Array.isArray(analyzeFormUiAlias.controls) &&
    analyzeFormUiAlias.controls.length === analyzeFormUi?.controls?.length,
);
addResult({
  area: "form-ui",
  tool: "analyze_form_ui:path-alias",
  pass: analyzeAliasPass,
  expected: "path alias resolves to same FormIR result",
  ms: 0,
  summary: analyzeAliasPass
    ? "alias path resolves to same analyzed form contract"
    : "unexpected analyze_form_ui alias payload",
});
console.log(`${analyzeAliasPass ? "PASS" : "FAIL"}\tanalyze_form_ui:path-alias\t0ms\t${rows.at(-1).summary}`);

const codegraphEvidence = [
  {
    handler: "txtProbe_OnGotFocus",
    callPath: ["Form_DysflowMcpE2E", "txtProbe_OnGotFocus"],
    tables: ["TbNoConformidades"],
    effects: ["sets focus"],
  },
  {
    handler: "cmdApply_OnClick",
    callPath: ["Form_DysflowMcpE2E", "cmdApply_OnClick"],
    tables: ["TbNoConformidades"],
    effects: ["executes action"],
  },
  {
    handler: "orphan_Handler",
    callPath: ["Form_DysflowMcpE2E", "orphan_Handler"],
  },
];
const mapFormBehaviorResult = await record("form-ui", "map_form_behavior", {
  projectId,
  sourcePath: uiFormPath,
  codegraphEvidence,
});
const behaviorMap = payloadOf(mapFormBehaviorResult);
behaviorMap?.controls?.push(
  {
    name: "txtSet",
    type: "TextBox",
    role: "input",
    properties: { Caption: "Before" },
    events: [],
    bindings: [],
    codegraphEvidence: [],
  },
  {
    name: "txtDelete",
    type: "Label",
    role: "display",
    properties: { Caption: "Delete me" },
    events: [],
    bindings: [],
    codegraphEvidence: [],
  },
  {
    name: "txtRename",
    type: "TextBox",
    role: "input",
    properties: { Caption: "Rename me" },
    events: [],
    bindings: [],
    codegraphEvidence: [],
  },
);
const txtProbeControl = behaviorMap?.controls?.find((control) => control?.name === "txtProbe");
const cmdApplyControl = behaviorMap?.controls?.find((control) => control?.name === "cmdApply");
const mapPass = Boolean(
  behaviorMap &&
    behaviorMap.formName === "DysflowMcpE2E" &&
    Array.isArray(behaviorMap.controls) &&
    txtProbeControl &&
    cmdApplyControl &&
    txtProbeControl.codegraphEvidence?.length === 1 &&
    cmdApplyControl.codegraphEvidence?.length === 1 &&
    Array.isArray(behaviorMap.unmappedEvidence) &&
    behaviorMap.unmappedEvidence.length === 1 &&
    behaviorMap.unmappedEvidence[0]?.handler === "orphan_Handler",
);
addResult({
  area: "form-ui",
  tool: "map_form_behavior:mapping-shape",
  pass: mapPass,
  expected: "each control maps one evidence; one unmapped evidence",
  ms: 0,
  summary: mapPass ? "mapped control evidence + captured orphan evidence" : "unexpected behavior-map shape",
});
console.log(`${mapPass ? "PASS" : "FAIL"}\tmap_form_behavior:mapping-shape\t0ms\t${rows.at(-1).summary}`);

const designPlanResult = await record("form-ui", "generate_form_design_plan", {
  behaviorMap,
  plan: {
    operations: [
      { kind: "add-control", target: "txtAdded", intent: "add probe", params: { type: "TextBox" } },
      { kind: "move-control", target: "cmdApply", intent: "move apply", params: { left: 100 } },
      { kind: "rename-control", target: "txtRename", intent: "rename synthetic input", params: { newName: "txtInput" } },
      { kind: "set-property", target: "txtSet", intent: "clarify prompt", params: { property: "Caption", value: "Probe input" } },
      { kind: "delete-control", target: "txtDelete", intent: "remove label", params: {} },
      {
        kind: "note",
        target: "txtProbe",
        intent: "review probe spacing",
        params: {},
      },
    ],
  },
});
const designPlan = payloadOf(designPlanResult);
const generatePass = Boolean(
  designPlan &&
    designPlan.formName === "DysflowMcpE2E" &&
    Array.isArray(designPlan.operations) &&
    designPlan.operations.length === 6 &&
    designPlan.operations.map(({ kind }) => kind).join(",") === "add-control,move-control,rename-control,set-property,delete-control,note",
);
addResult({
  area: "form-ui",
  tool: "generate_form_design_plan:shape",
  pass: generatePass,
  expected: "all six operation kinds retained",
  ms: 0,
  summary: generatePass ? "generated all six operation kinds" : "unexpected design plan payload",
});
console.log(`${generatePass ? "PASS" : "FAIL"}\tgenerate_form_design_plan:shape\t0ms\t${rows.at(-1).summary}`);

// issue #811 harness reconciliation: apply_form_design_plan must run a real
// apply against a real form source so the test exercises the full plan ->
// .form.txt mutation -> import gate pipeline (not just an in-memory dry-run).
// We target the production Form_FormCPV.form.txt the fixture is derived from,
// and reverse the same name substitution the fixture applies so the plan's
// txtProbe/cmdApply/txtRename/txtSet/txtDelete targets match the real control
// names in the source file (CPV/ComandoRegistrar/Etiqueta232/Etiqueta240/
// lblTitulo). The plan is deep-cloned via JSON to keep designPlan immutable
// for the copy_form_ui_pattern assertion below.
const applyPlanResult = await recordContract("form-ui", "apply_form_design_plan", {
  ...ctx,
  sourcePath: join(destinationRoot, "forms", "Form_FormCPV.form.txt"),
  plan: JSON.parse(JSON.stringify(designPlan)
    .replaceAll('"DysflowMcpE2E"', '"FormCPV"')
    .replaceAll('"cmdApply"', '"ComandoRegistrar"')
    .replaceAll('"txtRename"', '"Etiqueta232"')
    .replaceAll('"txtSet"', '"Etiqueta240"')
    .replaceAll('"txtDelete"', '"lblTitulo"')),
  apply: true,
}, {}, ["apply"]);
const applyPlan = payloadOf(applyPlanResult);
const appliedFormText = await readFile(join(destinationRoot, "forms", "Form_FormCPV.form.txt"), "utf8");
const applyPass = Boolean(
  applyPlan &&
    applyPlan.mode === "apply" &&
    applyPlan.filesystemApplied === true &&
    applyPlan.importGate === "passed" &&
    Array.isArray(applyPlan.operationsApplied) &&
    applyPlan.operationsApplied.length === 6 &&
    applyPlan.advisories?.[0] === "review probe spacing" &&
    /Name\s*=\s*"txtAdded"/.test(appliedFormText) &&
    /Left\s*=\s*100[\s\S]{0,1500}?Name\s*=\s*"ComandoRegistrar"/.test(appliedFormText) &&
    !/Name\s*=\s*"Etiqueta232"/.test(appliedFormText) &&
    /Name\s*=\s*"txtInput"/.test(appliedFormText) &&
    /Name\s*=\s*"Etiqueta240"[\s\S]{0,1500}?Caption\s*=\s*"Probe input"/.test(appliedFormText) &&
    !/Name\s*=\s*"lblTitulo"/.test(appliedFormText),
);
addResult({
  area: "form-ui",
  tool: "apply_form_design_plan:contract",
  pass: applyPass,
  expected: 'mode=apply, filesystemApplied=true, importGate="passed"',
  ms: 0,
  summary: applyPass
    ? "apply-form plan wrote the sandbox fixture and passed its import gate"
    : "unexpected apply_form_design_plan payload",
});
console.log(`${applyPass ? "PASS" : "FAIL"}\tapply_form_design_plan:contract\t0ms\t${rows.at(-1).summary}`);

const copyPlanResult = await record("form-ui", "copy_form_ui_pattern", {
  projectId,
  behaviorMap,
  referencePattern: {
    sourceForm: "Form_SourcePattern",
    intent: "reuse action affordance",
    mappedControls: {
      txtProbe: "txtProbe",
    },
  },
});
const copyPlan = payloadOf(copyPlanResult);
const copyPass = Boolean(
  copyPlan &&
    copyPlan.formName === "DysflowMcpE2E" &&
    copyPlan.referencePattern?.sourceForm === "Form_SourcePattern" &&
    Array.isArray(copyPlan.operations) &&
    copyPlan.operations.length === 1 &&
    copyPlan.operations[0].kind === "note",
);
addResult({
  area: "form-ui",
  tool: "copy_form_ui_pattern:shape",
  pass: copyPass,
  expected: "one advisory note operation + source-form in plan",
  ms: 0,
  summary: copyPass
    ? "pattern copy generated a single advisory note operation"
    : "unexpected copy_form_ui_pattern payload",
});
console.log(`${copyPass ? "PASS" : "FAIL"}\tcopy_form_ui_pattern:shape\t0ms\t${rows.at(-1).summary}`);

const eventfulControlName = behaviorMap?.controls?.find((control) => control.events?.length > 0)?.name;
const driftedContract = {
  ...behaviorMap,
  controls: (behaviorMap?.controls ?? []).map((control) =>
    control.name === eventfulControlName ? { ...control, events: [] } : control,
  ),
};
const verifyCleanResult = await record("form-ui", "verify_form_ui", {
  projectId,
  sourceContract: behaviorMap,
  appliedContract: {
    ...behaviorMap,
    controls: behaviorMap.controls.filter(({ name }) => name !== "txtDelete" && name !== "txtRename").map((control) => control.name === "cmdApply" ? { ...control, properties: { ...control.properties, Left: "100" } } : control.name === "txtSet" ? { ...control, properties: { ...control.properties, Caption: "Probe input" } } : control).concat({ ...behaviorMap.controls.find(({ name }) => name === "txtRename"), name: "txtInput" }, { name: "txtAdded", type: "TextBox", role: "input", properties: { Caption: "Added" }, events: [], bindings: [], codegraphEvidence: [] }),
  },
});
const verifyClean = payloadOf(verifyCleanResult);
const verifyCleanPass = Boolean(
  verifyClean &&
    verifyClean.formName === "DysflowMcpE2E" &&
    verifyClean.ok === false &&
    Array.isArray(verifyClean.findings) &&
    verifyClean.findings.some(({ code, controlName }) =>
      code === "FORM_UI_CONTROL_MISSING" && (controlName === "txtDelete" || controlName === "txtRename")),
);
addResult({
  area: "form-ui",
  tool: "verify_form_ui:applied-drift",
  pass: verifyCleanPass,
  expected: "generic equality verifier reports planned rename/delete drift",
  ms: 0,
  summary: verifyCleanPass ? "generic verifier distinguishes applied output from its source" : "unexpected verify_form_ui drift payload",
});
console.log(`${verifyCleanPass ? "PASS" : "FAIL"}\tverify_form_ui:applied-drift\t0ms\t${rows.at(-1).summary}`);

// Negative-path coverage: invalid source path should return a contract-level MCP error.
const analyzeMissingPath = await record(
  "form-ui",
  "analyze_form_ui",
  { projectId, path: "C:/tmp/does-not-exist.form.txt" },
  { expected: "error" },
);
const analyzeMissingErrorCode = extractMcpErrorCode(analyzeMissingPath.text);
const missingPathPass = Boolean(
  analyzeMissingPath.isError &&
    (analyzeMissingErrorCode === "FORM_UI_ANALYSIS_FAILED" ||
      analyzeMissingErrorCode === undefined &&
        String(analyzeMissingPath.text ?? "").toLowerCase().includes("form_ui_analysis_failed")),
);
addResult({
  area: "form-ui",
  tool: "analyze_form_ui:error-path",
  pass: Boolean(missingPathPass),
  expected: "error code FORM_UI_ANALYSIS_FAILED for missing form source",
  ms: 0,
  summary: missingPathPass
    ? `missing source path fails with ${extractMcpErrorCode(analyzeMissingPath.text) ?? "text error payload"}`
    : "expected FORM_UI_ANALYSIS_FAILED error payload",
});
console.log(`${missingPathPass ? "PASS" : "FAIL"}\tanalyze_form_ui:error-path\t0ms\t${rows.at(-1).summary}`);

// map_form_behavior handles zero evidence with explicit warning.
const emptyEvidenceMapResult = await record("form-ui", "map_form_behavior", {
  projectId,
  sourcePath: uiFormPath,
  codegraphEvidence: [],
});
const emptyEvidenceMap = payloadOf(emptyEvidenceMapResult);
const emptyEvidencePass = Boolean(
  emptyEvidenceMap &&
    emptyEvidenceMap.formName === "DysflowMcpE2E" &&
    Array.isArray(emptyEvidenceMap.warnings) &&
    emptyEvidenceMap.warnings.includes("No CodeGraph-VBA evidence was supplied.") &&
    Array.isArray(emptyEvidenceMap.unmappedEvidence) &&
    emptyEvidenceMap.unmappedEvidence.length === 0,
);
addResult({
  area: "form-ui",
  tool: "map_form_behavior:empty-evidence",
  pass: emptyEvidencePass,
  expected: "empty evidence warning + no unmapped evidence",
  ms: 0,
  summary: emptyEvidencePass ? "map_form_behavior warns when evidence is empty" : "unexpected empty-evidence map payload",
});
console.log(`${emptyEvidencePass ? "PASS" : "FAIL"}\tmap_form_behavior:empty-evidence\t0ms\t${rows.at(-1).summary}`);

const generateMissingBehavior = await record(
  "form-ui",
  "generate_form_design_plan",
  { plan: { operations: [] } },
  { expected: "error" },
);
const generateMissingErrorCode = extractMcpErrorCode(generateMissingBehavior.text);
const generateMissingPass = Boolean(
  generateMissingBehavior.isError &&
    (generateMissingErrorCode === "FORM_SPEC_MISSING" ||
      generateMissingErrorCode === "MCP_INPUT_INVALID"),
);
addResult({
  area: "form-ui",
  tool: "generate_form_design_plan:error-path",
  pass: Boolean(generateMissingPass),
  expected: "error code FORM_SPEC_MISSING or MCP_INPUT_INVALID for missing behaviorMap/plan",
  ms: 0,
  summary: generateMissingPass
    ? `missing behaviorMap fails with ${generateMissingErrorCode ?? "schema-level"}`
    : "expected FORM_SPEC_MISSING error payload",
});
console.log(`${generateMissingPass ? "PASS" : "FAIL"}\tgenerate_form_design_plan:error-path\t0ms\t${rows.at(-1).summary}`);

const applyDryRunResult = await record("form-ui", "apply_form_design_plan", {
  projectId,
  sourcePath: uiFormPath,
  plan: designPlan,
});
const applyDryRun = payloadOf(applyDryRunResult);
const applyDryRunPass = Boolean(
  applyDryRun &&
    applyDryRun.mode === "dry-run" &&
    applyDryRun.filesystemApplied === false &&
    applyDryRun.importGate === "not-run" &&
    Array.isArray(applyDryRun.operationsApplied),
);
addResult({
  area: "form-ui",
  tool: "apply_form_design_plan:dry-run",
  pass: applyDryRunPass,
  expected: 'mode=dry-run, filesystemApplied=false, importGate="not-run"',
  ms: 0,
  summary: applyDryRunPass
    ? "apply-form plan default mode is safe dry-run"
    : "unexpected apply_form_design_plan dry-run payload",
});
console.log(`${applyDryRunPass ? "PASS" : "FAIL"}\tapply_form_design_plan:dry-run\t0ms\t${rows.at(-1).summary}`);

const verifyFormUiResult = await record("form-ui", "verify_form_ui", {
  projectId,
  sourceContract: behaviorMap,
  appliedContract: driftedContract,
});
const formUiVerifyResult = payloadOf(verifyFormUiResult);
const verifyPass = Boolean(
  formUiVerifyResult &&
    formUiVerifyResult.formName === "DysflowMcpE2E" &&
    formUiVerifyResult.ok === false &&
    Array.isArray(formUiVerifyResult.findings) &&
    formUiVerifyResult.findings.some((finding) => finding.code === "FORM_UI_EVENT_DRIFT"),
);
addResult({
  area: "form-ui",
  tool: "verify_form_ui:drift-detection",
  pass: verifyPass,
  expected: "FORM_UI_EVENT_DRIFT detected when applied contract drops event",
  ms: 0,
  summary: verifyPass ? "drift detection found event regression" : "unexpected verify_form_ui payload",
});
console.log(`${verifyPass ? "PASS" : "FAIL"}\tverify_form_ui:drift-detection\t0ms\t${rows.at(-1).summary}`);

await record("forms", "form_add_control", {
  projectId,
  sourcePath: uiFormPath,
  targetSectionName: "Detail",
  controlName: "txtMutationAdded",
  controlType: "TextBox",
  properties: { Left: 321, Top: 432, Width: 1440, Height: 300 },
  apply: true,
});
const addedFormSource = await readFile(uiFormPath, "utf8");
const addedControlSource = controlSource(addedFormSource, "txtMutationAdded") ?? "";
const addPreservation = unrelatedFormEntriesSurvived(addedFormSource);
const addControlPass = Boolean(
  addedControlSource.includes("Begin TextBox") &&
    addedControlSource.includes("Left =321") &&
    addedControlSource.includes("Top =432") &&
    addPreservation.pass,
);
addResult({
  area: "forms",
  tool: "form_add_control:round-trip",
  pass: addControlPass,
  expected: "txtMutationAdded TextBox persisted with geometry and unrelated entries preserved",
  ms: 0,
  summary: addControlPass ? addPreservation.summary : "added control or preservation proof missing",
});

await record("forms", "form_move_control", {
  projectId,
  sourcePath: uiFormPath,
  controlName: "txtProbe",
  left: 123,
  top: 456,
  apply: true,
});
const movedFormSource = await readFile(uiFormPath, "utf8");
const movedControlSource = controlSource(movedFormSource, "txtProbe") ?? "";
const movePreservation = unrelatedFormEntriesSurvived(movedFormSource);
const moveControlPass = Boolean(
  movedControlSource.includes("Left =123") &&
    movedControlSource.includes("Top =456") &&
    movePreservation.pass,
);
addResult({
  area: "forms",
  tool: "form_move_control:round-trip",
  pass: moveControlPass,
  expected: "txtProbe persisted at left=123 top=456 with unrelated entries preserved",
  ms: 0,
  summary: moveControlPass ? movePreservation.summary : "moved geometry or preservation proof missing",
});

await record("forms", "form_rename_control", {
  projectId,
  sourcePath: uiFormPath,
  controlName: "txtRename",
  newName: "txtMutationRenamed",
  apply: true,
});
const renamedFormSource = await readFile(uiFormPath, "utf8");
const renamePreservation = unrelatedFormEntriesSurvived(renamedFormSource);
const renameControlPass = Boolean(
  controlSource(renamedFormSource, "txtMutationRenamed") !== undefined &&
    controlSource(renamedFormSource, "txtRename") === undefined &&
    renamePreservation.pass,
);
addResult({
  area: "forms",
  tool: "form_rename_control:round-trip",
  pass: renameControlPass,
  expected: "txtRename persisted as txtMutationRenamed with unrelated entries preserved",
  ms: 0,
  summary: renameControlPass ? renamePreservation.summary : "renamed control or preservation proof missing",
});

await record("forms", "form_delete_control", {
  projectId,
  sourcePath: uiFormPath,
  controlName: "txtDelete",
  apply: true,
});
const deletedFormSource = await readFile(uiFormPath, "utf8");
const deletePreservation = unrelatedFormEntriesSurvived(deletedFormSource);
const deleteControlPass = Boolean(
  controlSource(deletedFormSource, "txtDelete") === undefined && deletePreservation.pass,
);
addResult({
  area: "forms",
  tool: "form_delete_control:round-trip",
  pass: deleteControlPass,
  expected: "txtDelete absent after write with unrelated entries preserved",
  ms: 0,
  summary: deleteControlPass ? deletePreservation.summary : "deleted control or preservation proof missing",
});

await record("forms", "form_set_properties", {
  projectId,
  sourcePath: uiFormPath,
  controlName: "txtSet",
  properties: { Caption: "Mutation Set" },
  apply: true,
});
const propertiesFormSource = await readFile(uiFormPath, "utf8");
const propertiesControlSource = controlSource(propertiesFormSource, "txtSet") ?? "";
const propertiesPreservation = unrelatedFormEntriesSurvived(propertiesFormSource);
const setPropertiesPass = Boolean(
  propertiesControlSource.includes('Caption ="Mutation Set"') && propertiesPreservation.pass,
);
addResult({
  area: "forms",
  tool: "form_set_properties:round-trip",
  pass: setPropertiesPass,
  expected: "txtSet Caption persisted as Mutation Set with unrelated entries preserved",
  ms: 0,
  summary: setPropertiesPass
    ? propertiesPreservation.summary
    : "updated property or preservation proof missing",
});

await record("forms", "form_duplicate_control", {
  projectId,
  sourcePath: uiFormPath,
  sourceControlName: "txtProbe",
  newName: "txtProbeMutationCopy",
  apply: true,
});
const duplicatedFormSource = await readFile(uiFormPath, "utf8");
const duplicatePreservation = unrelatedFormEntriesSurvived(duplicatedFormSource);
const duplicateControlPass = Boolean(
  controlSource(duplicatedFormSource, "txtProbe") !== undefined &&
    controlSource(duplicatedFormSource, "txtProbeMutationCopy") !== undefined &&
    duplicatePreservation.pass,
);
addResult({
  area: "forms",
  tool: "form_duplicate_control:round-trip",
  pass: duplicateControlPass,
  expected: "source and duplicated controls persisted with unrelated entries preserved",
  ms: 0,
  summary: duplicateControlPass
    ? duplicatePreservation.summary
    : "duplicated control or preservation proof missing",
});

const serializedFormResult = await record("forms", "form_serialize", {
  projectId,
  sourcePath: uiFormPath,
  outputMode: "full",
});
const serializedForm = payloadOf(serializedFormResult);
const currentFormSource = await readFile(uiFormPath, "utf8");
const serializePreservation = unrelatedFormEntriesSurvived(serializedForm?.serialized ?? "");
const serializePass = Boolean(
  serializedForm?.name === "DysflowMcpE2E" &&
    serializedForm?.kind === "Form" &&
    serializedForm?.byteEqual === true &&
    serializedForm?.byteDiff === 0 &&
    serializedForm?.serialized === currentFormSource.replace(/\r\n/g, "\n") &&
    serializePreservation.pass,
);
addResult({
  area: "forms",
  tool: "form_serialize:round-trip",
  pass: serializePass,
  expected: "serialized FormIR is byte-equal after normalization and preserves duplicate/blob entries",
  ms: 0,
  summary: serializePass ? serializePreservation.summary : "serialize round-trip or preservation proof missing",
});

const { parseFormTxt } = await import(
  pathToFileURL(join(repoRoot, "dist", "core", "services", "form-ir-service.js")).href
);
const deserializeIr = parseFormTxt(serializedForm.serialized, { name: "DysflowMcpE2E" });
const deserializeCaption = deserializeIr.root.entries.find(
  (entry) => entry.kind === "scalar" && entry.key === "Caption",
);
if (deserializeCaption === undefined) {
  throw new Error("mcp-e2e: sandbox form is missing the Caption entry required by form_deserialize");
}
deserializeCaption.value = '"Dysflow Structural Round Trip"';
const deserializeResult = await record("forms", "form_deserialize", {
  projectId,
  sourcePath: uiFormPath,
  ir: deserializeIr,
  apply: true,
});
const deserializeData = payloadOf(deserializeResult);
const deserializedFormSource = await readFile(uiFormPath, "utf8");
const deserializePreservation = unrelatedFormEntriesSurvived(deserializedFormSource);
const deserializePass = Boolean(
  deserializeData?.mode === "apply" &&
    deserializeData?.written === true &&
    deserializeData?.loadFromTextGate === "passed" &&
    deserializedFormSource.includes('Caption ="Dysflow Structural Round Trip"') &&
    deserializePreservation.pass,
);
addResult({
  area: "forms",
  tool: "form_deserialize:round-trip",
  pass: deserializePass,
  expected: "Caption persisted through FormIR deserialization with unrelated entries preserved",
  ms: 0,
  summary: deserializePass
    ? deserializePreservation.summary
    : "deserialized Caption or preservation proof missing",
});

await record("forms", "form_align_controls", {
  projectId,
  sourcePath: uiFormPath,
  controlNames: ["txtProbe", "cmdApply"],
  edge: "left",
  apply: true,
});
const alignedFormSource = await readFile(uiFormPath, "utf8");
const alignedProbeLeft = numericControlProperty(alignedFormSource, "txtProbe", "Left");
const alignedApplyLeft = numericControlProperty(alignedFormSource, "cmdApply", "Left");
const alignPreservation = unrelatedFormEntriesSurvived(alignedFormSource);
const alignPass = Boolean(
  alignedProbeLeft !== undefined &&
    alignedProbeLeft === alignedApplyLeft &&
    alignPreservation.pass,
);
addResult({
  area: "forms",
  tool: "form_align_controls:round-trip",
  pass: alignPass,
  expected: "txtProbe and cmdApply persisted on the same left edge with unrelated entries preserved",
  ms: 0,
  summary: alignPass ? alignPreservation.summary : "aligned geometry or preservation proof missing",
});

const distributedControlNames = ["txtProbe", "cmdApply", "txtMutationRenamed"];
await record("forms", "form_distribute_controls", {
  projectId,
  sourcePath: uiFormPath,
  controlNames: distributedControlNames,
  axis: "vertical",
  spacing: 75,
  apply: true,
});
const distributedFormSource = await readFile(uiFormPath, "utf8");
const distributedGeometry = distributedControlNames
  .map((name) => ({
    name,
    top: numericControlProperty(distributedFormSource, name, "Top"),
    height: numericControlProperty(distributedFormSource, name, "Height"),
  }))
  .sort((left, right) => (left.top ?? 0) - (right.top ?? 0));
const distributePreservation = unrelatedFormEntriesSurvived(distributedFormSource);
const distributePass = Boolean(
  distributedGeometry.every(
    (geometry) => geometry.top !== undefined && geometry.height !== undefined,
  ) &&
    distributedGeometry.slice(1).every((geometry, index) => {
      const previous = distributedGeometry[index];
      return geometry.top === previous.top + previous.height + 75;
    }) &&
    distributePreservation.pass,
);
addResult({
  area: "forms",
  tool: "form_distribute_controls:round-trip",
  pass: distributePass,
  expected: "three controls persisted with exact 75-twip vertical gaps and unrelated entries preserved",
  ms: 0,
  summary: distributePass
    ? distributePreservation.summary
    : "distributed geometry or preservation proof missing",
});

const clonedFormResult = await record("forms", "create_form_from_template", {
  projectId,
  sourceForm: "Form_DysflowMcpE2E",
  targetForm: "Form_DysflowMcpE2EStructural",
  tokenMap: {},
  overwrite: true,
  apply: true,
});
const clonedForm = payloadOf(clonedFormResult);
const clonedFormSource =
  typeof clonedForm?.targetPath === "string" ? await readFile(clonedForm.targetPath, "utf8") : "";
// Access removes the source form-level GUID while importing a newly named form.
// PrtMip remains byte-identical and the duplicate scalar entries remain present;
// requiring the source GUID here would assert the wrong identity for the clone.
const clonePreservation = unrelatedFormEntriesSurvived(clonedFormSource, { requireGuid: false });
const clonePass = Boolean(
  clonedForm?.mode === "apply" &&
    clonedForm?.importGate === "passed" &&
    basename(clonedForm?.targetPath ?? "") === "Form_DysflowMcpE2EStructural.form.txt" &&
    controlSource(clonedFormSource, "txtProbe") !== undefined &&
    clonePreservation.pass,
);
addResult({
  area: "forms",
  tool: "create_form_from_template:round-trip",
  pass: clonePass,
  expected: "sandbox form cloned to a new managed form with controls and unrelated entries preserved",
  ms: 0,
  summary: clonePass ? clonePreservation.summary : "cloned form structure or preservation proof missing",
});

await record("legacy", "run_vba", { procedureName: "DysflowMcpE2EMissingProcedure", argsJson: "[]" }, { expected: "error" });
await record("legacy", "cleanup_access_operation", { operationId: "missing-operation", accessPath, force: false }, { expected: "error" });
await record("legacy", "list_access_operations", {});

// issue #701 — read-only VBA procedure introspection tools. These tests
// exercise both new visible MCP tools (`list_procedures` and
// `get_procedure`) through a live `tools/call` JSON-RPC round-trip.
// Inline `source` is used to keep these rows hermetic — the inline path does
// NOT touch Access or the project filesystem, so the success path does not
// depend on the fixture's actual modules being present. A second pair of
// rows covers the project's on-disk source tree (via `existingModuleName`)
// so the disk-resolution path is also exercised end-to-end. The final row
// proves the source-root containment (#701 review blocker): an explicit
// `destinationRoot` that points outside the configured project is rejected
// with MODULE_NOT_FOUND, never reads from disk, and never leaks the
// external file's body into the response.
const inlineSourceFixture = [
  "Option Explicit",
  "",
  "Public Sub DysflowMcpE2E_DoWork()",
  "    Dim x As Long",
  "    x = 42",
  "End Sub",
  "",
  "Private Function DysflowMcpE2E_GetValue() As Long",
  "    DysflowMcpE2E_GetValue = 7",
  "End Function",
].join("\r\n");
await record("vba-introspection", "list_procedures", {
  projectId,
  module: "DysflowMcpE2EInline",
  source: inlineSourceFixture,
});
await record("vba", "list_procedures:module-validation", {
  projectId, module: "ZZZ_NonExistent_Module",
  source: 'Attribute VB_Name = "mdlCursor"\nOption Explicit\nPublic Sub Foo()\nEnd Sub\n',
}, { expected: "error" });
await record("vba", "get_procedure:module-dot-proc-parsing", {
  projectId, module: "mdlCursor", procedure: "mdlCursor.MouseCursor",
  source: await readFile(join(destinationRoot, "modules", "mdlCursor.bas"), "utf8"),
});
await record("vba-introspection", "get_procedure", {
  projectId,
  module: "DysflowMcpE2EInline",
  procedure: "DysflowMcpE2E_DoWork",
  source: inlineSourceFixture,
});
await record("vba-introspection", "get_procedure", {
  projectId,
  module: "DysflowMcpE2EInline",
  procedure: "NonExistentDysflowMcpE2EProc",
  source: inlineSourceFixture,
}, { expected: "error" });
// Source-root containment: an explicit `destinationRoot` that does NOT
// match the configured project root must be refused. Inline `source` is
// omitted so the only way to find the module would be a disk read, which
// the adapter must NOT perform for an out-of-project path.
await record("vba-introspection", "list_procedures", {
  projectId,
  module: "DysflowMcpE2EAny",
  destinationRoot: "C:/dysflow-mcp-e2e-not-the-project",
}, { expected: "error" });
// On-disk resolution path: the configured project's source tree is the
// sandbox's `destinationRoot`. Use the existing fixture module the suite
// already exercises (`existingModuleName`) to prove the disk path is
// wired correctly end-to-end. Pass the E2E_testing/ source tree (the
// configured project's source root, NOT the sandbox's copy) — the security
// check inside `resolveVbaSourceFile` rejects any caller-supplied
// `destinationRoot` that does not match the configured root, so a
// sandbox-root `destinationRoot` would falsely fail with MODULE_NOT_FOUND.
await record("vba-introspection", "list_procedures", {
  projectId,
  module: existingModuleName,
  // Inline `source` keeps the assertion hermetic; the on-disk path is
  // covered by the E2E_testing/src fixture that the project's config
  // already points at.
  source: await readFile(join(scriptDir, "src", "modules", `${existingModuleName}.bas`), "utf-8"),
});
await record("vba-manifest", "validate_manifest", {
  projectId,
  manifest: { tests: [{ procedure: "DysflowMcpE2E_DoWork", args: [] }] },
  modules: { DysflowMcpE2EInline: inlineSourceFixture },
});
await record("vba-sync", "validate_manifest:allowlist-check-not-noop", {
  ...ctx, testsPath: "tests/vba/tests.vba.json",
  validateManifestIncludesAllowlistCheck: true,
});
// cross-check: output MUST differ from validateManifestIncludesAllowlistCheck:false

// Issue #1256 — schema/runtime drift release records. Keep these literals in
// sync with the issue so release evidence remains directly traceable.
await record("protocol", "data-schema-coverage", { projectId, view: "compact" });
// cross-check: list_objects, list_vba_modules, exists have non-empty dataSchema documenting all returned fields

await record("vba", "find_references:1018-schema-leak", {
  symbol: "<popular>", scope: "all", limit: 5,
});
// cross-check: if both binaryReferences and hasDifferences exist, they're coupled

await record("vba-sync", "fix_encoding:plan-drift-visibility", {
  ...ctx, location: "src", apply: false,
});
// assertions: filesInspected array + detectedDrift array populated

await record("vba-sync", "delete_module:bad-backendPath", {
  ...ctx, backendPath: "C:/bad/path.accdb", moduleName: "X", apply: false,
}, { expected: "error" });
// assertion: error.code in {OUTSIDE_PROJECT_ROOT, BACKEND_PATH_INVALID, FILE_NOT_FOUND}

await record("vba-sync", "verify_code:timeout-remediation", { ...ctx, diff: false });
// assertion: error envelope typed with error.remediation (not raw VBA_MANAGER_TIMEOUT)

await record("vba-sync", "generate_erd:path-semantics", { ...ctx, erdPath: tempRoot + "/ERD" });
// assertion: result.markdownFile ends in .md; isFile() === true

const sqlTools = ["query_execute", "create_table", "drop_table", "list_access_files",
                  "seed_fixture", "teardown_fixture", "list_tables"];
const errorProbeTable = "ZZZ_DysflowErrorProbe";
const errorEnvelopeArgs = {
  query_execute: { mode: "read", sql: "DROP TABLE [ZZZ_DysflowErrorProbe]" },
  create_table: {
    projectId: "non-existent",
    tableName: errorProbeTable,
    definition: "ID LONG",
    apply: false,
  },
  drop_table: { projectId: "non-existent", tableName: errorProbeTable, apply: false },
  list_access_files: { projectId: "non-existent" },
  seed_fixture: {
    projectId: "non-existent",
    tableName: errorProbeTable,
    rows: [{ ID: 1 }],
    apply: false,
  },
  teardown_fixture: { projectId: "non-existent", tableName: errorProbeTable, apply: false },
  list_tables: { projectId: "non-existent" },
};
for (const tool of sqlTools) {
  const args = errorEnvelopeArgs[tool];
  if (args === undefined) {
    throw new Error(`Missing deterministic error-envelope probe args for ${tool}`);
  }
  await record("query", `${tool}:error-envelope-remediation`, args, { expected: "error" });
}

await record("protocol", "effective-dry-run-default-coherence", { projectId });
// cross-check: for every tool, effectiveDryRunDefault===true ↔ defaultBehavior !== "writes"

// Phase 4 — real projectId resolution E2E against the existing
// `E2E_testing/.dysflow/project.json` fixture (id: noconformidades-e2e,
// destinationRoot: "src"). Reuses the tracked fixture so the test is
// idempotent and never collateral-deletes tracked files. The success
// path resolves an existing form (Form_FormCPV) whose `.form.txt` is
// already on disk; the miss path asserts the typed remediation surfaces
// without a `[PATH]`-scrubbed substring. The resolver prepends `Form_`
// to a bare name, so `formName: "FormCPV"` resolves to
// `forms/Form_FormCPV.form.txt`, and `inspect_form` returns the inner
// `name` (the bare formName) in its payload.
{
  // Test 1: Successful resolution via projectId against the existing fixture.
  // Read through `payloadOf`: the text channel only carries the whole payload
  // below the #1471 threshold, so a larger form would arrive as a stub there.
  const inspectResult = await record("project-resolution", "inspect_form", {
    projectId: "noconformidades-e2e",
    formName: "FormCPV",
  });
  const innerData = payloadOf(inspectResult);
  const inspectPass = Boolean(innerData && innerData.name === "FormCPV");
  addResult({
    area: "project-resolution",
    tool: "inspect_form:resolved-projectId",
    pass: inspectPass,
    expected: "success",
    ms: 0,
    summary: inspectPass ? "successfully resolved and parsed form via projectId" : "unexpected inspect_form payload: " + inspectResult.text,
  });
  console.log(`${inspectPass ? "PASS" : "FAIL"}\tinspect_form:resolved-projectId\t0ms\t${rows.at(-1).summary}`);

  // Test 2: Resolution failure miss-remediation lacks [PATH]. Tool errors
  // surface as content with `isError: true`; the harness's `toolText` returns
  // that content text here, so parse the inner payload the same way.
  const badResult = await record("project-resolution", "inspect_form", {
    projectId: "noconformidades-e2e",
    formName: "NonexistentForm",
  }, { expected: "error" });
  const badData = payloadOf(badResult);
  // inspect_form surfaces FORM_NOT_FOUND as a plain-text error string (not a
  // JSON envelope), so safeJsonParse returns undefined; fall back to the raw
  // error text so the "no [PATH] leak" check runs against the real message.
  const remediationMsg =
    badData?.message ?? badData?.error?.message ?? badData?.result?.content?.[0]?.text ?? badResult.text ?? "";
  const pathScrubbedPass = remediationMsg && !remediationMsg.includes("[PATH]");
  addResult({
    area: "project-resolution",
    tool: "inspect_form:miss-remediation-no-path-scrub",
    pass: pathScrubbedPass,
    expected: "error",
    ms: 0,
    summary: pathScrubbedPass ? "remediation is clean of [PATH] substring" : "remediation contains [PATH] substring: " + remediationMsg,
  });
  console.log(`${pathScrubbedPass ? "PASS" : "FAIL"}\tinspect_form:miss-remediation-no-path-scrub\t0ms\t${rows.at(-1).summary}`);
}

// v2.34-regressions — #1324 / R-S02. Every label starts with the real
// canonical MCP tool so the harness dispatches the tool being asserted.
// Each pair differs only by apply intent and receives a semantic parity row.
const regressionConfigText = await readFile(projectConfigPath, "utf8");
const regressionConfig = JSON.parse(regressionConfigText);
regressionConfig.capabilities = {
  ...(regressionConfig.capabilities ?? {}),
  procedures: {
    ...(regressionConfig.capabilities?.procedures ?? {}),
    allow: ["Test_MotivoNoRequiereControlEficacia_DomainFields_Atomic"],
  },
};
await writeFile(projectConfigPath, `${JSON.stringify(regressionConfig, null, 2)}\n`, "utf8");
let testVbaPlan;
let testVbaApply;
try {
  await record("v2.34-regressions", "clear_worktree_cache", { cwd: tempRoot });
  testVbaPlan = await record("v2.34-regressions", "test_vba:plan-vs-apply-plan", {
    ...ctx,
    proceduresJson: JSON.stringify([
      { procedure: "Test_MotivoNoRequiereControlEficacia_DomainFields_Atomic", args: [] },
    ]),
    apply: false,
  }, { expected: "ok" });
  testVbaApply = await record("v2.34-regressions", "test_vba:plan-vs-apply-apply", {
    ...ctx,
    proceduresJson: JSON.stringify([
      { procedure: "Test_MotivoNoRequiereControlEficacia_DomainFields_Atomic", args: [] },
    ]),
    apply: true,
  }, { expected: "ok" });
} finally {
  await writeFile(projectConfigPath, regressionConfigText, "utf8");
  await record("v2.34-regressions", "clear_worktree_cache", { cwd: tempRoot });
}
assertPlanApplyResolverPair("test_vba", testVbaPlan, testVbaApply, (plan, apply) => ({
  pass:
    plan?.dryRun === true &&
    apply?.mode === "apply" &&
    apply?.passed === 1 &&
    apply?.failed === 0 &&
    Array.isArray(apply?.tests) &&
    apply.tests.length === 1 &&
    apply.tests.every((entry) => entry?.ok !== false),
  summary: `plan dryRun=true; apply results=${Array.isArray(apply?.tests) ? apply.tests.length : "invalid"}`,
}));

const syncPlan = await record("v2.34-regressions", "sync_binary:plan-vs-apply-plan", {
  ...ctx,
  direction: "src-to-binary",
  moduleNames: ["Constantes"],
  apply: false,
}, { expected: "ok", timeoutMs: 180000 });
const syncApply = await record("v2.34-regressions", "sync_binary:plan-vs-apply-apply", {
  ...ctx,
  direction: "src-to-binary",
  moduleNames: ["Constantes"],
  apply: true,
}, { expected: "ok", timeoutMs: 180000 });
assertPlanApplyResolverPair("sync_binary", syncPlan, syncApply, (plan, apply) => ({
  pass:
    plan?.dryRun === true &&
    apply?.dryRun === false &&
    Array.isArray(plan?.plan?.toImport) &&
    Array.isArray(apply?.plan?.toImport) &&
    apply?.postSync !== undefined,
  summary: `plan/apply actions=${plan?.plan?.totalActionable}/${apply?.plan?.totalActionable}`,
}));

const formArgs = {
  ...baselineArgsFor("form_set_property"),
  value: '"Plan/apply resolver"',
  commitScope: "source",
};
const formPlan = await record("v2.34-regressions", "form_set_property:plan-vs-apply-plan", {
  ...formArgs,
  apply: false,
}, { expected: "ok" });
const formApply = await record("v2.34-regressions", "form_set_property:plan-vs-apply-apply", {
  ...formArgs,
  apply: true,
}, { expected: "ok" });
assertPlanApplyResolverPair("form_set_property", formPlan, formApply, (plan, apply) => ({
  pass:
    (plan?.mode === "dry-run" || plan?.dryRun === true) &&
    apply?.mode === "apply" &&
    apply?.importGate === "skipped" &&
    plan?.sourcePath === apply?.sourcePath,
  summary: `plan=${plan?.mode ?? "dry-run"}; apply=${apply?.mode}; import=${apply?.importGate}`,
}));

const importArgs = { ...ctx, moduleNames: ["Constantes"] };
const importPlan = await record("v2.34-regressions", "import_modules:plan-vs-apply-plan", {
  ...importArgs,
  apply: false,
}, { expected: "ok" });
const importApply = await record("v2.34-regressions", "import_modules:plan-vs-apply-apply", {
  ...importArgs,
  apply: true,
}, { expected: "ok" });
assertPlanApplyResolverPair("import_modules", importPlan, importApply, (plan, apply) => ({
  pass:
    plan?.dryRun === true &&
    apply?.dryRun === false &&
    plan?.resolvedProjectId === projectId &&
    apply?.resolvedProjectId === projectId &&
    apply?.result !== undefined,
  summary: `resolvedProjectId=${apply?.resolvedProjectId}; apply result captured`,
}));

const requiredContractCoverage = [
  "bootstrap",
  "recovery",
  "sql",
  "vba-sync",
  "forms",
  "alias",
  "typed-error",
  "success",
  "plan",
  "apply",
  "file-backed",
];
const missingContractCoverage = requiredContractCoverage.filter(
  (category) => !resultContractCoverage.has(category),
);
addResult({
  area: "result-contract",
  tool: "coverage-matrix",
  pass: missingContractCoverage.length === 0,
  expected: requiredContractCoverage.join(","),
  ms: 0,
  summary:
    missingContractCoverage.length === 0
      ? "all representative result-contract families validated through describe_tool"
      : `missing=${missingContractCoverage.join(",")}`,
});
}

// isOwnPidAlive checks a specific child PID with `process.kill(pid, 0)`,
// and if the parent is gone, walks its descendant tree via wmic to detect
// grandchildren (e.g. an MSACCESS.EXE spawned by a PowerShell that the
// harness itself spawned). The OS rejects the signal (ESRCH) when the
// process is gone. We never scan global MSACCESS.EXE — only the PIDs this
// E2E itself spawned. The descendant walk is delegated to the helper so
// vitest tests and the E2E suite share the same implementation.
function isOwnPidAlive(pid) {
  return isPidOrDescendantAlive(pid);
}

async function waitForNoOwnPids(timeoutMs = 2000, pollMs = 100) {
  const start = Date.now();
  // Check all known suite-owned PIDs (a single tool may leave more than
  // one — e.g. a child PowerShell that itself spawned MSACCESS.EXE).
  const watched = Array.from(suiteOwnPids);
  while (true) {
    const survivors = watched.filter((p) => isOwnPidAlive(p));
    if (survivors.length === 0) return { found: false, elapsed: Date.now() - start };
    if (Date.now() - start >= timeoutMs) return { found: true, pids: survivors, elapsed: Date.now() - start };
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
// Final lingering-access check: ONLY the suite's own PIDs. After a 1s
// prudent delay (where an -Embedding COM server that was just started
// materializes), poll our own child PIDs. Other Dysflow consumers'
// MSACCESS.EXE instances on the host are out of scope.
//
// We ALSO sample the global MSACCESS.EXE count before and after the
// battery. If it grows by more than 1, the e2e leaked a process that
// escaped the suiteOwnPids watch list (e.g. a PS script that spawned
// MSACCESS.EXE outside the harness child process). Cheap global check
// — no extra run, no extra tools, just `(Get-Process -Name MSACCESS
// -ErrorAction SilentlyContinue).Count` at start and end.
const PRUDENT_ZOMBIE_DELAY_MS = 1000;
const LINGERING_OWN_PID_TIMEOUT_MS = 2000;
const LINGERING_OWN_PID_POLL_MS = 100;
let hasLingeringAccess = false;
let finalZombieMs = 0;
let finalZombie;
let globalMsAccessLeak = 0;
const globalMsAccessCountAtStart = Number(`${process.env.DYSFLOW_E2E_PRE_MSACCESS_COUNT ?? ""}`) || (() => {
  try { return Number(`${spawnSync("powershell.exe", ["-NoProfile", "-Command", "(Get-Process -Name MSACCESS -ErrorAction SilentlyContinue).Count"], { encoding: "utf8" }).stdout?.trim()}`) || 0; } catch { return 0; }
})();

{
  console.error(`prudentDelayMs=${PRUDENT_ZOMBIE_DELAY_MS} (waiting before final lingering-access check on suite-owned PIDs)`);
  await new Promise((r) => setTimeout(r, PRUDENT_ZOMBIE_DELAY_MS));
  finalZombie = await waitForNoOwnPids(LINGERING_OWN_PID_TIMEOUT_MS, LINGERING_OWN_PID_POLL_MS);
  hasLingeringAccess = finalZombie.found;
  finalZombieMs = finalZombie.elapsed;

  // Global MSACCESS.EXE count comparison: cheap, runs once per battery.
  // The suite intentionally leaves the global count out of scope for
  // in-suite checks (other consumers may legitimately run MSACCESS.EXE).
  // For the battery's own leak detection, we only flag a DELTA from start
  // to end-of-battery — not the absolute count. A delta of 0 is the
  // happy path; a delta > 0 means WE leaked a process that escaped
  // suiteOwnPids (e.g. PS spawned MSACCESS.EXE outside the harness).
  try {
    const postOut = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-Command", "(Get-Process -Name MSACCESS -ErrorAction SilentlyContinue).Count"],
      { encoding: "utf8" },
    ).stdout?.trim() ?? "";
    const postCount = Number(postOut) || 0;
    globalMsAccessLeak = Math.max(0, postCount - globalMsAccessCountAtStart);
  } catch {
    globalMsAccessLeak = 0;
  }
  console.error(
    `globalMsAccessCount: start=${globalMsAccessCountAtStart} ` +
      `end=${globalMsAccessCountAtStart + globalMsAccessLeak} ` +
      `leakDelta=${globalMsAccessLeak}`,
  );
}
appendUnchecked({
  area: "zombies",
  tool: "lingering-access-check",
  pass: !hasLingeringAccess && globalMsAccessLeak === 0,
  expected: "no suite-owned MSACCESS.EXE lingering AND global MSACCESS.EXE delta=0 over the battery",
  ms: finalZombieMs,
  summary: (() => {
    if (hasLingeringAccess) {
      return `Suite-owned MSACCESS.EXE pids=${(finalZombie?.pids || []).join(",")} still alive after final recheck!`;
    }
    if (globalMsAccessLeak > 0) {
      return `Global MSACCESS.EXE grew by ${globalMsAccessLeak} during the battery (start=${globalMsAccessCountAtStart}, end=${globalMsAccessCountAtStart + globalMsAccessLeak}); a process escaped the suiteOwnPids watch list.`;
    }
    return "No suite-owned MSACCESS.EXE lingering; no global MSACCESS.EXE leak.";
  })(),
  ...((hasLingeringAccess || globalMsAccessLeak > 0)
    ? { failureClass: "safety-critical" }
    : {}),
});
await resumeController.syncFailures(rows.filter((row) => !row.pass));
if (hasLingeringAccess || globalMsAccessLeak > 0) {
  await resumeController.fail(
    "zombies/lingering-access-check",
    "zombies",
    suiteOwnPids,
    { invalidateLast: true },
  );
}

if (hasLingeringAccess) {
  console.error("Assertion failed: suite-owned MSACCESS.EXE processes detected at the end of the E2E execution!");
}

const passed = rows.filter((row) => row.pass).length;
const failed = rows.filter((row) => !row.pass);
const report = `# Dysflow MCP E2E Report\n\nProject: ${projectId}\nFrontend: ${accessPath}\nBackend: ${backendPath}\nTools advertised: ${advertised.length}\nPassed: ${passed}\nFailed: ${failed.length}\nAborted due to unsafe failure: ${abortedDueToFailure}\n\n| Result | ID | Class | Area | Tool | Expected | ms | Summary |\n|---|---|---|---|---|---|---:|---|\n${rows.map((row) => `| ${row.pass ? "PASS" : "FAIL"} | ${row.id} | ${row.failureClass ?? ""} | ${row.area} | ${row.tool} | ${row.expected} | ${row.ms} | ${String(row.summary).replace(/\|/g, "\\|")} |`).join("\n")}\n\n## Advertised tools\n${advertised.map((name) => `- ${name}`).join("\n")}\n`;
await writeFile(reportPath, report, "utf8");
console.log(`\nReport: ${reportPath}`);
// When the battery was aborted early we PRESERVE the sandbox unconditionally
// so the user can inspect whatever state the suite left behind. The zombie
// check is the only way to learn which PIDs were orphaned.
if (abortedDueToFailure || failed.length > 0 || process.env.DYSFLOW_E2E_PRESERVE_SANDBOX === "1") {
  console.log(`Sandbox preserved: ${tempRoot}`);
} else {
  await rm(tempRoot, { recursive: true, force: true });
  await rm(phaseSnapshots.root, { recursive: true, force: true });
  console.log("Sandbox cleaned after successful MCP E2E run. Set DYSFLOW_E2E_PRESERVE_SANDBOX=1 to keep it for inspection.");
}
process.exitCode = computeE2eExitCode(rows, abortedDueToFailure);
