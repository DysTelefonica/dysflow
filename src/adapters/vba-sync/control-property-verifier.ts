import { readFile } from "node:fs/promises";
import { collectControls, parseFormTxt } from "../../core/services/form-ir-service.js";
import type { FormIR } from "../../core/models/form-ir.js";

export type ExpectedProperty = {
  controlName: string;
  propertyName: string;
  expectedValue?: string;
};

export type MissingProperty = ExpectedProperty & {
  actualValue?: string;
};

export type ControlPropertyVerificationResult = {
  ok: boolean;
  missing: MissingProperty[];
};

export type FormSourceReader = (formSourcePath: string) => Promise<string>;

const nodeFormSourceReader: FormSourceReader = async (formSourcePath) =>
  (await readFile(formSourcePath, "utf8")) as string;

/**
 * Identify scalar properties that are present after a mutation but were not
 * present before it. Existing properties are intentionally excluded so value
 * updates do not require a second verification path.
 */
export function findNewControlProperties(before: FormIR, after: FormIR): ExpectedProperty[] {
  const beforeControls = new Map(collectControls(before.root).map((control) => [control.name, control]));
  const expected: ExpectedProperty[] = [];

  for (const control of collectControls(after.root)) {
    const previous = beforeControls.get(control.name);
    if (previous === undefined) continue;
    for (const [propertyName, expectedValue] of Object.entries(control.properties)) {
      if (propertyName === "Name" || previous.properties[propertyName] !== undefined) continue;
      expected.push({ controlName: control.name, propertyName, expectedValue });
    }
  }

  return expected;
}

/**
 * Re-parse a written form source and verify that each requested new property
 * survived serialization. This is deliberately source-only: the Access gate
 * has already completed, and the verifier catches a LoadFromText silent drop
 * without opening a second COM session.
 */
export async function verifyControlProperties(
  formSourcePath: string,
  expectedProperties: readonly ExpectedProperty[],
  readSource: FormSourceReader = nodeFormSourceReader,
): Promise<ControlPropertyVerificationResult> {
  if (expectedProperties.length === 0) return { ok: true, missing: [] };

  const source = await readSource(formSourcePath);
  const form = parseFormTxt(source, { name: formSourcePath });
  const controls = new Map(collectControls(form.root).map((control) => [control.name, control]));
  const missing: MissingProperty[] = [];

  for (const expected of expectedProperties) {
    const control = controls.get(expected.controlName);
    const actualValue = control?.properties[expected.propertyName];
    const absent = actualValue === undefined;
    const wrongValue =
      expected.expectedValue !== undefined && !absent && actualValue !== expected.expectedValue;
    if (absent || wrongValue) {
      missing.push({
        ...expected,
        ...(actualValue === undefined ? {} : { actualValue }),
      });
    }
  }

  return { ok: missing.length === 0, missing };
}
