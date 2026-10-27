// Issue #1868 — real Access round-trip for every form write tool.
//
// Each scenario applies one form write tool against the sandbox copy of
// `Form_FormPECAL` (a fixture form no other battery step touches), lets the
// tool's own import gate load the result into the sandbox Access binary, then
// asks `verify_code` whether the binary agrees with the source. The harness
// reverts the source byte-for-byte, re-imports it, and requires `verify_code`
// to be clean again before the next scenario starts.
//
// The values below were chosen so a regression of #1868 is caught by Access
// itself: numeric properties passed as strings (written quoted before #1928,
// which `LoadFromText` rejects) and align/distribute moves that land on half
// twips (written fractional before #1928). Every move keeps the controls of
// the Detalle section free of overlaps, so Access has no reason to rewrite
// OverlapFlags and report drift that the tool did not cause.
//
// The module is shared by `mcp-e2e.mjs` and by the offline pin
// `test/quality-gates/mcp-e2e-form-access-round-trip-1868.test.ts`, which
// replays every scenario through the production form adapter with a stubbed
// import gate. Keep it free of side effects.

export const FORM_ROUND_TRIP_FORM_NAME = "FormPECAL";
export const FORM_ROUND_TRIP_MODULE = "Form_FormPECAL";
export const FORM_ROUND_TRIP_CLONE_MODULE = "Form_FormPECALRoundTrip";

/** Form write tools whose output never reaches Access, so no round-trip applies. */
export const FORM_ROUND_TRIP_EXEMPT_TOOLS = Object.freeze({
  generate_form: "writes a .form.json spec stub; nothing is imported into Access",
  catalog_add_control: "writes the control catalog JSON; nothing is imported into Access",
});

/** Operations the harness sends through map_form_behavior -> generate_form_design_plan. */
export const FORM_ROUND_TRIP_PLAN_OPERATIONS = Object.freeze([
  {
    kind: "set-property",
    target: "PECAL",
    // The plan path validates twips strictly and refuses the string "7500"
    // (FORM_MUTATION_INVALID), unlike form_set_properties; send a number.
    intent: "issue #1868: a numeric width written raw",
    params: { property: "Width", value: 7500 },
  },
  {
    kind: "move-control",
    target: "DESCRIPCION",
    intent: "issue #1868: whole-twip move through a design plan",
    params: { top: 700 },
  },
]);

function sourceLines(source) {
  return String(source ?? "").split(/\r?\n/);
}

function lineEnding(source) {
  return String(source ?? "").includes("\r\n") ? "\r\n" : "\n";
}

function controlRange(lines, controlName) {
  const nameLine = lines.findIndex((line) => line.trim() === `Name ="${controlName}"`);
  if (nameLine < 0) return undefined;
  let start = nameLine;
  while (start >= 0 && !/^\s*Begin\s+\S+/.test(lines[start])) start -= 1;
  if (start < 0) return undefined;
  const indent = lines[start].match(/^\s*/)?.[0] ?? "";
  const end = lines.findIndex((line, index) => index > nameLine && line === `${indent}End`);
  if (end < 0) return undefined;
  const propertyIndent = lines[nameLine].match(/^\s*/)?.[0] ?? "";
  return { start, end, propertyIndent };
}

