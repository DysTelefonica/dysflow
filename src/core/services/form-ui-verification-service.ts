import type {
  FormUiBehaviorMap,
  FormUiVerificationFinding,
  FormUiVerificationReport,
  VerifyFormUiOptions,
} from "../models/form-ui-builder.js";
import {
  type BoundingBox,
  boxesOverlap,
  eventHandlerExistsInCodeBehind,
  isWithinCanvas,
  isWithinSection,
  type LayoutBounds,
  parseBoundingBox,
  parseTabIndex,
  tabOrderMatchesVisual,
  validatePropertyValue,
  visualOrder,
} from "./form-ui-geometry.js";

/**
 * Verify an applied form UI contract against the source behavior map.
 *
 * Issue #831 — extended with three categories of looks-right checks:
 *   1. Geometry (overlap, negative positions, off-canvas, off-section).
 *   2. Tab order (TabIndex matches visual top-to-bottom order).
 *   3. Property validity (numeric ranges + enum allowlists + event-handler
 *      cross-ref against the sibling `.cls`).
 *
 * The result envelope is additive: `findings` still carries the COMBINED
 * list (backward compat for pre-#831 callers); `survivedFindings` carries
 * the original "did it survive" check (severity:"error"), and
 * `looksRightFindings` carries the new warnings (severity:"warning",
 * non-blocking — `ok` stays `true` while no error is present).
 *
 * Optional inputs (`formCanvas` / `sectionBounds` + `controlSection` /
 * `codeBehind`) enable the corresponding looks-right check; missing input
 * ⇒ that check is skipped silently.
 *
 * Pure: no I/O, no FormIR mutation, no Access dependency. The geometry
 * primitives live in `form-ui-geometry.ts` (single source of truth shared
 * with the upcoming #815 `analyze_form_layout` and #818
 * `verify_form_bindings`).
 */
export function verifyFormUi(
  sourceContract: FormUiBehaviorMap,
  appliedContract: FormUiBehaviorMap,
  options: VerifyFormUiOptions = {},
): FormUiVerificationReport {
  const survivedFindings = collectSurvivedFindings(sourceContract, appliedContract);
  const looksRightFindings = collectLooksRightFindings(appliedContract, options);

  return {
    ok: survivedFindings.every((finding) => finding.severity !== "error"),
    formName: sourceContract.formName,
    findings: [...survivedFindings, ...looksRightFindings],
    checkedControls: sourceContract.controls.map((control) => control.name),
    survivedFindings,
    looksRightFindings,
  };
}

// ---------------------------------------------------------------------------
// Phase 1: survivedFindings (unchanged — preserved verbatim from pre-#831)
// ---------------------------------------------------------------------------

