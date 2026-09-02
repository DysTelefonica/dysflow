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
      description: "Target worktree; default: process cwd.",
    },
    fromCwd: {
      type: "string",
      description: "Source worktree with .dysflow/project.json.",
    },
    overrideProjectRoot: {
      type: "string",
      description: "New root; must equal target cwd.",
    },
    frontendFile: {
      type: "string",
      description: "Frontend basename at worktree root.",
    },
    backendPath: ACCESS_TARGET_BLOCK.backendPath,
    projectId: PROJECT_IDENTITY_BLOCK.projectId,
    ...PROJECT_RECOVERY_SCHEMA_BLOCK,
    destinationRoot: MANAGED_SOURCE_TARGET_BLOCK.destinationRoot,
    capabilities: {
      type: "object",
      description: "Initial capabilities.",
      additionalProperties: false,
      properties: {
        allowWrites: {
          type: "boolean",
          description: "Default: true.",
        },
        writeExecutionPolicy: {
          type: "string",
          enum: ["safe-by-default", "developer"],
        },
        procedures: {
          type: "object",
          additionalProperties: false,
          properties: {
            allow: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    },
    timeoutMs: {
      type: "number",
      description: "Positive operation timeout (ms).",
      minimum: 1,
    },
    ...WRITE_INTENT_BLOCK,
  },
  anyOf: [
    { required: ["frontendFile"] },
    { required: ["fromCwd", "overrideProjectRoot"] },
    { required: ["projectId", "projectChoiceReason", "recoveryToken"] },
  ],
};
