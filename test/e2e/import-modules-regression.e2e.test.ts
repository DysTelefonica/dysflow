delete process.env.DYSFLOW_HOME;

/**
 * Comprehensive E2E suite for the dysflow MCP tool surface.
 *
 * Acceptance criterion for the v1.2.34 release (issue #496) and every
 * subsequent release: each of the 50 MCP tools (compile_vba was removed in v1.19.0) must respond correctly
 * when invoked through the same JSON-RPC stdio protocol that a real
 * opencode client uses in production.
 *
 * Strategy:
 *   - The case list is built at MODULE LOAD time, not in beforeAll,
 *     so vitest's discovery phase sees every it() and registers it.
 *   - Workspace path is stable (under tmpdir, named by this test
 *     file's PID + Date.now()). Each test resolves the workspace
 *     lazily in callMcp so we do not depend on a beforeAll hook.
 *   - Universal contract: every response is JSON-parseable, never
 *     contains the VBA_MANAGER_SERIALIZATION_FAILED fallback, and
 *     exposes the tool's ok indicator. Per-tool assertions add
 *     shape-specific checks.
 *
 * Cost: ~95 tests, ~5 minutes in CI. This is the price of confidence
 * in production.
 */
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliCommand =
  process.env.DYSFLOW_E2E_COMMAND ?? join(repoRoot, "test-runtime", "bin", "dysflow.cmd");
const fixtureFront = join(repoRoot, "E2E_testing", "NoConformidades.accdb");
const fixtureBackend = join(repoRoot, "E2E_testing", "NoConformidades_Datos.accdb");

const canRunE2e =
  existsSync(cliCommand) &&
  existsSync(fixtureFront) &&
  existsSync(fixtureBackend) &&
  hasAccessCom() &&
  (process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD) !== undefined;

if (!canRunE2e) {
  console.warn(
    "[dysflow-tool-e2e] Skipping: DYSFLOW_E2E_COMMAND, E2E_testing/*.accdb, " +
      "Access COM, or ACCESS_VBA_PASSWORD are unavailable.",
  );
}

function hasAccessCom(): boolean {
  try {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "try { $a = New-Object -ComObject Access.Application; $a.Quit(); 'ok' } catch { 'missing' }",
      ],
      { encoding: "utf8", windowsHide: true, timeout: 20_000 },
    );
    return output.includes("ok");
  } catch {
    return false;
  }
}

// Workspace path is stable per process: same name for every test in
// this run. We pre-create it in beforeAll and tear it down in
// afterAll. The path itself is computed at module load so the
// test cases can be built with absolute paths.
const workspaceRoot = join(tmpdir(), `dysflow-tool-e2e-${process.pid}-${Date.now()}`);

