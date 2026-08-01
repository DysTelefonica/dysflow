import type { JsonObjectSchema } from "./schemas.js";

export const WORKTREE_CWD_SCHEMA_PROP = {
  type: "string",
  minLength: 1,
  description:
    "Optional per-call worktree cwd. Paths are canonicalized and resolved through the bounded worktree-context cache. Omit to use the MCP startup cwd.",
} as const;

export const PROJECT_CONFIG_TOOL_EXEMPTIONS = new Set([
  "schema",
  "describe_tool",
  "list_access_operations",
]);

export function withWorktreeCwdSchema(name: string, schema: JsonObjectSchema): JsonObjectSchema {
  if (PROJECT_CONFIG_TOOL_EXEMPTIONS.has(name)) return schema;
  schema.properties.cwd = WORKTREE_CWD_SCHEMA_PROP;
  return schema;
}
