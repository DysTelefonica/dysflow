export type AccessSmokeEvidenceStatus = "executed" | "skipped" | "failed";

export type AccessSmokeEvidenceReport = {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  success?: boolean;
};

export type AccessSmokeEvidenceSummary = {
  status: AccessSmokeEvidenceStatus;
  exitCode: 0 | 1;
  message: string;
};

export function summarizeAccessSmokeEvidence(
  report: AccessSmokeEvidenceReport,
): AccessSmokeEvidenceSummary;
