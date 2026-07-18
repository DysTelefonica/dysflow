import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools";
import { failureResult, successResult } from "../../src/core/contracts/index";

const coreRoot = join(process.cwd(), "src", "core");

function collectTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

describe("MCP/core architecture boundary", () => {
  it("drives core behavior through injected service interfaces", async () => {
    const requests: unknown[] = [];
    const tools = createDysflowMcpTools({
      services: {
        vbaService: {
          execute: async (request) => {
            requests.push({ service: "vba", request });
            return successResult({ returnValue: "ok" });
          },
        },
        queryService: {
          execute: async (request) => {
            requests.push({ service: "query", request });
            return successResult({ rows: [{ id: 1 }] });
          },
        },
        diagnosticsService: {
          run: async (request) => {
            requests.push({ service: "diagnostics", request });
            return successResult({ checks: [] });
          },
        },
      },
    });

    await expect(
      tools
        .find((tool) => tool.name === "run_vba")
        // #777 (Opción A cont.) — `dysflow_vba_execute` was REMOVED.
        // The canonical `run_vba` is registered in alias-tools.ts and
        // accepts `argsJson` instead of `arguments[]`. The schema for
        // `run_vba` does not enforce `minLength: 1` on procedureName,
        // so empty/whitespace procedureNames fall through to the
        // default-deny gate at the runner level.
        ?.handler({ procedureName: "Smoke", argsJson: "[]", dryRun: true }),
    ).resolves.toMatchObject({ isError: false });
    await expect(
      tools
        .find((tool) => tool.name === "query_execute")
        ?.handler({ sql: "SELECT 1", mode: "read" }),
    ).resolves.toMatchObject({ isError: false });
    await expect(
      tools.find((tool) => tool.name === "doctor")?.handler({ includeEnvironment: true }),
    ).resolves.toMatchObject({ isError: false });

    // #777 (Opción A cont.) — `run_vba` (alias-tools.ts) builds the
    // request with `moduleName: ""` and `arguments: []` defaults. Match
    // the canonical shape, not just the caller's payload.
    expect(requests).toEqual([
      expect.objectContaining({
        service: "vba",
        request: expect.objectContaining({ procedureName: "Smoke", dryRun: true }),
      }),
      { service: "query", request: { sql: "SELECT 1", mode: "read" } },
      { service: "diagnostics", request: { includeEnvironment: true } },
    ]);
  });

  it("keeps VBA sync dispatch behind the injected VBA sync service", async () => {
    const vbaSyncRequests: unknown[] = [];
    // writesEnabled=true so the filesystem-write gate does not intercept
    // before the call reaches the vbaSyncToolService stub. The mutates* audit
    // (#665) flipped export_all from mutatesFilesystem:false to
    // mutatesFilesystem:true, so the gate now fires by default.
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({ returnValue: "unused" }) },
        queryService: { execute: async () => successResult({ rows: [] }) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
        vbaSyncToolService: {
          execute: async (toolName, input) => {
            vbaSyncRequests.push({ toolName, input });
            return failureResult({
              code: "TOOL_NOT_IMPLEMENTED",
              message: "not implemented",
              retryable: false,
            });
          },
        },
      },
      writes: true,
    });

    // #972 — uniform ErrorEnvelope: every failure now carries the
    // structured `error` block (uniform `errorCode` / `errorMessage` /
    // `relatedIssueNumbers`). Use property assertions instead of
    // `toEqual` so future additive envelope fields stay refactor-safe.
    const result = await tools
      .find((tool) => tool.name === "export_all")
      ?.handler({
        projectRoot: "C:/project",
      });
    expect(result?.content[0]?.text).toBe("TOOL_NOT_IMPLEMENTED: not implemented");
    expect(result?.isError).toBe(true);
    expect(result?.ok).toBe(false);
    expect(result?.error?.errorCode).toBe("TOOL_NOT_IMPLEMENTED");
    expect(result?.error?.relatedIssueNumbers).toEqual(["#972"]);

    expect(vbaSyncRequests).toEqual([
      // Issue #785 (v2.1.1) — the dispatch seam injects the policy-driven
      // effective dryRun default (`dryRun: true` in safe-by-default for any
      // non-routine-dev-write tool — here `export_all` is destructive-write).
      // The wire shape between dispatcher and adapter changed in v2.1.1; the
      // routing assertion (tool name + caller-provided fields) is preserved.
      {
        toolName: "export_all",
        input: { projectRoot: "C:/project", dryRun: true },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// I/O port boundary
//
// docs/testing/testing-philosophy.md mandates "test at the ports": src/core may
// only reach the filesystem/network through an INJECTED port, never by importing
// node:fs / node:net (etc.) directly. The list below is the GRANDFATHERED debt
// that predates this guard.
//
// This is a RATCHET, not a freeze:
//   - a NEW core file importing an I/O builtin fails the suite (debt must not grow)
//   - migrating a listed file to a port but forgetting to delete its entry here
//     ALSO fails (the debt list must not go stale)
//
// The ONLY legal edit to KNOWN_DIRECT_IO_DEBT is REMOVAL after a real migration.
// Network builtins are absent on purpose: none exist in core today, so any new
// one fails immediately.
// ---------------------------------------------------------------------------

const IO_BUILTIN_IMPORT =
  /\b(?:from|import|require)\b[^"'\n]*["']node:(?:fs(?:\/promises)?|net|http|https|http2|dgram|tls)["']/;

const KNOWN_DIRECT_IO_DEBT: ReadonlySet<string> = new Set([
  "src/core/runner/access-runner.ts",
  "src/core/utils/index.ts",
  "src/core/utils/package-info.ts",
]);

function toPosixRelative(file: string): string {
  return relative(process.cwd(), file).split(sep).join("/");
}

describe("core I/O port boundary", () => {
  const ioImporters = collectTypeScriptFiles(coreRoot)
    .filter((file) => !file.endsWith(".test.ts"))
    .filter((file) => IO_BUILTIN_IMPORT.test(readFileSync(file, "utf8")))
    .map(toPosixRelative);

  it("admits no new direct filesystem/network imports in src/core", () => {
    const unexpected = ioImporters.filter((file) => !KNOWN_DIRECT_IO_DEBT.has(file));
    expect(unexpected).toEqual([]);
  });

  it("keeps the I/O debt list honest — migrated files must be removed from it", () => {
    const stale = [...KNOWN_DIRECT_IO_DEBT].filter((file) => !ioImporters.includes(file));
    expect(stale).toEqual([]);
  });
});
