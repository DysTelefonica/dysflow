import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const guardScript = path.resolve("scripts/check-optional-presence-guards.mjs");

async function withFixture(
  source: string,
  run: (filePath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), "dysflow-optional-guard-"));
  try {
    const filePath = path.join(directory, "fixture.ts");
    await writeFile(filePath, source, "utf8");
    await run(filePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runGuard(filePath: string) {
  return execFileAsync(process.execPath, [guardScript, filePath], { cwd: process.cwd() });
}

describe("optional config/params presence guard", () => {
  it("rejects presence checks on optional config-like subjects", async () => {
    await withFixture(
      `
type RuntimeConfig = { timeoutMs?: number };
export function timeout(config: RuntimeConfig): number | undefined {
  if ("timeoutMs" in config) return config.timeoutMs;
  return undefined;
}
`,
      async (filePath) => {
        await expect(runGuard(filePath)).rejects.toMatchObject({
          stderr: expect.stringContaining("uses in on config"),
        });
      },
    );
  });

  it("rejects Object.hasOwn and hasOwnProperty.call on params/options subjects", async () => {
    await withFixture(
      `
type Params = { dryRun?: boolean };
export function dryRun(params: Params, wrapper: { options?: Params }): boolean {
  return Object.hasOwn(params, "dryRun") ||
    Object.prototype.hasOwnProperty.call(wrapper.options, "dryRun");
}
`,
      async (filePath) => {
        await expect(runGuard(filePath)).rejects.toMatchObject({
          stderr: expect.stringContaining("Object.hasOwn"),
        });
        await expect(runGuard(filePath)).rejects.toMatchObject({
          stderr: expect.stringContaining("Object.prototype.hasOwnProperty.call"),
        });
      },
    );
  });

  it("rejects hasOwnProperty calls on config-like receivers", async () => {
    await withFixture(
      `
type RuntimeConfig = { timeoutMs?: number };
export function hasTimeout(config: RuntimeConfig): boolean {
  return config.hasOwnProperty("timeoutMs");
}
`,
      async (filePath) => {
        await expect(runGuard(filePath)).rejects.toMatchObject({
          stderr: expect.stringContaining("uses hasOwnProperty on config"),
        });
      },
    );
  });

  it("allows value checks and documented non-config presence checks", async () => {
    await withFixture(
      `
type RuntimeConfig = { timeoutMs?: number };
export function timeout(config: RuntimeConfig, value: unknown): number | undefined {
  if (config.timeoutMs !== undefined) return config.timeoutMs;
  if (typeof value === "object" && value !== null && "content" in value) return 1;
  return undefined;
}
`,
      async (filePath) => {
        await expect(runGuard(filePath)).resolves.toMatchObject({ stderr: "" });
      },
    );
  });

  it("allows narrow documented exceptions", async () => {
    await withFixture(
      `
type RuntimeConfig = { timeoutMs?: number };
export function hasOwnTimeout(config: RuntimeConfig): boolean {
  // optional-presence-guard: allow required for serialization boundary tests.
  return Object.hasOwn(config, "timeoutMs");
}
`,
      async (filePath) => {
        await expect(runGuard(filePath)).resolves.toMatchObject({ stderr: "" });
      },
    );
  });
});
