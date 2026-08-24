export const CI_RECEIPT_JOB_NAME: "CI result";

export interface ReceiptEvaluationOptions {
  workflowRuns: unknown[];
  jobsByRunId: ReadonlyMap<number, unknown[]>;
  expectedRepository: string;
  expectedSha: string;
  expectedBranch: string;
  expectedWorkflowName: string;
  expectedWorkflowPath: string;
  expectedJobName: string;
  now: string;
  maxAgeHours: number;
}

export type ReceiptEvaluation =
  | {
      decision: "skip";
      reason: "fresh-authoritative-receipt";
      runId: number;
      jobId: number;
      completedAt: string;
    }
  | {
      decision: "full-validation";
      reason: string;
    };

export function evaluateCiReceipt(options: ReceiptEvaluationOptions): ReceiptEvaluation;
export function verifyCiReceiptFromGitHub(
  env?: NodeJS.ProcessEnv,
): Promise<ReceiptEvaluation>;
