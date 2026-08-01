import {
  ACCESS_TARGET_BLOCK,
  MANAGED_SOURCE_TARGET_BLOCK,
  PROJECT_IDENTITY_BLOCK,
  WRITE_INTENT_BLOCK,
} from "../../../shared/validation/index.js";
import { PROJECT_RECOVERY_SCHEMA_BLOCK } from "../project-resolution-recovery.js";
import type { JsonObjectSchema } from "../schemas.js";

export const SETUP_PROJECT_SCHEMA: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    cwd: {
      type: "string",
      description: "Git worktree root to bootstrap. Defaults to the MCP process cwd.",
    },
    frontendFile: {
      type: "string",
      description: "Access frontend basename located at the worktree root.",
    },
    backendPath: ACCESS_TARGET_BLOCK.backendPath,
    projectId: PROJECT_IDENTITY_BLOCK.projectId,
    ...PROJECT_RECOVERY_SCHEMA_BLOCK,
    destinationRoot: MANAGED_SOURCE_TARGET_BLOCK.destinationRoot,
    capabilities: {
      type: "object",
      description: "Initial project write capabilities.",
      additionalProperties: false,
      properties: {
        allowWrites: {
          type: "boolean",
          description: "Permit project-scoped writes. Defaults to true.",
        },
        writeExecutionPolicy: {
          type: "string",
          enum: ["safe-by-default", "developer"],
          description: "Initial project write-execution policy.",
        },
      },
    },
    timeoutMs: {
      type: "number",
      description: "Optional positive per-project operation timeout in milliseconds.",
      minimum: 1,
    },
    ...WRITE_INTENT_BLOCK,
  },
  anyOf: [
    { required: ["frontendFile"] },
    { required: ["projectId", "projectChoiceReason", "recoveryToken"] },
  ],
};
