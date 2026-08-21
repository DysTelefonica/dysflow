/**
 * Issue #1459 — project the live tool catalog into the shape the evidence
 * analyzer consumes.
 *
 * The analyzer in `src/core/telemetry/surface-profile-evidence.ts` refuses to
 * own a phase taxonomy or a write-capability list, because both already exist
 * in the runtime and a second copy would drift. This adapter is the one place
 * that reads them off the live catalog, which keeps the analysis honest as
 * tools are added, reclassified, or retired.
 */
import type {
  SurfaceProfileCatalog,
  ToolCatalogEntry,
  WorkflowPhase,
} from "../../core/telemetry/surface-profile-evidence.js";
import { buildToolSchemaCatalog } from "./schema-tool.js";

/**
 * A tool is write-capable when its declared access is anything other than
 * read-only. This is the DECLARED capability, deliberately not the observed
 * one: the gap between the two is precisely the AC#7 evidence the analyzer
 * reports.
 */
export function buildSurfaceProfileCatalog(): SurfaceProfileCatalog {
  const catalog = buildToolSchemaCatalog({ projectId: undefined });
  const entries: Record<string, ToolCatalogEntry> = {};
  for (const tool of catalog.tools) {
    const phases = tool.agentWorkflow.workflowPhases as readonly WorkflowPhase[];
    entries[tool.name] = {
      phases: phases.length > 0 ? [...phases] : ["unclassified"],
      writeCapable: tool.access !== "read-only",
    };
  }
  return entries;
}
