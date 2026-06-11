import { describe, expect, it } from "vitest";
import {
  CLEANUP_SCHEMA,
  HTTP_QUERY_SCHEMA,
  HTTP_VBA_EXECUTE_SCHEMA,
  HTTP_WRITE_QUERY_SCHEMA,
} from "../../../src/shared/validation";

// ──────────────────────────────────────────────────────────────────────────────
// CLEANUP_SCHEMA — required fields and shape
// ──────────────────────────────────────────────────────────────────────────────

describe("CLEANUP_SCHEMA — dysflow_access_cleanup HTTP contract", () => {
  it("requires operationId and accessPath", () => {
    expect(CLEANUP_SCHEMA.required).toEqual(["operationId", "accessPath"]);
  });

  it("disallows additional properties", () => {
    expect(CLEANUP_SCHEMA.additionalProperties).toBe(false);
  });

  it("declares operationId as a non-empty string", () => {
    const prop = CLEANUP_SCHEMA.properties.operationId;
    expect(prop?.type).toBe("string");
    expect(prop?.minLength).toBe(1);
  });

  it("declares accessPath as a string", () => {
    const prop = CLEANUP_SCHEMA.properties.accessPath;
    expect(prop?.type).toBe("string");
  });

  it("declares force as an optional boolean", () => {
    const prop = CLEANUP_SCHEMA.properties.force;
    expect(prop?.type).toBe("boolean");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// HTTP_QUERY_SCHEMA — read query HTTP contract
// ──────────────────────────────────────────────────────────────────────────────

describe("HTTP_QUERY_SCHEMA — read query HTTP contract", () => {
  it("requires sql", () => {
    expect(HTTP_QUERY_SCHEMA.required).toEqual(["sql"]);
  });

  it("disallows additional properties", () => {
    expect(HTTP_QUERY_SCHEMA.additionalProperties).toBe(false);
  });

  it("declares sql with minLength 1 and maxLength 100000", () => {
    const prop = HTTP_QUERY_SCHEMA.properties.sql;
    expect(prop?.type).toBe("string");
    expect(prop?.minLength).toBe(1);
    expect(prop?.maxLength).toBe(100000);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// HTTP_WRITE_QUERY_SCHEMA — write query HTTP contract
// ──────────────────────────────────────────────────────────────────────────────

describe("HTTP_WRITE_QUERY_SCHEMA — write query HTTP contract", () => {
  it("requires sql", () => {
    expect(HTTP_WRITE_QUERY_SCHEMA.required).toEqual(["sql"]);
  });

  it("disallows additional properties", () => {
    expect(HTTP_WRITE_QUERY_SCHEMA.additionalProperties).toBe(false);
  });

  it("declares sql with length bounds", () => {
    const prop = HTTP_WRITE_QUERY_SCHEMA.properties.sql;
    expect(prop?.type).toBe("string");
    expect(prop?.minLength).toBe(1);
    expect(prop?.maxLength).toBe(100000);
  });

  it("exposes dryRun and apply as boolean properties", () => {
    expect(HTTP_WRITE_QUERY_SCHEMA.properties.dryRun?.type).toBe("boolean");
    expect(HTTP_WRITE_QUERY_SCHEMA.properties.apply?.type).toBe("boolean");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// HTTP_VBA_EXECUTE_SCHEMA — VBA execute HTTP contract
// ──────────────────────────────────────────────────────────────────────────────

describe("HTTP_VBA_EXECUTE_SCHEMA — vba execute HTTP contract", () => {
  it("requires moduleName and procedureName", () => {
    expect(HTTP_VBA_EXECUTE_SCHEMA.required).toEqual(["moduleName", "procedureName"]);
  });

  it("disallows additional properties", () => {
    expect(HTTP_VBA_EXECUTE_SCHEMA.additionalProperties).toBe(false);
  });

  it("declares moduleName and procedureName as non-empty strings", () => {
    expect(HTTP_VBA_EXECUTE_SCHEMA.properties.moduleName?.type).toBe("string");
    expect(HTTP_VBA_EXECUTE_SCHEMA.properties.moduleName?.minLength).toBe(1);
    expect(HTTP_VBA_EXECUTE_SCHEMA.properties.procedureName?.type).toBe("string");
    expect(HTTP_VBA_EXECUTE_SCHEMA.properties.procedureName?.minLength).toBe(1);
  });

  it("declares arguments as an array of unconstrained items", () => {
    const prop = HTTP_VBA_EXECUTE_SCHEMA.properties.arguments;
    expect(prop?.type).toBe("array");
  });
});
