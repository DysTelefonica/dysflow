import { describe, expect, it, vi } from "vitest";
import {
  parseRelinkDirectoryArgs,
  handleRelinkDirectoryCommand,
  type RelinkDirectoryOptions,
} from "../../../src/cli/commands/access/relink-directory.js";
import type { AccessQueryResult } from "../../../src/core/services/query-service.js";
import type { OperationResult } from "../../../src/core/contracts/index.js";
import { successResult } from "../../../src/core/contracts/index.js";
import type { RelinkDirectoryReport } from "../../../src/core/contracts/index.js";

// ---------------------------------------------------------------------------
// FakeQueryService for handler tests
// ---------------------------------------------------------------------------

function makeReport(overrides: Partial<RelinkDirectoryReport> = {}): RelinkDirectoryReport {
  return {
    mode: "dry-run",
    root: "C:\\data",
    filesScanned: 0,
    linkedTablesFound: 0,
    alreadyLocal: 0,
    plannedRelinks: 0,
    appliedRelinks: 0,
    unresolved: [],
    removed: [],
    externalLinkCount: 0,
    datosteLinkCount: 0,
    brokenLinkCount: 0,
    backupPaths: [],
    errors: [],
    fileResults: [],
    ...overrides,
  };
}

type FakeRequest = {
  action?: string;
  rootPath?: string;
  dryRun?: boolean;
  backup?: boolean;
  recursive?: boolean;
  maps?: unknown[];
  denyPrefixes?: string[];
  strictLocal?: boolean;
  removeUnresolved?: boolean;
  timeoutMs?: number;
};

class FakeQueryService {
  public requests: FakeRequest[] = [];
  private report: RelinkDirectoryReport;

  constructor(report?: RelinkDirectoryReport) {
    this.report = report ?? makeReport();
  }

  async execute(request: FakeRequest): Promise<OperationResult<AccessQueryResult>> {
    this.requests.push(request);
    return successResult({ relinkDirectory: this.report });
  }
}

// ---------------------------------------------------------------------------
// parseRelinkDirectoryArgs — unit tests
// ---------------------------------------------------------------------------

