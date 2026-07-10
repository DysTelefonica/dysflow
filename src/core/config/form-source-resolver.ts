/**
 * Pure form/report source-path resolver (issue #718, PR slice 1).
 *
 * Produces an ORDERED list of candidate on-disk paths for a form/report from
 * either a `projectId`-driven identity lookup (`formName` against a resolved
 * `sourceRoot`), a project-relative `sourcePath`, or a raw legacy
 * `sourceRoot` + relative-path join. Performs NO filesystem or network I/O —
 * config loading and the existence-check loop stay in the calling adapter
 * (`resolveExecutionTarget` / `loadDysflowConfigAsyncWith`), never here. See
 * `openspec/changes/projectid-form-source-resolution/design.md`.
 */

import { isAbsolutePath } from "../utils/index.js";

export type FormSourceInput = {
  /** Resolved `destinationRoot` (absolute) — where form/report sources live. */
  sourceRoot: string;
  /** Resolved project root (absolute), when known. Enables split-project detection. */
  projectRoot?: string;
  /** Identity-based lookup — resolves to `forms/Form_<name>.form.txt` (or `reports/Report_<name>.report.txt`). */
  formName?: string;
  /** Project-relative OR absolute raw path, as historically supplied by callers. */
  sourcePath?: string;
  /** Default `"form"`. */
  kind?: "form" | "report";
};

export type FormSourceCandidate = {
  absolutePath: string;
  /** Relative to `sourceRoot` — safe for path-free messaging. Absolute-strategy candidates keep the original string here (no root to relate to). */
  relativePath: string;
  strategy: "identity" | "idempotent-join" | "naive-join" | "absolute";
};

export type FormSourceDiagnostic = {
  projectId?: string;
  /** `sourceRoot` expressed relative to `projectRoot` (or `"."` when unknown/non-split). Never an absolute path. */
  sourceRootRelative: string;
  /** Ordered, relative-only representation of every candidate this resolution attempted. NO absolute paths. */
  attemptedRelative: string[];
  /** Actionable, path-free remediation message. */
  remediation: string;
};

// ---------------------------------------------------------------------------
// Internal path helpers — deliberately NOT `node:path`. All joining/splitting
// here is plain string manipulation over forward-slash-normalized segments,
// so behavior is identical regardless of host OS (Windows in production,
// Linux in CI) and regardless of the caller's separator style. This also
// keeps the module free of any `node:*` import, satisfying the core I/O
// port boundary guard (test/architecture/core-boundary.test.ts).
// ---------------------------------------------------------------------------

function toForwardSlashes(path: string): string {
  return path.replace(/\\/g, "/");
}

function stripTrailingSlash(path: string): string {
  return path.replace(/\/+$/, "");
}

/**
 * Collapses `./`, doubled separators (`src//forms`), and unifies `\` → `/`.
 * Also strips leading slashes so the result is a clean relative path.
 */
function normalizeRelativeSourcePath(sourcePath: string): string {
  let normalized = toForwardSlashes(sourcePath).replace(/\/{2,}/g, "/");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  return normalized.replace(/^\/+/, "");
}

function segmentsOf(normalizedPath: string): string[] {
  return normalizedPath.split("/").filter((segment) => segment.length > 0 && segment !== ".");
}

function joinRelative(root: string, relativePath: string): string {
  const base = stripTrailingSlash(toForwardSlashes(root));
  return relativePath.length > 0 ? `${base}/${relativePath}` : base;
}

function isSamePath(a: string, b: string): boolean {
  return (
    stripTrailingSlash(toForwardSlashes(a)).toLowerCase() ===
    stripTrailingSlash(toForwardSlashes(b)).toLowerCase()
  );
}

/**
 * Returns `path` relative to `root` (forward-slash, case-insensitive prefix
 * match), or `undefined` when `path` is not a strict child of `root`.
 */
function relativeToRoot(root: string, path: string): string | undefined {
  const normalizedRoot = stripTrailingSlash(toForwardSlashes(root));
  const normalizedRootLower = normalizedRoot.toLowerCase();
  const normalizedPath = stripTrailingSlash(toForwardSlashes(path));
  const normalizedPathLower = normalizedPath.toLowerCase();

  return normalizedPathLower.startsWith(`${normalizedRootLower}/`)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : undefined;
}

/**
 * Detects the redundant leading path segment introduced by a split-project
 * layout (`sourceRoot === "<projectRoot>/src"`). Returns the segment (e.g.
 * `"src"`) ONLY when the project is genuinely split (`sourceRoot !==
 * projectRoot`) AND `sourceRoot` is a real child of `projectRoot`.
 *
 * Returns `undefined` for a non-split project (`sourceRoot === projectRoot`)
 * or when `projectRoot` is unknown — callers in that case NEVER strip a
 * leading segment, even if it happens to match the project directory's own
 * basename (spec scenario: "basename collision in a non-split project is
 * not stripped").
 */
