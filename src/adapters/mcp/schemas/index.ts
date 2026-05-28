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
