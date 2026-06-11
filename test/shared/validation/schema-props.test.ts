import { describe, expect, it } from "vitest";
import {
  SCHEMA_PROPS,
  CTX_PROPS,
  ACCESS_OVERRIDE,
  STRICT_CTX,
} from "../../../src/shared/validation";

describe("SCHEMA_PROPS — shared schema property atoms", () => {
  it("contains projectId with correct type and description", () => {
    expect(SCHEMA_PROPS.projectId).toEqual({
      type: "string",
      description: "Canonical project identity for traceability.",
    });
  });

  it("contains contextId with correct type and description", () => {
    expect(SCHEMA_PROPS.contextId).toEqual({
      type: "string",
      description: "Optional run/context id for this call.",
    });
  });

  it("contains accessPath with correct type and description", () => {
    expect(SCHEMA_PROPS.accessPath).toEqual({
      type: "string",
      description: "Optional override for Access frontend database path.",
    });
  });

  it("contains backendPath with correct type and description", () => {
    expect(SCHEMA_PROPS.backendPath).toEqual({
      type: "string",
      description: "Optional override for Access backend database path.",
    });
  });

  it("contains databasePath with correct type and description", () => {
    expect(SCHEMA_PROPS.databasePath).toEqual({
      type: "string",
      description: "Database path.",
    });
  });

  it("contains sql with minLength and maxLength constraints", () => {
    expect(SCHEMA_PROPS.sql).toEqual({
      type: "string",
      minLength: 1,
      maxLength: 100000,
      description: "SQL text.",
    });
  });

  it("contains dryRun and apply boolean properties", () => {
    expect(SCHEMA_PROPS.dryRun).toEqual({
      type: "boolean",
      description: "Run without applying writes.",
    });
    expect(SCHEMA_PROPS.apply).toEqual({
      type: "boolean",
      description: "Apply a write instead of dry run.",
    });
  });

  it("contains timeoutMs with minimum constraint", () => {
    expect(SCHEMA_PROPS.timeoutMs).toEqual({
      type: "number",
      minimum: 1,
      description: "Operation timeout in milliseconds. Overrides project config timeout.",
    });
  });

  it("contains moduleNames array with maxItems constraint", () => {
    expect(SCHEMA_PROPS.moduleNames).toEqual({
      type: "array",
      maxItems: 100,
      items: { type: "string" },
      description: "VBA module names.",
    });
  });

  it("contains importMode with enum values", () => {
    expect(SCHEMA_PROPS.importMode).toEqual({
      type: "string",
      enum: ["Auto", "Form", "Code", "auto", "form", "code", "replace"],
      description:
        "VBA import mode. Lowercase aliases and replace are normalized before invoking the runner.",
    });
  });

  it("contains strictContext boolean property", () => {
    expect(SCHEMA_PROPS.strictContext).toEqual({
      type: "boolean",
      description: "Abort before opening Access if resolved target does not match expected paths.",
    });
  });

  it("has all expected keys", () => {
    const expectedKeys = [
      "projectId",
      "contextId",
      "accessPath",
      "backendPath",
      "comparePath",
      "databasePath",
      "sourcePath",
      "rootPath",
      "directory",
      "exportPath",
      "importPath",
      "path",
      "scriptPath",
      "destinationRoot",
      "projectRoot",
      "tableName",
      "table",
      "columnName",
      "column",
      "definition",
      "fields",
      "sql",
      "query",
      "queryDefinitions",
      "queries",
      "rows",
      "dryRun",
      "apply",
      "allowTables",
      "allowTable",
      "denyTables",
      "denyTable",
      "moduleName",
      "moduleNames",
      "procedureName",
      "proceduresJson",
      "argsJson",
      "compile",
      "filter",
      "importMode",
      "mode",
      "strict",
      "strictContext",
      "expectedAccessPath",
      "expectedProjectRoot",
      "expectedDestinationRoot",
      "name",
      "operationId",
      "force",
      "backup",
      "backupFirst",
      "diff",
      "limit",
      "timeoutMs",
      "replace",
      "strict_write",
      "erdPath",
      "catalogPath",
      "specPath",
      "spec",
      "kind",
      "controlName",
      "controlType",
      "type",
      "location",
      "top",
      "testsPath",
      "exists_name",
    ];
    expect(Object.keys(SCHEMA_PROPS).sort()).toEqual(expectedKeys.sort());
  });
});

describe("CTX_PROPS — shared context properties", () => {
  it("contains only projectId and contextId from SCHEMA_PROPS", () => {
    expect(CTX_PROPS).toEqual({
      projectId: SCHEMA_PROPS.projectId,
      contextId: SCHEMA_PROPS.contextId,
    });
  });
});

describe("ACCESS_OVERRIDE — shared access path overrides", () => {
  it("contains accessPath, backendPath, destinationRoot, projectRoot", () => {
    expect(ACCESS_OVERRIDE).toEqual({
      accessPath: SCHEMA_PROPS.accessPath,
      backendPath: SCHEMA_PROPS.backendPath,
      destinationRoot: SCHEMA_PROPS.destinationRoot,
      projectRoot: SCHEMA_PROPS.projectRoot,
    });
  });
});

describe("STRICT_CTX — strict context guard properties", () => {
  it("contains strictContext and expected path properties", () => {
    expect(STRICT_CTX).toEqual({
      strictContext: SCHEMA_PROPS.strictContext,
      expectedAccessPath: SCHEMA_PROPS.expectedAccessPath,
      expectedProjectRoot: SCHEMA_PROPS.expectedProjectRoot,
      expectedDestinationRoot: SCHEMA_PROPS.expectedDestinationRoot,
    });
  });
});