// E2E_testing/mcp-e2e-issue-869-list-vba-modules-password-env.mjs
//
// End-to-end test for the round-9 fix on issue #869: `list_vba_modules` must
// succeed against a password-protected `.accdb` when the parent process
// exports `ACCESS_VBA_PASSWORD` to the child MCP. The fix derives the
// password as `ACCESS_VBA_PASSWORD` / `DYSFLOW_ACCESS_PASSWORD` in the
// child PowerShell env at the executor seam
// (`src/adapters/vba-sync/vba-sync-adapter.ts:1355-1427`), so the script
// fallback at `scripts/dysflow-vba-manager.ps1:259` resolves
// `$env:ACCESS_VBA_PASSWORD` and `Open-AccessDatabase` at line 5017 accepts
// the protected binary.
//
// Shape mirrors `E2E_testing/mcp-e2e-issue-807-features.mjs`:
//   - Spawn the test-runtime build via `resolveMcpE2eCommand` (refuses the
//     production runtime at `%LOCALAPPDATA%\dysflow` by default).
//   - Parent env MUST carry `ACCESS_VBA_PASSWORD`; the test throws if it is
//     missing — proving the env was forwarded is the whole point of the
//     check, so a silently-masked empty password would make the assertion
//     pass for the wrong reason.
//   - All MCP traffic goes through stdio JSON-RPC; no shortcuts.
//
// AC3 RED/GREEN proof (PR description): running this script against the
// unpatched v2.11.1 dist makes Round 1 fail with `VBA_MANAGER_FAILED` in
// stderr; running it against the patched build makes Round 1 pass with
// `Array.isArray(modules)` and `summary.inBoth + inBinaryOnly + inSourceOnly
// === total`. Round 2 is the round-8 non-regression boundary (AC5).
//
// Environment variables:
//   - ACCESS_VBA_PASSWORD (REQUIRED — script throws if absent; do not
//     silently mask a missing password)
//   - DYSFLOW_E2E_COMMAND (operator override; honored by
//     resolveMcpE2eCommand; default falls back to
//     `<repoRoot>/test-runtime/bin/dysflow.cmd`)
//   - DYSFLOW_E2E_TIMEOUT_MS (default 30000)
//   - DYSFLOW_REQUIRE_ACCESS_E2E=1 — fail instead of skip when the fixture
//     is missing.

import { spawn } from "node:child_process";
import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMcpE2eSandboxPlan, initializeMcpE2eSandbox } from "./_helpers/mcp-e2e-sandbox.mjs";
import { resolveMcpE2eCommand } from "./_helpers/resolve-mcp-e2e-command.mjs";
import { runMcpHarness } from "./_helpers/mcp-harness.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const fixtureAccess = join(scriptDir, "NoConformidades.accdb");
const fixtureBackend = join(scriptDir, "NoConformidades_Datos.accdb");
const fixtureSource = join(scriptDir, "src");
const projectId = "noconformidades-i869-password-env-e2e";
const timeoutMs = Number(process.env.DYSFLOW_E2E_TIMEOUT_MS ?? 30000);
const closeWatchdogMs = Number(process.env.DYSFLOW_E2E_CLOSE_WATCHDOG_MS ?? 5000);
const password = process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD;
const requireAccessE2e = /^(1|true|yes)$/i.test(process.env.DYSFLOW_REQUIRE_ACCESS_E2E ?? "");

function skipOrFail(message) {
  const prefix = requireAccessE2e ? "required fixture missing" : "skipped";
  const output = `[i869-list-vba-modules-password-env] ${prefix}: ${message}`;
  if (requireAccessE2e) {
    console.error(output);
    process.exit(1);
  }
  console.log(output);
  process.exit(0);
}

