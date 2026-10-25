import { classifyVbaPair } from "./vba-semantic-classifier.js";

// Issue #1865 — a form's code lives in forms/<Name>.cls and is also copied into
// the CodeBehindForm section of forms/Form_<Name>.form.txt. Importing the .cls
// silently overwrites any edit made only in the copy. This guard reuses the
// verify_code classifier, so case, whitespace and encoding noise never count.

const CODE_BEHIND_MARKER = "CodeBehindForm";
const SHOWN_DIFFERENCES = 5;

export type CodeBehindComparison =
  | { diverges: false }
  | {
      diverges: true;
      /** The verify_code category that made the copies diverge. */
      classification: string;
      /** First lines of the form copy that the .cls does not carry, trimmed. */
      firstDifferences: string[];
    };

/** The code after the CodeBehindForm marker, or undefined when absent. */
function codeBehindOf(formText: string): string | undefined {
  const lines = formText.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim() === CODE_BEHIND_MARKER);
  if (index === -1) return undefined;
  return lines.slice(index + 1).join("\n");
}

/** Module header attributes are not code (#1895). */
const ATTRIBUTE_LINE = /^\s*Attribute\s+VB_/i;

function withoutAttributeLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !ATTRIBUTE_LINE.test(line))
    .join("\n");
}

function linesNotIn(text: string, other: string): string[] {
  const otherLines = new Set(
    other
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !otherLines.has(line))
    .slice(0, SHOWN_DIFFERENCES);
}

/** Compare an already extracted CodeBehindForm text with the sibling .cls. */
export function compareCodeBehindText(codeBehind: string, clsText: string): CodeBehindComparison {
  const code = withoutAttributeLines(codeBehind);
  const cls = withoutAttributeLines(clsText);
  const verdict = classifyVbaPair({
    sourceText: cls,
    binaryText: code,
    fileType: "cls",
    mode: "semantic",
  });
  if (!verdict.actionable) return { diverges: false };

  return {
    diverges: true,
    classification: verdict.classification,
    firstDifferences: linesNotIn(code, cls),
  };
}

export function compareFormCodeBehind(input: {
  formText: string;
  clsText: string;
}): CodeBehindComparison {
  const codeBehind = codeBehindOf(input.formText);
  if (codeBehind === undefined) return { diverges: false };
  return compareCodeBehindText(codeBehind, input.clsText);
}
