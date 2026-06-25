import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDefaultVbaManagerScriptPath } from "../../../src/adapters/vba-sync/vba-sync-adapter.js";

/**
 * Lightweight regression for the real-Access E2E failure where list_objects failed with
 * "El argumento 'scripts/dysflow-vba-manager.ps1' para el parámetro -File no existe":
 * without DYSFLOW_HOME the default script path was RELATIVE, so it broke whenever the
 * operation spawned PowerShell with a project-directory cwd. This catches that class at
 * unit speed, no Access COM required.
 */
describe("resolveDefaultVbaManagerScriptPath", () => {
  it("uses the runtime path under DYSFLOW_HOME when it is set", () => {
    expect(resolveDefaultVbaManagerScriptPath({ DYSFLOW_HOME: "C:/rt" })).toBe(
      "C:/rt/app/scripts/dysflow-vba-manager.ps1",
    );
  });

  it("resolves a cwd-independent ABSOLUTE existing path when DYSFLOW_HOME is unset", () => {
    const resolved = resolveDefaultVbaManagerScriptPath({});
    expect(isAbsolute(resolved)).toBe(true);
    expect(existsSync(resolved)).toBe(true);
  });

  it("treats a whitespace DYSFLOW_HOME as unset and still resolves an absolute existing path", () => {
    const resolved = resolveDefaultVbaManagerScriptPath({ DYSFLOW_HOME: "   " });
    expect(isAbsolute(resolved)).toBe(true);
    expect(existsSync(resolved)).toBe(true);
  });
});
