import type { FormNode } from "../models/form-ir.js";
import { parseFormTxt, serializeFormTxt, upsertScalar } from "./form-ir-service.js";

/** Functional properties that Access may omit when they hold their default. */
export const COMBOBOX_LISTBOX_FORCE_INCLUDE_PROPERTIES: ReadonlySet<string> = new Set([
  "BoundColumn",
  "ColumnCount",
  "ColumnHeads",
  "RowSource",
  "ColumnWidths",
  "Format",
  "StatusBarText",
  "ListRows",
  "ListWidth",
]);

export type ControlPropertyLookup = (
  controlName: string,
  propertyName: string,
) => string | number | boolean | undefined;

function controlNameOf(node: FormNode): string | undefined {
  const entry = node.entries.find(
    (candidate) => candidate.kind === "scalar" && candidate.key === "Name",
  );
  if (entry === undefined || entry.kind !== "scalar") return undefined;
  const value = entry.value.trim();
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

/**
 * Add omitted functional ComboBox/ListBox properties to an exported form.
 * Existing values are preserved; lookup is called only for missing allow-list
 * entries, so the normal SaveAsText representation remains untouched.
 */
export function postprocessFormTxt(formText: string, lookup: ControlPropertyLookup): string {
  const form = parseFormTxt(formText);

  const visit = (node: FormNode): void => {
    const controlName = controlNameOf(node);
    if (controlName !== undefined && /^(ComboBox|ListBox)$/i.test(node.blockType)) {
      for (const propertyName of COMBOBOX_LISTBOX_FORCE_INCLUDE_PROPERTIES) {
        const exists = node.entries.some(
          (entry) => entry.kind === "scalar" && entry.key === propertyName,
        );
        if (exists) continue;
        const value = lookup(controlName, propertyName);
        if (value !== undefined) upsertScalar(node, propertyName, String(value));
      }
    }
    for (const child of node.children) visit(child);
  };

  visit(form.root);
  return serializeFormTxt(form);
}
