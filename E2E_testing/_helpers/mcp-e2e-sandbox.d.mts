export type McpE2eSandboxPaths = {
  root: string;
  accessPath: string;
  backendPath: string;
  destinationRoot: string;
  exportsRoot: string;
  pruneExportPath: string;
  erdPath: string;
  reportPath: string;
  sqlScript: string;
  formSpec: string;
  queriesExportPath: string;
  catalogPath: string;
};

export type McpE2eFixtureSourcePaths = {
  accessPath: string;
  backendPath: string;
  destinationRoot: string;
};

export type McpE2eSandboxPlan = {
  source: McpE2eFixtureSourcePaths;
  sandbox: McpE2eSandboxPaths;
  mutablePaths: string[];
};

export function buildMcpE2eSandboxPlan(options: {
  scriptDir: string;
  sandboxRoot?: string;
}): McpE2eSandboxPlan;
export function initializeMcpE2eSandbox(
  plan: McpE2eSandboxPlan,
  options: { projectId: string },
): Promise<void>;
