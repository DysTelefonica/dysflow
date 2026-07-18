/**
 * Issue #961 (B component) — codegraph-supplement-drift-detector
 *
 * Pure kernel that detects stale `codegraph-vba` runtime version references
 * inside `<!-- user-supplement:* --> ... <!-- /user-supplement:* -->` blocks
 * of user-global instruction files (e.g. `~/.config/opencode/AGENTS.md`).
 *
 * Why it exists
 * -------------
 * The `dysflow-codegraph-update` skill (originally in `DysTelefonica/workflow`,
 * archived 2026-07-18) keeps the `dysflow-arnes` harness and the
 * `<!-- user-supplement:dysflow:pointer -->` blocks in sync with the
 * `dysflow` and `codegraph-vba` runtime versions. Other `<!-- user-supplement:* -->`
 * blocks (notably the user-owned `codegraph-extra-tools` block) pin
 * themselves to a runtime version in prose and only drift when the user
 * hand-edits them. This module is the local safety net: it surfaces drift
 * inside `dysflow doctor` so the user knows to refresh a stale block before
 * it propagates downstream.
 *
 * Architecture
 * ------------
 * - PURE kernel: no `node:fs` / `node:fs/promises` imports. Caller-supplied
 *   `InstructionFileReadPort` provides file content; the kernel only does
 *   string matching.
 * - No default I/O: the doctor command (or any caller) wires the Node
 *   adapter at composition time. The CLI composition root lives at
 *   `src/cli/commands/codegraph-supplement-drift-check.ts`.
 * - Scope: ONLY `<!-- user-supplement:* --> ... <!-- /user-supplement:* -->`
 *   blocks. The managed `<!-- gentle-ai:* -->` blocks are deliberately
 *   excluded because gentle-ai sync regenerates them as a unit.
 */

// ---------------------------------------------------------------------------
// Constants — well-known user-global instruction files
// ---------------------------------------------------------------------------

/**
 * Relative paths (under the user's `$HOME`) of the well-known
 * user-global instruction files that the doctor pre-flight scans. The list
 * is rooted at `.config/opencode/` because the `dysflow-arnes` harness is
 * delivered through OpenCode's user-global AGENTS.md chain. Paths use POSIX
 * separators on disk (`path.join` normalizes on Windows).
 *
 * Resolved relative paths at runtime:
 * - `.config/opencode/AGENTS.md`
 * - `.config/opencode/CLAUDE.md`
 * - `.config/opencode/GEMINI.md`
 * - `.config/opencode/CODEX.md`
 * - `.config/opencode/.opencode/agent.md`
 * - `.config/opencode/.claude/CLAUDE.md`
 * - `.config/opencode/.gemini/GEMINI.md`
 * - `.config/opencode/.codex/AGENTS.md`
 * - `.config/opencode/.qwen/AGENTS.md`
 * - `.config/opencode/.aider/AGENTS.md`
 *
 * Exposed as a `readonly` tuple so callers cannot mutate the canonical
 * list; tests and the CLI adapter both depend on this shape.
 */
export const DEFAULT_INSTRUCTION_FILE_PATHS: readonly string[] = [
  ".config/opencode/AGENTS.md",
  ".config/opencode/CLAUDE.md",
  ".config/opencode/GEMINI.md",
  ".config/opencode/CODEX.md",
  ".config/opencode/.opencode/agent.md",
  ".config/opencode/.claude/CLAUDE.md",
  ".config/opencode/.gemini/GEMINI.md",
  ".config/opencode/.codex/AGENTS.md",
  ".config/opencode/.qwen/AGENTS.md",
  ".config/opencode/.aider/AGENTS.md",
] as const;

// ---------------------------------------------------------------------------
// Public types — scan result, finding, port
// ---------------------------------------------------------------------------

/**
 * One offending line. The kernel surfaces enough information for a
 * human or an AI agent to navigate to the file, jump to the right line,
 * see the bad snippet in context, and follow the remediation hint
 * without needing to re-read the file.
 */
export type SupplementDriftFinding = {
  filePath: string;
  blockId: string;
  /** 1-indexed line number inside `filePath`. */
  line: number;
  /** The full offending line (after trim, preserved for display). */
  snippet: string;
  /** The literal version string matched, e.g. `v1.10.0` or `v1.11`. */
  matchedVersion: string;
  /** Always populated: a copy/pasteable remediation hint. */
  remediation: string;
  /**
   * `true` when the enclosing `<!-- user-supplement:* -->` block had no
   * matching `<!-- /user-supplement:* -->` closing marker before EOF.
   * The drift itself is still flagged; the malformed closing marker is a
   * secondary diagnostic so the user fixes the root cause (a missing
   * closing tag) rather than just rewriting the bad prose.
   */
  malformedClosing?: boolean;
};

/**
 * Structured error envelope for files that the port could not read.
 * `code` is `FILE_READ_FAILED` so callers can render the error uniformly
 * with the rest of the doctor output.
 */
