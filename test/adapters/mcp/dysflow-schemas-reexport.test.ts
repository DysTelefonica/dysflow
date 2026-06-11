import { describe, expect, it } from "vitest";
import {
  ACCESS_OVERRIDE,
  CTX_PROPS,
  HTTP_QUERY_SCHEMA,
  HTTP_VBA_EXECUTE_SCHEMA,
  HTTP_WRITE_QUERY_SCHEMA,
  type JsonObjectSchema,
  type JsonSchemaPrimitiveType,
  type JsonSchemaProperty,
  SCHEMA_PROPS,
  STRICT_CTX,
} from "../../../src/adapters/mcp/schemas/dysflow-schemas.js";
import {
  ACCESS_OVERRIDE as sharedAccessOverride,
  CTX_PROPS as sharedCtxProps,
  HTTP_QUERY_SCHEMA as sharedHttpQuery,
  HTTP_VBA_EXECUTE_SCHEMA as sharedHttpVba,
  HTTP_WRITE_QUERY_SCHEMA as sharedHttpWrite,
  type JsonObjectSchema as SharedJsonObjectSchema,
  type JsonSchemaPrimitiveType as SharedPrimitive,
  type JsonSchemaProperty as SharedProperty,
  SCHEMA_PROPS as sharedSchemaProps,
  STRICT_CTX as sharedStrictCtx,
} from "../../../src/shared/validation";

// Contract guard: the MCP dysflow-schemas module must keep exporting the
// public surface it always did, even though the implementation now lives in
// src/shared/validation. This pins types and runtime atoms so an accidental
// re-export removal or an inline copy will fail the suite.

describe("src/adapters/mcp/schemas/dysflow-schemas.ts — re-export contract", () => {
  it("re-exports the same SCHEMA_PROPS reference as the shared module", () => {
    expect(SCHEMA_PROPS).toBe(sharedSchemaProps);
  });

  it("re-exports the same CTX_PROPS reference as the shared module", () => {
    expect(CTX_PROPS).toBe(sharedCtxProps);
  });

  it("re-exports the same ACCESS_OVERRIDE reference as the shared module", () => {
    expect(ACCESS_OVERRIDE).toBe(sharedAccessOverride);
  });

  it("re-exports the same STRICT_CTX reference as the shared module", () => {
    expect(STRICT_CTX).toBe(sharedStrictCtx);
  });

  it("re-exports HTTP_QUERY_SCHEMA, HTTP_WRITE_QUERY_SCHEMA, HTTP_VBA_EXECUTE_SCHEMA as the same references", () => {
    expect(HTTP_QUERY_SCHEMA).toBe(sharedHttpQuery);
    expect(HTTP_WRITE_QUERY_SCHEMA).toBe(sharedHttpWrite);
    expect(HTTP_VBA_EXECUTE_SCHEMA).toBe(sharedHttpVba);
  });

  it("re-exports JsonObjectSchema, JsonSchemaProperty, JsonSchemaPrimitiveType types from shared", () => {
    // The type assertions are compile-time guarantees; runtime checks are
    // belt-and-suspenders to keep the contract honest.
    const objSchema: JsonObjectSchema = sharedSchemaProps.sql as JsonObjectSchema;
    const propSchema: JsonSchemaProperty = sharedSchemaProps.sql;
    const primitive: JsonSchemaPrimitiveType = sharedSchemaProps.sql.type ?? "string";
    expect(objSchema).toBeDefined();
    expect(propSchema).toBeDefined();
    expect(primitive).toBeDefined();

    // Cross-cast to shared aliases verifies structural compatibility.
    const sharedObj: SharedJsonObjectSchema = objSchema;
    const sharedProp: SharedProperty = propSchema;
    const sharedPrim: SharedPrimitive = primitive;
    expect(sharedObj).toBe(objSchema);
    expect(sharedProp).toBe(propSchema);
    expect(sharedPrim).toBe(primitive);
  });
});
