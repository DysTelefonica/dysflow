import { WORKTREE_CWD_SCHEMA_PROP } from "./worktree-cwd.js";

/** Canonical names for the large capability blocks exposed by the snapshot. */
export const CAPABILITY_BLOCK_NAMES = [
  "tools",
  "sharedBlockSupport",
  "effectiveDryRunDefault",
  "migrationNotes",
  "preferredAgentWorkflows",
  "writeClassToolsPermitted",
  "allowedProcedures",
  "documentationBundle",
  "projectConfig",
  "worktreeCache",
] as const;

export type CapabilityBlockName = (typeof CAPABILITY_BLOCK_NAMES)[number];

export type GetCapabilitiesInput = {
  view?: "compact" | "full";
  compact?: boolean;
  include?: CapabilityBlockName[];
  toolNames?: string[];
};

export const CAPABILITIES_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    cwd: WORKTREE_CWD_SCHEMA_PROP,
    view: {
      type: "string",
      enum: ["compact", "full"],
      default: "compact",
      description: "Default compact; pass full for the complete snapshot.",
    },
    compact: {
      type: "boolean",
      description: "Alias for the compact projection.",
    },
    include: {
      type: "array",
      items: { type: "string", enum: [...CAPABILITY_BLOCK_NAMES] },
      description: "Optional large-block allowlist for compact discovery.",
    },
    toolNames: {
      type: "array",
      items: { type: "string" },
      description: "Optional per-tool filter applied to tool-related capability blocks.",
    },
  },
} as const;
