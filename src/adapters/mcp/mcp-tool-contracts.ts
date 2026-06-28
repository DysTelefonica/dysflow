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
  return {
    access: "conditional-write",
    writeGate: "conditional",
    dryRunDefault: route.kind !== "vba-sync",
    summary: "Write-capable MCP contract; write execution is write-gated.",
  };
}

const generatedContracts = Object.fromEntries(
  (Object.keys(MCP_TOOL_ROUTES) as GeneratedDispatchToolName[]).map((name) => [
    name,
    contractFromGeneratedRoute(name),
  ]),
) as Record<GeneratedDispatchToolName, McpToolContract>;

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
    access: "read-only",
    writeGate: "none",
    summary:
      "Read-only MCP contract; executing a public VBA procedure requires an already compiled project.",
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
    access: "read-only",
    writeGate: "none",
    summary:
      "Read-only MCP contract; executing a VBA procedure requires an already compiled project.",
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
