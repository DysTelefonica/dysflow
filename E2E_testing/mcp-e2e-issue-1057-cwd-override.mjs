// E2E_testing/mcp-e2e-issue-1057-cwd-override.mjs
//
// End-to-end test for issue #1057 (Round-15 F10): per-call `cwd` override on
// the project-scoped read tools. One MCP session, started with its factory
// cwd in project A, must be able to target a SIBLING project B by passing
// `cwd` on the call — without restarting the MCP.
//
// Fixture layout (created at runtime INSIDE E2E_testing/, removed on exit):
//
//   E2E_testing/cwd-override-sandbox/
//     project-a/.dysflow/project.json   (id: i1057-project-a)  ← factory cwd
//     project-b/.dysflow/project.json   (id: i1057-project-b)  ← override target
//     not-a-project/                    (no .dysflow)          ← negative case
//
// Rounds (each spawns a fresh test-runtime MCP via the per-call harness):
//   1. resolve_project {}                                → resolves project-a
//      (backwards compat: no override, factory cwd wins).
//   2. resolve_project { projectId: b, cwd: project-b }  → resolves project-b
//      (the override, not the factory cwd, is targeted).
//   3. resolve_project { cwd: not-a-project }            → MCP_INPUT_INVALID
//      with the "not a dysflow project" hint.
//
// No Access, no COM, no password: resolve_project is pure filesystem read.
//
// Environment variables:
//   - DYSFLOW_E2E_COMMAND (operator override; honored by resolveMcpE2eCommand;
//     default falls back to `<repoRoot>/test-runtime/bin/dysflow.cmd`)
//   - DYSFLOW_E2E_TIMEOUT_MS (default 30000)

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMcpE2eCommand } from "./_helpers/resolve-mcp-e2e-command.mjs";
import { runMcpHarness } from "./_helpers/mcp-harness.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const sandboxRoot = join(scriptDir, "cwd-override-sandbox");
const projectA = join(sandboxRoot, "project-a");
const projectB = join(sandboxRoot, "project-b");
const notAProject = join(sandboxRoot, "not-a-project");
const timeoutMs = Number(process.env.DYSFLOW_E2E_TIMEOUT_MS ?? 30000);
const closeWatchdogMs = Number(process.env.DYSFLOW_E2E_CLOSE_WATCHDOG_MS ?? 5000);

const failures = [];
function expect(label, condition, detail) {
  if (condition) {
    console.log(`  [ok]   ${label}`);
  } else {
    const rendered = detail === undefined ? "" : `- ${JSON.stringify(detail)?.slice(0, 300)}`;
    console.error(`  [FAIL] ${label} ${rendered}`);
    failures.push({ label, detail });
  }
}

function writeProjectFixture(dir, id) {
  mkdirSync(join(dir, ".dysflow"), { recursive: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "App.accdb"), "stub-not-a-real-binary");
  writeFileSync(
    join(dir, ".dysflow", "project.json"),
    JSON.stringify({ id, accessPath: "App.accdb", destinationRoot: "src" }, null, 2),
  );
}

function spawnMcp() {
  const resolvedCommand = resolveMcpE2eCommand({ env: process.env, repoRoot });
  if (!resolvedCommand.ok) {
    console.log(`[i1057-cwd-override] skipped: ${resolvedCommand.code}: ${resolvedCommand.message}`);
    process.exit(0);
  }
  process.env.DYSFLOW_HOME = join(repoRoot, "test-runtime");
  // Factory cwd is project A — the whole point is that round 2 escapes it.
  return spawn(resolvedCommand.command, ["mcp"], {
    cwd: projectA,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });
}

function toolPayload(message) {
  const content = message?.response?.result?.content;
  if (!Array.isArray(content)) return null;
  const text = content.map((item) => item?.text ?? "").join("\n");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text.replace(/^[A-Z_]+: /, ""));
  } catch {
    return null;
  }
}

function rawText(message) {
  const content = message?.response?.result?.content;
  if (!Array.isArray(content)) return "";
  return content.map((item) => item?.text ?? "").join("\n");
}

async function callResolveProject(requestId, args) {
  const child = spawnMcp();
  const result = await runMcpHarness({
    child,
    requestId,
    method: "tools/call",
    params: { name: "resolve_project", arguments: args },
    timeoutMs,
    closeWatchdogMs,
  });
  return { result, payload: toolPayload(result), text: rawText(result) };
}

await rm(sandboxRoot, { recursive: true, force: true });
writeProjectFixture(projectA, "i1057-project-a");
writeProjectFixture(projectB, "i1057-project-b");
mkdirSync(notAProject, { recursive: true });

try {
  console.log("[i1057-cwd-override] Round 1 — factory cwd (backwards compat)");
  {
    const { result, payload } = await callResolveProject(2, {});
    expect("round 1 transport ok", !result.timedOut && !result.isError, result.text);
    expect("round 1 resolves the factory project (project-a)", payload?.projectId === "i1057-project-a", payload);
    expect("round 1 outcome resolved", payload?.outcome === "resolved", payload);
  }

  console.log("[i1057-cwd-override] Round 2 — cwd override targets sibling project-b");
  {
    const { result, payload } = await callResolveProject(3, {
      projectId: "i1057-project-b",
      cwd: projectB,
    });
    expect("round 2 transport ok", !result.timedOut && !result.isError, result.text);
    expect("round 2 resolves the OVERRIDE project (project-b)", payload?.projectId === "i1057-project-b", payload);
    expect("round 2 outcome resolved", payload?.outcome === "resolved", payload);
    // The fixture's project.json declares no explicit projectRoot, so the
    // resolver reports projectRoot: null — the authoritative proof of the
    // override is projectConfig.cwd (the directory the diagnostic ran in).
    const cwdReported = String(payload?.projectConfig?.cwd ?? "");
    expect(
      "round 2 diagnostic cwd points at project-b, not the factory cwd",
      cwdReported.replaceAll("\\", "/").includes("project-b"),
      payload,
    );
  }

  console.log("[i1057-cwd-override] Round 3 — non-project cwd is rejected");
  {
    const { text } = await callResolveProject(4, { cwd: notAProject });
    expect("round 3 rejects with MCP_INPUT_INVALID", text.includes("MCP_INPUT_INVALID"), text);
    expect("round 3 carries the 'not a dysflow project' hint", /not a dysflow project/i.test(text), text);
  }
} finally {
  await rm(sandboxRoot, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`[i1057-cwd-override] FAILED — ${failures.length} assertion(s) failed.`);
  process.exit(1);
}
console.log("[i1057-cwd-override] PASS — cwd override verified end-to-end.");