function setupWorkspace(): void {
  mkdirSync(join(workspaceRoot, ".dysflow"), { recursive: true });
  mkdirSync(join(workspaceRoot, "src", "modules"), { recursive: true });
  cpSync(fixtureFront, join(workspaceRoot, "NoConformidades.accdb"));
  cpSync(fixtureBackend, join(workspaceRoot, "NoConformidades_Datos.accdb"));
  writeFileSync(
    join(workspaceRoot, ".dysflow", "project.json"),
    `${JSON.stringify(
      {
        id: "dysflow-tool-e2e",
        accessPath: "NoConformidades.accdb",
        backendPath: "NoConformidades_Datos.accdb",
        destinationRoot: "src",
        // Heavy whole-project operations (verify_code exports the ENTIRE project)
        // exceed the generic default on this large fixture.
        // Set a realistic per-project timeout so the suite verifies the config is
        // HONORED end-to-end (no per-call timeoutMs is passed by these tools).
        timeoutMs: 120_000,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const goodModule = [
    'Attribute VB_Name = "TestGoodModule"',
    "Option Compare Database",
    "Option Explicit",
    "",
    "Public Function Always42() As Long",
    "    Always42 = 42",
    "End Function",
    "",
  ].join("\r\n");
  writeFileSync(join(workspaceRoot, "src", "modules", "TestGoodModule.bas"), goodModule);
  const otherModule = goodModule
    .replace("TestGoodModule", "TestAnotherModule")
    .replace("Always42", "AlsoOk")
    .replace("    AlsoOk = 7", "    AlsoOk = 7");
  writeFileSync(join(workspaceRoot, "src", "modules", "TestAnotherModule.bas"), otherModule);
}

interface McpToolResponse {
  ok: boolean;
  isError: boolean;
  text: string;
  timedOut: boolean;
}

async function callMcp(
  toolName: string,
  args: Record<string, unknown>,
  options: { timeoutMs?: number; cwd?: string } = {},
): Promise<McpToolResponse> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const cwd = options.cwd ?? workspaceRoot;
  return await new Promise((resolveCall) => {
    const child = spawn(cliCommand, ["mcp"], {
      cwd,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ACCESS_VBA_PASSWORD: process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD,
        DYSFLOW_ACCESS_PASSWORD:
          process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD,
        DYSFLOW_BACKEND_PASSWORD:
          process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_BACKEND_PASSWORD,
      },
    });
    let buf = "";
    let settled = false;
    const finish = (r: McpToolResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.stdin.end();
      } catch {
        /* ignore */
      }
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolveCall(r);
    };
    const timer = setTimeout(() => {
      finish({ ok: false, isError: true, text: "MCP timeout", timedOut: true });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      const nl = buf.lastIndexOf("\n");
      if (nl < 0) return;
      for (const l of buf.slice(0, nl).split("\n")) {
        const s = l.trim();
        if (!s) continue;
        try {
          const m = JSON.parse(s) as {
            id: number;
            result?: { content: Array<{ type: string; text?: string }>; isError?: boolean };
            error?: unknown;
          };
          if (m.id !== 3) continue;
          const text = m.result?.content?.map((c) => c.text ?? "").join("\n") ?? "";
          const isError = Boolean(m.error ?? m.result?.isError);
          finish({ ok: !isError, isError, text, timedOut: false });
          return;
        } catch {
          /* keep reading */
        }
      }
    });
    child.on("error", (e) =>
      finish({ ok: false, isError: true, text: e.message, timedOut: false }),
    );
    child.on("close", () => {
      if (!settled) finish({ ok: false, isError: true, text: "MCP closed", timedOut: false });
    });
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "tool-e2e", version: "1" },
        },
      })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      })}\n`,
    );
  });
}

function assertUniversalContract(r: McpToolResponse): void {
  expect(r.text).not.toMatch(/VBA_MANAGER_SERIALIZATION_FAILED/);
  expect(r.text).not.toMatch(/RUNNER_INVALID_JSON/);
  if (r.text.trim().length === 0) throw new Error("MCP response text is empty");
  if (r.timedOut) throw new Error("MCP call timed out");
}

type ToolCase = {
  tool: string;
  label: "happy" | "sad";
  args: Record<string, unknown>;
  timeoutMs: number;
};

/**
 * Build the full case list at module load. Workspace path is known
 * at this point (computed above) so all paths are absolute.
 */
