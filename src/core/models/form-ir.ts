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

export type SetPropertyInput = {
  controlName: string;
  property: string;
  value: string | number | boolean;
};

/**
 * Input for batch property updates against a single control.
 *
 * Issue #872 F1 — `form_set_properties` collapses a sequence of `form_set_property`
 * calls into one mutation, preserving the same per-key validation contract
 * (protected keys are rejected, blob-kind entries refuse scalar replacement,
 * LayoutCached* entries are silently dropped — they're serialisation noise
 * that Access regenerates on save and the semantic-diff classifier strips
 * anyway, see `form-noise-keys.ts`).
 */
export type SetPropertiesInput = {
  controlName: string;
  properties: Record<string, string | number | boolean>;
};

/**
 * Input for duplicating an existing control.
 *
 * Issue #872 F2 — `form_duplicate_control` is the canonical "make this new
 * control like that existing one" verb: copy the entire IR subtree (type,
 * entries, children), regenerate the `Name`, push the clone into the same
 * target section, and apply caller-supplied property/position overrides on
 * top. Event bindings (`[Event Procedure]`) ARE preserved — Access reads
 * them from the cloned entries verbatim — so a duplicated control comes
 * pre-wired with the source's behaviour unless the caller explicitly
 * overrides the affected scalar.
 */
export type DuplicateControlInput = {
  sourceControlName: string;
  newName: string;
  targetSectionName?: string;
  /**
   * Property overrides applied AFTER deep-clone. Keys may be any scalar
   * property (`Caption`, `Left`, `Top`, `Width`, `Height`, `FontSize`,
   * `ForeColor`, `Visible`, …). `Name` is always overridden by `newName`
   * regardless of whether the caller passes a `Name` key here.
   */
  overrides?: Record<string, string | number | boolean>;
};

export type DeleteControlInput = {
  controlName: string;
};

export type FormMutationResult = {
  ir: FormIR;
  source: string;
  changedControlName: string;
  preservedKeys: string[];
  /**
   * Issue #941 — pre-validation gate result for `form_set_property`.
   * Populated only on success; absent when no pre-validation ran (other
   * mutation verbs). `controlKnown` is always `true` here (a missing
   * control throws FORM_CONTROL_NOT_FOUND earlier); `propertyKnown` and
   * `valueTypeOk` reflect the per-key allowlist + value type check.
   */
  preValidation?: { controlKnown: true; propertyKnown: boolean; valueTypeOk: boolean };
};

// ---------------------------------------------------------------------------
// Form Template Cloning (slice 5, issue #618)
// ---------------------------------------------------------------------------

/**
 * Caller-supplied replacement map: `{{Token}}` placeholder → string value.
 * Keys MUST be non-empty strings; values MUST be strings; the engine replaces
 * every occurrence of `{{Key}}` in scalar values and non-preserved blob body
 * lines. Reserved metadata (`Checksum`, `Format`, `PrtDevMode`) is never walked.
 */
export type TokenMap = Readonly<Record<string, string>>;

/**
 * How the engine handles a token that appears in the source but is missing
 * from the token map.
 *
 * - `warn-pass-through` (default): leave the token verbatim in the result,
 *   record it in `missingTokens`, emit a structured warning, return success.
 * - `strict`: throw `FORM_MUTATION_INVALID` and produce no cloned IR.
 */
export type MissingTokenPolicy = "warn-pass-through" | "strict";

/**
 * Options for `applyTokenMap` (pure IR transformation).
 */
export type ApplyTokenMapOptions = {
  missingTokenPolicy?: MissingTokenPolicy;
};

/**
 * Result of `applyTokenMap`: the transformed IR plus a structured accounting
 * of which tokens were applied and which were left verbatim.
 */
export type ApplyTokenMapResult = {
  ir: FormIR;
  appliedTokens: string[];
  missingTokens: string[];
  warnings: string[];
};

/**
 * Options for `cloneFormFromTemplate`. Pure: the engine does not read or
 * write files. Path-level concerns (source resolution, target overwrite,
 * LoadFromText gate) are the adapter's responsibility.
 */
export type CloneFromTemplateOptions = {
  tokenMap: TokenMap;
  targetFormName: string;
  missingTokenPolicy?: MissingTokenPolicy;
};

/**
 * Result of `cloneFormFromTemplate`. `source` is the byte-equivalent
 * serialized form of the cloned IR; `preservedKeys` mirrors `FormMutationResult`.
 */
export type CloneFromTemplateResult = {
  ir: FormIR;
  source: string;
  appliedTokens: string[];
  missingTokens: string[];
  warnings: string[];
  preservedKeys: string[];
};