export type SupplementDriftError = {
  filePath: string;
  code: "FILE_READ_FAILED";
  message: string;
};

/**
 * Top-level scan result. Aggregates per-file drift + per-file errors so
 * callers can render the doctor output without re-parsing anything.
 */
export type SupplementDriftScanResult = {
  /** True when `driftDetected` is empty AND every readable file scanned clean. */
  ok: boolean;
  filesScanned: number;
  blocksScanned: number;
  driftDetected: readonly SupplementDriftFinding[];
  errors: readonly SupplementDriftError[];
};

/**
 * Caller-supplied async read port. The kernel never imports `node:fs`;
 * callers wire the real Node implementation in the CLI composition root.
 * `readFile` MUST throw on a missing / unreadable file — the kernel catches
 * and surfaces the error uniformly so a missing file does not abort the
 * whole scan.
 */
export type InstructionFileReadPort = {
  readFile: (filePath: string) => Promise<string>;
};

export type DetectSupplementDriftOptions = {
  /** Absolute or `home`-relative file paths to scan. */
  filePaths: readonly string[];
  port: InstructionFileReadPort;
};

// ---------------------------------------------------------------------------
// Pure kernel — regex + line iteration
// ---------------------------------------------------------------------------

/**
 * Strict regex that captures `codegraph-vba vX.Y.Z` or `codegroup-vba vX.Y`
 * anywhere in a line. The leading word-boundary + literal name ensures
 * `codegraph-usage v1.2` (skill version, never runtime) and
 * `codegraph-vba-foo v1.0` (hypothetical neighbouring tool) do not match.
 *
 * Capture groups:
 *   1 — the full version token including the leading `v` (e.g. `v1.10.0`).
 */
const STRICT_DRIFT_REGEX = /\bcodegraph-vba\s+(v\d+\.\d+(?:\.\d+)?)\b/g;

/**
 * Loose regex — catches prose like `v1.10.0 semantics` or `v1.11 runtime`
 * that the strict regex misses. We only fire when the bare version is
 * immediately followed by a small set of keywords that signal the author
 * is documenting codegraph semantics, runtime behaviour, or version
 * pinning. Lines like `v1.0 of jQuery` or `v2.0 (released 2024)` do NOT
 * match.
 *
 * Keyword allowlist:
 *   - semantics / semantic
 *   - runtime / run-time
 *   - spec / spec.
 *   - behaviour / behavior
 *   - contract
 *   - version / versions
 *
 * Capture groups:
 *   1 — the bare version token including the leading `v` (e.g. `v1.10.0`).
 */
const LOOSE_DRIFT_KEYWORDS =
  /(?:semantics|semantic|runtime|run-time|spec\.?|behaviour|behavior|contract|version|versions)/i;
const LOOSE_DRIFT_REGEX = /\b(v\d+\.\d+(?:\.\d+)?)\s+(?=\w)/g;

/**
 * Lines that delimit `<!-- user-supplement:* --> ... <!-- /user-supplement:* -->`.
 * Group 1 captures the block id (the text between the opening marker and
 * `-->`). Empty ids are tolerated — they become `"<empty>"` in the finding.
 */
const OPEN_MARKER = /^<!--\s*user-supplement:([^>]*?)\s*-->$/;
const CLOSE_MARKER = /^<!--\s*\/user-supplement:[^>]*?\s*-->$/;

/** Lines that delimit the gentle-ai managed blocks (excluded from drift scan). */
const GENTLE_OPEN = /^<!--\s*gentle-ai:[^>]*?\s*-->$/;
const GENTLE_CLOSE = /^<!--\s*\/gentle-ai:[^>]*?\s*-->$/;

const DEFAULT_REMEDIATION =
  "Replace the literal `codegraph-vba vX.Y[.Z]` reference with a `codegraph --version` " +
  "pointer so the block tracks the live runtime version. Skill versions (e.g. " +
  "`codegraph-usage v1.2`) are fine — only the runtime version drift is flagged here.";

/**
 * Pure content scanner. Walks every line of `content`, tracks which
 * `<!-- user-supplement:* -->` block (if any) is currently open, and emits
 * one `SupplementDriftFinding` per offending line. Lines inside gentle-ai
 * managed blocks are skipped even when nested inside a supplement block.
 *
 * The kernel deliberately ignores everything OUTSIDE supplement blocks —
 * prose that lives in the surrounding markdown is not in scope and is
 * maintained by either gentle-ai sync or the user.
 */
