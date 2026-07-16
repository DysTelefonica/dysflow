import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildMaintenanceRequest,
  buildQueryReadRequest,
  buildWriteFixtureRequest,
  coerceTimeoutMs,
  getStr,
  isValidQueryTarget,
  pickOverrides,
  pickQueryTarget,
  VALID_QUERY_TARGETS,
} from "../../../src/core/mapping/access-query-request-mapper.js";

/**
 * Project-relative override fields. Every `build*` builder MUST populate
 * these from the same `pickOverrides(params)` helper, so the builder
 * outputs are deep-equal across each other for the override slice.
 */
const OVERRIDE_KEYS = [
  "projectId",
  "contextId",
  "accessPath",
  "destinationRoot",
  "projectRoot",
  "strictContext",
  "expectedAccessPath",
  "expectedProjectRoot",
  "expectedDestinationRoot",
  "timeoutMs",
  "target",
] as const;

function pickOverrideSlice(request: Record<string, unknown>): Record<string, unknown> {
  const slice: Record<string, unknown> = {};
  for (const key of OVERRIDE_KEYS) slice[key] = request[key];
  return slice;
}

describe("access-query-request-mapper", () => {
  describe("getStr", () => {
    it("returns string values and resolves fallback keys in order", () => {
      expect(getStr({ tableName: "People" }, "tableName", ["table"])).toBe("People");
      expect(getStr({ table: "People" }, "tableName", ["table"])).toBe("People");
      expect(getStr({ tableName: "   ", table: "People" }, "tableName", ["table"])).toBe("People");
      expect(getStr({}, "tableName", ["table"])).toBeUndefined();
    });
  });

  describe("buildQueryReadRequest", () => {
    it("maps a read request with action and mode fixed by the caller", () => {
      const request = buildQueryReadRequest("query_sql", { sql: "SELECT 1" });
      expect(request).toEqual({
        action: "query_sql",
        mode: "read",
        sql: "SELECT 1",
        tableName: undefined,
        columnName: undefined,
        backendPath: undefined,
        databasePath: undefined,
        rootPath: undefined,
        exportPath: undefined,
        importPath: undefined,
        queryDefinitions: undefined,
      });
    });

    it("aliases sql<-query, tableName<-table, columnName<-column", () => {
      const request = buildQueryReadRequest("count_rows", {
        query: "SELECT 2",
        table: "People",
        column: "name",
      });
      expect(request.sql).toBe("SELECT 2");
      expect(request.tableName).toBe("People");
      expect(request.columnName).toBe("name");
    });

    it("aliases backendPath<-comparePath, databasePath<-sourcePath, rootPath<-directory", () => {
      const request = buildQueryReadRequest("compare_backends", {
        comparePath: "C:/backend.accdb",
        sourcePath: "C:/source.accdb",
        directory: "C:/root",
      });
      expect(request.backendPath).toBe("C:/backend.accdb");
      expect(request.databasePath).toBe("C:/source.accdb");
      expect(request.rootPath).toBe("C:/root");
    });

    it("aliases exportPath<-path and importPath<-path", () => {
      const request = buildQueryReadRequest("export_queries", { path: "C:/out" });
      expect(request.exportPath).toBe("C:/out");
      expect(request.importPath).toBe("C:/out");
    });

    it("prefers queryDefinitions then falls back to queries", () => {
      const fromDefinitions = buildQueryReadRequest("export_queries", {
        queryDefinitions: [{ name: "q1", sql: "SELECT 1" }],
      });
      expect(fromDefinitions.queryDefinitions).toEqual([{ name: "q1", sql: "SELECT 1" }]);

      const fromQueries = buildQueryReadRequest("export_queries", {
        queries: [{ name: "q2", sql: "SELECT 2" }],
      });
      expect(fromQueries.queryDefinitions).toEqual([{ name: "q2", sql: "SELECT 2" }]);
    });

    it("defaults sql to empty string and treats non-record input as empty params", () => {
      expect(buildQueryReadRequest("list_tables", undefined).sql).toBe("");
      expect(buildQueryReadRequest("list_tables", undefined).action).toBe("list_tables");
      expect(buildQueryReadRequest("list_tables", 42).sql).toBe("");
    });

    it("throws an error if the action is invalid", () => {
      expect(() => buildQueryReadRequest("invalid_action" as unknown as "list_tables", {})).toThrow(
        "Invalid Access query action",
      );
    });

    it("maps context and override properties", () => {
      const request = buildQueryReadRequest("query_sql", {
        projectId: "proj-123",
        contextId: "ctx-456",
        accessPath: "C:/access.accdb",
        backendPath: "C:/backend.accdb",
        destinationRoot: "C:/dest",
        projectRoot: "C:/proj",
        timeoutMs: 5000,
        strictContext: true,
        expectedAccessPath: "C:/expected-access.accdb",
        expectedProjectRoot: "C:/expected-proj",
        expectedDestinationRoot: "C:/expected-dest",
      });
      expect(request.projectId).toBe("proj-123");
      expect(request.contextId).toBe("ctx-456");
      expect(request.accessPath).toBe("C:/access.accdb");
      expect(request.backendPath).toBe("C:/backend.accdb");
      expect(request.destinationRoot).toBe("C:/dest");
      expect(request.projectRoot).toBe("C:/proj");
      expect(request.timeoutMs).toBe(5000);
      expect(request.strictContext).toBe(true);
      expect(request.expectedAccessPath).toBe("C:/expected-access.accdb");
      expect(request.expectedProjectRoot).toBe("C:/expected-proj");
      expect(request.expectedDestinationRoot).toBe("C:/expected-dest");
    });
  });

  describe("buildWriteFixtureRequest", () => {
    it("fixes mode to write and maps fixture-specific fields", () => {
      const request = buildWriteFixtureRequest("seed_fixture", {
        table: "People",
        fields: "id INT",
        rows: [{ id: 1 }, "skip", { id: 2 }],
        scriptPath: "C:/seed.sql",
      });
      expect(request.action).toBe("seed_fixture");
      expect(request.mode).toBe("write");
      expect(request.tableName).toBe("People");
      expect(request.definition).toBe("id INT");
      expect(request.rows).toEqual([{ id: 1 }, { id: 2 }]);
      expect(request.scriptPath).toBe("C:/seed.sql");
    });

    it("resolves dryRun: apply=true => false, dryRun=false => false, otherwise true", () => {
      expect(buildWriteFixtureRequest("exec_sql", { apply: true }).dryRun).toBe(false);
      expect(buildWriteFixtureRequest("exec_sql", { dryRun: false }).dryRun).toBe(false);
      expect(buildWriteFixtureRequest("exec_sql", {}).dryRun).toBe(true);
      expect(buildWriteFixtureRequest("exec_sql", undefined).dryRun).toBe(true);
    });

    it("aliases allowTables<-allowTable and denyTables<-denyTable (single -> array)", () => {
      const request = buildWriteFixtureRequest("create_table", {
        allowTable: "People",
        denyTable: "Secret",
      });
      expect(request.allowTables).toEqual(["People"]);
      expect(request.denyTables).toEqual(["Secret"]);
    });

    it("prefers array allowTables/denyTables over the single alias", () => {
      const request = buildWriteFixtureRequest("create_table", {
        allowTables: ["A", "B"],
        allowTable: "C",
      });
      expect(request.allowTables).toEqual(["A", "B"]);
    });

    it("maps context and override properties", () => {
      const request = buildWriteFixtureRequest("seed_fixture", {
        projectId: "proj-123",
        contextId: "ctx-456",
        accessPath: "C:/access.accdb",
        backendPath: "C:/backend.accdb",
        destinationRoot: "C:/dest",
        projectRoot: "C:/proj",
        timeoutMs: 5000,
        strictContext: true,
        expectedAccessPath: "C:/expected-access.accdb",
        expectedProjectRoot: "C:/expected-proj",
        expectedDestinationRoot: "C:/expected-dest",
      });
      expect(request.projectId).toBe("proj-123");
      expect(request.contextId).toBe("ctx-456");
      expect(request.accessPath).toBe("C:/access.accdb");
      expect(request.backendPath).toBe("C:/backend.accdb");
      expect(request.destinationRoot).toBe("C:/dest");
      expect(request.projectRoot).toBe("C:/proj");
      expect(request.timeoutMs).toBe(5000);
      expect(request.strictContext).toBe(true);
      expect(request.expectedAccessPath).toBe("C:/expected-access.accdb");
      expect(request.expectedProjectRoot).toBe("C:/expected-proj");
      expect(request.expectedDestinationRoot).toBe("C:/expected-dest");
    });
  });

  describe("buildMaintenanceRequest", () => {
    it("uses the caller-supplied mode and action", () => {
      const read = buildMaintenanceRequest(
        "list_links",
        "read",
        { table: "People" },
        () => undefined,
      );
      expect(read.action).toBe("list_links");
      expect(read.mode).toBe("read");

      const write = buildMaintenanceRequest("link_tables", "write", {}, () => undefined);
      expect(write.mode).toBe("write");
    });

    // Issue #851 — link_tables gains an opt-in create capability. The tool-level
    // `mode: "create-or-relink"` param is forwarded as `linkMode` (NOT the
    // read/write dispatch `mode`), and `tableNames[]` scopes the operation.
    it("forwards link_tables mode->linkMode and tableNames (#851 create-or-relink)", () => {
      const request = buildMaintenanceRequest(
        "link_tables",
        "write",
        {
          mode: "create-or-relink",
          tableNames: ["TbResponsablesPorRol", "TbOtra"],
          backendPath: "C:/backend.accdb",
        },
        () => undefined,
      );
      expect(request.linkMode).toBe("create-or-relink");
      expect(request.tableNames).toEqual(["TbResponsablesPorRol", "TbOtra"]);
      // The read/write dispatch mode is unaffected by the tool-level link mode.
      expect(request.mode).toBe("write");
    });

    it("omits linkMode/tableNames when not supplied (relink-only default) (#851)", () => {
      const request = buildMaintenanceRequest(
        "link_tables",
        "write",
        { backendPath: "C:/backend.accdb" },
        () => undefined,
      );
      expect(request.linkMode).toBeUndefined();
      expect(request.tableNames).toBeUndefined();
    });

    it("filters maps to well-formed {from,to} string pairs", () => {
      const request = buildMaintenanceRequest(
        "relink_tables",
        "write",
        {
          maps: [{ from: "a", to: "b" }, { from: 1, to: "c" }, "garbage", { from: "d", to: "e" }],
        },
        () => undefined,
      );
      expect(request.maps).toEqual([
        { from: "a", to: "b" },
        { from: "d", to: "e" },
      ]);
    });

    it("maps boolean toggles: strictLocal, removeUnresolved, noBackup<-backup===false, recursive, timeoutMs", () => {
      const request = buildMaintenanceRequest(
        "localize_backend_links",
        "write",
        {
          strictLocal: true,
          removeUnresolved: true,
          backup: false,
          recursive: false,
          timeoutMs: 1234,
        },
        () => undefined,
      );
      expect(request.strictLocal).toBe(true);
      expect(request.removeUnresolved).toBe(true);
      expect(request.noBackup).toBe(true);
      expect(request.recursive).toBe(false);
      expect(request.timeoutMs).toBe(1234);
    });

    it("forwards backupFirst so compact_repair can back up before compacting", () => {
      const on = buildMaintenanceRequest(
        "compact_repair",
        "write",
        { backupFirst: true },
        () => undefined,
      );
      expect(on.backupFirst).toBe(true);
      const off = buildMaintenanceRequest("compact_repair", "write", {}, () => undefined);
      expect(off.backupFirst).toBeUndefined();
    });

    it("defaults compact_repair to the frontend and accepts an explicit backend target", () => {
      expect(buildMaintenanceRequest("compact_repair", "write", {}, () => undefined).target).toBe(
        "frontend",
      );
      expect(
        buildMaintenanceRequest("compact_repair", "write", { target: "backend" }, () => undefined)
          .target,
      ).toBe("backend");
    });

    it("uses deterministic compact_repair path precedence: databasePath, sourcePath, accessPath", () => {
      const request = buildMaintenanceRequest(
        "compact_repair",
        "write",
        {
          accessPath: "C:/explicit/frontend.accdb",
          sourcePath: "C:/explicit/source.accdb",
          databasePath: "C:/explicit/database.accdb",
        },
        () => undefined,
      );
      expect(request.databasePath).toBe("C:/explicit/database.accdb");

      const sourceAlias = buildMaintenanceRequest(
        "compact_repair",
        "write",
        { accessPath: "C:/explicit/frontend.accdb", sourcePath: "C:/explicit/source.accdb" },
        () => undefined,
      );
      expect(sourceAlias.databasePath).toBe("C:/explicit/source.accdb");

      const accessAlias = buildMaintenanceRequest(
        "compact_repair",
        "write",
        { accessPath: "C:/explicit/frontend.accdb" },
        () => undefined,
      );
      expect(accessAlias.databasePath).toBe("C:/explicit/frontend.accdb");
    });

    it("resolves backendPassword from explicit value, then password alias", () => {
      expect(
        buildMaintenanceRequest("link_tables", "write", { backendPassword: "x" }, () => undefined)
          .backendPassword,
      ).toBe("x");
      expect(
        buildMaintenanceRequest("link_tables", "write", { password: "y" }, () => undefined)
          .backendPassword,
      ).toBe("y");
    });

    it("resolves backendPassword from passwordEnv via the env accessor", () => {
      const request = buildMaintenanceRequest(
        "link_tables",
        "write",
        { passwordEnv: "ACCESS_VBA_PASSWORD" },
        (key) => (key === "ACCESS_VBA_PASSWORD" ? "from-env" : undefined),
      );
      expect(request.backendPassword).toBe("from-env");
    });

    it("preserves backendPassword so the maintenance error sink can redact it (#429)", () => {
      const request = buildMaintenanceRequest(
        "compact_repair",
        "write",
        { password: "topsecret" },
        () => undefined,
      );
      expect(request.backendPassword).toBe("topsecret");
    });

    it("maps context and override properties", () => {
      const request = buildMaintenanceRequest(
        "link_tables",
        "write",
        {
          projectId: "proj-123",
          contextId: "ctx-456",
          accessPath: "C:/access.accdb",
          backendPath: "C:/backend.accdb",
          destinationRoot: "C:/dest",
          projectRoot: "C:/proj",
          timeoutMs: 5000,
          strictContext: true,
          expectedAccessPath: "C:/expected-access.accdb",
          expectedProjectRoot: "C:/expected-proj",
          expectedDestinationRoot: "C:/expected-dest",
        },
        () => undefined,
      );
      expect(request.projectId).toBe("proj-123");
      expect(request.contextId).toBe("ctx-456");
      expect(request.accessPath).toBe("C:/access.accdb");
      expect(request.backendPath).toBe("C:/backend.accdb");
      expect(request.destinationRoot).toBe("C:/dest");
      expect(request.projectRoot).toBe("C:/proj");
      expect(request.timeoutMs).toBe(5000);
      expect(request.strictContext).toBe(true);
      expect(request.expectedAccessPath).toBe("C:/expected-access.accdb");
      expect(request.expectedProjectRoot).toBe("C:/expected-proj");
      expect(request.expectedDestinationRoot).toBe("C:/expected-dest");
    });
  });

  // ---------------------------------------------------------------
  // PR 3 (#F override dedup + #E coerceTimeoutMs helper) — structural,
  // happy, edge, and regression coverage. Strict TDD: RED before GREEN.
  // ---------------------------------------------------------------

  describe("pickOverrides", () => {
    it("is the single source of override fields (structural)", () => {
      const source = readFileSync("src/core/mapping/access-query-request-mapper.ts", "utf8");
      // The 9 override-only string keys each map to `getStr(params, "X")`.
      // `expectedAccessPath` is unique to the override set (no builder
      // uses it for any other field), so its `getStr` call site count is
      // the cleanest canary for "single source of truth".
      const overrideOnlyCalls =
        source.match(/getStr\(params,\s*["']expectedAccessPath["']\)/g) ?? [];
      expect(overrideOnlyCalls.length).toBe(1);
      // The same invariant for `expectedProjectRoot` (another override-only key).
      const expectedProjectRootCalls =
        source.match(/getStr\(params,\s*["']expectedProjectRoot["']\)/g) ?? [];
      expect(expectedProjectRootCalls.length).toBe(1);
    });

    it("all 3 builders produce identical override shapes for the same input (happy)", () => {
      const params = {
        projectId: "proj-123",
        contextId: "ctx-456",
        accessPath: "C:/access.accdb",
        destinationRoot: "C:/dest",
        projectRoot: "C:/proj",
        timeoutMs: 5000,
        strictContext: true,
        expectedAccessPath: "C:/expected-access.accdb",
        expectedProjectRoot: "C:/expected-proj",
        expectedDestinationRoot: "C:/expected-dest",
        target: "frontend" as const,
      };
      const readRequest = buildQueryReadRequest("query_sql", params);
      const writeRequest = buildWriteFixtureRequest("seed_fixture", params);
      const maintRequest = buildMaintenanceRequest(
        "compact_repair",
        "write",
        params,
        () => undefined,
      );

      const readSlice = pickOverrideSlice(readRequest as unknown as Record<string, unknown>);
      const writeSlice = pickOverrideSlice(writeRequest as unknown as Record<string, unknown>);
      const maintSlice = pickOverrideSlice(maintRequest as unknown as Record<string, unknown>);

      expect(readSlice).toEqual(writeSlice);
      expect(writeSlice).toEqual(maintSlice);
    });

    it("preserves missing-field defaults as undefined (edge)", () => {
      const result = pickOverrides({ projectId: "only-this" });
      // Provided field passes through.
      expect(result.projectId).toBe("only-this");
      // Every other override field is undefined — not null, not absent, not defaulted.
      for (const key of OVERRIDE_KEYS) {
        if (key === "projectId") continue;
        expect(result[key]).toBeUndefined();
      }
    });

    it("delegates timeoutMs to coerceTimeoutMs (identity)", () => {
      // Behavioral check: passing a number returns the number.
      const result = pickOverrides({ timeoutMs: 12345 });
      expect(result.timeoutMs).toBe(12345);
      // Structural check: pickOverrides MUST call coerceTimeoutMs on params.timeoutMs.
      // The TypeScript-narrowing cast (`as number | string | undefined`) is
      // allowed by the regex because the cast is the same call site, not a
      // different one.
      const source = readFileSync("src/core/mapping/access-query-request-mapper.ts", "utf8");
      expect(source).toMatch(/timeoutMs:\s*coerceTimeoutMs\(params\.timeoutMs(?:\s+as\s+[^)]+)?\)/);
    });
  });

  describe("coerceTimeoutMs", () => {
    it("is the only timeoutMs coercion site in the mapper (structural)", () => {
      const source = readFileSync("src/core/mapping/access-query-request-mapper.ts", "utf8");
      // Exactly one definition (export or local).
      const definitions = source.match(/(?:export\s+)?function\s+coerceTimeoutMs\b/g) ?? [];
      expect(definitions.length).toBe(1);
      // Exactly one call site.
      const callSites = source.match(/\bcoerceTimeoutMs\(/g) ?? [];
      // 1 definition + 1 call site in pickOverrides = 2 matches.
      expect(callSites.length).toBe(2);
      // The 3 inline `typeof === "string"` blocks MUST be gone.
      const inlineBlocks = source.match(/typeof\s+params\.timeoutMs\s*===\s*["']string["']/g) ?? [];
      expect(inlineBlocks.length).toBe(0);
    });

    it("number pass-through returns the number (regression)", () => {
      expect(coerceTimeoutMs(12345)).toBe(12345);
    });

    it("undefined pass-through returns undefined (regression)", () => {
      expect(coerceTimeoutMs(undefined)).toBeUndefined();
    });

    it("throws TypeError on a string input — design decision 5 pins throw, not silent coerce", () => {
      // The Zod schema declares `timeoutMs: z.number().optional()`, so a
      // string reaching coerceTimeoutMs is a programming error. The
      // helper MUST fail loud instead of silently accepting the dead
      // branch the refactor was meant to delete. We pin the message so
      // this test stays RED before the helper exists (the "is not a
      // function" TypeError has a different message).
      expect(() => coerceTimeoutMs("15000" as unknown as number)).toThrow(
        /timeoutMs must be a number/,
      );
    });
  });

  describe("target (#716)", () => {
    it("VALID_QUERY_TARGETS exposes only 'frontend' and 'backend'", () => {
      // v1.20.0 (#763) — `auto` is added as a third value (see the
      // dedicated `target (#763) — auto enum value` describe block below).
      // The shape of this assertion is preserved by sorting so the order
      // doesn't matter; it pins the v1.19.0 minimum + the v1.20.0 addition.
      expect([...VALID_QUERY_TARGETS].sort()).toEqual(["auto", "backend", "frontend"]);
    });

    it("isValidQueryTarget accepts the two valid roles and rejects everything else", () => {
      expect(isValidQueryTarget("frontend")).toBe(true);
      expect(isValidQueryTarget("backend")).toBe(true);
      // v1.20.0 (#763) — `auto` is now a third valid value.
      expect(isValidQueryTarget("auto")).toBe(true);
      expect(isValidQueryTarget("FRONTEND")).toBe(false);
      expect(isValidQueryTarget(123)).toBe(false);
      expect(isValidQueryTarget(undefined)).toBe(false);
      expect(isValidQueryTarget(null)).toBe(false);
    });

    it("pickQueryTarget returns the value when valid and undefined otherwise", () => {
      expect(pickQueryTarget({ target: "frontend" })).toBe("frontend");
      expect(pickQueryTarget({ target: "backend" })).toBe("backend");
      // v1.20.0 (#763) — `auto` round-trips through the picker.
      expect(pickQueryTarget({ target: "auto" })).toBe("auto");
      expect(pickQueryTarget({})).toBeUndefined();
    });

    it("pickOverrides surfaces target as part of the override slice (#716)", () => {
      const result = pickOverrides({ projectId: "p", target: "backend" });
      expect(result.target).toBe("backend");
      expect(result.projectId).toBe("p");
    });

    it("buildQueryReadRequest for get_schema passes target through to the request", () => {
      const request = buildQueryReadRequest("get_schema", {
        projectId: "p",
        target: "frontend",
        tableName: "TbConfiguracionBackends",
      });
      expect(request.target).toBe("frontend");
      expect(request.tableName).toBe("TbConfiguracionBackends");
      expect(request.projectId).toBe("p");
    });

    it("buildQueryReadRequest omits target when not provided", () => {
      const request = buildQueryReadRequest("get_schema", {
        projectId: "p",
        tableName: "TbConfiguracionBackends",
      });
      expect(request.target).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------
  // PR-2 of v1.20.0 (issues #763 + #764) — `target: "auto"` is a NEW
  // third enum value (#763). The mapper MUST accept it like the other
  // roles so the consumer can opt into the cross-DB lookup primitive.
  // Behavior-preserving refactors (e.g. extracting the picker) MUST NOT
  // flip these tests red; they assert on the public surface (enum
  // membership + round-trip via pickQueryTarget / pickOverrides /
  // buildQueryReadRequest).
  // -----------------------------------------------------------------

  describe("target (#763) — auto enum value", () => {
    it("VALID_QUERY_TARGETS exposes 'auto' alongside 'frontend' and 'backend'", () => {
      expect([...VALID_QUERY_TARGETS].sort()).toEqual(["auto", "backend", "frontend"]);
    });

    it("isValidQueryTarget accepts 'auto' (and still rejects everything else)", () => {
      expect(isValidQueryTarget("auto")).toBe(true);
      expect(isValidQueryTarget("frontend")).toBe(true);
      expect(isValidQueryTarget("backend")).toBe(true);
      expect(isValidQueryTarget("AUTO")).toBe(false);
      expect(isValidQueryTarget("auto ")).toBe(false);
      expect(isValidQueryTarget(123)).toBe(false);
      expect(isValidQueryTarget(undefined)).toBe(false);
      expect(isValidQueryTarget(null)).toBe(false);
    });

    it("pickQueryTarget returns 'auto' when given 'auto' and undefined otherwise", () => {
      expect(pickQueryTarget({ target: "auto" })).toBe("auto");
      expect(pickQueryTarget({ target: "frontend" })).toBe("frontend");
      expect(pickQueryTarget({ target: "backend" })).toBe("backend");
      expect(pickQueryTarget({})).toBeUndefined();
    });

    it("pickOverrides surfaces target='auto' as part of the override slice", () => {
      const result = pickOverrides({ projectId: "p", target: "auto" });
      expect(result.target).toBe("auto");
      expect(result.projectId).toBe("p");
    });

    it("buildQueryReadRequest for get_schema passes target='auto' through to the request", () => {
      const request = buildQueryReadRequest("get_schema", {
        projectId: "p",
        target: "auto",
        tableName: "TbConfiguracionBackends",
      });
      expect(request.target).toBe("auto");
      expect(request.tableName).toBe("TbConfiguracionBackends");
      expect(request.projectId).toBe("p");
    });

    it("buildQueryReadRequest for count_rows preserves target='auto' + tableName", () => {
      const request = buildQueryReadRequest("count_rows", {
        target: "auto",
        table: "People",
      });
      expect(request.target).toBe("auto");
      expect(request.tableName).toBe("People");
    });
  });

  describe("frontend-only DAO actions (#870)", () => {
    it.each([
      "list_linked_tables",
      "list_links",
      "export_queries",
      "link_tables",
      "relink_tables",
      "localize_backend_links",
      "unlink_table",
      "import_queries",
    ] as const)("forces %s to the frontend role while preserving context", (action) => {
      const request =
        action === "list_linked_tables"
          ? buildQueryReadRequest(action, { projectId: "split" })
          : buildMaintenanceRequest(
              action,
              action === "export_queries" ? "read" : "write",
              {
                projectId: "split",
                backendPath: "C:/data.accdb",
              },
              () => undefined,
            );

      expect(request.projectId).toBe("split");
      expect(request.target).toBe("frontend");
    });
  });
});
