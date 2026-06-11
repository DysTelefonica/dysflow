// Re-export the shared types and atoms so consumers of this barrel can
// pick them up from one entry point without having to reach into the
// shared validation kernel directly.
export type {
  JsonObjectSchema,
  JsonSchemaPrimitiveType,
  JsonSchemaProperty,
} from "../../../shared/validation/index.js";
export {
  ACCESS_OVERRIDE,
  CLEANUP_SCHEMA,
  CTX_PROPS,
  HTTP_QUERY_SCHEMA,
  HTTP_VBA_EXECUTE_SCHEMA,
  HTTP_WRITE_QUERY_SCHEMA,
  SCHEMA_PROPS,
  STRICT_CTX,
} from "../../../shared/validation/index.js";
export * from "./dysflow-schemas.js";
export * from "./query-schemas.js";
export * from "./vba-sync-schemas.js";

import type { JsonObjectSchema } from "./dysflow-schemas.js";
import { QUERY_TOOL_SCHEMAS } from "./query-schemas.js";
import { VBA_SYNC_TOOL_SCHEMAS } from "./vba-sync-schemas.js";

export const MCP_TOOL_SCHEMAS: Record<string, JsonObjectSchema> = {
  ...VBA_SYNC_TOOL_SCHEMAS,
  ...QUERY_TOOL_SCHEMAS,
};
