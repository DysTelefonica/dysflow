import { describe, expect, it } from "vitest";
import {
  buildMaintenanceRequest,
  buildQueryReadRequest,
  buildWriteFixtureRequest,
  getStr,
} from "../../../src/core/mapping/access-query-request-mapper.js";

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
});
