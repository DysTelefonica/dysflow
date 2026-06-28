export type AccessSmokeEvidenceStatus = "executed" | "skipped" | "access-skipped" | "failed";

export type AccessSmokeEvidenceAssertionResult = {
  status?: string;
};

export type AccessSmokeEvidenceTestResult = {
  name?: string;
  assertionResults?: AccessSmokeEvidenceAssertionResult[];
};

export type AccessSmokeEvidenceReport = {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  success?: boolean;
  testResults?: AccessSmokeEvidenceTestResult[];
};

export type AccessSmokeEvidenceOptions = {
  releaseMode?: boolean;
};

export type AccessSmokeEvidenceSummary = {
  status: AccessSmokeEvidenceStatus;
  exitCode: 0 | 1;
  message: string;
};

export function summarizeAccessSmokeEvidence(
  report: AccessSmokeEvidenceReport,
  options?: AccessSmokeEvidenceOptions,
): AccessSmokeEvidenceSummary;
