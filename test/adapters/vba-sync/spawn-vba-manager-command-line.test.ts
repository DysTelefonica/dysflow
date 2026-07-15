import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { spawnPowerShellProcess } from "../../../src/adapters/powershell/default-executor.js";
import { spawnVbaManager } from "../../../src/adapters/vba-sync/vba-sync-adapter";

/**
 * Module-level mock that wraps the real `spawnPowerShellProcess`. The existing
 * real-spawn describe never overrides it, so it delegates to the actual
 * implementation (zero behavior change for the ENAMETOOLONG regression). The
 * new "child env derivation" describe below resets it to a stub that captures
 * the call args — the derivation rule only matters at the executor seam, so
 * inspecting the env passed to `spawnPowerShellProcess` is the user-observable
 * behaviour we are pinning.
 */
vi.mock("../../../src/adapters/powershell/default-executor.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/adapters/powershell/default-executor.js")
  >("../../../src/adapters/powershell/default-executor.js");
  return {
    ...actual,
    spawnPowerShellProcess: vi.fn(actual.spawnPowerShellProcess),
  };
});

/**
 * Real-spawn regression for the ENAMETOOLONG bug: a large `proceduresJson` used to
 * be passed inline on the PowerShell command line, overflowing the Windows ~32K
 * command-line limit so `spawn` failed with ENAMETOOLONG before MSACCESS.EXE ever
 * launched (`import_modules` was unaffected — it only passes a short module list).
 *
 * This launches a real `powershell.exe` (no child_process mock), so it is gated to
 * Windows. It needs no Access COM: the dummy script accepts the manager's params
 * and exits 0. Pre-fix, this spawn throws/reports ENAMETOOLONG; post-fix the plan
 * is offloaded to a temp file and the process starts cleanly.
 */
describe("spawnVbaManager — command line stays within the OS limit (real spawn)", () => {
  let workDir: string;
  let scriptPath: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), "dysflow-cmdline-"));
    scriptPath = join(workDir, "dummy-manager.ps1");
    // A no-op stand-in for the real VBA manager: binds the params the executor
    // sends for Run-Tests and exits cleanly without touching Access.
    await writeFile(
      scriptPath,
      [
        "param(",
        "  [string]$Action,",
        "  [string]$DestinationRoot,",
        "  [string]$AccessPath,",
        "  [switch]$Json,",
        "  [string]$ProceduresJson,",
        "  [string]$ProceduresJsonFile",
        ")",
        "Write-Output 'DYSFLOW_RESULT {\"ok\":true}'",
        "exit 0",
      ].join("\r\n"),
      "utf8",
    );
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it.skipIf(process.platform !== "win32")(
    "launches the process with a huge proceduresJson instead of failing with ENAMETOOLONG",
    async () => {
      // ~60K chars — comfortably past the Windows command-line limit if inlined.
      const hugePlan = JSON.stringify(
        Array.from({ length: 3_000 }, (_, i) => ({
          procedure: `Test_Procedure_Number_${i}`,
          args: [],
        })),
      );
      expect(hugePlan.length).toBeGreaterThan(32_000);

      const result = await spawnVbaManager({
        scriptPath,
        action: "Run-Tests",
        accessPath: join(workDir, "front.accdb"),
        destinationRoot: workDir,
        moduleNames: [],
        json: true,
        extra: { proceduresJson: hugePlan },
        timeoutMs: 30_000,
        cwd: workDir,
      });

      expect(result.stderr).not.toContain("ENAMETOOLONG");
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
    },
  );
});

/**
 * Issue #869: `list_vba_modules` is the only raw-executor caller of
 * `spawnVbaManager` that passes `password` without `env`. The previous
 * behaviour forwarded `env === undefined` to `spawnPowerShellProcess`, so
 * `$env:ACCESS_VBA_PASSWORD` was never set inside the child PowerShell
 * process and `Open-AccessDatabase` rejected password-protected `.accdb`
 * projects with `VBA_MANAGER_FAILED: No es una contraseña válida`. The
 * round-9 fix derives `{ ACCESS_VBA_PASSWORD, DYSFLOW_ACCESS_PASSWORD }`
 * at the executor seam when `password !== undefined && env === undefined`,
 * mirroring `executeMappedTool` (vba-sync-adapter.ts:592-595). This block
 * pins the three contract branches so a future refactor of the executor
 * cannot silently regress the password forwarding.
 */