function collectSurvivedFindings(
  sourceContract: FormUiBehaviorMap,
  appliedContract: FormUiBehaviorMap,
): FormUiVerificationFinding[] {
  const findings: FormUiVerificationFinding[] = [];

  for (const sourceControl of sourceContract.controls) {
    const appliedControl = appliedContract.controls.find(
      (control) => control.name === sourceControl.name,
    );
    if (appliedControl === undefined) {
      findings.push({
        code: "FORM_UI_CONTROL_MISSING",
        severity: "error",
        controlName: sourceControl.name,
        message: `Mapped control "${sourceControl.name}" is missing from the applied UI.`,
      });
      continue;
    }
    for (const eventName of sourceControl.events) {
      if (!appliedControl.events.includes(eventName)) {
        findings.push({
          code: "FORM_UI_EVENT_DRIFT",
          severity: "error",
          controlName: sourceControl.name,
          message: `Mapped event "${eventName}" was removed from "${sourceControl.name}".`,
        });
      }
    }
    for (const binding of sourceControl.bindings) {
      if (!appliedControl.bindings.includes(binding)) {
        findings.push({
          code: "FORM_UI_BINDING_DRIFT",
          severity: "error",
          controlName: sourceControl.name,
          message: `Mapped binding "${binding}" was removed from "${sourceControl.name}".`,
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Phase 2: looksRightFindings (new — issue #831)
// ---------------------------------------------------------------------------

function collectLooksRightFindings(
  appliedContract: FormUiBehaviorMap,
  options: VerifyFormUiOptions,
): FormUiVerificationFinding[] {
  const findings: FormUiVerificationFinding[] = [];

  // Index controls by name once; every looks-right check needs it.
  const controlsByName = new Map<string, FormUiBehaviorMap["controls"][number]>();
  for (const control of appliedContract.controls) {
    controlsByName.set(control.name, control);
  }

  // Pre-parse geometry + tabIndex so we don't redo the work for every check.
  const geometryByName = new Map<string, BoundingBox | null>();
  const tabIndexByName = new Map<string, number | null>();
  for (const control of appliedContract.controls) {
    geometryByName.set(control.name, parseBoundingBox(control.properties ?? {}));
    tabIndexByName.set(control.name, parseTabIndex(control.properties ?? {}));
  }

  // 1. Geometry -----------------------------------------------------------

  // 1a. Negative positions: left<0 OR top<0 on a control with parsed box.
  for (const control of appliedContract.controls) {
    const raw = control.properties ?? {};
    const leftRaw = raw.Left;
    const topRaw = raw.Top;
    if (leftRaw !== undefined && Number(leftRaw.trim()) < 0) {
      findings.push({
        code: "FORM_UI_NEGATIVE_POSITION",
        severity: "warning",
        controlName: control.name,
        message: `Control "${control.name}" has a negative Left value (${leftRaw.trim()}).`,
      });
    }
    if (topRaw !== undefined && Number(topRaw.trim()) < 0) {
      findings.push({
        code: "FORM_UI_NEGATIVE_POSITION",
        severity: "warning",
        controlName: control.name,
        message: `Control "${control.name}" has a negative Top value (${topRaw.trim()}).`,
      });
    }
  }

  // 1b. Overlapping bounding boxes (pairwise, deduplicated).
  const overlappingPairs = new Set<string>();
  const names = appliedContract.controls.map((c) => c.name);
  for (let i = 0; i < names.length; i++) {
    const nameA = names[i];
    if (nameA === undefined) continue;
    const boxA = geometryByName.get(nameA) ?? null;
    if (boxA === null) continue;
    for (let j = i + 1; j < names.length; j++) {
      const nameB = names[j];
      if (nameB === undefined) continue;
      const boxB = geometryByName.get(nameB) ?? null;
      if (boxB === null) continue;
      if (!boxesOverlap(boxA, boxB)) continue;
      const pairKey = nameA < nameB ? `${nameA}|${nameB}` : `${nameB}|${nameA}`;
      if (overlappingPairs.has(pairKey)) continue;
      overlappingPairs.add(pairKey);
      findings.push({
        code: "FORM_UI_OVERLAPPING_BOUNDS",
        severity: "warning",
        controlName: `${nameA} <-> ${nameB}`,
        message: `Controls "${nameA}" and "${nameB}" have overlapping bounding boxes.`,
      });
    }
  }

  // 1c. Off-canvas (only when formCanvas is supplied).
  if (options.formCanvas !== undefined) {
    const canvas: LayoutBounds = options.formCanvas;
    for (const control of appliedContract.controls) {
      const box = geometryByName.get(control.name) ?? null;
      if (box === null) continue;
      if (isWithinCanvas(box, canvas)) continue;
      findings.push({
        code: "FORM_UI_OFF_CANVAS",
        severity: "warning",
        controlName: control.name,
        message: `Control "${control.name}" extends outside the form canvas (${canvas.width}x${canvas.height} twips).`,
      });
    }
  }

  // 1d. Off-section (only when sectionBounds + controlSection are supplied).
  if (options.sectionBounds !== undefined && options.controlSection !== undefined) {
    for (const control of appliedContract.controls) {
      const box = geometryByName.get(control.name) ?? null;
      if (box === null) continue;
      const sectionName = options.controlSection[control.name];
      if (sectionName === undefined) continue;
      const section = options.sectionBounds[sectionName];
      if (section === undefined) continue;
      if (isWithinSection(box, section)) continue;
      findings.push({
        code: "FORM_UI_OFF_SECTION",
        severity: "warning",
        controlName: control.name,
        message: `Control "${control.name}" extends outside its section "${sectionName}".`,
      });
    }
  }

  // 2. Tab order ---------------------------------------------------------

  const controlsWithTab = appliedContract.controls
    .map((control) => {
      const box = geometryByName.get(control.name);
      if (box === null || box === undefined) return null;
      return {
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        name: control.name,
        tabIndex: tabIndexByName.get(control.name) ?? null,
      };
    })
    .filter(
      (entry): entry is BoundingBox & { name: string; tabIndex: number | null } => entry !== null,
    );
  if (!tabOrderMatchesVisual(controlsWithTab)) {
    const expectedOrder = visualOrder(controlsWithTab)
      .filter((c) => c.tabIndex !== null)
      .map((c) => c.name);
    findings.push({
      code: "FORM_UI_TAB_ORDER_MISMATCH",
      severity: "warning",
      message: `Tab order does not match visual top-to-bottom order. Visual order: ${expectedOrder.join(", ")}.`,
    });
  }

  // 3. Property validity -------------------------------------------------

  // 3a. Numeric range + enum allowlist per property.
  for (const control of appliedContract.controls) {
    const properties = control.properties ?? {};
    for (const [key, rawValue] of Object.entries(properties)) {
      const validation = validatePropertyValue(key, rawValue);
      if (validation === null) continue;
      if (validation.kind === "out-of-range") {
        findings.push({
          code: "FORM_UI_PROPERTY_OUT_OF_RANGE",
          severity: "warning",
          controlName: control.name,
          message: `Control "${control.name}" property "${key}" value "${rawValue}" is outside the sane range [${validation.min}, ${validation.max}] twips.`,
        });
      } else if (validation.kind === "invalid-enum") {
        findings.push({
          code: "FORM_UI_INVALID_ENUM_VALUE",
          severity: "warning",
          controlName: control.name,
          message: `Control "${control.name}" property "${key}" value "${rawValue}" is not in the allowed enum values [${validation.allowed.join(", ")}].`,
        });
      }
      // "non-numeric" on a known-numeric property is also out-of-range;
      // surface it under the same code so callers don't need to special-case.
      else if (validation.kind === "non-numeric") {
        findings.push({
          code: "FORM_UI_PROPERTY_OUT_OF_RANGE",
          severity: "warning",
          controlName: control.name,
          message: `Control "${control.name}" property "${key}" value "${rawValue}" is not a finite number.`,
        });
      }
    }
  }

  // 3b. Event-handler cross-ref (only when codeBehind is supplied).
  if (options.codeBehind !== undefined && options.codeBehind.length > 0) {
    for (const control of appliedContract.controls) {
      for (const eventName of control.events) {
        if (eventHandlerExistsInCodeBehind(control.name, eventName, options.codeBehind)) {
          continue;
        }
        findings.push({
          code: "FORM_UI_EVENT_HANDLER_MISSING",
          severity: "warning",
          controlName: control.name,
          message: `Control "${control.name}" binds event "${eventName}" to [Event Procedure], but no "${control.name}_${eventName}" handler was found in the .cls code-behind.`,
        });
      }
    }
  }

  return findings;
}
