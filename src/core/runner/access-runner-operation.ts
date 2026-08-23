import type { AccessQueryRequest, AccessVbaRequest } from "../contracts/index.js";

/**
 * Leaf module (#1491). `AccessRunnerOperation` used to live in
 * `access-runner.ts`, which made it unreachable from anything that
 * `access-runner.ts` itself imports. Lifting the query pre-flight out needed
 * this type, so the type moves to a leaf instead of the extraction creating an
 * import cycle — the same shape used to break the adapters/mcp SCC.
 */
export type AccessDiagnosticsRequest = {
  includeEnvironment?: boolean;
  // Overrides
  projectId?: string;
  contextId?: string;
  accessPath?: string;
  backendPath?: string;
  destinationRoot?: string;
  projectRoot?: string;
  timeoutMs?: number;
  strictContext?: boolean;
  expectedAccessPath?: string;
  expectedProjectRoot?: string;
  expectedDestinationRoot?: string;
};

export type AccessRunnerOperation =
  | { kind: "vba"; request: AccessVbaRequest }
  | { kind: "query"; request: AccessQueryRequest }
  | { kind: "diagnostics"; request: AccessDiagnosticsRequest };
