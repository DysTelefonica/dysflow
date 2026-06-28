// Vitest quality gate for the MCP E2E command resolution wiring (#582).
// Reads E2E_testing/mcp-e2e.mjs as text and asserts:
//   1. The legacy hard-coded default `%LOCALAPPDATA%\dysflow\bin\dysflow.cmd`
//      is NOT used as the resolved command.
//   2. The harness imports and uses the resolveMcpE2eCommand helper.
//   3. The harness exits with code 1 when the helper returns ok: false.
//   4. The harness uses the helper's resolved command in the spawn call.
//   5. The harness sets DYSFLOW_HOME to the repo test-runtime AFTER resolving
//      the helper (so the production install can never be inherited).

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const E2E_SCRIPT = "E2E_testing/mcp-e2e.mjs";
const HELPER = "E2E_testing/_helpers/resolve-mcp-e2e-command.mjs";

function readE2E(): string {
  return readFileSync(E2E_SCRIPT, "utf8");
}

describe("MCP E2E command resolution wiring (#582)", () => {
  it("mcp-e2e.mjs imports the resolveMcpE2eCommand helper", () => {
    const text = readE2E();
    expect(text).toMatch(
      /import\s*\{[^}]*resolveMcpE2eCommand[^}]*\}\s*from\s*["']\.\/_helpers\/resolve-mcp-e2e-command\.mjs["']/,
    );
  });

  it("the helper module exists on disk", () => {
    expect(existsSync(HELPER), `${HELPER} must exist so the harness can import it`).toBe(true);
  });

  it("mcp-e2e.mjs does NOT hard-code %LOCALAPPDATA%\\dysflow as a default command", () => {
    const text = readE2E();
    // The legacy pattern was a `??` default that resolved to the production
    // install. The new code must go through the helper.
    expect(text).not.toMatch(
      /DYSFLOW_E2E_COMMAND\s*\?\?\s*join\([^)]*LOCALAPPDATA[^)]*["']dysflow["']/,
    );
  });

  it("mcp-e2e.mjs aborts with exit 1 when the helper refuses the command", () => {
    const text = readE2E();
    // The harness must exit before any spawn if the helper refuses.
    expect(text).toMatch(/resolvedCommand\.ok\s*\)[\s\S]{0,200}?process\.exit\(1\)/);
  });

  it("mcp-e2e.mjs uses the helper's resolved command in the spawn call", () => {
    const text = readE2E();
    // The spawn() call must use the helper output, not the legacy default.
    expect(text).toMatch(/cliCommand\s*=\s*resolvedCommand\.command/);
    // And the spawn must use cliCommand (not the legacy default).
    expect(text).toMatch(/spawn\(\s*cliCommand/);
  });

  it("mcp-e2e.mjs sets DYSFLOW_HOME to the repo test-runtime after the helper resolves", () => {
    const text = readE2E();
    // The DYSFLOW_HOME assignment must come AFTER the helper check, so a
    // refusal short-circuits before the env var is touched.
    const helperIdx = text.indexOf("resolveMcpE2eCommand(");
    const homeIdx = text.indexOf("process.env.DYSFLOW_HOME =");
    expect(helperIdx).toBeGreaterThan(0);
    expect(homeIdx).toBeGreaterThan(0);
    expect(helperIdx).toBeLessThan(homeIdx);
  });
});
