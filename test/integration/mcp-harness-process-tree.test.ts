import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { runMcpHarness } from "../../E2E_testing/_helpers/mcp-harness.mjs";

let fixtureRoot = "";
let fixtureScript = "";
const ownedGrandchildren = new Set<number>();

beforeAll(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "dysflow-harness-tree-"));
  fixtureScript = join(fixtureRoot, "mcp-tree-fixture.cjs");
  await writeFile(
    fixtureScript,
    `const { spawn } = require("node:child_process");
const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  windowsHide: true,
  stdio: "ignore",
});
process.stderr.write("GRANDCHILD_PID=" + grandchild.pid + "\\n");
const mode = process.env.DYSFLOW_HARNESS_FIXTURE_MODE;
if (mode !== "timeout") {
  const response = {
    jsonrpc: "2.0",
    id: 2,
    result: {
      content: [{ type: "text", text: mode === "error" ? "fixture error" : "fixture ok" }],
      isError: mode === "error",
    },
  };
  setTimeout(() => process.stdout.write(JSON.stringify(response) + "\\n"), 50);
}
setInterval(() => {}, 1000);
`,
    "utf8",
  );
});

afterAll(async () => {
  if (fixtureRoot.length > 0) await rm(fixtureRoot, { recursive: true, force: true });
});

afterEach(() => {
  for (const pid of ownedGrandchildren) {
    try {
      process.kill(pid);
    } catch {
      // The harness already retired it.
    }
  }
  ownedGrandchildren.clear();
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntilGone(pid: number): Promise<boolean> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !isAlive(pid);
}

async function runFixture(mode: "success" | "error" | "timeout") {
  const child = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "& $env:DYSFLOW_NODE_EXE $env:DYSFLOW_FIXTURE_SCRIPT",
    ],
    {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        DYSFLOW_HARNESS_FIXTURE_MODE: mode,
        DYSFLOW_NODE_EXE: process.execPath,
        DYSFLOW_FIXTURE_SCRIPT: fixtureScript,
      },
    },
  );
  const result = await runMcpHarness({
    child,
    requestId: 2,
    method: "tools/call",
    params: { name: "fixture", arguments: {} },
    timeoutMs: mode === "timeout" ? 200 : 5_000,
    closeWatchdogMs: 500,
  });
  const match = result.stderr.match(/GRANDCHILD_PID=(\d+)/);
  expect(match, `fixture did not report its owned grandchild: ${result.stderr}`).not.toBeNull();
  const grandchildPid = Number(match?.[1]);
  ownedGrandchildren.add(grandchildPid);
  expect(await waitUntilGone(grandchildPid)).toBe(true);
  ownedGrandchildren.delete(grandchildPid);
  return result;
}

describe.skipIf(process.platform !== "win32")(
  "MCP harness owns its spawned process tree (#1286)",
  () => {
    it.each([
      "success",
      "error",
      "timeout",
    ] as const)("retires the real descendant process on the %s path", async (mode) => {
      const result = await runFixture(mode);
      expect(result.timedOut).toBe(mode === "timeout");
      expect(result.isError).toBe(mode !== "success");
    });
  },
);