function buildToolCases(): ToolCase[] {
  const access = join(workspaceRoot, "NoConformidades.accdb");
  const backend = join(workspaceRoot, "NoConformidades_Datos.accdb");
  const projectId = "dysflow-tool-e2e";
  const ctx = { projectId, accessPath: access, backendPath: backend };
  const cases: ToolCase[] = [];
  const t = (
    tool: string,
    label: ToolCase["label"],
    args: Record<string, unknown>,
    timeoutMs = 90_000,
  ): ToolCase => ({ tool, label, args, timeoutMs });

  // ----- Modern dysflow_* tools (6 tools, happy + sad where natural) -----
  cases.push(
    t("dysflow_doctor", "happy", { projectId, includeEnvironment: true }),
    t("dysflow_doctor", "sad", { projectId: "no-such-project-anywhere" }),
    t("dysflow_query_execute", "happy", { projectId, sql: "SELECT 1 AS One", mode: "read" }),
    t("dysflow_query_execute", "sad", { projectId, sql: "", mode: "read" }),
    t("dysflow_access_operations_list", "happy", {}),
    t("dysflow_access_cleanup", "happy", {
      operationId: "bogus-id-does-not-exist",
      accessPath: access,
    }),
    t("dysflow_access_cleanup", "sad", { operationId: "../../../etc/passwd", accessPath: access }),
    t("dysflow_access_force_cleanup_orphaned", "happy", {}),
    t("dysflow_access_force_cleanup_orphaned", "sad", { confirmPid: -1 }),
  );

  // ----- VBA-sync write path (the #496 fix surface) -----
  cases.push(
    t(
      "import_modules",
      "happy",
      {
        projectId,
        moduleNames: ["TestGoodModule"],
        importMode: "Code",
        dryRun: false,
      },
      150_000,
    ),
    t(
      "import_modules",
      "sad",
      {
        projectId,
        moduleNames: ["NoSuchModule_xyz_999"],
        importMode: "Code",
        dryRun: false,
      },
      150_000,
    ),
    t(
      "import_modules",
      "happy",
      {
        projectId,
        moduleNames: ["TestAnotherModule"],
        importMode: "Code",
        dryRun: true,
      },
      150_000,
    ),
// feat-759-no-compile (v1.19.0) — `compile` parameter is gone.
    t(
      "import_all",
      "happy",
      { projectId, importMode: "Code", dryRun: true },
      150_000,
    ),
    t(
      "import_all",
      "sad",
      {
        projectId,
        destinationRoot: join(workspaceRoot, "src", "no-such"),
        importMode: "Code",
        dryRun: false,
      },
      150_000,
    ),
    t("export_modules", "happy", { projectId, moduleNames: ["TestGoodModule"] }, 150_000),
    t("export_modules", "sad", { projectId, moduleNames: ["NoSuchModule_xyz_999"] }, 150_000),
    t("export_all", "happy", { projectId }, 150_000),
    t("delete_module", "happy", { projectId, moduleName: "TestAnotherModule" }, 150_000),
    t("delete_module", "sad", { projectId, moduleName: "NoSuchModule_xyz_999" }, 150_000),
    t("list_objects", "happy", { projectId, filter: "*" }, 150_000),
    t("exists", "happy", { projectId, moduleName: "TestGoodModule" }, 150_000),
t("exists", "sad", { projectId, moduleName: "NoSuchModule_xyz_999" }, 150_000),
    // feat-759-no-compile (v1.19.0) — compile_vba was removed.
    t("fix_encoding", "happy", { projectId, location: "Source" }, 150_000),
    t("fix_encoding", "sad", { projectId, location: "InvalidLocation" }, 150_000),
    t(
      "generate_erd",
      "happy",
      { projectId, erdPath: join(workspaceRoot, "erd-output.txt") },
      150_000,
    ),
    t("run_vba", "happy", { procedureName: "TestGoodModule.Always42", argsJson: "[]" }, 150_000),
    t("run_vba", "sad", { procedureName: "NoSuchModule.NoSuchSub", argsJson: "[]" }, 150_000),
    t("test_vba", "happy", { projectId, proceduresJson: "[]" }, 150_000),
    t("test_vba", "sad", { projectId, proceduresJson: "not-valid-json" }, 150_000),
    t("verify_code", "happy", { projectId, moduleNames: ["TestGoodModule"], diff: true }, 150_000),
    // Whole-project (no moduleNames) cases are exercised by the dedicated
    // regression block below with stronger assertions than the universal
    // contract, because empty moduleNames means "verify everything" — a happy
    // path, not a sad one.
  );

  // ----- Query read path (smoke per tool) -----
  for (const tool of [
    "list_tables",
    "list_linked_tables",
    "get_schema",
    "count_rows",
    "distinct_values",
    "list_links",
    "get_relationships",
    "compare_backends",
    "list_access_files",
  ]) {
    const args: Record<string, unknown> = { ...ctx };
    if (tool === "get_schema") args.tableName = "TbNoConformidades";
    if (tool === "count_rows") args.tableName = "TbNoConformidades";
    if (tool === "distinct_values") {
      args.tableName = "TbNoConformidades";
      args.columnName = "ESTADO";
    }
    cases.push(t(tool, "happy", args));
  }
  cases.push(
    t("list_tables", "sad", { ...ctx, databasePath: join(workspaceRoot, "NoSuch.accdb") }),
    t("get_schema", "sad", { ...ctx, tableName: "NoSuchTable_xyz_999" }),
    t("count_rows", "sad", { ...ctx, tableName: "" }),
  );

  // ----- Query write/alias path -----
  cases.push(
    t("query_sql", "happy", { ...ctx, sql: "SELECT COUNT(*) AS N FROM TbNoConformidades" }),
    t("query_sql", "sad", { ...ctx, sql: "" }),
    t("exec_sql", "happy", { ...ctx, sql: "SELECT 1 AS One", dryRun: true }),
    t("exec_sql", "sad", {
      ...ctx,
      sql: "DROP TABLE TbNoConformidades",
      dryRun: false,
      apply: true,
    }),
    t("run_script", "happy", { ...ctx, scriptPath: "SELECT 1", dryRun: true }),
    t("run_script", "sad", { ...ctx, scriptPath: "", dryRun: true }),
    t("create_table", "happy", {
      ...ctx,
      tableName: "ZZZ_E2E_Probe",
      definition: "ID Long, Name Text(50)",
      dryRun: true,
    }),
    t("drop_table", "happy", { ...ctx, tableName: "ZZZ_E2E_NonExistent", dryRun: true }),
    t("seed_fixture", "happy", { ...ctx, tableName: "TbNoConformidades", rows: [], dryRun: true }),
    t("teardown_fixture", "happy", { ...ctx, tableName: "TbNoConformidades", dryRun: true }),
    t("link_tables", "happy", { ...ctx, dryRun: true }),
    t("relink_tables", "happy", { ...ctx, dryRun: true }),
    t("localize_backend_links", "happy", { ...ctx, dryRun: true }),
    t("unlink_table", "happy", { ...ctx, tableName: "ZZZ_E2E_NoSuch", dryRun: true }),
    t("export_queries", "happy", { ...ctx, exportPath: join(workspaceRoot, "queries.json") }),
    t("import_queries", "happy", { ...ctx, queryDefinitions: [], dryRun: true }),
    t("compact_repair", "happy", { ...ctx, backupFirst: true, dryRun: true }),
    t("relink_directory", "happy", { rootPath: workspaceRoot, dryRun: true }),
  );

  // ----- Aliases -----
  cases.push(
    t("list_access_operations", "happy", {}),
    t("cleanup_access_operation", "happy", { operationId: "bogus", accessPath: access }),
    t("cleanup_access_operation", "sad", { operationId: "../bad", accessPath: access }),
    t(
      "dysflow_vba_execute",
      "happy",
      { projectId, moduleName: "TestGoodModule", procedureName: "Always42" },
      60_000,
    ),
    t("dysflow_vba_execute", "sad", { projectId, procedureName: "NoSuchSub" }, 60_000),
  );

  // ----- Forms/ERD -----
  cases.push(
    t("validate_form_spec", "happy", {
      spec: { name: "Form_E2E_Probe", kind: "Form", controls: [] },
    }),
    t(
      "generate_form",
      "happy",
      {
        name: "Form_E2E_Probe",
        kind: "Form",
        spec: { name: "Form_E2E_Probe", kind: "Form", controls: [] },
        dryRun: true,
      },
      60_000,
    ),
    t("catalog_add_control", "happy", {
      catalogPath: join(workspaceRoot, "catalog.json"),
      controlName: "ProbeControl",
      controlType: "Button",
      spec: {},
    }),
    t(
      "harvest_form_catalog",
      "happy",
      { catalogPath: join(workspaceRoot, "harvest.json") },
      60_000,
    ),
  );

  return cases;
}