function detectSplitSegment(sourceRoot: string, projectRoot: string | undefined): string | undefined {
  if (projectRoot === undefined) return undefined;
  if (isSamePath(sourceRoot, projectRoot)) return undefined;

  const remainder = relativeToRoot(projectRoot, sourceRoot);
  if (remainder === undefined) return undefined;

  const firstSegment = remainder.split("/")[0];
  return firstSegment !== undefined && firstSegment.length > 0 ? firstSegment : undefined;
}

function buildIdentityRelativePath(formName: string, kind: "form" | "report"): string {
  return kind === "report"
    ? `reports/Report_${formName}.report.txt`
    : `forms/Form_${formName}.form.txt`;
}

/**
 * Pure candidate resolver. Given the same inputs, always returns the same
 * ordered candidate list — no filesystem or network access occurs.
 *
 * Resolution order:
 * 1. `formName` supplied → single `identity` candidate against `sourceRoot`.
 * 2. `sourcePath` absolute → single `absolute` candidate, passed through
 *    verbatim (documents the literal-passthrough contract Group A read-only
 *    tools rely on — those tools never even call this function when they
 *    have no `projectId`/`formName`, but the contract holds here too).
 * 3. `sourcePath` project-relative, split-project collision detected →
 *    `idempotent-join` (stripped, correct) first, `naive-join` (unstripped,
 *    legacy double-nested) retained as a trailing backward-compat candidate.
 * 4. `sourcePath` project-relative, no collision (non-split project, or the
 *    path doesn't start with the split segment) → single `identity` join,
 *    identical to the pre-existing raw-path join behavior.
 */
export function resolveFormSourceCandidates(input: FormSourceInput): FormSourceCandidate[] {
  const kind = input.kind ?? "form";

  if (input.formName !== undefined && input.formName.length > 0) {
    const relativePath = buildIdentityRelativePath(input.formName, kind);
    return [
      {
        absolutePath: joinRelative(input.sourceRoot, relativePath),
        relativePath,
        strategy: "identity",
      },
    ];
  }

  if (input.sourcePath === undefined) return [];

  if (isAbsolutePath(input.sourcePath)) {
    return [
      {
        absolutePath: input.sourcePath,
        relativePath: input.sourcePath,
        strategy: "absolute",
      },
    ];
  }

  const normalized = normalizeRelativeSourcePath(input.sourcePath);
  const splitSegment = detectSplitSegment(input.sourceRoot, input.projectRoot);
  const segments = segmentsOf(normalized);
  const collides =
    splitSegment !== undefined &&
    segments.length > 0 &&
    segments[0]?.toLowerCase() === splitSegment.toLowerCase();

  if (collides) {
    const stripped = segments.slice(1).join("/");
    return [
      {
        absolutePath: joinRelative(input.sourceRoot, stripped),
        relativePath: stripped,
        strategy: "idempotent-join",
      },
      {
        absolutePath: joinRelative(input.sourceRoot, normalized),
        relativePath: normalized,
        strategy: "naive-join",
      },
    ];
  }

  return [
    {
      absolutePath: joinRelative(input.sourceRoot, normalized),
      relativePath: normalized,
      strategy: "identity",
    },
  ];
}

function computeSourceRootRelative(input: FormSourceInput): string {
  if (input.projectRoot === undefined) return ".";
  if (isSamePath(input.sourceRoot, input.projectRoot)) return ".";

  return relativeToRoot(input.projectRoot, input.sourceRoot) ?? ".";
}

/**
 * Builds a typed, path-free resolution-failure diagnostic from the same
 * input and the candidate list the adapter's existence-check loop already
 * tried (and missed on every one). Contains NO raw absolute filesystem path
 * in any field — `sanitizeMcpErrorMessage` only scrubs absolute paths into
 * `[PATH]`, so a message built exclusively from relative fields never
 * triggers that scrub and stays fully actionable.
 */
export function buildResolutionDiagnostic(
  input: FormSourceInput,
  candidates: readonly FormSourceCandidate[],
  projectId?: string,
): FormSourceDiagnostic {
  const sourceRootRelative = computeSourceRootRelative(input);

  const attemptedRelative = candidates.map((candidate) =>
    candidate.strategy === "absolute" ? "(absolute path omitted)" : candidate.relativePath,
  );

  // Never surface a raw sourcePath in free text when it is absolute — an
  // absolute sourcePath is exactly the kind of raw filesystem path this
  // diagnostic channel must stay free of (design.md, "[PATH]-safe diagnostic
  // channel"). formName is always safe (an identity string, not a path).
  const target =
    input.formName ??
    (input.sourcePath !== undefined && !isAbsolutePath(input.sourcePath)
      ? input.sourcePath
      : undefined) ??
    "(unspecified form)";
  const remediation = [
    `No form/report source found for "${target}" under source root "${sourceRootRelative}".`,
    attemptedRelative.length > 0
      ? `Checked: ${attemptedRelative.join(", ")}.`
      : "No candidate paths were attempted.",
    projectId !== undefined
      ? `Verify projectId "${projectId}" resolves to the correct project and that the form/report name is spelled correctly.`
      : "Verify the form/report name and source root are correct.",
  ].join(" ");

  return {
    projectId,
    sourceRootRelative,
    attemptedRelative,
    remediation,
  };
}