function toolPayload(message) {
  // #1001: the runMcpHarness wrapper exposes the JSON-RPC payload under
  // `response.result`, not at top-level `result`. Walk the wrapper shape so
  // the test reads the actual JSON envelope (the original code read
  // `message?.result?.content` and silently returned null because the
  // wrapper has no top-level `result`).
  const content = message?.response?.result?.content;
  if (!Array.isArray(content)) return null;
  const text = content.map((item) => item?.text ?? "").join("\n");
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function spawnMcp() {
  const resolvedCommand = resolveMcpE2eCommand({ env: process.env, repoRoot });
  if (!resolvedCommand.ok) {
    skipOrFail(`${resolvedCommand.code}: ${resolvedCommand.message}`);
  }
  // Pin DYSFLOW_HOME to the test-runtime build. The harness MUST NOT touch
  // %LOCALAPPDATA%\dysflow — that is the host's live runtime, and spawning
  // it under E2E mixes the wrong scripts, the wrong DYSFLOW_HOME, and the
  // wrong Update path into the test environment.
  process.env.DYSFLOW_HOME = join(repoRoot, "test-runtime");
  return spawn(resolvedCommand.command, ["mcp"], {
    cwd: tempRoot,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ACCESS_VBA_PASSWORD: password,
      DYSFLOW_ACCESS_PASSWORD: password,
    },
  });
}

async function callTool(child, requestId, name, args) {
  const result = await runMcpHarness({
    child,
    requestId,
    method: "tools/call",
    params: { name, arguments: { accessPath, destinationRoot, ...args } },
    timeoutMs,
    closeWatchdogMs,
  });
  const payload = toolPayload(result);
  return { result, payload };
}

async function callCapabilities(child) {
  const result = await runMcpHarness({
    child,
    requestId: 2,
    method: "tools/call",
    params: { name: "get_capabilities", arguments: { projectId } },
    timeoutMs,
    closeWatchdogMs,
  });
  return { result, payload: toolPayload(result) };
}

if (process.platform !== "win32") {
  skipOrFail("Windows + Access required.");
}
// Parent-env gate: the test proves the env was forwarded, so a missing
// password would silently mask the regression. Throw rather than skip.
if (!password) {
  console.error(
    "[i869-list-vba-modules-password-env] ACCESS_VBA_PASSWORD is required " +
      "to prove the env was forwarded; refusing to silently mask a missing password.",
  );
  process.exit(2);
}
if (!existsSync(fixtureAccess) || !existsSync(fixtureBackend)) {
  skipOrFail("missing NoConformidades.accdb / NoConformidades_Datos.accdb fixture in E2E_testing/.");
}

const failures = [];
function formatDetail(detail, max = 200) {
  if (detail === undefined) return "(no detail)";
  if (detail === null) return "null";
  try {
    return JSON.stringify(detail).slice(0, max);
  } catch {
    return String(detail).slice(0, max);
  }
}
function expect(label, condition, detail) {
  if (condition) {
    console.log(`  [ok]   ${label}`);
  } else {
    console.error(`  [FAIL] ${label} ${detail !== undefined && detail !== null ? `- ${formatDetail(detail)}` : ""}`);
    failures.push({ label, detail });
  }
}

// #1001: round-trip the fixture through the MCP-owned sandbox so the
// project's `.dysflow/project.json` resolves at `tempRoot`, not up the
// directory tree at `scriptDir` (which would otherwise latch onto the
// stale F16 project.json living in the operator's `$repo/.dysflow/`).
const sandboxPlan = buildMcpE2eSandboxPlan({ scriptDir });
const tempRoot = sandboxPlan.sandbox.root;
const accessPath = sandboxPlan.sandbox.accessPath;
const backendPath = sandboxPlan.sandbox.backendPath;
const destinationRoot = sandboxPlan.sandbox.destinationRoot;

await rm(tempRoot, { recursive: true, force: true });
await initializeMcpE2eSandbox(sandboxPlan, { projectId });
await cp(fixtureAccess, accessPath);
await cp(fixtureBackend, backendPath);
await cp(fixtureSource, destinationRoot, { recursive: true });

{
  const child = spawnMcp();
  try {
    const { result, payload } = await callCapabilities(child);
    const snapshot = payload?.snapshot ?? payload;
    const config = snapshot?.projectConfig;
    const sandboxReady =
      !result.isError &&
      typeof snapshot?.adapterVersion === "string" &&
      typeof snapshot?.toolsVisible === "number" &&
      snapshot?.writesProcess?.enabled === true &&
      snapshot?.writesProject?.allowWrites === true &&
      config?.status === "valid" &&
      config?.writeReady === true &&
      config?.projectId === projectId &&
      typeof config?.projectRoot === "string" &&
      resolve(config.projectRoot).toLowerCase() === resolve(tempRoot).toLowerCase();
    expect("PREFLIGHT.sandbox project config is write-ready and isolated", sandboxReady, snapshot);
    if (!sandboxReady) {
      throw new Error(`Sandbox capability preflight failed. snapshot=${JSON.stringify(snapshot)}`);
    }
  } finally {
    child.kill();
  }
}

