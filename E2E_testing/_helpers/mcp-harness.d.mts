// Type declarations for E2E_testing/_helpers/mcp-harness.mjs.

export type HarnessChild = {
  pid?: number;
  stdout: { on: (event: "data", cb: (chunk: Buffer | string) => void) => void };
  stderr: { on: (event: "data", cb: (chunk: Buffer | string) => void) => void };
  stdin: { write: (s: string) => void; end: () => void };
  on: (event: "close" | "error", cb: (...args: unknown[]) => void) => void;
  kill: () => void;
};

export type HarnessOptions = {
  child: HarnessChild;
  requestId: number;
  method: string;
  params: Record<string, unknown>;
  timeoutMs: number;
  closeWatchdogMs: number;
  clientName?: string;
  clientVersion?: string;
};

export type HarnessResult = {
  response: unknown;
  exit: { code: number | null; signal: string | null };
  stdout: string;
  stderr: string;
  timedOut: boolean;
  isError: boolean;
  text: string;
  childPid?: number;
  closeWatchdogFired?: boolean;
};

export function runMcpHarness(options: HarnessOptions): Promise<HarnessResult>;
