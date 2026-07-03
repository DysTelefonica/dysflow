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
  it("keeps src/core independent from adapter implementations", () => {
    const coreFiles = collectTypeScriptFiles(coreRoot);

    const violations = coreFiles.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const importsAdapter =
        /^\s*import\s+.*(?:\.\.\/)+adapters\//m.test(source) ||
        /^\s*export\s+.*(?:\.\.\/)+adapters\//m.test(source) ||
        /from\s+["'](?:\.\/)+adapters\//.test(source);

      return importsAdapter && !KNOWN_ADAPTER_IMPORT_DEBT.has(toPosixRelative(file))
        ? [relative(process.cwd(), file)]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("keeps the adapter-import debt list honest — migrated files must be removed from it", () => {
    const allCoreFiles = collectTypeScriptFiles(coreRoot).map(toPosixRelative);
    const actualImporters = allCoreFiles.filter((file) => {
      const source = readFileSync(join(coreRoot, relative(coreRoot, file)), "utf8");
      return (
        /^\s*import\s+.*(?:\.\.\/)+adapters\//m.test(source) ||
        /^\s*export\s+.*(?:\.\.\/)+adapters\//m.test(source) ||
        /from\s+["'](?:\.\/)+adapters\//.test(source)
      );
    });
    const stale = [...KNOWN_ADAPTER_IMPORT_DEBT].filter((file) => !actualImporters.includes(file));
    expect(stale).toEqual([]);
  });

  it("drives core behavior through injected service interfaces", async () => {
    const requests: unknown[] = [];
    const tools = createDysflowMcpTools({
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
    });

    await expect(
      tools
        .find((tool) => tool.name === "dysflow_vba_execute")
        ?.handler({ procedureName: "Smoke", dryRun: true }),
    ).resolves.toMatchObject({ isError: false });
    await expect(
      tools
        .find((tool) => tool.name === "dysflow_query_execute")
        ?.handler({ sql: "SELECT 1", mode: "read" }),
    ).resolves.toMatchObject({ isError: false });
    await expect(
      tools.find((tool) => tool.name === "dysflow_doctor")?.handler({ includeEnvironment: true }),
    ).resolves.toMatchObject({ isError: false });

    expect(requests).toEqual([
      { service: "vba", request: { procedureName: "Smoke", dryRun: true } },
      { service: "query", request: { sql: "SELECT 1", mode: "read" } },
      { service: "diagnostics", request: { includeEnvironment: true } },
    ]);
  });

  it("keeps VBA sync dispatch behind the injected VBA sync service", async () => {
    const vbaSyncRequests: unknown[] = [];
    const tools = createDysflowMcpTools({
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
    });

    await expect(
      tools.find((tool) => tool.name === "export_all")?.handler({ projectRoot: "C:/project" }),
    ).resolves.toEqual({
      content: [{ type: "text", text: "TOOL_NOT_IMPLEMENTED: not implemented" }],
      isError: true,
      ok: false,
    });

    expect(vbaSyncRequests).toEqual([
      { toolName: "export_all", input: { projectRoot: "C:/project" } },
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

/**
 * Files that import an adapter for **default port wiring** only. The
 * cleaner pattern (per the `cross-process-lock.ts` precedent, commit
 * `6ac0af1`) is to keep the port REQUIRED in core and inject the Node
 * adapter from the composition root. We deviate here for two reasons:
 *
 *   1. **Byte-equivalent production behavior** is a hard contract
 *      (#624 PR4). Existing tests construct
 *      `new FileAccessOperationRegistry({ filePath })` and
 *      `new VbaFormService({ cwd })` WITHOUT a port — the default
 *      Node wiring preserves their behavior unchanged.
 *   2. **37 test sites** would have to change if we made the port
 *      required. PR4's review budget is 400 lines (forecast 160-260L,
 *      tightest margin in the chain); rewriting every call site is
 *      out of scope.
 *
 * The right next step is to move the factory functions
 * (`createFileAccessOperationRegistry`, `createProjectAccessOperationRegistry`)
 * to `src/adapters/operations/` and require the port in core — same
 * pattern as `cross-process-lock.ts`. A future PR can do that
 * without behavior change. Until then, this debt list keeps the
 * ratchet honest: every entry MUST be removed when the file stops
 * importing the adapter.
 */
const KNOWN_ADAPTER_IMPORT_DEBT: ReadonlySet<string> = new Set([
  "src/core/operations/access-operation-registry.ts",
  "src/core/services/vba-form-service.ts",
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
