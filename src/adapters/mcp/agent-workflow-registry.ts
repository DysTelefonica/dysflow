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

export type AgentWorkflowMetadata = {
  status: AgentWorkflowStatus;
  supersededBy?: string;
  preferFor: string[];
  workflowPhase?: AgentWorkflowPhase;
  specializedWhen?: string;
  migrationGuidance?: string;
  deprecationPolicy?: string;
};

export type PreferredAgentWorkflow = {
  phase: AgentWorkflowPhase;
  tools: string[];
};

export const PREFERRED_AGENT_WORKFLOWS: readonly PreferredAgentWorkflow[] = [
  {
    phase: "bootstrap",
    tools: ["get_capabilities", "schema", "describe_tool"],
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
    tools: ["diagnose", "state", "logs", "cleanup_access_operation"],
  },
];

const ADDITIONAL_PREFERRED_TOOLS = new Set([
  "form_set_properties",
  "form_align_controls",
  "form_distribute_controls",
]);

const PREFERRED_PHASE_BY_TOOL = new Map<string, AgentWorkflowPhase>(
  PREFERRED_AGENT_WORKFLOWS.flatMap((workflow) =>
    workflow.tools.map((tool) => [tool, workflow.phase] as const),
  ),
);

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
  get_capabilities: [
    "Bootstrap every agent session with live adapter, project, and write-gate state.",
  ],
  schema: [
    "Discover all tools with view:'compact'; request view:'full' only for catalog-wide contract analysis.",
  ],
  describe_tool: ["Inspect one selected tool's complete contract after compact discovery."],
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

export function buildAgentWorkflowMetadata(name: string): AgentWorkflowMetadata {
  const legacy = LEGACY_METADATA[name];
  if (legacy !== undefined) {
    return {
      status: "legacy",
      supersededBy: legacy.supersededBy,
      preferFor: [...legacy.preferFor],
      migrationGuidance: legacy.migrationGuidance,
      deprecationPolicy: DEPRECATION_POLICY,
    };
  }

  const useCases = preferFor(name);
  const workflowPhase = PREFERRED_PHASE_BY_TOOL.get(name);
  if (workflowPhase !== undefined || ADDITIONAL_PREFERRED_TOOLS.has(name)) {
    return {
      status: "preferred",
      preferFor: useCases,
      ...(workflowPhase === undefined ? {} : { workflowPhase }),
    };
  }

  return {
    status: "specialized",
    preferFor: useCases,
    specializedWhen: `Choose ${name} over a preferred wrapper when ${useCases[0]}`,
  };
}
