import { ALIAS_TOOL_NAME_LIST, type AliasToolName } from "./alias-tools.js";
import { type GeneratedDispatchToolName, MCP_TOOL_ROUTES } from "./dispatch-routes.js";
import type { DysflowMcpToolName } from "./mcp-tool-registry.js";
import type { ModernDysflowMcpToolName } from "./tools.js";

export type McpToolAccess = "read-only" | "read-write" | "conditional-write";
export type McpToolWriteGate = "none" | "conditional";

export type McpToolContract = {
  access: McpToolAccess;
  writeGate: McpToolWriteGate;
  dryRunDefault?: boolean;
  summary: string;
};

type ContractToolName = DysflowMcpToolName | ModernDysflowMcpToolName;

function contractFromGeneratedRoute(name: GeneratedDispatchToolName): McpToolContract {
  const route = MCP_TOOL_ROUTES[name];
  if (route.kind === "query-read") {
    return { access: "read-only", writeGate: "none", summary: "Read-only MCP contract." };
  }
  if (route.kind === "query-maintenance" && route.queryMode === "read") {
    return { access: "read-only", writeGate: "none", summary: "Read-only MCP contract." };
  }
  if (route.kind === "vba-sync" && !route.mutatesBinary && !route.mutatesFilesystem) {
    return { access: "read-only", writeGate: "none", summary: "Read-only MCP contract." };
  }
  // Every write-class dispatch route defaults to plan mode (`dryRun: true`).
  // The dispatcher path honors that default — `resolveIsDryRun` for query
  // aliases, `buildMaintenanceRequest` for query-maintenance, and
  // `VbaModulesAdapter.execute`'s `params.dryRun !== false` rule for vba-sync.
  // vba-sync tools are NOT an exception: they default to dry-run just like the
  // rest, and the snapshot surface must agree with AGENTS.md and the CHANGELOG
  // v1.14 promise of "standardized dryRun defaults".
  return {
    access: "conditional-write",
    writeGate: "conditional",
    dryRunDefault: true,
    summary: "Write-capable MCP contract; write execution is write-gated.",
  };
}

const generatedContracts = {
  ...Object.fromEntries(
    (Object.keys(MCP_TOOL_ROUTES) as GeneratedDispatchToolName[]).map((name) => [
      name,
      contractFromGeneratedRoute(name),
    ]),
  ),
  // PR1b (#621 F1) — `test_vba` runtime gate lives in
  // `VbaExecutionAdapter.executeTestVba` (default-deny when
  // `allowedProcedures` is undefined/empty with a `dryRun:true` escape
  // hatch, per-procedure allowlist verification with `error.allowedProcedures`
  // + `error.remediation` when configured). The dispatcher route stays
  // `mutatesBinary: false` so the tool remains conditional-write.
  test_vba: {
    access: "conditional-write",
    writeGate: "conditional",
    summary:
      "Conditional-write MCP contract; test execution is gated by the project's allowedProcedures allowlist, with dryRun:true as an explicit escape hatch when no allowlist is configured.",
  },
} as Record<GeneratedDispatchToolName, McpToolContract>;

const aliasContracts: Record<AliasToolName, McpToolContract> = {
  list_access_operations: {
    access: "read-only",
    writeGate: "none",
    summary: "Read-only MCP contract.",
  },
  cleanup_access_operation: {
    access: "conditional-write",
    writeGate: "conditional",
    summary:
      "Conditional-write MCP contract; cleanup is read-only without force and write-gated when force can kill a process.",
  },
  run_vba: {
    access: "conditional-write",
    writeGate: "conditional",
    summary:
      "Conditional-write MCP contract; VBA execution is gated by the project's allowedProcedures allowlist, with dryRun:true as an explicit escape hatch when no allowlist is configured.",
  },
  query_sql: {
    access: "read-only",
    writeGate: "none",
    summary: "Read-only MCP contract.",
  },
  exec_sql: {
    access: "conditional-write",
    writeGate: "conditional",
    dryRunDefault: true,
    summary: "Write-capable MCP contract; write execution is write-gated.",
  },
  run_script: {
    access: "conditional-write",
    writeGate: "conditional",
    dryRunDefault: true,
    summary: "Write-capable MCP contract; write execution is write-gated.",
  },
  create_table: {
    access: "conditional-write",
    writeGate: "conditional",
    dryRunDefault: true,
    summary: "Write-capable MCP contract; write execution is write-gated.",
  },
  drop_table: {
    access: "conditional-write",
    writeGate: "conditional",
    dryRunDefault: true,
    summary: "Write-capable MCP contract; write execution is write-gated.",
  },
  seed_fixture: {
    access: "conditional-write",
    writeGate: "conditional",
    dryRunDefault: true,
    summary: "Write-capable MCP contract; write execution is write-gated.",
  },
  teardown_fixture: {
    access: "conditional-write",
    writeGate: "conditional",
    dryRunDefault: true,
    summary: "Write-capable MCP contract; write execution is write-gated.",
  },
};

