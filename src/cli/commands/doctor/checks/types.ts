/**
 * Issue #1057 (F9) — shared shape for the categorized `dysflow doctor`
 * checks. Every check is read-only (no PowerShell, no Access COM, no
 * writes) and best-effort: a throwing check surfaces as its own failed
 * entry instead of aborting the category.
 */
export type DoctorCategoryCheck = {
  ok: boolean;
  name: string;
  message: string;
  /** Only `critical` findings flip the doctor exit code; warnings exit 0. */
  severity: "critical" | "warning";
};

export type DoctorCategoryId = "A" | "B" | "C" | "D";

export const DOCTOR_CATEGORY_LABELS: Record<DoctorCategoryId, string> = {
  A: "Category A — .dysflow/project.json",
  B: "Category B — VBA source structure",
  C: "Category C — runtime consumer contract",
  D: "Category D — external dependencies",
};