console.log("[i869-list-vba-modules-password-env] === Round 1: list_vba_modules happy path ===");

// Round 1 — the AC3 deliverable. On the unpatched v2.11.1 dist the
// executor forwards `env === undefined` to `spawnPowerShellProcess`, so
// `$env:ACCESS_VBA_PASSWORD` is empty in the child process and
// `Open-AccessDatabase` at scripts/dysflow-vba-manager.ps1:5017 rejects
// the protected binary with `VBA_MANAGER_FAILED: No es una contraseña
// válida`. The round-9 fix derives the env at the executor seam
// (vba-sync-adapter.ts:1413-1426), so this round goes green.
{
  const child = spawnMcp();
  try {
    const { result, payload } = await callTool(child, 2, "list_vba_modules", {});
    expect(
      "R1.MCP response completed successfully",
      result.timedOut === false && result.isError === false && result.response !== null,
      { exit: result.exit, timedOut: result.timedOut, text: result.text, stderrTail: result.stderr.slice(-2000) },
    );
    expect("R1.payload parses", payload !== null, payload?.error);
    expect("R1.modules is array", Array.isArray(payload?.modules), payload?.modules);
    expect(
      "R1.summary.total === modules.length",
      payload?.summary?.total === payload?.modules?.length,
      { summary: payload?.summary, modulesLength: payload?.modules?.length },
    );
    expect(
      "R1.summary.inBoth + inBinaryOnly + inSourceOnly === total",
      payload?.summary &&
        payload.summary.inBoth + payload.summary.inBinaryOnly + payload.summary.inSourceOnly ===
          payload.summary.total,
      payload?.summary,
    );
    expect(
      "R1.password_env_forwarded_no_VBA_MANAGER_FAILED",
      !String(result.response?.error?.message ?? "").includes("VBA_MANAGER_FAILED"),
      result.response?.error?.message,
    );
  } finally {
    child.kill();
  }
}

console.log("[i869-list-vba-modules-password-env] === Round 2: round-8 non-regression (list_objects) ===");

// Round 2 — AC5 / round-8 reproducer Steps 1-2 (issue #869). `list_objects`
// already worked pre-patch because it goes through `executeMappedTool`
// (vba-sync-adapter.ts:592-595) which sets the env explicitly. This round
// locks the non-regression boundary: the round-9 fix must not perturb the
// sibling tool.
{
  const child = spawnMcp();
  try {
    const { result, payload } = await callTool(child, 3, "list_objects", {});
    expect(
      "R2.MCP response completed successfully",
      result.timedOut === false && result.isError === false && result.response !== null,
      { exit: result.exit, timedOut: result.timedOut, text: result.text, stderrTail: result.stderr.slice(-2000) },
    );
    expect("R2.payload parses", payload !== null, payload?.error);
    const inventoryKeys = ["forms", "reports", "modules", "classes", "documentModules"];
    const inventoryCounts = Object.fromEntries(
      inventoryKeys.map((key) => [key, Array.isArray(payload?.[key]) ? payload[key].length : 0]),
    );
    const inventoryCount = Object.values(inventoryCounts).reduce((total, count) => total + count, 0);
    expect(
      "R2.object inventory is non-empty",
      inventoryCount > 0,
      { inventoryCounts, payload },
    );
    expect(
      "R2.round8_list_objects_still_works",
      !String(result.response?.error?.message ?? "").includes("VBA_MANAGER_FAILED"),
      result.response?.error?.message,
    );
  } finally {
    child.kill();
  }
}

if (failures.length > 0) {
  console.error(
    `\n[i869-list-vba-modules-password-env] ${failures.length} assertion(s) failed.`,
  );
  for (const f of failures) {
    console.error(`  - ${f.label}: ${formatDetail(f.detail)}`);
  }
  process.exit(1);
}

console.log(`\n[i869-list-vba-modules-password-env] all assertions passed.`);
process.exit(0);