const modernContracts: Record<ModernDysflowMcpToolName, McpToolContract> = {
  dysflow_vba_execute: {
    access: "conditional-write",
    writeGate: "conditional",
    summary:
      "Conditional-write MCP contract; VBA execution is gated by the project's allowedProcedures allowlist, with dryRun:true as an explicit escape hatch when no allowlist is configured.",
  },
  dysflow_query_execute: {
    access: "read-write",
    writeGate: "conditional",
    dryRunDefault: true,
    summary: "Read/write MCP contract; write mode is write-gated and honors dryRun/apply.",
  },
  dysflow_doctor: {
    access: "read-only",
    writeGate: "none",
    summary: "Read-only MCP contract.",
  },
  dysflow_access_operations_list: {
    access: "read-only",
    writeGate: "none",
    summary: "Read-only MCP contract.",
  },
  dysflow_access_cleanup: aliasContracts.cleanup_access_operation,
  dysflow_access_force_cleanup_orphaned: {
    access: "conditional-write",
    writeGate: "conditional",
    summary:
      "Conditional-write MCP contract; orphan cleanup is read-only when listing and write-gated when confirmPid can kill a process.",
  },
  // Round-3 Item 1 — `dysflow_resolve_project` re-resolves
  // `.dysflow/project.json` from disk so a consumer can ask "what would
  // the MCP think if I passed THIS projectId?" without round-tripping
  // through the MCP restart cycle. Read-only.
  dysflow_resolve_project: {
    access: "read-only",
    writeGate: "none",
    summary: "Read-only MCP contract.",
  },
  // PR-1 (issue #656) — `dysflow_get_capabilities` is the read-only gate
  // introspection surface (#655 umbrella). It aggregates the static contract
  // metadata with the live process- and project-level state. It never opens
  // Access, never spawns PowerShell, and is never write-gated.
  dysflow_get_capabilities: {
    access: "read-only",
    writeGate: "none",
    summary: "Read-only MCP contract.",
  },
  // issue #701 — read-only VBA procedure introspection
  dysflow_list_procedures: {
    access: "read-only",
    writeGate: "none",
    summary: "Read-only MCP contract.",
  },
  dysflow_get_procedure: {
    access: "read-only",
    writeGate: "none",
    summary: "Read-only MCP contract.",
  },
  dysflow_find_references: {
    access: "read-only",
    writeGate: "none",
    summary: "Read-only MCP contract.",
  },
  // issue #705 — `dysflow_detect_dead_code` is the read-only dead-code
  // analysis surface. The handler is the modern MCP counterpart to the
  // pure `detectDeadCode` core function: it never opens Access, never
  // spawns PowerShell, and never mutates the filesystem. Like its #701
  // siblings it is never write-gated and stays available in --disable-writes.
  dysflow_detect_dead_code: {
    access: "read-only",
    writeGate: "none",
    summary: "Read-only MCP contract.",
  },
  // issue #703 — read-only VBA test manifest validation before `test_vba`.
  dysflow_validate_manifest: {
    access: "read-only",
    writeGate: "none",
    summary: "Read-only MCP contract.",
  },
  // issue #704 — read-only VBA module pre-import linting.
  dysflow_lint_module: {
    access: "read-only",
    writeGate: "none",
    summary: "Read-only MCP contract.",
  },
};

export const MCP_TOOL_CONTRACTS = {
  ...generatedContracts,
  ...aliasContracts,
  ...modernContracts,
} as const satisfies Record<ContractToolName, McpToolContract>;

for (const name of ALIAS_TOOL_NAME_LIST) {
  if (MCP_TOOL_CONTRACTS[name] === undefined) {
    throw new Error(`Missing MCP alias contract metadata: ${name}`);
  }
}

export function getMcpToolContract(name: ContractToolName): McpToolContract {
  return MCP_TOOL_CONTRACTS[name];
}