const allCases = buildToolCases();

describe.skipIf(!canRunE2e)(
  // feat-759-no-compile (v1.19.0) — compile_vba was removed; the E2E
  // surface covers all 50 tools now (68 -> 67 advertised; the harness
  // exercises 50 distinct tools).
  "dysflow MCP tool surface (issue #496 acceptance)",
  () => {
    beforeAll(() => {
      setupWorkspace();
    });
    afterAll(() => {
      try {
        rmSync(workspaceRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });

    for (const c of allCases) {
      it(
        `${c.tool} (${c.label})`,
        async () => {
          const r = await callMcp(c.tool, c.args, { timeoutMs: c.timeoutMs });
          assertUniversalContract(r);
        },
        c.timeoutMs + 30_000,
      );
    }

    // ----- Whole-project verify regression -----
    // A consumer reported VBA_MANAGER_FAILED ("...NormalizedModules ... matriz
    // vacía") when calling verify_code on a populated database without
    // moduleNames. Root cause: the PowerShell Export action rejected an empty
    // NormalizedModules array at parameter-binding time, before its export-all
    // branch could run. Omitting moduleNames must verify the ENTIRE project and
    // succeed (drift is data, not an error), never surface the empty-array bind
    // failure. These assert ok === true — stronger than the universal contract,
    // which a VBA_MANAGER_FAILED response would otherwise satisfy.
    const projectId = "dysflow-tool-e2e";
    const assertWholeProjectOk = (r: McpToolResponse): void => {
      assertUniversalContract(r);
      expect(r.text).not.toMatch(/VBA_MANAGER_FAILED/);
      expect(r.text).not.toMatch(/NormalizedModules|matriz vac|empty array/i);
      expect(r.ok).toBe(true);
    };

    it("verify_code verifies the whole project when no moduleNames are given", async () => {
      const r = await callMcp("verify_code", { projectId, diff: true }, { timeoutMs: 60_000 });
      assertWholeProjectOk(r);
    }, 90_000);
  },
);

// ----- Non-ASCII module name roundtrip (CopyObject Unicode-safe fix) -----
// Root cause: DoCmd.CopyObject mangles non-ASCII chars in the new object name (e.g. Módulo1 →
// Mód×lo1). The fix forces VBComponent.Name via the COM property setter after CopyObject. These
// tests verify the full create and delete+re-import paths against a temporary fixture workspace.
const nonAsciiWorkspace = join(tmpdir(), `dysflow-nonascii-e2e-${process.pid}-${Date.now()}`);
const nonAsciiModuleName = "TestMódulo"; // TestMódulo — ó = U+00F3
const nonAsciiProjectId = "dysflow-nonascii-e2e";

function setupNonAsciiWorkspace(): void {
  mkdirSync(join(nonAsciiWorkspace, ".dysflow"), { recursive: true });
  mkdirSync(join(nonAsciiWorkspace, "src", "modules"), { recursive: true });
  cpSync(fixtureFront, join(nonAsciiWorkspace, "NoConformidades.accdb"));
  cpSync(fixtureBackend, join(nonAsciiWorkspace, "NoConformidades_Datos.accdb"));
  writeFileSync(
    join(nonAsciiWorkspace, ".dysflow", "project.json"),
    `${JSON.stringify(
      {
        id: nonAsciiProjectId,
        accessPath: "NoConformidades.accdb",
        backendPath: "NoConformidades_Datos.accdb",
        destinationRoot: "src",
        allowWrites: true,
        timeoutMs: 120_000,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  // Module with a non-ASCII VBA name — UTF-8 file, ó stored as C3 B3.
  // This is the exact encoding pattern that triggered the CopyObject mojibake.
  const content = [
    `Attribute VB_Name = "${nonAsciiModuleName}"`,
    "Option Compare Database",
    "Option Explicit",
    "",
    "Public Function SiempreCinco() As Long",
    "    SiempreCinco = 5",
    "End Function",
    "",
  ].join("\r\n");
  writeFileSync(
    join(nonAsciiWorkspace, "src", "modules", `${nonAsciiModuleName}.bas`),
    content,
    "utf8",
  );
}

describe.skipIf(!canRunE2e)(
  "import_modules: non-ASCII module name roundtrip (CopyObject Unicode-safe fix)",
  () => {
    beforeAll(() => {
      setupNonAsciiWorkspace();
    });
    afterAll(() => {
      try {
        rmSync(nonAsciiWorkspace, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });

    it("imports a new non-ASCII module without mangling VBComponent.Name", async () => {
      // The module does not exist in the fixture → goes through New-VbComponentFromCodeFile
      // → the CopyObject branch → the Unicode-safe .Name fix must apply.
      const r = await callMcp(
        "import_modules",
        {
          projectId: nonAsciiProjectId,
          moduleNames: [nonAsciiModuleName],
          importMode: "Code",
          dryRun: false,
        },
        { timeoutMs: 60_000, cwd: nonAsciiWorkspace },
      );
      assertUniversalContract(r);
      expect(r.ok).toBe(true);

      const list = await callMcp(
        "list_objects",
        { projectId: nonAsciiProjectId, filter: "*" },
        { timeoutMs: 60_000, cwd: nonAsciiWorkspace },
      );
      assertUniversalContract(list);
      // Exact Unicode match — no mojibake variant (×, ?, Ã, etc.)
      expect(list.text).toContain(nonAsciiModuleName);
      expect(list.text).not.toMatch(/TestM[^ó]dulo/);
    }, 120_000);

    it("delete + re-import preserves the non-ASCII module name", async () => {
      const del = await callMcp(
        "delete_module",
        { projectId: nonAsciiProjectId, moduleName: nonAsciiModuleName },
        { timeoutMs: 60_000, cwd: nonAsciiWorkspace },
      );
      assertUniversalContract(del);

      const reimport = await callMcp(
        "import_modules",
        {
          projectId: nonAsciiProjectId,
          moduleNames: [nonAsciiModuleName],
          importMode: "Code",
          dryRun: false,
        },
        { timeoutMs: 60_000, cwd: nonAsciiWorkspace },
      );
      assertUniversalContract(reimport);
      expect(reimport.ok).toBe(true);

      const list = await callMcp(
        "list_objects",
        { projectId: nonAsciiProjectId, filter: "*" },
        { timeoutMs: 60_000, cwd: nonAsciiWorkspace },
      );
      assertUniversalContract(list);
      expect(list.text).toContain(nonAsciiModuleName);
      expect(list.text).not.toMatch(/TestM[^ó]dulo/);
    }, 120_000);
  },
);
