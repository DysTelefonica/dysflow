export const AGENT_WORKFLOW_PHASES = [
  "bootstrap",
  "sync",
  "tests",
  "sql",
  "forms",
  "recovery",
] as const;

export type AgentWorkflowPhase = (typeof AGENT_WORKFLOW_PHASES)[number];
export type AgentWorkflowStatus = "preferred" | "specialized" | "legacy";

/** Issue #1492 — advertised surface mode for `tools/list`. */
export const TOOL_SURFACE_MODES = ["core", "full"] as const;
export type ToolSurface = (typeof TOOL_SURFACE_MODES)[number];

/** Phases that belong to the default `core` advertised surface. */
export const CORE_SURFACE_PHASES: readonly AgentWorkflowPhase[] = [
  "bootstrap",
  "recovery",
  "tests",
  "sync",
] as const;

/** True when the tool's workflow membership intersects the core phases. */
export function isCoreSurfaceTool(name: string): boolean {
  const phases = classifyWorkflowPhases(name);
  return phases.some((phase) => CORE_SURFACE_PHASES.includes(phase));
}

/** True when the tool should be advertised under the given surface. */
export function isAdvertisedUnderSurface(name: string, surface: ToolSurface): boolean {
  if (surface === "full") return true;
  return isCoreSurfaceTool(name);
}

export type AgentWorkflowMetadata = {
  status: AgentWorkflowStatus;
  supersededBy?: string;
  preferFor: string[];
  /** Complete phase classification. Always contains at least one phase. */
  workflowPhases: AgentWorkflowPhase[];
  /** Backward-compatible primary phase for consumers predating multi-phase metadata. */
  workflowPhase?: AgentWorkflowPhase;
  specializedWhen?: string;
  migrationGuidance?: string;
  deprecationPolicy?: string;
};

export type PreferredAgentWorkflow = {
  phase: AgentWorkflowPhase;
  tools: string[];
};

export const DYSFLOW_WORKFLOW_META_KEY = "dysflow/workflow" as const;

