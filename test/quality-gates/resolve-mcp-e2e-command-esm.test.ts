// Vitest test that loads resolve-mcp-e2e-command through a real ESM dynamic
// import (the shape mcp-e2e.mjs uses in production) and exercises the
// default `require("node:fs")` fallback WITHOUT injecting an fs. Catches the
// regression where the lazy `require("node:fs")` inside an ESM module
// returns a non-functional binding that always answers false on Windows.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPRO_PATH = resolve(
  process.cwd(),
  "test/quality-gates/_artifacts/repro-resolve-mcp-e2e-default-fs.mjs",
);

describe("resolveMcpE2eCommand — default lazy-fs branch (real ESM, observed via subprocess)", () => {
  it("uses the lazy require('node:fs') fallback when no fs is injected", () => {
    // We cannot exercise the lazy-`require` bug from vitest itself because
    // vitest loads `.mjs` files in CJS context. The reproduction lives in a
    // subprocess that runs the helper the way mcp-e2e.mjs does.
    const proc = spawnSync(process.execPath, [REPRO_PATH, "--repro-resolve-mcp-e2e-default-fs"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    });
    if (proc.error) throw proc.error;
    expect(proc.status).toBe(0);
    if (proc.status !== 0) {
      throw new Error(
        `subprocess exited ${proc.status}\nstdout:\n${proc.stdout}\nstderr:\n${proc.stderr}`,
      );
    }
    const result = JSON.parse(proc.stdout) as {
      ok: boolean;
      code?: string;
      message?: string;
      command?: string;
      source?: string;
    };
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`helper returned ${result.code}: ${result.message}`);
    }
    expect(result.source).toBe("env-override");
    expect(result.command).toBe(REPRO_PATH);
    // suppress unused warning
    void fileURLToPath;
  });
});
