import type {
  CheckId,
  DiagnosticCategory,
  ReasonCode,
} from "../../../../core/contracts/diagnostic-check.js";
import type { Remediation } from "../../../../core/contracts/remediation.js";

export type DoctorCategoryCheck = {
  ok: boolean;
  name: string;
  message: string;
  /** Only `critical` findings flip the doctor exit code; warnings exit 0. */
  severity: "critical" | "warning";
  check_id?: CheckId;
  reason_code?: ReasonCode;
  requires_confirmation?: boolean;
  category?: DiagnosticCategory;
  safe_next_step?: Remediation;
};

export type DoctorCheckMetadata = Required<
  Pick<DoctorCategoryCheck, "check_id" | "reason_code" | "requires_confirmation" | "category">
>;

export const DOCTOR_CHECK_METADATA = [
  {
    check_id: "project_json_schema",
    reason_code: "PROJECT_JSON_INVALID",
    requires_confirmation: false,
    category: "projectConfig",
  },
  {
    check_id: "access_path_resolves",
    reason_code: "ACCESS_PATH_NOT_FOUND",
    requires_confirmation: false,
    category: "projectConfig",
  },
  {
    check_id: "backend_path_resolves",
    reason_code: "BACKEND_PATH_NOT_FOUND",
    requires_confirmation: false,
    category: "projectConfig",
  },
  {
    check_id: "destination_root_resolves",
    reason_code: "DESTINATION_ROOT_NOT_FOUND",
    requires_confirmation: false,
    category: "projectConfig",
  },
  {
    check_id: "project_id_matches_convention",
    reason_code: "PROJECT_ID_BAD_CHARS",
    requires_confirmation: false,
    category: "projectConfig",
  },
  {
    check_id: "write_execution_policy_known",
    reason_code: "WRITE_POLICY_UNKNOWN",
    requires_confirmation: false,
    category: "projectConfig",
  },
  {
    check_id: "attribute_vb_name",
    reason_code: "VB_NAME_MISSING",
    requires_confirmation: true,
    category: "source",
  },
  {
    check_id: "option_explicit",
    reason_code: "OPTION_EXPLICIT_MISSING",
    requires_confirmation: true,
    category: "source",
  },
  {
    check_id: "apply_polarity",
    reason_code: "APPLY_POLARITY_DRIFT",
    requires_confirmation: false,
    category: "runtimeConsumer",
  },
  {
    check_id: "module_param_naming",
    reason_code: "PARAM_NAMING_INCONSISTENT",
    requires_confirmation: false,
    category: "runtimeConsumer",
  },
  {
    check_id: "lacdb_locks",
    reason_code: "STALE_LACCDB_PRESENT",
    requires_confirmation: true,
    category: "externalDeps",
  },
  {
    check_id: "codegraph_freshness",
    reason_code: "CODEGRAPH_STALE",
    requires_confirmation: false,
    category: "externalDeps",
  },
  {
    check_id: "opencode_mcp_wiring",
    reason_code: "MCP_WIRING_MISMATCH",
    requires_confirmation: false,
    category: "externalDeps",
  },
  {
    check_id: "codegraph_supplement_drift",
    reason_code: "SUPPLEMENT_DRIFT",
    requires_confirmation: false,
    category: "externalDeps",
  },
  {
    check_id: "diagnose_project_config_status",
    reason_code: "PROJECT_CONFIG_STATUS",
    requires_confirmation: false,
    category: "projectConfig",
  },
  {
    check_id: "diagnose_filesystem_access_path_exists",
    reason_code: "FS_ACCESS_PATH_MISSING",
    requires_confirmation: false,
    category: "projectConfig",
  },
  {
    check_id: "diagnose_filesystem_backend_path_exists",
    reason_code: "FS_BACKEND_PATH_MISSING",
    requires_confirmation: false,
    category: "projectConfig",
  },
  {
    check_id: "diagnose_filesystem_destination_root_exists",
    reason_code: "FS_DESTINATION_ROOT_MISSING",
    requires_confirmation: false,
    category: "projectConfig",
  },
  {
    check_id: "stale_markers",
    reason_code: "STALE_MARKER_PRESENT",
    requires_confirmation: true,
    category: "runtimeConsumer",
  },
  {
    check_id: "diagnose_runtime_active_ops",
    reason_code: "ACTIVE_OPS_PRESENT",
    requires_confirmation: false,
    category: "runtimeConsumer",
  },
  {
    check_id: "orphans_msaccess",
    reason_code: "MSACCESS_ORPHAN_PRESENT",
    requires_confirmation: true,
    category: "runtimeConsumer",
  },
  {
    check_id: "diagnose_runtime_dysflow_version",
    reason_code: "ADAPTER_VERSION_SNAPSHOT",
    requires_confirmation: false,
    category: "runtimeConsumer",
  },
  {
    check_id: "diagnose_runtime_write_execution_policy",
    reason_code: "WRITE_POLICY_SNAPSHOT",
    requires_confirmation: false,
    category: "runtimeConsumer",
  },
  {
    check_id: "diagnose_project_config_warnings",
    reason_code: "CWD_OR_TARGET_MISMATCH",
    requires_confirmation: false,
    category: "safety",
  },
  {
    check_id: "diagnostics_powershell_router",
    reason_code: "DIAGNOSTICS_PS_ROUTED",
    requires_confirmation: false,
    category: "runtimeConsumer",
  },
  {
    check_id: "export_overwrites_source_precheck",
    reason_code: "DESTINATION_OVERLAPS_SOURCE",
    requires_confirmation: true,
    category: "safety",
  },
] as const satisfies readonly DoctorCheckMetadata[];

export function doctorCheckMetadata(checkId: CheckId): DoctorCheckMetadata {
  const metadata = DOCTOR_CHECK_METADATA.find((entry) => entry.check_id === checkId);
  if (metadata === undefined) throw new Error(`Unknown doctor check_id: ${checkId}`);
  return metadata;
}

export type DoctorCategoryId = "A" | "B" | "C" | "D";

export const DOCTOR_CATEGORY_LABELS: Record<DoctorCategoryId, string> = {
  A: "Category A — .dysflow/project.json",
  B: "Category B — VBA source structure",
  C: "Category C — runtime consumer contract",
  D: "Category D — external dependencies",
};
