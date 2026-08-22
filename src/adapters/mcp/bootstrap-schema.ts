import { AGENT_WORKFLOW_PHASES } from "./agent-workflow-registry.js";
import type { JsonObjectSchema } from "./schemas.js";
import { WORKTREE_CWD_SCHEMA_PROP } from "./worktree-cwd.js";

export const BOOTSTRAP_INPUT_SCHEMA: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    cwd: WORKTREE_CWD_SCHEMA_PROP,
    phase: {
      type: "string",
      enum: [...AGENT_WORKFLOW_PHASES],
      description:
        "Optional workflow phase filter. When omitted, returns recommended calls for every agent workflow phase.",
    },
  },
};
