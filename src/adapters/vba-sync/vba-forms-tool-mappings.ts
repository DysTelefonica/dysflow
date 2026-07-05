import { stringValue } from "../../core/utils/index.js";
import { mapping } from "./vba-sync-types.js";

export const FORMS_MAPPINGS = {
  generate_erd: mapping(
    "Generate-ERD",
    false,
    () => [],
    (input) => ({
      backendPath: stringValue(input.backendPath),
      erdPath: stringValue(input.erdPath),
    }),
  ),
  import_modules_gate: mapping(
    "Import",
    true,
    (input) =>
      Array.isArray(input.moduleNames)
        ? input.moduleNames.filter((value): value is string => typeof value === "string")
        : [],
    (input) => ({ importMode: stringValue(input.importMode) }),
  ),
};
