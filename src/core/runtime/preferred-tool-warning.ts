export type ToolSelectionStatus = "preferred" | "specialized" | "legacy";
export type ToolSelectionAccess = "read-only" | "read-write" | "conditional-write";

export type ToolSelectionDescriptor = {
  name: string;
  status: ToolSelectionStatus;
  phases: readonly string[];
  access: ToolSelectionAccess;
  preferredFor: readonly string[];
  supersededBy?: string;
  migrationGuidance?: string;
};

export type PreferredToolWarning = {
  code: "PREFERRED_TOOL_AVAILABLE" | "LEGACY_TOOL_AVAILABLE";
  severity: "info" | "warning";
  called: string;
  preferred: string;
  rationale: string;
  docsAnchor: string;
  release: string;
};

function coversAllPhases(candidate: ToolSelectionDescriptor, called: ToolSelectionDescriptor) {
  return called.phases.every((phase) => candidate.phases.includes(phase));
}

function docsAnchor(name: string): string {
  return `dysflow-usage/assets/examples/${name.replaceAll("_", "-")}.md`;
}

function rationaleFor(called: ToolSelectionDescriptor, preferred: ToolSelectionDescriptor): string {
  if (called.status === "legacy" && called.migrationGuidance !== undefined) {
    return called.migrationGuidance;
  }
  return (
    preferred.preferredFor[0] ??
    `${preferred.name} is the preferred workflow for every phase covered by ${called.name}.`
  );
}

/**
 * Resolve additive, non-blocking tool-selection guidance from the in-memory
 * runtime catalog. The policy is pure so adapters can apply it without I/O.
 */
export function resolvePreferredToolWarnings(input: {
  called: ToolSelectionDescriptor;
  catalog: readonly ToolSelectionDescriptor[];
  release: string;
  forceSpecialized?: boolean;
}): PreferredToolWarning[] {
  const { called, catalog, release } = input;
  if (input.forceSpecialized === true || called.status === "preferred") return [];

  if (called.status === "legacy") {
    const preferred = catalog.find(
      (candidate) => candidate.name === called.supersededBy && candidate.status === "preferred",
    );
    if (preferred === undefined) return [];
    return [
      {
        code: "LEGACY_TOOL_AVAILABLE",
        severity: "warning",
        called: called.name,
        preferred: preferred.name,
        rationale: rationaleFor(called, preferred),
        docsAnchor: docsAnchor(preferred.name),
        release,
      },
    ];
  }

  if (called.access === "read-only") return [];
  const candidates = catalog
    .filter(
      (candidate) =>
        candidate.status === "preferred" &&
        candidate.name !== called.name &&
        coversAllPhases(candidate, called),
    )
    .sort(
      (left, right) =>
        right.phases.length - left.phases.length || left.name.localeCompare(right.name),
    );

  return candidates.map((preferred) => ({
    code: "PREFERRED_TOOL_AVAILABLE",
    severity: "info",
    called: called.name,
    preferred: preferred.name,
    rationale: rationaleFor(called, preferred),
    docsAnchor: docsAnchor(preferred.name),
    release,
  }));
}
