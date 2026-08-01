import { WORKTREE_CWD_SCHEMA_PROP } from "./worktree-cwd.js";

export const REGISTER_WORKTREE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cwd"],
  properties: { cwd: WORKTREE_CWD_SCHEMA_PROP },
} as const;

export const CLEAR_WORKTREE_CACHE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { cwd: WORKTREE_CWD_SCHEMA_PROP },
} as const;