export function scanSupplementDriftInContent(
  content: string,
  filePath: string,
): SupplementDriftFinding[] {
  const findings: SupplementDriftFinding[] = [];
  const lines = content.split(/\r?\n/);

  let inGentleBlock = false;
  let inSupplementBlock = false;
  let currentBlockId = "<none>";

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const trimmedLine = rawLine.trim();

    if (inGentleBlock) {
      if (GENTLE_CLOSE.test(trimmedLine)) {
        inGentleBlock = false;
      }
      // Even when nested inside a supplement block, gentle-ai managed
      // content is out of scope.
      continue;
    }

    if (GENTLE_OPEN.test(trimmedLine)) {
      inGentleBlock = true;
      // An open marker for gentle-ai inside a supplement block also closes
      // the supplement block's relevance — its prose is no longer ours to
      // lint. We keep `inSupplementBlock = true` so the closing marker
      // accounting still works, but we skip drift detection until the
      // gentle-ai block closes.
      continue;
    }

    const openMatch = OPEN_MARKER.exec(trimmedLine);
    if (openMatch !== null) {
      inSupplementBlock = true;
      currentBlockId = openMatch[1]?.trim() || "<empty>";
      continue;
    }

    if (CLOSE_MARKER.test(trimmedLine)) {
      inSupplementBlock = false;
      currentBlockId = "<none>";
      continue;
    }

    if (!inSupplementBlock) {
      continue;
    }

    // Inside an open supplement block — look for `codegraph-vba vX.Y[.Z]`.
    STRICT_DRIFT_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null = STRICT_DRIFT_REGEX.exec(rawLine);
    while (match !== null) {
      const version = match[1];
      if (version !== undefined) {
        findings.push({
          filePath,
          blockId: currentBlockId,
          line: index + 1,
          snippet: rawLine.trim(),
          matchedVersion: version,
          remediation: DEFAULT_REMEDIATION,
        });
      }
      match = STRICT_DRIFT_REGEX.exec(rawLine);
    }

    // Loose scan: bare `vX.Y[.Z]` followed by a keyword that signals the
    // author is documenting codegraph semantics / runtime behaviour.
    // Suppressed when the strict scan already flagged the same line so the
    // consumer sees one finding per offending line, not two.
    if (!findings.some((f) => f.line === index + 1)) {
      LOOSE_DRIFT_REGEX.lastIndex = 0;
      let looseMatch: RegExpExecArray | null = LOOSE_DRIFT_REGEX.exec(rawLine);
      while (looseMatch !== null) {
        const version = looseMatch[1];
        if (version !== undefined) {
          const tail = rawLine.slice(looseMatch.index + version.length);
          if (LOOSE_DRIFT_KEYWORDS.test(tail)) {
            findings.push({
              filePath,
              blockId: currentBlockId,
              line: index + 1,
              snippet: rawLine.trim(),
              matchedVersion: version,
              remediation: DEFAULT_REMEDIATION,
            });
            break; // One loose finding per line is enough.
          }
        }
        looseMatch = LOOSE_DRIFT_REGEX.exec(rawLine);
      }
    }
  }

  if (inSupplementBlock) {
    // Marker for malformed closing — appended AFTER all findings so the
    // consumer still sees drift findings even when the closing tag is
    // missing. The malformed closing is a secondary signal.
    findings.push({
      filePath,
      blockId: currentBlockId,
      line: lines.length,
      snippet: "(EOF reached without `<!-- /user-supplement:* -->`)",
      matchedVersion: "<malformed-closing-marker>",
      remediation:
        "Add the missing `<!-- /user-supplement:... -->` closing marker; the drift findings above were emitted optimistically.",
      malformedClosing: true,
    });
  }

  return findings;
}

/**
 * Count supplement blocks in a file's content. The helper exists to keep
 * the `blocksScanned` counter honest — the doctor output renders it so
 * users can sanity-check the scan reached the expected number of blocks.
 */
export function countSupplementBlocks(content: string): number {
  let count = 0;
  for (const rawLine of content.split(/\r?\n/)) {
    if (OPEN_MARKER.test(rawLine.trim())) count += 1;
  }
  return count;
}

/**
 * Multi-file scan entry point. Iterates the supplied paths, reads each
 * through the injected port, runs the pure kernel on the content, and
 * aggregates per-file drift + per-file errors. A missing file does NOT
 * abort the whole scan — it surfaces in `errors[]` with code
 * `FILE_READ_FAILED` and the caller decides whether that warrants an
 * exit-code flip on top of `ok`.
 */
export async function detectSupplementDrift(
  options: DetectSupplementDriftOptions,
): Promise<SupplementDriftScanResult> {
  const { filePaths, port } = options;
  const driftDetected: SupplementDriftFinding[] = [];
  const errors: SupplementDriftError[] = [];
  let filesScanned = 0;
  let blocksScanned = 0;

  for (const filePath of filePaths) {
    let content: string;
    try {
      content = await port.readFile(filePath);
    } catch (error) {
      errors.push({
        filePath,
        code: "FILE_READ_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    filesScanned += 1;
    blocksScanned += countSupplementBlocks(content);
    driftDetected.push(...scanSupplementDriftInContent(content, filePath));
  }

  return {
    ok: driftDetected.length === 0,
    filesScanned,
    blocksScanned,
    driftDetected,
    errors,
  };
}