describe("parseRelinkDirectoryArgs", () => {
  it("happy path: --root and --dry-run → ok:true with defaults", () => {
    const result = parseRelinkDirectoryArgs(["--root", "C:\\data", "--dry-run"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rootPath).toBe("C:\\data");
    expect(result.value.apply).toBe(false);
    expect(result.value.recursive).toBe(true);
    expect(result.value.backup).toBe(true);
    expect(result.value.strictLocal).toBe(false);
    expect(result.value.removeUnresolved).toBe(false);
    expect(result.value.json).toBe(false);
    expect(result.value.maps).toEqual([]);
    expect(result.value.denyPrefixes).toEqual([]);
  });

  it("default mode is dry-run when no mode flag given", () => {
    const result = parseRelinkDirectoryArgs(["--root", "C:\\data"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.apply).toBe(false);
  });

  it("--apply sets apply:true", () => {
    const result = parseRelinkDirectoryArgs(["--root", "C:\\data", "--apply"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.apply).toBe(true);
  });

  it("--apply --dry-run together → error (conflicting)", () => {
    const result = parseRelinkDirectoryArgs(["--root", "C:\\data", "--apply", "--dry-run"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/cannot.*both|conflict|mutually exclusive/i);
  });

  it("missing --root → error", () => {
    const result = parseRelinkDirectoryArgs(["--dry-run"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/--root/i);
  });

  it("--map repeated → maps array populated", () => {
    const result = parseRelinkDirectoryArgs([
      "--root", "C:\\data",
      "--map", "OldName.accdb=NewName.accdb",
      "--map", "Legacy.mdb=Current.accdb",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maps).toEqual([
      { from: "OldName.accdb", to: "NewName.accdb" },
      { from: "Legacy.mdb", to: "Current.accdb" },
    ]);
  });

  it("--deny-prefix repeated → denyPrefixes array populated", () => {
    const result = parseRelinkDirectoryArgs([
      "--root", "C:\\data",
      "--deny-prefix", "\\\\datoste\\",
      "--deny-prefix", "\\\\server2\\",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.denyPrefixes).toEqual(["\\\\datoste\\", "\\\\server2\\"]);
  });

  it("--password-env ACCESS_VBA_PASSWORD → passwordEnv set", () => {
    const result = parseRelinkDirectoryArgs(["--root", "C:\\data", "--password-env", "ACCESS_VBA_PASSWORD"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passwordEnv).toBe("ACCESS_VBA_PASSWORD");
  });

  it("--backup flag → backup true (already default)", () => {
    const result = parseRelinkDirectoryArgs(["--root", "C:\\data", "--backup"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.backup).toBe(true);
  });

  it("--no-backup → backup false", () => {
    const result = parseRelinkDirectoryArgs(["--root", "C:\\data", "--no-backup"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.backup).toBe(false);
  });

  it("--strict-local → strictLocal true", () => {
    const result = parseRelinkDirectoryArgs(["--root", "C:\\data", "--strict-local"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.strictLocal).toBe(true);
  });

  it("--remove-unresolved → removeUnresolved true", () => {
    const result = parseRelinkDirectoryArgs(["--root", "C:\\data", "--remove-unresolved"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.removeUnresolved).toBe(true);
  });

  it("--recursive → recursive true", () => {
    const result = parseRelinkDirectoryArgs(["--root", "C:\\data", "--recursive"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recursive).toBe(true);
  });

  it("--json → json true", () => {
    const result = parseRelinkDirectoryArgs(["--root", "C:\\data", "--json"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.json).toBe(true);
  });

  it("--timeout-ms 30000 → timeoutMs 30000", () => {
    const result = parseRelinkDirectoryArgs(["--root", "C:\\data", "--timeout-ms", "30000"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.timeoutMs).toBe(30000);
  });

  it("--map with missing value → error", () => {
    const result = parseRelinkDirectoryArgs(["--root", "C:\\data", "--map"]);
    expect(result.ok).toBe(false);
  });

  it("--map without '=' separator → error", () => {
    const result = parseRelinkDirectoryArgs(["--root", "C:\\data", "--map", "noequalssign"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/=|format|map/i);
  });
});

// ---------------------------------------------------------------------------
// handleRelinkDirectoryCommand — unit tests
// ---------------------------------------------------------------------------

describe("handleRelinkDirectoryCommand", () => {
  it("calls service with action: relink_directory, rootPath, dryRun:true", async () => {
    const service = new FakeQueryService();
    const result = await handleRelinkDirectoryCommand(
      ["--root", "C:\\data", "--dry-run"],
      {},
      { service },
    );
    expect(result.exitCode).toBe(0);
    expect(service.requests).toHaveLength(1);
    expect(service.requests[0]).toMatchObject({
      action: "relink_directory",
      rootPath: "C:\\data",
      dryRun: true,
    });
  });

  it("--apply → dryRun:false in payload", async () => {
    const service = new FakeQueryService();
    await handleRelinkDirectoryCommand(
      ["--root", "C:\\data", "--apply"],
      {},
      { service },
    );
    expect(service.requests[0]).toMatchObject({
      action: "relink_directory",
      dryRun: false,
    });
  });

  it("--json flag → output is valid JSON", async () => {
    const service = new FakeQueryService();
    const result = await handleRelinkDirectoryCommand(
      ["--root", "C:\\data", "--dry-run", "--json"],
      {},
      { service },
    );
    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it("--strict-local + externalLinkCount > 0 → exitCode 1", async () => {
    const service = new FakeQueryService(makeReport({ externalLinkCount: 1 }));
    const result = await handleRelinkDirectoryCommand(
      ["--root", "C:\\data", "--apply", "--strict-local"],
      {},
      { service },
    );
    expect(result.exitCode).toBe(1);
  });

  it("--strict-local + externalLinkCount 0 → exitCode 0", async () => {
    const service = new FakeQueryService(makeReport({ externalLinkCount: 0 }));
    const result = await handleRelinkDirectoryCommand(
      ["--root", "C:\\data", "--apply", "--strict-local"],
      {},
      { service },
    );
    expect(result.exitCode).toBe(0);
  });

  it("--deny-prefix with datosteLinkCount > 0 → exitCode 1", async () => {
    const service = new FakeQueryService(makeReport({ datosteLinkCount: 1 }));
    const result = await handleRelinkDirectoryCommand(
      ["--root", "C:\\data", "--deny-prefix", "\\\\datoste\\"],
      {},
      { service },
    );
    expect(result.exitCode).toBe(1);
  });

  it("normal completion → exitCode 0", async () => {
    const service = new FakeQueryService();
    const result = await handleRelinkDirectoryCommand(
      ["--root", "C:\\data", "--dry-run"],
      {},
      { service },
    );
    expect(result.exitCode).toBe(0);
  });

  it("missing --root → exitCode 1 with error message", async () => {
    const result = await handleRelinkDirectoryCommand(["--dry-run"], {});
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/--root/i);
  });

  it("passes maps to service when --map is provided", async () => {
    const service = new FakeQueryService();
    await handleRelinkDirectoryCommand(
      ["--root", "C:\\data", "--map", "Old.accdb=New.accdb"],
      {},
      { service },
    );
    expect(service.requests[0]).toMatchObject({
      maps: [{ from: "Old.accdb", to: "New.accdb" }],
    });
  });

  it("passes denyPrefixes to service when --deny-prefix is provided", async () => {
    const service = new FakeQueryService();
    await handleRelinkDirectoryCommand(
      ["--root", "C:\\data", "--deny-prefix", "\\\\datoste\\"],
      {},
      { service },
    );
    expect(service.requests[0]).toMatchObject({
      denyPrefixes: ["\\\\datoste\\"],
    });
  });

  it("resolves password from env when --password-env is given", async () => {
    const service = new FakeQueryService();
    const result = await handleRelinkDirectoryCommand(
      ["--root", "C:\\data", "--password-env", "MY_PASS"],
      { env: { MY_PASS: "secret123" } },
      { service },
    );
    expect(result.exitCode).toBe(0);
    // The password itself should not appear in stdout
    expect(result.stdout).not.toContain("secret123");
  });
});
