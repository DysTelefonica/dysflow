import { describe, expect, it } from "vitest";
import {
  ACCESS_OVERRIDE,
  CTX_PROPS,
  SCHEMA_PROPS,
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

  it("contains dryRun and apply boolean properties that advertise the write contract", () => {
    const dryRun = SCHEMA_PROPS.dryRun as { type: string; description: string };
    expect(dryRun.type).toBe("boolean");
    expect(dryRun.description).toMatch(/default/i);
    expect(dryRun.description).toMatch(/dry[- ]?run/i);

    const apply = SCHEMA_PROPS.apply as { type: string; description: string };
    expect(apply.type).toBe("boolean");
    expect(apply.description).toMatch(/commit|appl/i);
    expect(apply.description).toMatch(/precedence|default/i);
  });

  it("allows zero-valued form coordinates", () => {
    expect(SCHEMA_PROPS.left).toMatchObject({ type: "number", minimum: 0 });
    expect(SCHEMA_PROPS.top).toMatchObject({ type: "number", minimum: 0 });
  });

  it("contains timeoutMs with minimum constraint", () => {
    expect(SCHEMA_PROPS.timeoutMs).toEqual({
      type: "number",
      minimum: 1,
      description: "Operation timeout in milliseconds. Overrides project config timeout.",
    });
  });

  it("contains moduleNames array with no hard length cap (R1 consumer request)", () => {
    // R1 of the consumer request: long lists (20-30+) must reach the
    // PowerShell runner untruncated. The legacy maxItems:100 cap is removed
    // (commit 2026-06-27 consumer-request hardening); the test pins that
    // there is no maxItems constraint and that the description explains
    // the contract to schema readers (consumers and consuming LLMs).
    const schema = SCHEMA_PROPS.moduleNames as Record<string, unknown>;
    expect(schema.type).toBe("array");
    expect(schema).not.toHaveProperty("maxItems");
    expect(schema.items).toEqual({ type: "string" });
    expect(schema.description as string).toMatch(/no hard length cap|long lists|empty array/i);
  });

  it("contains importMode with enum values", () => {
    expect(SCHEMA_PROPS.importMode).toEqual({
      type: "string",
      enum: ["Auto", "Form", "Code", "auto", "form", "code", "replace"],
      description:
        "VBA import mode. Auto (default) imports a form/report's UI from its .form.txt and its canonical code from the sibling .cls. Code imports only code-behind/.bas. Form is a deprecated alias for Auto (there is no layout-only import). Lowercase variants and replace are normalized before invoking the runner.",
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
      // feat-759-no-compile (v1.19.0) — the `compile` property atom was
      // removed: `import_modules` / `import_all` no longer accept a
      // `compile` flag. See openspec/specs/vba-manager-actions/spec.md
      // "Save-only persistence (no compile)".
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
      "transactional",
      "prune",
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
      "newName",
      "targetSectionName",
      "properties",
      "left",
      "location",
      "top",
      "testsPath",
      "exists_name",
      "code",
      // slice 5 (issue #618) — `create_form_from_template` atoms.
      // Documented here as mechanical contract maintenance; the full tool-count
      // parity contract update is PR 3 (README + tool-parity-registry edits).
      "sourceForm",
      "targetForm",
      "tokenMap",
      "missingTokenPolicy",
      "strictMissingTokens",
      "overwrite",
      // issue #752 — opt-in verbose flag for `import_modules` / `import_all` /
      // `export_modules` / `export_all` to surface source-vs-destination line
      // counts, byte counts, sha256 hashes and a `truncated` boolean. Added as
      // a single shared SCHEMA_PROPS entry so the description stays in one
      // place rather than being copy-pasted into four tool schemas.
      "verboseContract",
      // issue #785 (v2.1.1) — opt-in acknowledgment for the export-source
      // guard. When `developer` mode is active and the destination
      // overlaps the project's active source root, the dispatcher refuses
      // with `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` unless the
      // caller passes this flag. Added as a single shared SCHEMA_PROPS
      // entry so the description stays in one place rather than being
      // copy-pasted into the two export_* schemas.
      "confirmOverwriteSource",
      // Issue #968 — opt-in acknowledgment for read-only-side tools that
      // bypasses the `OUTSIDE_PROJECT_ROOT` verdict on the `accessPath`
      // override. Added as a single shared entry so the description lives
      // in one place rather than being copy-pasted into four tool schemas.
      "allowExternalAccessPath",
      // feat-forms-output-modes
      "outputMode",
      "includeSerialized",
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