function propertyLineIndex(lines, range, key) {
  for (let index = range.start + 1; index < range.end; index += 1) {
    const line = lines[index];
    if (
      !line.startsWith(range.propertyIndent) ||
      /^\s/.test(line.slice(range.propertyIndent.length))
    ) {
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key} =`)) return index;
  }
  return -1;
}

/** True when the form source declares a control with this exact name. */
export function hasControl(source, controlName) {
  return controlRange(sourceLines(source), controlName) !== undefined;
}

/**
 * Raw serialized value of one property of a named control, exactly as the
 * file stores it (`1100`, `"1100"`, `NotDefault`), or undefined when absent.
 * Only the control's own properties are read, never a nested block's.
 */
export function controlProperty(source, controlName, key) {
  const lines = sourceLines(source);
  const range = controlRange(lines, controlName);
  if (range === undefined) return undefined;
  const index = propertyLineIndex(lines, range, key);
  if (index < 0) return undefined;
  const line = lines[index];
  return line.slice(line.indexOf("=") + 1).trim();
}

/** Replace one property of a named control with a raw serialized value. */
export function withControlProperty(source, controlName, key, rawValue) {
  const lines = sourceLines(source);
  const range = controlRange(lines, controlName);
  if (range === undefined) throw new Error(`control ${controlName} not found`);
  const index = propertyLineIndex(lines, range, key);
  if (index < 0) throw new Error(`control ${controlName} has no ${key} property`);
  lines[index] = `${range.propertyIndent}${key} =${rawValue}`;
  return lines.join(lineEnding(source));
}

/** A twip value Access accepts: an unquoted whole number. */
export function isWholeTwip(raw) {
  return typeof raw === "string" && /^-?\d+$/.test(raw);
}

/**
 * Geometry defects of one control: non-integer positions or extents, and
 * LayoutCached* copies that disagree with them. LayoutCachedLeft/Top cache the
 * position; LayoutCachedWidth/Height cache the far edge (Left + Width,
 * Top + Height). Empty when the control is internally consistent.
 */
export function geometryDefects(source, controlName) {
  if (!hasControl(source, controlName)) return [`${controlName} missing`];
  const defects = [];
  for (const [axis, extent] of [
    ["Left", "Width"],
    ["Top", "Height"],
  ]) {
    const position = controlProperty(source, controlName, axis);
    const size = controlProperty(source, controlName, extent);
    for (const [key, raw] of [
      [axis, position],
      [extent, size],
    ]) {
      if (raw !== undefined && !isWholeTwip(raw)) defects.push(`${controlName}.${key}=${raw}`);
    }
    const cachedPosition = controlProperty(source, controlName, `LayoutCached${axis}`);
    if (cachedPosition !== undefined && cachedPosition !== position) {
      defects.push(`${controlName}.LayoutCached${axis}=${cachedPosition} but ${axis}=${position}`);
    }
    const cachedFarEdge = controlProperty(source, controlName, `LayoutCached${extent}`);
    if (cachedFarEdge !== undefined && Number(cachedFarEdge) !== Number(position) + Number(size)) {
      defects.push(
        `${controlName}.LayoutCached${extent}=${cachedFarEdge} but ${axis}+${extent}=${Number(position) + Number(size)}`,
      );
    }
  }
  return defects;
}

function expectProperties(source, controlName, expected) {
  const mismatches = Object.entries(expected)
    .map(([key, raw]) => ({ key, raw, actual: controlProperty(source, controlName, key) }))
    .filter(({ raw, actual }) => actual !== raw)
    .map(({ key, raw, actual }) => `${controlName}.${key}=${actual ?? "<absent>"} (want ${raw})`);
  return mismatches;
}

function verdict(problems, okSummary) {
  return problems.length === 0
    ? { pass: true, summary: okSummary }
    : { pass: false, summary: problems.join("; ") };
}

function centerOf(source, controlName, axis, extent) {
  return (
    Number(controlProperty(source, controlName, axis)) +
    Number(controlProperty(source, controlName, extent)) / 2
  );
}

/**
 * One scenario per Access-importing form write tool. `buildArgs` returns the
 * tool-specific arguments; the harness adds `projectId`, `sourcePath`, and
 * `apply: true`. `expectSource` checks the written source before Access is
 * asked anything. `drift` is the verify_code outcome expected after the
 * import: "none" for edits of existing values, "layout" for tools that add a
 * control Access then completes with its own defaults. `binaryValues` names
 * values the exported binary must carry, for the tools whose drift verify_code
 * cannot clear on its own.
 */
export const FORM_ROUND_TRIP_SCENARIOS = Object.freeze([
  {
    tool: "form_set_property",
    drift: "none",
    buildArgs: () => ({ controlName: "Etiqueta240", propertyName: "FontSize", value: "12" }),
    expectSource: (source) =>
      verdict(
        expectProperties(source, "Etiqueta240", { FontSize: "12" }),
        "FontSize written raw as 12",
      ),
  },
  {
    tool: "form_set_properties",
    drift: "none",
    buildArgs: () => ({
      controlName: "Etiqueta232",
      properties: { Width: "1100", Caption: "1100" },
    }),
    expectSource: (source) =>
      verdict(
        expectProperties(source, "Etiqueta232", { Width: "1100", Caption: '"1100"' }),
        "Width written raw as 1100; numeric-looking Caption kept quoted",
      ),
  },
  {
    tool: "form_move_control",
    drift: "none",
    buildArgs: () => ({ controlName: "Etiqueta240", left: 160, top: 700 }),
    expectSource: (source) =>
      verdict(
        expectProperties(source, "Etiqueta240", { Left: "160", Top: "700" }),
        "moved to 160/700",
      ),
  },
  {
    tool: "form_rename_control",
    drift: "none",
    buildArgs: () => ({ controlName: "Etiqueta240", newName: "lblRoundTripRenamed" }),
    expectSource: (source) =>
      verdict(
        [
          ...(hasControl(source, "lblRoundTripRenamed") ? [] : ["lblRoundTripRenamed missing"]),
          ...(hasControl(source, "Etiqueta240") ? ["Etiqueta240 still present"] : []),
        ],
        "Etiqueta240 renamed to lblRoundTripRenamed",
      ),
  },
  {
    tool: "form_delete_control",
    drift: "none",
    buildArgs: () => ({ controlName: "Etiqueta240" }),
    expectSource: (source) =>
      verdict(
        hasControl(source, "Etiqueta240") ? ["Etiqueta240 still present"] : [],
        "Etiqueta240 removed",
      ),
  },
  {
    tool: "form_add_control",
    drift: "layout",
    binaryValues: {
      control: "txtRoundTripAdded",
      properties: { Left: "150", Top: "1100", Width: "1035", Height: "300", FontSize: "11" },
    },
    buildArgs: () => ({
      targetSectionName: "Detalle",
      controlName: "txtRoundTripAdded",
      controlType: "TextBox",
      properties: { Left: "150", Top: "1100", Width: "1035", Height: "300", FontSize: "11" },
    }),
    expectSource: (source) =>
      verdict(
        expectProperties(source, "txtRoundTripAdded", {
          Left: "150",
          Top: "1100",
          Width: "1035",
          Height: "300",
          FontSize: "11",
        }),
        "string geometry and FontSize written raw",
      ),
  },
  {
    tool: "form_duplicate_control",
    drift: "layout",
    binaryValues: {
      control: "lblRoundTripCopy",
      properties: { Left: "150", Top: "1100", FontSize: "12" },
    },
    buildArgs: () => ({
      sourceControlName: "Etiqueta240",
      newName: "lblRoundTripCopy",
      overrides: { Top: "1100", FontSize: "12" },
    }),
    expectSource: (source) =>
      verdict(
        [
          ...expectProperties(source, "lblRoundTripCopy", {
            Top: "1100",
            FontSize: "12",
            Caption: '"DESCRIP."',
          }),
          ...(hasControl(source, "Etiqueta240") ? [] : ["source control Etiqueta240 missing"]),
        ],
        "string overrides written raw on the copy",
      ),
  },
  {
    tool: "form_align_controls",
    drift: "none",
    // Centers 1233.5 and 862.5: the median 1048 puts both tops on half twips.
    buildArgs: () => ({ controlNames: ["DESCRIPCION", "Etiqueta240"], edge: "center-vertical" }),
    expectSource: (source) => {
      const delta = Math.abs(
        centerOf(source, "DESCRIPCION", "Top", "Height") -
          centerOf(source, "Etiqueta240", "Top", "Height"),
      );
      return verdict(
        [
          ...geometryDefects(source, "DESCRIPCION"),
          ...geometryDefects(source, "Etiqueta240"),
          ...(delta <= 1 ? [] : [`vertical centers differ by ${delta}`]),
        ],
        "half-twip tops rounded; LayoutCachedTop/Height follow",
      );
    },
  },
  {
    tool: "form_distribute_controls",
    drift: "none",
    // A 7.5-twip gap puts PECAL on a half twip.
    buildArgs: () => ({ controlNames: ["Etiqueta232", "PECAL"], axis: "horizontal", spacing: 7.5 }),
    expectSource: (source) => {
      const gap =
        Number(controlProperty(source, "PECAL", "Left")) -
        Number(controlProperty(source, "Etiqueta232", "Left")) -
        Number(controlProperty(source, "Etiqueta232", "Width"));
      return verdict(
        [
          ...geometryDefects(source, "Etiqueta232"),
          ...geometryDefects(source, "PECAL"),
          ...(gap >= 7 && gap <= 8 ? [] : [`gap ${gap} is not the rounded 7.5-twip spacing`]),
        ],
        "half-twip left rounded; LayoutCachedLeft/Width follow",
      );
    },
  },
  {
    tool: "form_deserialize",
    drift: "none",
    buildArgs: ({ source, parseFormTxt }) => ({
      ir: parseFormTxt(
        withControlProperty(
          withControlProperty(source, "Etiqueta232", "Width", "1100"),
          "Etiqueta232",
          "Caption",
          '"PECAL RT"',
        ),
        { name: FORM_ROUND_TRIP_FORM_NAME },
      ),
    }),
    expectSource: (source) =>
      verdict(
        expectProperties(source, "Etiqueta232", { Width: "1100", Caption: '"PECAL RT"' }),
        "FormIR re-serialized with raw Width and quoted Caption",
      ),
  },
  {
    tool: "apply_form_design_plan",
    drift: "none",
    buildArgs: ({ plan }) => ({ plan }),
    expectSource: (source) =>
      verdict(
        [
          ...expectProperties(source, "PECAL", { Width: "7500" }),
          ...expectProperties(source, "DESCRIPCION", { Top: "700" }),
        ],
        "plan wrote raw Width 7500 and Top 700",
      ),
  },
]);

/**
 * The forced failure: a FormIR whose numeric Width is quoted, the exact value
 * Access rejected before #1928. form_deserialize writes the IR verbatim, so
 * the rejection must come from Access, and the harness then proves that the
 * source was restored, no errors.txt was left behind, and the binary is clean.
 */
export function buildRejectedDeserializeArgs({ source, parseFormTxt }) {
  return {
    ir: parseFormTxt(withControlProperty(source, "Etiqueta232", "Width", '"1100"'), {
      name: FORM_ROUND_TRIP_FORM_NAME,
    }),
  };
}

function entryName(entry) {
  if (typeof entry === "string") return entry;
  return entry?.moduleName ?? entry?.module ?? entry?.name ?? "<unknown>";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Reduce a diagnostic verify_code payload to the round-trip verdict.
 * `clean`: no actionable or missing entry. `layoutOnly`: every actionable
 * entry is the target form's .form.txt and nothing is missing, which is the
 * drift a control Access completes with its own defaults produces.
 * `foreign` lists any reported module other than the target.
 */
export function summarizeFormVerify(payload, moduleName) {
  const actionable = list(payload?.actionableDifferent);
  const missingInSource = list(payload?.missingInSource).map(entryName);
  const missingInBinary = list(payload?.missingInBinary).map(entryName);
  const target = String(moduleName).toLowerCase();
  const describe = (entry) =>
    `${entryName(entry)}.${entry?.fileType ?? "?"}:${entry?.classification ?? "?"}`;
  const clean =
    payload?.actionableOk === true &&
    actionable.length === 0 &&
    missingInSource.length === 0 &&
    missingInBinary.length === 0;
  const layoutOnly =
    missingInSource.length === 0 &&
    missingInBinary.length === 0 &&
    actionable.every(
      (entry) =>
        entry?.fileType === "form.txt" && String(entryName(entry)).toLowerCase() === target,
    );
  const foreign = [...actionable.map(entryName), ...missingInSource, ...missingInBinary].filter(
    (name) => String(name).toLowerCase() !== target,
  );
  const details = [
    `actionableOk=${payload?.actionableOk}`,
    `actionable=[${actionable.map(describe).join(", ")}]`,
    ...(missingInSource.length > 0 ? [`missingInSource=[${missingInSource.join(", ")}]`] : []),
    ...(missingInBinary.length > 0 ? [`missingInBinary=[${missingInBinary.join(", ")}]`] : []),
  ];
  return { clean, layoutOnly, missingInBinary, foreign, summary: details.join("; ") };
}
