export type Contributor = {
  name: string;
  logicalBytes: number;
  share: number;
};

export type BudgetViolation = {
  metric: string;
  baseline: number;
  current: number;
};

export function canonicalJson(value: unknown): string;
export function measureLogicalBytes(value: unknown): number;
export function summarizeContributors(
  entries: readonly { name: string; logicalBytes: number }[],
  limit?: number,
): Contributor[];
export function compareBudget(
  current: unknown,
  baseline: unknown,
): BudgetViolation[];
