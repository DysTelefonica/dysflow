import {
  classifyVbaPair,
  SEMANTIC_CLASSIFIER_RULES,
} from "../../core/services/vba-semantic-classifier.js";
import { isRecord } from "../../core/utils/index.js";

/**
 * Enriches runner-owned verbose snapshots with the canonical VBA semantic
 * verdict, then removes the private comparison text used at the adapter seam.
 * The PowerShell runner owns Access COM capture; TypeScript owns semantic
 * policy. Keeping that split prevents the runner from growing a second,
 * inevitably drifting classification taxonomy.
 */
export function enrichVbaSyncVerboseDiagnostics(payload: unknown): unknown {
  return visit(payload);
}

function visit(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(visit);
  if (!isRecord(value)) return value;

  const enriched = enrichVerboseObject(value);
  return Object.fromEntries(Object.entries(enriched).map(([key, child]) => [key, visit(child)]));
}

function enrichVerboseObject(value: Record<string, unknown>): Record<string, unknown> {
  const importSource = text(value._sourceText);
  const importDestination = text(value._destinationText);
  if (importSource !== undefined && importDestination !== undefined) {
    return withClassification(value, importSource, importDestination);
  }

  const exportBinary = text(value._binaryText);
  const exportFile = text(value._fileText);
  if (exportBinary !== undefined && exportFile !== undefined) {
    // The canonical classifier names the disk side `source` and the Access
    // side `binary`, independent of whether the operation is import or export.
    return withClassification(value, exportFile, exportBinary);
  }

  return removePrivateText(value);
}

function withClassification(
  value: Record<string, unknown>,
  sourceText: string,
  binaryText: string,
): Record<string, unknown> {
  const { _sourceText, _destinationText, _binaryText, _fileText, ...publicFields } = value;
  void _sourceText;
  void _destinationText;
  void _binaryText;
  void _fileText;
  const fileType = normalizeFileType(value.fileType);
  const classification = classifyVbaPair({
    sourceText,
    binaryText,
    fileType,
    mode: "semantic",
  });

  return {
    ...publicFields,
    ...classification,
    classifierRules: SEMANTIC_CLASSIFIER_RULES,
  };
}

function normalizeFileType(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "bas";
  return value.replace(/^\./, "").toLowerCase();
}

function removePrivateText(value: Record<string, unknown>): Record<string, unknown> {
  const { _sourceText, _destinationText, _binaryText, _fileText, ...publicFields } = value;
  void _sourceText;
  void _destinationText;
  void _binaryText;
  void _fileText;
  return publicFields;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