describe("spawnVbaManager — child env derivation (issue #869)", () => {
  const fakeResult = {
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 0,
    timedOut: false,
  };

  beforeEach(() => {
    vi.mocked(spawnPowerShellProcess).mockReset();
    vi.mocked(spawnPowerShellProcess).mockResolvedValue(fakeResult);
  });

  function lastCallEnv(): Record<string, string | undefined> | undefined {
    const calls = vi.mocked(spawnPowerShellProcess).mock.calls;
    const last = calls.at(-1);
    return last?.[0]?.env;
  }

  function lastCallArgs(): readonly string[] | undefined {
    const calls = vi.mocked(spawnPowerShellProcess).mock.calls;
    const last = calls.at(-1);
    return last?.[0]?.args;
  }

  it.skipIf(process.platform !== "win32")(
    "Case A — derives ACCESS_VBA_PASSWORD and DYSFLOW_ACCESS_PASSWORD when password is set and env is undefined",
    async () => {
      await spawnVbaManager({
        scriptPath: "ignored.ps1",
        action: "List-VbaModules",
        accessPath: "ignored.accdb",
        destinationRoot: "ignored",
        moduleNames: [],
        json: true,
        extra: {},
        timeoutMs: 5_000,
        password: "secret",
        env: undefined,
      });

      expect(lastCallEnv()).toEqual({
        ACCESS_VBA_PASSWORD: "secret",
        DYSFLOW_ACCESS_PASSWORD: "secret",
      });
    },
  );

  it.skipIf(process.platform !== "win32")(
    "Case B — explicit env wins over derivation (no double-set, no merge)",
    async () => {
      await spawnVbaManager({
        scriptPath: "ignored.ps1",
        action: "List-VbaModules",
        accessPath: "ignored.accdb",
        destinationRoot: "ignored",
        moduleNames: [],
        json: true,
        extra: {},
        timeoutMs: 5_000,
        password: "secret",
        env: { ACCESS_VBA_PASSWORD: "explicit", FOO: "bar" },
      });

      // The explicit env must be forwarded verbatim — the derivation must
      // NOT add a synthetic ACCESS_VBA_PASSWORD / DYSFLOW_ACCESS_PASSWORD
      // on top, and must NOT merge the derived object over the caller's.
      expect(lastCallEnv()).toEqual({
        ACCESS_VBA_PASSWORD: "explicit",
        FOO: "bar",
      });
    },
  );

  it.skipIf(process.platform !== "win32")(
    "Case C — undefined password and undefined env leaves env undefined (no synthetic stub)",
    async () => {
      await spawnVbaManager({
        scriptPath: "ignored.ps1",
        action: "List-VbaModules",
        accessPath: "ignored.accdb",
        destinationRoot: "ignored",
        moduleNames: [],
        json: true,
        extra: {},
        timeoutMs: 5_000,
        password: undefined,
        env: undefined,
      });

      // Without a password there is no contract to honor: the child env
      // must stay `undefined` so `buildChildEnv` (default-executor.ts:81-92)
      // does not receive a fabricated stub it might merge with.
      expect(lastCallEnv()).toBeUndefined();
    },
  );

  it.skipIf(process.platform !== "win32")(
    "Case D — password value never appears in the spawnPowerShellProcess args (rejected variant 2 guard)",
    async () => {
      // The round-9 fix carries the password via env. Variant 2 (rejected in
      // proposal.md) would have added `-Password <value>` to the args vector;
      // that puts the secret on the process command line, visible to `ps` /
      // Process Monitor / ETW traces. The variant-2-rejection contract is
      // pinned here so a future maintainer cannot silently re-introduce it.
      const secret = "secret-token-do-not-leak";

      await spawnVbaManager({
        scriptPath: "ignored.ps1",
        action: "List-VbaModules",
        accessPath: "ignored.accdb",
        destinationRoot: "ignored",
        moduleNames: [],
        json: true,
        extra: {},
        timeoutMs: 5_000,
        password: secret,
        env: undefined,
      });

      const args = lastCallArgs() ?? [];
      // (1) The password value must not appear as a literal array element.
      expect(args).not.toContain(secret);
      // (2) The password value must not appear as a substring of any arg.
      //     Catches the `-Password <value>` leak even if a future maintainer
      //     wraps it in some flag-prefix helper.
      const leaked = args.find((arg) => typeof arg === "string" && arg.includes(secret));
      expect(leaked, `password leaked in args: ${JSON.stringify(args)}`).toBeUndefined();
    },
  );

  it.skipIf(process.platform !== "win32")(
    "Case D-bis — password value never appears in args even when env is explicit (Case B path)",
    async () => {
      const secret = "another-secret-token";

      await spawnVbaManager({
        scriptPath: "ignored.ps1",
        action: "List-VbaModules",
        accessPath: "ignored.accdb",
        destinationRoot: "ignored",
        moduleNames: [],
        json: true,
        extra: {},
        timeoutMs: 5_000,
        password: secret,
        env: { ACCESS_VBA_PASSWORD: "explicit", FOO: "bar" },
      });

      const args = lastCallArgs() ?? [];
      expect(args).not.toContain(secret);
      const leaked = args.find((arg) => typeof arg === "string" && arg.includes(secret));
      expect(leaked, `password leaked in args: ${JSON.stringify(args)}`).toBeUndefined();
    },
  );
});