export type McpStandardToolAnnotations = {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

export type DysflowWorkflowAdvertisement = {
  phases: AgentWorkflowPhase[];
  preferredFor: string[];
  status: AgentWorkflowStatus;
};

export type ToolAdvertisementMetadata = {
  annotations: McpStandardToolAnnotations;
  _meta: {
    [DYSFLOW_WORKFLOW_META_KEY]: DysflowWorkflowAdvertisement;
  };
};

export const PREFERRED_AGENT_WORKFLOWS: readonly PreferredAgentWorkflow[] = [
  {
    phase: "bootstrap",
    tools: [
      "bootstrap",
      "get_capabilities",
      "schema",
      "describe_tool",
      "register_worktree",
      "setup_project",
      "resolve_project",
      "clear_worktree_cache",
    ],
  },
  {
    phase: "sync",
    tools: ["sync_binary"],
  },
  {
    phase: "tests",
    tools: ["validate_manifest", "test_vba"],
  },
  {
    phase: "sql",
    tools: ["query_execute"],
  },
  {
    phase: "forms",
    tools: [
      "analyze_form_ui",
      "generate_form_design_plan",
      "apply_form_design_plan",
      "verify_form_ui",
    ],
  },
  {
    phase: "recovery",
    tools: ["resolve_project", "diagnose", "state", "logs", "cleanup_access_operation"],
  },
];

const ADDITIONAL_PREFERRED_TOOLS = new Set([
  "form_set_properties",
  "form_align_controls",
  "form_distribute_controls",
]);

const PREFERRED_PHASES_BY_TOOL = new Map<string, AgentWorkflowPhase[]>();
for (const workflow of PREFERRED_AGENT_WORKFLOWS) {
  for (const tool of workflow.tools) {
    const phases = PREFERRED_PHASES_BY_TOOL.get(tool) ?? [];
    if (!phases.includes(workflow.phase)) phases.push(workflow.phase);
    PREFERRED_PHASES_BY_TOOL.set(tool, phases);
  }
}

const BOOTSTRAP_TOOLS = new Set([
  "bootstrap",
  "get_capabilities",
  "schema",
  "describe_tool",
  "setup_project",
  "register_worktree",
  "clear_worktree_cache",
  "migrate_project_config",
]);
const TEST_TOOLS = new Set(["validate_manifest", "test_vba"]);
const RECOVERY_TOOLS = new Set([
  "list_access_operations",
  "cleanup_access_operation",
  "doctor",
  "access_force_cleanup_orphaned",
  "diagnose",
  "clean_stale_markers",
  "state",
  "logs",
]);
const SQL_TOOLS = new Set([
  "query_sql",
  "list_tables",
  "list_linked_tables",
  "get_schema",
  "count_rows",
  "distinct_values",
  "compare_backends",
  "list_access_files",
  "exec_sql",
  "run_script",
  "create_table",
  "drop_table",
  "seed_fixture",
  "teardown_fixture",
  "list_links",
  "link_tables",
  "relink_tables",
  "localize_backend_links",
  "unlink_table",
  "export_queries",
  "import_queries",
  "get_relationships",
  "compact_repair",
  "relink_directory",
  "query_execute",
]);
const DEPRECATION_POLICY =
  "Compatibility-only in the v2.x line; removal requires a documented deprecation window and migration release note.";

const LEGACY_METADATA: Readonly<
  Record<
    string,
    {
      supersededBy: string;
      preferFor: string[];
      migrationGuidance: string;
    }
  >
> = {
  query_sql: {
    supersededBy: "query_execute",
    preferFor: ["Keep an existing read-only query_sql integration working while it migrates."],
    migrationGuidance:
      "Call query_execute with mode:'read'; keep the canonical sql and target parameters reported by describe_tool.",
  },
  exec_sql: {
    supersededBy: "query_execute",
    preferFor: ["Keep an existing write SQL exec_sql integration working while it migrates."],
    migrationGuidance:
      "Call query_execute with mode:'write' and use its canonical apply flag instead of the compatibility dryRun polarity.",
  },
};

const CURATED_PREFER_FOR: Readonly<Record<string, readonly string[]>> = {
  bootstrap: [
    "Make the first Dysflow MCP call when an agent needs runtime identity, write gates, and recommended next tools.",
  ],
  get_capabilities: [
    "Inspect the full live adapter, project, and write-gate state after bootstrap routing selects it.",
  ],
  schema: [
    "Discover all tools with view:'compact'; request view:'full' only for catalog-wide contract analysis.",
  ],
  describe_tool: ["Inspect one selected tool's complete contract after compact discovery."],
  setup_project: [
    "Bootstrap a missing per-worktree project config through MCP when shell access is unavailable.",
  ],
  register_worktree: ["Pre-warm a sibling worktree context and inspect cache hit/miss telemetry."],
  clear_worktree_cache: [
    "Force one worktree or the complete process-local cache to rescan on the next call.",
  ],
  resolve_project: ["Resolve and verify the selected worktree project after bootstrap."],
  sync_binary: [
    "Run the preferred source-to-binary or binary-to-source verify, plan, apply, and re-verify workflow.",
  ],
  verify_code: ["Inspect source and binary drift without planning or applying a synchronization."],
  import_modules: [
    "Apply a granular source-to-binary import when sync_binary orchestration is too broad.",
  ],
  export_modules: [
    "Apply a granular binary-to-source export when sync_binary orchestration is too broad.",
  ],
  validate_manifest: ["Validate tests.vba.json procedure references before invoking test_vba."],
  test_vba: ["Execute the validated VBA test manifest after the human-compile gate is clear."],
  query_execute: ["Execute the preferred unified read or write SQL contract."],
  query_sql: ["Keep an existing read-only query_sql integration working while it migrates."],
  exec_sql: ["Keep an existing write SQL exec_sql integration working while it migrates."],
  analyze_form_ui: ["Start the preferred form workflow by deriving control roles from FormIR."],
  generate_form_design_plan: ["Generate a guarded form design plan from analyzed behavior."],
  apply_form_design_plan: ["Apply a validated form design plan through the guarded write seam."],
  verify_form_ui: ["Complete the preferred form workflow with contract and geometry verification."],
  form_set_properties: ["Update several properties on one control atomically."],
  form_set_property: ["Update exactly one property without constructing a batch property map."],
  form_align_controls: ["Align several controls in one geometry operation."],
  form_distribute_controls: ["Distribute several controls evenly in one geometry operation."],
  form_move_control: [
    "Move one control to an exact coordinate that alignment or distribution cannot express.",
  ],
  diagnose: ["Start recovery with one aggregated project health snapshot."],
  state: ["Inspect operation, marker, lock, and counter state during recovery."],
  logs: ["Inspect the filtered operation timeline after diagnose identifies a failure."],
  cleanup_access_operation: ["Retire one Dysflow-owned operation through ownership-safe cleanup."],
  doctor: [
    "Run the narrower diagnostics service when aggregated project recovery context is unnecessary.",
  ],
  access_force_cleanup_orphaned: [
    "List orphan candidates or retire one verified orphan PID when normal owned-operation cleanup cannot apply.",
  ],
  vba_orphan_audit: [
    "Find test procedures registered in the binary but missing from the source tree.",
    "Audit source and binary module parity before a cleanup batch.",
  ],
  detect_dead_code: ["Find unreferenced procedures before deleting or migrating legacy code."],
  compare_backends: ["Compare schema or data between two backend Access databases."],
  delete_module: ["Remove one VBA module after a plan confirms the destructive target."],
};

function preferFor(name: string): string[] {
  return [...(CURATED_PREFER_FOR[name] ?? [`Use ${name} when its focused contract is required.`])];
}

function classifyWorkflowPhases(name: string): AgentWorkflowPhase[] {
  const preferred = PREFERRED_PHASES_BY_TOOL.get(name);
  if (preferred !== undefined) return [...preferred];
  if (BOOTSTRAP_TOOLS.has(name)) return ["bootstrap"];
  if (TEST_TOOLS.has(name)) return ["tests"];
  if (RECOVERY_TOOLS.has(name)) return ["recovery"];
  if (SQL_TOOLS.has(name)) return ["sql"];
  if (name.includes("form") || name.includes("control")) return ["forms"];
  return ["sync"];
}

function toolTitle(name: string): string {
  return name
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export function buildAgentWorkflowMetadata(name: string): AgentWorkflowMetadata {
  const workflowPhases = classifyWorkflowPhases(name);
  const legacy = LEGACY_METADATA[name];
  if (legacy !== undefined) {
    return {
      status: "legacy",
      supersededBy: legacy.supersededBy,
      preferFor: [...legacy.preferFor],
      workflowPhases,
      workflowPhase: workflowPhases[0],
      migrationGuidance: legacy.migrationGuidance,
      deprecationPolicy: DEPRECATION_POLICY,
    };
  }

  const useCases = preferFor(name);
  const preferredPhases = PREFERRED_PHASES_BY_TOOL.get(name);
  if (preferredPhases !== undefined || ADDITIONAL_PREFERRED_TOOLS.has(name)) {
    return {
      status: "preferred",
      preferFor: useCases,
      workflowPhases,
      workflowPhase: workflowPhases[0],
    };
  }

  return {
    status: "specialized",
    preferFor: useCases,
    workflowPhases,
    workflowPhase: workflowPhases[0],
    specializedWhen: `Choose ${name} over a preferred wrapper when ${useCases[0]}`,
  };
}

export function buildToolAdvertisementMetadata(
  name: string,
  access: "read-only" | "read-write" | "conditional-write",
): ToolAdvertisementMetadata {
  const workflow = buildAgentWorkflowMetadata(name);
  const readOnly = access === "read-only";
  return {
    annotations: {
      title: toolTitle(name),
      readOnlyHint: readOnly,
      // MCP defaults this hint to true when omitted. Keep the same conservative
      // contract for every write-capable tool because apply mode may overwrite
      // Access objects, data, or project files even when the default call plans.
      destructiveHint: !readOnly,
      idempotentHint: readOnly,
      openWorldHint: false,
    },
    _meta: {
      [DYSFLOW_WORKFLOW_META_KEY]: {
        phases: [...workflow.workflowPhases],
        preferredFor: [...workflow.preferFor],
        status: workflow.status,
      },
    },
  };
}
