/**
 * Privacy-safe, project-local MCP invocation telemetry contract.
 *
 * The core owns the record shape and output port. Node filesystem concerns
 * (JSONL append and rotation) stay in the MCP adapter.
 */
export type InvocationOutcome = "ok" | "error";
export type InvocationFailureClass = "contract" | "runtime" | "none";
export type InvocationWriteIntent = "apply" | "dryRun" | "read";

export type InvocationTelemetryEntry = {
  timestamp: string;
  tool: string;
  action: string;
  operationId: string | null;
  /**
   * Deliberate privacy exception: the canonical project identity may be retained
   * so local multi-project telemetry can be attributed. No other argument value
   * is allowed into this record.
   */
  projectId: string | null;
  outcome: InvocationOutcome;
  failureClass: InvocationFailureClass;
  errorCode: string | null;
  durationMs: number;
  writeIntent: InvocationWriteIntent;
  paramNamesPresent: string[];
  /** Required schema parameters omitted by the caller (#1198). */
  missingParams: string[];
  rejectedParams: string[];
  unknownToolName: string | null;
  /** Privacy-safe dispatch evidence; argument values never belong here. */
  auditEvents?: string[];
};

export interface InvocationTelemetryRecorder {
  record(entry: InvocationTelemetryEntry): Promise<void>;
}
