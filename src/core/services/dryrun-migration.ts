export type DryRunMigrationConfidence = "literal" | "context-dependent";

export type DryRunMigrationEdit = {
  line: number;
  legacyLine: string;
  newLine: string;
  confidence: number;
  confidenceReason: DryRunMigrationConfidence;
};

export type DryRunContentMigration = {
  content: string;
  edits: readonly DryRunMigrationEdit[];
};

export type DryRunUndoEntry = {
  before: string;
  after: string;
};

const DRY_RUN_PROPERTY =
  /\bdryRun(?<quoteSuffix>"{0,2}|'?)\s*:\s*(?<value>true|false|[A-Za-z_][\w.]*)/gi;

function invertValue(value: string): {
  replacement: string;
  confidence: number;
  confidenceReason: DryRunMigrationConfidence;
} {
  if (value.toLowerCase() === "true") {
    return { replacement: "false", confidence: 1, confidenceReason: "literal" };
  }
  if (value.toLowerCase() === "false") {
    return { replacement: "true", confidence: 1, confidenceReason: "literal" };
  }
  return {
    replacement: `Not (${value})`,
    confidence: 0.5,
    confidenceReason: "context-dependent",
  };
}

/**
 * Pure migration kernel for legacy Dysflow consumer payloads.
 *
 * The supported consumer artifacts are VBA-oriented, so a non-literal value is
 * inverted with VBA's `Not` operator and explicitly reported at lower
 * confidence. Literal booleans are deterministic and receive confidence 1.
 */
export function migrateDryRunContent(source: string): DryRunContentMigration {
  const lines = source.split(/\r?\n/);
  const lineEndings = source.match(/\r\n/) ? "\r\n" : "\n";
  const edits: DryRunMigrationEdit[] = [];

  const migratedLines = lines.map((legacyLine, index) => {
    let lineChanged = false;
    let lineConfidence = 1;
    let confidenceReason: DryRunMigrationConfidence = "literal";
    const newLine = legacyLine.replace(DRY_RUN_PROPERTY, (...args: unknown[]) => {
      const groups = args.at(-1) as { quoteSuffix?: string; value?: string } | undefined;
      const value = groups?.value;
      if (value === undefined) return String(args[0]);
      const inverted = invertValue(value);
      lineChanged = true;
      if (inverted.confidence < lineConfidence) {
        lineConfidence = inverted.confidence;
        confidenceReason = inverted.confidenceReason;
      }
      return `apply${groups?.quoteSuffix ?? ""}: ${inverted.replacement}`;
    });

    if (lineChanged) {
      edits.push({
        line: index + 1,
        legacyLine,
        newLine,
        confidence: lineConfidence,
        confidenceReason,
      });
    }
    return newLine;
  });

  return { content: migratedLines.join(lineEndings), edits };
}

export function restoreDryRunContent(current: string, entry: DryRunUndoEntry): string {
  if (current !== entry.after) {
    throw new Error("Cannot undo: the consumer file changed since migration.");
  }
  return entry.before;
}
