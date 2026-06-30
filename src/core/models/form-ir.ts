// Form IR (Intermediate Representation) types for parsing/serializing Access SaveAsText .form.txt files.
// Ordered arrays + recursive node tree — NOT maps — so duplicate keys and insertion order are preserved.

/**
 * A scalar form property entry: Key =Value (single-line).
 */
export type ScalarEntry = { kind: "scalar"; key: string; value: string };

/**
 * An opaque blob form property entry: Key = Begin\n...\nEnd
 * Lines are preserved verbatim (with original whitespace) for round-trip fidelity.
 */
export type BlobEntry = { kind: "blob"; key: string; lines: string[] };

/**
 * An empty line inside a form node. Access SaveAsText occasionally emits blank
 * lines between entries (e.g. after a blob block). Storing them here is the
 * only way to achieve a byte-for-byte round-trip via serializeFormTxt.
 */
export type EmptyLineEntry = { kind: "empty" };

/**
 * A form property entry — either a scalar key=value, an opaque blob, or an
 * empty line (whitespace separator emitted by Access between some entries).
 */
export type PropertyEntry = ScalarEntry | BlobEntry | EmptyLineEntry;

/**
 * A recursive form node representing a Begin...End block.
 *
 * blockType is the word following Begin (e.g. "Form", "Label", "Section",
 * "FormHeader", "Image"). blockType "" represents an unlabeled Begin container.
 *
 * entries holds property entries in document order (duplicates preserved).
 * children holds nested Begin...End nodes in document order.
 */
export type FormNode = {
  blockType: string;
  entries: PropertyEntry[];
  children: FormNode[];
};

/**
 * The top-level parsed representation of a single Access .form.txt file.
 *
 * name: derived from the filename by the adapter (e.g. "frmSplash").
 * kind: "Form" or "Report", inferred from the Begin Form/Report line.
 * preamble: property entries before the root Begin block (Version, Checksum, …).
 * root: the root Form/Report node (blockType="Form" or "Report").
 * codeBehind: the VBA code after the CodeBehindForm marker, or null if absent.
 */
export type FormIR = {
  name: string;
  kind: "Form" | "Report";
  preamble: PropertyEntry[];
  root: FormNode;
  codeBehind: string | null;
};

export type FormControlMutationSpec = {
  name: string;
  type: string;
  properties?: Record<string, string | number | boolean>;
};

export type AddControlInput = {
  targetSectionName?: string;
  control: FormControlMutationSpec;
};

export type MoveControlInput = {
  controlName: string;
  left?: number;
  top?: number;
};

export type RenameControlInput = {
  controlName: string;
  newName: string;
};

export type FormMutationResult = {
  ir: FormIR;
  source: string;
  changedControlName: string;
  preservedKeys: string[];
};
