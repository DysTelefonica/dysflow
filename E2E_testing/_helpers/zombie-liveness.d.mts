export interface LivenessSample {
  atMs: number;
  alive: boolean;
}

export interface LivenessSummary {
  firstDeadAtMs: number | null;
  aliveAtEnd: boolean;
  sampleCount: number;
}

export declare function summarizeLiveness(samples: LivenessSample[]): LivenessSummary;

export declare function formatTerminationLine(input: {
  tool: string;
  childPid: number;
  taskkillExit: number | null;
  guardExpired: boolean;
  terminationMs: number;
  liveness: LivenessSummary;
}): string;

export declare function classifyChildLiveness(input: {
  alive: boolean;
  imageName: string | null | undefined;
}): "dead" | "alive" | "reused";

export declare function zombieVerdict(input: {
  aliveAtCheck: boolean;
  liveness: { aliveAtEnd: boolean } | null;
}): "pass" | "late-exit" | "zombie";
