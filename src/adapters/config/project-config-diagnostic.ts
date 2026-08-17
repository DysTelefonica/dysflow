import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  discoverWorktreeProjectConfigs,
  type WorktreeDiscoveryDiagnostic,
} from "../../core/config/dysflow-config.js";
import type { DiagnosticRemediation } from "../../core/contracts/remediation.js";
import {
  remediationForCapabilitiesDisallowWrite,
  remediationForConfigMigration,
  remediationForDestinationRootNotFound,
  remediationForProjectIdMismatch,
  remediationForWriteLockedByRunningOp,
  remediationText,
} from "../../core/contracts/remediation.js";
import { DEFAULT_STALE_MARKER_THRESHOLD_MS } from "../../core/operations/stale-marker-cleanup.js";
import { resolveActiveWorktreeRoot } from "../runtime/worktree-resolver.js";
import { nodeConfigFileSystem } from "./dysflow-config-node.js";
import { buildMissingProjectConfigRemediation } from "./missing-project-guidance.js";

export type ProjectConfigStatus =
  | "valid"
  | "missing"
  | "invalid-schema"
  | "id-mismatch"
  | "path-mismatch"
  | "outside-project-root"
  | "destination-root-not-found"
  | "write-locked-by-running-op"
  | "capabilities-disallow-write"
  | "target-not-found"
  | "ambiguous";

export type DiscoveredProjectDiagnostic = {
  id: string | null;
  projectRoot: string;
  accessPath: string | null;
  destinationRoot: string;
  configPath: string;
  active: boolean;
};

export type ProjectConfigDiagnostic = {
  status: ProjectConfigStatus;
  cwd: string;
  configPath: string;
  projectRoot: string;
  projectId: string | null;
  accessPath: string | null;
  backendPath: string | null;
  destinationRoot: string | null;
  writeReady: boolean;
  discoveredProjects?: readonly DiscoveredProjectDiagnostic[];
  owningWorktree?: "cwd" | string;
  diagnostics: readonly {
    code: string;
    severity: "error" | "warning";
    message: string;
    path?: string;
    phase?: WorktreeDiscoveryDiagnostic["phase"];
    remediation?: DiagnosticRemediation;
  }[];
  remediation: string | null;
};

/**
 * A single entry of {@link ProjectConfigDiagnostic.diagnostics}. Extracted so
 * the recovery paths that accumulate warnings (issue #1179, extended by
 * #1394) can be typed without restating the shape.
 */
type ProjectConfigDiagnosticEntry = ProjectConfigDiagnostic["diagnostics"][number];

export type ProjectConfigRequest = {
  operation?: string;
  projectId?: string;
  accessPath?: string;
  accessDbPath?: string;
  databasePath?: string;
  sourcePath?: string;
  backendPath?: string;
  destinationRoot?: string;
  projectRoot?: string;
  contextId?: string;
  /**
   * Issue #968 — opt-in flag that lets read-only-side tools target an
   * `.accdb` outside the active worktree. Honored ONLY when the operation
   * does not mutate the binary (`mutatesBinary === false`); writes to a
   * foreign `.accdb` stay gated because that is precisely the risk
   * `OUTSIDE_PROJECT_ROOT` exists to prevent.
   *
   * Defaults to `false` (omit the field) so backward compat is preserved:
   * external accessPath targets fall through to the current
   * `OUTSIDE_PROJECT_ROOT` verdict.
   */
  allowExternalAccessPath?: boolean;
  /**
   * Issue #968 — forwarded by the MCP dispatcher from
   * `MCP_TOOL_ROUTES[name].mutatesBinary`. When true, `allowExternalAccessPath`
   * is ignored regardless of the caller's intent; when false (and the flag
   * is true), the `OUTSIDE_PROJECT_ROOT` verdict on the accessPath override
   * is bypassed so consumers can read release binaries without copying them
   * into the worktree.
   *
   * Forwarded explicitly instead of imported from
   * `adapters/mcp/dispatch-routes` to keep the diagnostic module
   * independent of MCP-layer routing semantics.
   */
  mutatesBinary?: boolean;
};

const normalize = (value: string): string => resolve(value).replaceAll("\\", "/");
const identity = (value: string): string =>
  process.platform === "win32" ? normalize(value).toLowerCase() : normalize(value);
const canonical = (value: string): string => normalize(realpathSync(value));
const within = (child: string, root: string): boolean => {
  const rel = relative(root, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

function worktreeRoot(cwd: string): string | null {
  let cursor = resolve(cwd);
  while (true) {
    if (existsSync(join(cursor, ".git"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

export function diagnoseProjectConfig(
  cwdInput: string,
  request: ProjectConfigRequest = {},
  candidateConfig?: Record<string, unknown>,
): ProjectConfigDiagnostic {
  // Issue #1179 — auto-detect the active worktree from the process cwd.
  // The MCP process is spawned from a fixed cwd; the consumer's OpenCode
  // session may operate from a subdirectory of a sibling worktree. The
  // resolver walks up to the git worktree toplevel (default port runs
  // `git rev-parse --show-toplevel` with a filesystem-walk fallback) so
  // the implicit target is the worktree, not the spawn cwd.
  const detectedWorktreeRoot = resolveActiveWorktreeRoot(cwdInput);
  // Issue #1179 — typed warnings accumulate here. They are appended to the
  // diagnostic array on every exit path (success, failure, mismatch) so the
  // consumer can flag the gap without parsing the legacy error code.
  const warnings: ProjectConfigDiagnosticEntry[] = [];
  const discoveryDiagnostics: WorktreeDiscoveryDiagnostic[] = [];
  const discoverProjects = (cwd: string): DiscoveredProjectDiagnostic[] =>
    discoverWorktreeProjectConfigs(
      cwd,
      nodeConfigFileSystem,
      undefined,
      undefined,
      discoveryDiagnostics,
    );
  if (detectedWorktreeRoot === null) {
    warnings.push({
      code: "CWD_NOT_IN_WORKTREE",
      severity: "warning",
      message:
        "The process cwd is not inside a git worktree; projectConfig.cwd uses the process cwd as a fallback.",
    });
  }
  // Effective cwd for the resolver: the worktree toplevel whenever the
  // process cwd is inside a worktree, otherwise the process cwd verbatim.
  // The override is the #1179 contract — the implicit/default context is the
  // worktree, not the spawn cwd.
  const effectiveCwdInput = detectedWorktreeRoot ?? cwdInput;

  let targetCwdInput = effectiveCwdInput;
  const requestedId = request.projectId;
  const explicitTargetSupplied =
    requestedId !== undefined ||
    request.accessPath !== undefined ||
    request.accessDbPath !== undefined ||
    request.databasePath !== undefined ||
    request.sourcePath !== undefined ||
    request.backendPath !== undefined;
  const requestedAccessPath =
    request.accessPath ?? request.accessDbPath ?? request.databasePath ?? request.sourcePath;

  let discoveredProjects: DiscoveredProjectDiagnostic[] | undefined;
  const cwdNative = worktreeRoot(effectiveCwdInput);
  let matchedInCwd = false;
  if (cwdNative !== null) {
    const configCandidate = join(cwdNative, ".dysflow", "project.json");
    if (existsSync(configCandidate)) {
      try {
        const raw = JSON.parse(readFileSync(configCandidate, "utf8")) as Record<string, unknown>;
        const configuredId = typeof raw.id === "string" && raw.id ? raw.id : null;
        const normAccess = requestedAccessPath
          ? normalize(resolve(effectiveCwdInput, requestedAccessPath))
          : undefined;

        const idOk =
          requestedId === undefined || (configuredId !== null && configuredId === requestedId);
        const pathOk = normAccess === undefined || within(normAccess, cwdNative);

        if (idOk && pathOk) {
          matchedInCwd = true;
          const configuredFrontend =
            typeof raw.frontendFile === "string" && raw.frontendFile
              ? raw.frontendFile
              : typeof raw.accessPath === "string" && raw.accessPath
                ? raw.accessPath
                : null;
          const accessPath =
            configuredFrontend !== null &&
            !isAbsolute(configuredFrontend) &&
            configuredFrontend === basename(configuredFrontend)
              ? normalize(resolve(cwdNative, configuredFrontend))
              : null;
          const destinationRoot =
            typeof raw.destinationRoot === "string" && raw.destinationRoot
              ? normalize(resolve(cwdNative, raw.destinationRoot))
              : normalize(join(cwdNative, "src"));
          discoveredProjects = [
            {
              id: configuredId,
              projectRoot: normalize(cwdNative),
              accessPath,
              destinationRoot,
              configPath: normalize(configCandidate),
              active: true,
            },
          ];
        }
      } catch (err) {
        // Issue #1394 — an unreadable or malformed cwd candidate used to be
        // discarded here, so the verdict read as "no project matched in cwd"
        // when the real cause was a broken config. Non-fatal by design: the
        // resolver still falls through to worktree discovery.
        warnings.push({
          code: "PROJECT_CONFIG_CANDIDATE_UNREADABLE",
          severity: "warning",
          message: `Failed to read the worktree project config candidate: ${formatError(err)}`,
          path: normalize(configCandidate),
        });
      }
    }
  }

  if (!matchedInCwd) {
    discoveredProjects = discoverProjects(effectiveCwdInput);
    if (requestedId !== undefined && requestedId !== null) {
      const match = discoveredProjects.find((p) => p.id === requestedId);
      if (match) {
        targetCwdInput = match.projectRoot;
      }
    } else if (requestedAccessPath !== undefined && requestedAccessPath !== null) {
      const normAccess = normalize(resolve(effectiveCwdInput, requestedAccessPath));
      const match = discoveredProjects.find(
        (p) =>
          (p.accessPath !== null && identity(p.accessPath) === identity(normAccess)) ||
          within(normAccess, p.projectRoot),
      );
      if (match) {
        targetCwdInput = match.projectRoot;
      }
    }
  }

  discoveredProjects ??= discoverProjects(targetCwdInput);
  const seenDiscoveryDiagnostics = new Set<string>();
  for (const diagnostic of discoveryDiagnostics) {
    const key = `${diagnostic.phase}\0${diagnostic.path}\0${diagnostic.code}\0${diagnostic.message}`;
    if (seenDiscoveryDiagnostics.has(key)) continue;
    seenDiscoveryDiagnostics.add(key);
    warnings.push({
      code: diagnostic.code,
      severity: "warning",
      message: diagnostic.message,
      path: normalize(diagnostic.path),
      phase: diagnostic.phase,
    });
  }

  const cwd = normalize(targetCwdInput);
  const projectRootNative = worktreeRoot(targetCwdInput);
  if (projectRootNative === null) {
    return {
      status: "outside-project-root",
      cwd,
      configPath: normalize(join(targetCwdInput, ".dysflow", "project.json")),
      projectRoot: cwd,
      projectId: null,
      accessPath: null,
      backendPath: null,
      destinationRoot: null,
      writeReady: false,
      discoveredProjects,
      diagnostics: [
        {
          code: "OUTSIDE_PROJECT_ROOT",
          severity: "error",
          message: "The requested cwd is not inside a Git worktree.",
        },
        ...warnings,
      ],
      remediation: `Run Dysflow from the intended Git worktree or pass its path with \`--cwd\`.`,
    };
  }
  const projectRoot = normalize(projectRootNative);
  const canonicalProjectRoot = canonical(projectRootNative);
  const configCandidate = join(projectRootNative, ".dysflow", "project.json");
  const legacy = join(projectRootNative, "dysflow.project.json");
  const present = [
    ...(candidateConfig === undefined ? [configCandidate].filter(existsSync) : [configCandidate]),
    ...[legacy].filter(existsSync),
  ];
  const base = {
    cwd,
    configPath: normalize(configCandidate),
    projectRoot,
    projectId: null,
    accessPath: null,
    backendPath: null,
    destinationRoot: null,
    discoveredProjects: discoveredProjects?.filter(
      (project) => identity(project.projectRoot) === identity(projectRoot),
    ),
  };
  const fail = (
    status: ProjectConfigStatus,
    message: string,
    remediation: DiagnosticRemediation,
  ): ProjectConfigDiagnostic => {
    const descText = remediationText(remediation);
    return {
      ...base,
      status,
      writeReady: false,
      diagnostics: [
        {
          code: status.toUpperCase().replaceAll("-", "_"),
          severity: "error",
          message,
          remediation,
        },
        ...warnings,
      ],
      remediation: descText,
    };
  };
  if (present.length === 0)
    return fail(
      "missing",
      "No per-worktree .dysflow/project.json was found.",
      buildMissingProjectConfigRemediation(cwd),
    );
  if (present.length > 1)
    return fail(
      "ambiguous",
      "Both project.json and legacy dysflow.project.json exist in this worktree.",
      `Remove the legacy ${normalize(legacy)} after migrating its settings to ${normalize(configCandidate)}.`,
    );
  const selectedConfig = present[0];
  if (selectedConfig === undefined)
    return fail(
      "missing",
      "No project config selected.",
      `Run \`dysflow setup --cwd ${cwd} --apply --project-id <id> --access-path <path>\`.`,
    );
  try {
    if (!within(canonical(dirname(selectedConfig)), canonicalProjectRoot)) throw new Error();
  } catch {
    return fail(
      "outside-project-root",
      "The project config path is redirected outside the owning worktree.",
      `Replace ${normalize(dirname(selectedConfig))} with a directory owned by ${projectRoot}.`,
    );
  }
  let parsed: Record<string, unknown>;
  try {
    const value: unknown = candidateConfig ?? JSON.parse(readFileSync(selectedConfig, "utf8"));
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
    parsed = value as Record<string, unknown>;
  } catch {
    return fail(
      "ambiguous",
      "The project config is not valid JSON.",
      `Run \`dysflow doctor --cwd ${cwd}\` and repair ${normalize(selectedConfig)}.`,
    );
  }
  const pathValue = (key: string): string | null =>
    typeof parsed[key] === "string" && parsed[key]
      ? normalize(resolve(projectRootNative, parsed[key] as string))
      : null;
  const projectId =
    typeof parsed.id === "string" && parsed.id
      ? parsed.id
      : typeof parsed.projectId === "string" && parsed.projectId
        ? parsed.projectId
        : null;
  if (projectId !== null && parsed.id === undefined && parsed.projectId !== undefined) {
    warnings.push({
      code: "MIGRATE_LEGACY_PROJECT_ID",
      severity: "warning",
      message:
        `Project config uses legacy \`projectId\` key. Rename to canonical \`id\` to silence this warning. ` +
        `Run \`dysflow migrate-project-config --cwd ${cwd}\` to apply the rename automatically.`,
    });
  }
  const configuredFrontend =
    typeof parsed.frontendFile === "string" && parsed.frontendFile
      ? parsed.frontendFile
      : typeof parsed.accessPath === "string" && parsed.accessPath
        ? parsed.accessPath
        : null;
  if (
    configuredFrontend !== null &&
    (isAbsolute(configuredFrontend) || basename(configuredFrontend) !== configuredFrontend)
  )
    return failWith(
      base,
      "path-mismatch",
      `Legacy accessPath '${configuredFrontend}' is not a basename.`,
      remediationForConfigMigration({
        field: "accessPath",
        replaceWith: "frontendFile",
        suggestedValue: basename(configuredFrontend),
        rationale:
          "absolute and separator-containing frontend paths cannot authorize cross-worktree access",
      }),
      explicitTargetSupplied ? "INHERITED_WORKTREE_MISMATCH" : "FRONTEND_PATH_NOT_BASENAME",
    );
  const localCandidates = readdirSync(projectRootNative)
    .filter((entry) => entry.toLowerCase().endsWith(".accdb"))
    .sort();
  if (configuredFrontend === null && localCandidates.length === 0)
    return failWith(
      base,
      "invalid-schema",
      `The project config exists but does not declare frontendFile and no local .accdb can be selected.`,
      "Configure frontendFile with the local .accdb filename.",
      "PROJECT_CONFIG_INVALID_SCHEMA",
    );
  if (configuredFrontend === null && localCandidates.length > 1)
    return failWith(
      base,
      "ambiguous",
      `Multiple eligible frontends exist: ${localCandidates.join(", ")}.`,
      "Configure frontendFile explicitly.",
      "FRONTEND_TARGET_AMBIGUOUS",
    );
  const accessPath = normalize(
    resolve(projectRootNative, configuredFrontend ?? (localCandidates[0] as string)),
  );
  const backendPath = pathValue("backendPath");
  const destinationRoot = pathValue("destinationRoot") ?? normalize(join(projectRootNative, "src"));
  // Issue #1438 — honor the caller-supplied `request.destinationRoot`
  // override. The configured value is what `base.destinationRoot` reports
  // (callers that audit the project config still see the configured value),
  // but every gate from here on MUST use `effectiveDestinationRoot` so a
  // post-`git rm -r src/ && mkdir -p src/{...}` export pass succeeds when
  // the consumer supplied an explicit override that exists. The override
  // is resolved relative to the worktree root (matching how the round-14
  // (#1228) post-resolve containment check treats it) and forward/backslash
  // paths are both normalized.
  const requestDestinationRootRaw =
    typeof request.destinationRoot === "string" && request.destinationRoot.length > 0
      ? request.destinationRoot
      : undefined;
  const effectiveDestinationRoot =
    requestDestinationRootRaw !== undefined
      ? normalize(
          isAbsolute(requestDestinationRootRaw)
            ? requestDestinationRootRaw
            : resolve(projectRootNative, requestDestinationRootRaw),
        )
      : destinationRoot;
  Object.assign(base, {
    configPath: normalize(selectedConfig),
    projectId,
    accessPath,
    backendPath,
    destinationRoot,
  });
  // v2.12.0 (#873) — sibling-worktree recognition. Three-way AND criterion:
  //   1. the accessPath itself is NOT a reparse point (lexical === canonical);
  //   2. canonical-access walks up to a directory that owns a `.git` (real Git worktree);
  //   3. that directory is at the SAME parent as `canonicalProjectRoot` and has
  //      a different identity than `canonicalProjectRoot` itself.
  // All three must hold for `siblingRoot` to be non-null. The lexical-vs-canonical
  // comparison stays fail-closed against Windows junctions / symlinks.
  const repoSiblingRoot = (): string | null => {
    if (
      accessPath === null ||
      parsed.accessPath === undefined ||
      typeof parsed.accessPath !== "string" ||
      within(accessPath, projectRootNative)
    )
      return null;
    let canonicalAccess: string;
    try {
      canonicalAccess = canonical(accessPath);
    } catch {
      return null;
    }
    const lexical = normalize(resolve(projectRootNative, parsed.accessPath));
    if (identity(lexical) !== identity(canonicalAccess)) return null;
    const sibling = worktreeRoot(dirname(canonicalAccess));
    if (sibling === null) return null;
    if (!existsSync(join(sibling, ".git"))) return null;
    const normalizedSibling = normalize(sibling);
    if (dirname(canonicalProjectRoot) !== dirname(normalizedSibling)) return null;
    if (identity(normalizedSibling) === identity(canonicalProjectRoot)) return null;
    return normalizedSibling;
  };
  const siblingRoot = repoSiblingRoot();
  const effectiveOwning = siblingRoot !== null ? canonical(siblingRoot) : canonicalProjectRoot;
  if (requestedId !== undefined && requestedId !== projectId) {
    // Issue #1179 — typed warning when the auto-detected worktree would
    // route to a different configured project than the request. The error
    // path is preserved so the dispatch gate still fails closed; the
    // warning is additive so the consumer can flag the gap explicitly.
    warnings.push({
      code: "TARGET_MISMATCH_WARNING",
      severity: "warning",
      message: `Requested projectId '${requestedId}' does not match the auto-detected worktree's projectId '${projectId ?? "(missing)"}'.`,
    });
    return failWith(
      base,
      "id-mismatch",
      `Requested project identity '${requestedId}' does not match '${projectId ?? "(missing)"}'.`,
      remediationForProjectIdMismatch(projectId),
      "PROJECT_ID_MISMATCH",
      warnings,
    );
  }
  const capabilities = parsed.capabilities;
  if (
    capabilities !== null &&
    typeof capabilities === "object" &&
    !Array.isArray(capabilities) &&
    (capabilities as Record<string, unknown>).allowWrites === false
  )
    return failWith(
      base,
      "capabilities-disallow-write",
      `Project '${projectId ?? "(missing)"}' has capabilities.allowWrites = false.`,
      remediationForCapabilitiesDisallowWrite(base.configPath),
    );
  if (
    accessPath === null ||
    (siblingRoot === null &&
      (!within(accessPath, projectRootNative) || !within(destinationRoot, projectRootNative)))
  )
    return failWith(
      base,
      "path-mismatch",
      "Configured accessPath or destinationRoot is outside the owning worktree.",
      `Move the target under ${projectRoot} or update ${base.configPath}.`,
    );
  // Issue #1438 + Round-14 (#1228) — when a caller supplies a
  // `request.destinationRoot` override, validate it BEFORE the existence
  // gate at line 554. The override must (a) resolve inside this worktree
  // OR (b) equal the configured value, otherwise it escapes the project
  // root and the `path-mismatch` verdict alone would be misleading. This
  // validation also runs BEFORE the existsSync check so that an override
  // pointing outside the worktree (which cannot exist on disk) fails with
  // `outside-project-root`, not the generic `destination-root-not-found`.
  if (request.destinationRoot !== undefined) {
    const requestedDestinationRoot = identity(resolve(projectRootNative, request.destinationRoot));
    const isLegacyAbsoluteAccessPath =
      parsed.accessPath !== undefined &&
      typeof parsed.accessPath === "string" &&
      (isAbsolute(parsed.accessPath) || basename(parsed.accessPath) !== parsed.accessPath);
    const withinProjectRoot = (() => {
      try {
        return within(resolve(projectRootNative, request.destinationRoot ?? ""), projectRootNative);
      } catch {
        return false;
      }
    })();
    const isEqualToConfigured = requestedDestinationRoot === identity(destinationRoot);
    const accepted = isEqualToConfigured || (withinProjectRoot && !isLegacyAbsoluteAccessPath);
    if (!accepted)
      return failWith(
        base,
        "outside-project-root",
        "Requested destinationRoot is not owned by this worktree config.",
        `Use destinationRoot '${destinationRoot}' or a subdirectory of '${projectRoot}'.`,
      );
  }
  if (!existsSync(effectiveDestinationRoot))
    return failWith(
      base,
      "destination-root-not-found",
      `destinationRoot directory does not exist: ${effectiveDestinationRoot}.`,
      remediationForDestinationRootNotFound(effectiveDestinationRoot),
    );
  try {
    const canonicalDestinationRoot = canonical(effectiveDestinationRoot);
    const destinationWorktree = identity(worktreeRoot(canonicalDestinationRoot) ?? "");
    const destinationOwningRoot =
      destinationWorktree === identity(effectiveOwning)
        ? effectiveOwning
        : destinationWorktree === identity(canonicalProjectRoot)
          ? canonicalProjectRoot
          : null;
    if (destinationOwningRoot === null || !within(canonicalDestinationRoot, destinationOwningRoot))
      throw new Error();
  } catch {
    return failWith(
      base,
      "outside-project-root",
      `destinationRoot '${effectiveDestinationRoot}' cannot be canonically owned by this worktree.`,
      `Create or move destinationRoot under ${projectRoot}.`,
    );
  }
  if (request.projectRoot !== undefined) {
    try {
      if (
        identity(canonical(resolve(projectRootNative, request.projectRoot))) ===
        identity(canonicalProjectRoot)
      ) {
        // Continue with the canonical owning worktree.
      } else throw new Error();
    } catch {
      return failWith(
        base,
        "outside-project-root",
        "Requested projectRoot is not the active worktree.",
        `Use projectRoot '${projectRoot}'.`,
      );
    }
  }
  const sourcePathTargetsDatabase =
    request.operation === undefined ||
    (!request.operation.startsWith("form_") &&
      request.operation !== "apply_form_design_plan" &&
      request.operation !== "create_form_from_template");
  // Issue #1044 — alias set membership.
  //
  // The frontend Access database has FOUR aliases (`accessPath`,
  // `accessDbPath`, `databasePath`, `sourcePath`). They all MUST resolve to
  // the same file; if not, the caller is asking the dispatcher to act on
  // two different targets at once and we fail closed with
  // `CONFLICTING_TARGET_ALIASES`.
  //
  // `backendPath` is intentionally NOT in this set. The frontend and the
  // data backend are legitimately DIFFERENT files (the whole point of the
  // split-DB topology); a `run_vba` call can pass both, e.g. to verify
  // context against both. Lumping `backendPath` into the alias set was the
  // #1044 surface defect — `accessPath = Expedientes.accdb` together with
  // `backendPath = Expedientes_datos.accdb` was rejected as a "conflicting
  // alias" even though the two paths are independently valid.
  //
  // `backendPath` is NOT dropped from validation — it is added to the
  // "requested target" list below so the outside-worktree / canonical
  // ownership checks still cover it when it is the ONLY alias supplied
  // (and when it is supplied alongside a frontend alias, the existing
  // `namesConfiguredBackend` exception in the target validation block
  // keeps the request consistent with the configured backend file).
  const frontendAliases = [
    request.accessPath,
    request.accessDbPath,
    request.databasePath,
    ...(sourcePathTargetsDatabase ? [request.sourcePath] : []),
  ].filter((value): value is string => value !== undefined);
  const targets = new Set(
    frontendAliases.map((value) => identity(resolve(projectRootNative, value))),
  );
  if (targets.size > 1)
    return failWith(
      base,
      "ambiguous",
      "Conflicting Access target aliases were supplied.",
      "Pass exactly one of accessPath, accessDbPath, databasePath, or sourcePath.",
      "CONFLICTING_TARGET_ALIASES",
    );
  // `requestedTarget` is the alias that drives the per-call target
  // validation block (existsSync + canonical ownership). Frontend aliases
  // take priority; `backendPath` fills in only when no frontend alias was
  // supplied so a request that names ONLY the backend still gets the same
  // outside-worktree / target-not-found treatment as before.
  const requestedTarget =
    frontendAliases[0] ?? (request.backendPath !== undefined ? request.backendPath : undefined);
  // Issue #968 — `allowExternalAccessPath` opt-in flag. When the caller
  // supplies `allowExternalAccessPath: true` AND the operation is
  // explicitly declared non-binary-mutating (the dispatcher forwards
  // `MCP_TOOL_ROUTES[name].mutatesBinary === false`), the `OUTSIDE_PROJECT_ROOT`
  // verdict on the accessPath override is skipped — the binary is being READ,
  // not written, so the safety guarantee the gate normally enforces (don't
  // mutate a foreign .accdb) is moot. Binary-mutating tools (`mutatesBinary
  // === true`) and tools that omit the field (treated as unknown-default)
  // both ignore the flag — fail-closed by construction.
  const externalAccessPathAllowedByFlag =
    request.allowExternalAccessPath === true && request.mutatesBinary === false;
  if (!existsSync(accessPath))
    return failWith(
      base,
      "target-not-found",
      `Configured accessPath does not exist: ${accessPath}.`,
      `Create or correct the Access target in ${base.configPath}.`,
    );
  let canonicalAccess: string;
  try {
    canonicalAccess = canonical(accessPath);
    if (identity(worktreeRoot(dirname(canonicalAccess)) ?? "") !== identity(effectiveOwning))
      throw new Error("different worktree");
  } catch {
    return failWith(
      base,
      "outside-project-root",
      "Configured Access target cannot be canonically owned by this worktree.",
      `Move the target under ${projectRoot}.`,
    );
  }
  let canonicalBackend: string | null = null;
  if (backendPath !== null) {
    try {
      canonicalBackend = canonical(backendPath);
    } catch {
      return failWith(
        base,
        "target-not-found",
        `Configured backendPath does not exist: ${backendPath}.`,
        `Create or correct the backend target in ${base.configPath}.`,
      );
    }
  }
  // Issue #1044 — request-time `backendPath` override must match the
  // configured `backendPath`. `backendPath` is intentionally NOT in the
  // frontend alias set (a `run_vba` call legitimately names both the
  // frontend and the data backend), but the request alias still has to
  // resolve to the configured value: an unconfigured external backend
  // would silently bypass the gate, which is exactly what the
  // `allowExternalAccessPath` opt-in exists to prevent.
  if (request.backendPath !== undefined) {
    const requestedBackend = identity(resolve(projectRootNative, request.backendPath));
    const configuredBackend = backendPath === null ? null : identity(backendPath);
    if (configuredBackend !== null && requestedBackend !== configuredBackend) {
      return failWith(
        base,
        "outside-project-root",
        `Requested backendPath '${requestedBackend}' does not match configured backendPath '${configuredBackend}'.`,
        `The backendPath override must resolve to the project's configured backendPath. Run \`dysflow doctor --cwd ${projectRoot}\` and retry with the configured path.`,
      );
    }
  }
  if (requestedTarget !== undefined) {
    const target = normalize(resolve(projectRootNative, requestedTarget));
    // When a sibling is recognized as the binary's owning tree, "outside"
    // is judged against the sibling, not against cwd. This lets a write-class
    // tool call (e.g. import_modules) override its target to point at the
    // sibling's actual .accdb without falling into the cross-worktree gate.
    const ownershipRoot = siblingRoot ?? projectRootNative;
    const outsideWorktree = !within(target, ownershipRoot);
    const namesConfiguredBackend =
      backendPath !== null && identity(target) === identity(backendPath);
    if (
      !existsSync(target) &&
      outsideWorktree &&
      !namesConfiguredBackend &&
      !externalAccessPathAllowedByFlag
    )
      return failWith(
        base,
        "outside-project-root",
        `Requested target '${target}' is outside this worktree.`,
        `The accessPath override must be inside projectRoot '${projectRoot}'. Run \`dysflow doctor --cwd ${projectRoot}\` and retry with a path owned by that worktree.`,
      );
    let canonicalTarget: string;
    try {
      canonicalTarget = canonical(target);
    } catch {
      return failWith(
        base,
        "target-not-found",
        `Requested target does not exist: ${target}.`,
        `Correct the target path.`,
      );
    }
    const isConfiguredBackend =
      canonicalBackend !== null && identity(canonicalTarget) === identity(canonicalBackend);
    if (!isConfiguredBackend && outsideWorktree && !externalAccessPathAllowedByFlag)
      return failWith(
        base,
        "outside-project-root",
        `Requested target '${target}' is outside this worktree.`,
        `The accessPath override must be inside projectRoot '${projectRoot}'. Run \`dysflow doctor --cwd ${projectRoot}\` and retry with a path owned by that worktree.`,
      );
    if (!isConfiguredBackend && !externalAccessPathAllowedByFlag) {
      if (
        identity(worktreeRoot(dirname(canonicalTarget)) ?? "") !== identity(effectiveOwning) ||
        identity(canonicalTarget) !== identity(canonicalAccess)
      )
        return failWith(
          base,
          "outside-project-root",
          `Requested target '${target}' is not owned by this worktree config.`,
          `Run \`dysflow doctor --cwd ${normalize(dirname(target))}\` and call that worktree's MCP process.`,
        );
    }
  }
  const thresholdMs = resolveStaleMarkerThresholdMs(capabilities);
  reapStaleMarkerFiles(join(projectRootNative, ".dysflow", "runtime", "markers"), thresholdMs);
  reapStaleOperationsRegistry(projectRootNative, thresholdMs);
  const blockingOperations = findRunningOperations(projectRootNative, accessPath, warnings);
  if (blockingOperations.length > 0)
    return failWith(
      base,
      "write-locked-by-running-op",
      `Running Access operations block this write: ${blockingOperations.join(", ")}.`,
      remediationForWriteLockedByRunningOp(blockingOperations),
      "WRITE_LOCKED_BY_RUNNING_OP",
      warnings,
    );
  return {
    ...base,
    status: "valid",
    writeReady: true,
    diagnostics: [...warnings],
    remediation: null,
    owningWorktree: siblingRoot !== null ? `sibling:${siblingRoot}` : "cwd",
  };
}

/**
 * Issue #967 — read the stale-marker threshold from
 * `capabilities.staleMarkerThresholdMinutes` in `.dysflow/project.json`,
 * falling back to {@link DEFAULT_STALE_MARKER_THRESHOLD_MS} (30 min) when
 * absent or malformed. Returns a value in milliseconds because the
 * downstream `cleanupStaleMarkers` does wall-clock comparison in ms.
 */
export function resolveStaleMarkerThresholdMs(capabilities: unknown): number {
  if (capabilities === null || typeof capabilities !== "object" || Array.isArray(capabilities)) {
    return DEFAULT_STALE_MARKER_THRESHOLD_MS;
  }
  const raw = (capabilities as Record<string, unknown>).staleMarkerThresholdMinutes;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_STALE_MARKER_THRESHOLD_MS;
  }
  return Math.floor(raw * 60 * 1000);
}

/**
 * Reap stale `status: "running"` records from `<projectRoot>/.dysflow/runtime/operations.json`,
 * flipping them to `status: "abandoned"`. Pairs with `cleanupStaleMarkers`
 * to cover both data sources that {@link findRunningOperations} reads.
 *
 * Returns the number of records flipped. A missing or malformed file is
 * treated as zero reaped and surfaces in `errors[]` (silent on read —
 * never blocks the pre-write gate on diagnostics noise).
 *
 * SYNC by design — same rationale as {@link reapStaleMarkerFiles}.
 */
export function reapStaleOperationsRegistry(
  projectRoot: string,
  thresholdMs: number,
  options: { nowMs?: number } = {},
): { reaped: number; errors: string[] } {
  const registryPath = join(projectRoot, ".dysflow", "runtime", "operations.json");
  const result: { reaped: number; errors: string[] } = { reaped: 0, errors: [] };
  if (!existsSync(registryPath)) return result;

  const nowMs = options.nowMs ?? Date.now();
  let raw: string;
  try {
    raw = readFileSync(registryPath, "utf8");
  } catch (err) {
    result.errors.push(`operations.json read failed: ${formatError(err)}`);
    return result;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed registry is not our concern here — it's the registry's
    // contract to handle corruption (quarantine). Skip silently.
    return result;
  }

  if (!isPlainObjectRecord(parsed)) return result;

  const wrapped = Array.isArray(parsed.records);
  if (!wrapped && !Array.isArray(parsed)) return result;

  const records = (wrapped ? parsed.records : parsed) as unknown[];
  let mutated = false;
  const abandonedAtIso = new Date(nowMs).toISOString();
  for (const entry of records) {
    if (!isPlainObjectRecord(entry)) continue;
    if (entry.status !== "running") continue;
    const updatedAtMs = Date.parse(typeof entry.updatedAt === "string" ? entry.updatedAt : "");
    if (!Number.isFinite(updatedAtMs)) continue;
    if (nowMs - updatedAtMs < thresholdMs) continue;
    entry.status = "abandoned";
    entry.abandonedAt = abandonedAtIso;
    mutated = true;
    result.reaped += 1;
  }

  if (mutated) {
    try {
      writeFileSync(registryPath, JSON.stringify(parsed), "utf8");
    } catch (err) {
      result.errors.push(`operations.json write failed: ${formatError(err)}`);
      result.reaped = 0;
    }
  }
  return result;
}

function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Issue #1394 — `warnings` is the evidence sink. Every recovery path here is
 * best-effort by contract (a corrupt file must never block the write gate),
 * but the reason is now reported instead of discarded so a consumer can tell
 * "no running operations" from "the sources could not be read".
 */
function findRunningOperations(
  projectRoot: string,
  accessPath: string,
  warnings: ProjectConfigDiagnosticEntry[] = [],
): string[] {
  const candidates: { value: unknown; fallbackId: string }[] = [];
  const registryPath = join(projectRoot, ".dysflow", "runtime", "operations.json");
  if (existsSync(registryPath)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(registryPath, "utf8"));
      const parsedObject =
        parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      const records = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsedObject?.records)
          ? parsedObject.records
          : [];
      for (const record of records)
        candidates.push({ value: record, fallbackId: "operations.json" });
    } catch (err) {
      warnings.push({
        code: "OPERATIONS_REGISTRY_UNREADABLE",
        severity: "warning",
        message: `Failed to read the running-operations registry: ${formatError(err)}`,
        path: normalize(registryPath),
      });
    }
  }
  const markerRoot = join(projectRoot, ".dysflow", "runtime", "markers");
  if (existsSync(markerRoot)) {
    try {
      for (const name of readdirSync(markerRoot)) {
        if (!name.endsWith(".json")) continue;
        const markerPath = join(markerRoot, name);
        try {
          candidates.push({
            value: JSON.parse(readFileSync(markerPath, "utf8")),
            fallbackId: name,
          });
        } catch (err) {
          warnings.push({
            code: "RUNTIME_MARKER_UNREADABLE",
            severity: "warning",
            message: `Failed to read the runtime operation marker: ${formatError(err)}`,
            path: normalize(markerPath),
          });
        }
      }
    } catch (err) {
      warnings.push({
        code: "RUNTIME_MARKERS_UNREADABLE",
        severity: "warning",
        message: `Failed to list the runtime markers directory: ${formatError(err)}`,
        path: normalize(markerRoot),
      });
    }
  }
  return [
    ...new Set(
      candidates.flatMap(({ value, fallbackId }) => {
        if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
        const record = value as Record<string, unknown>;
        const marker =
          record.marker !== null &&
          typeof record.marker === "object" &&
          !Array.isArray(record.marker)
            ? (record.marker as Record<string, unknown>)
            : record;
        if (marker.status !== "running") return [];
        if (
          typeof marker.projectRootAbs === "string" &&
          identity(marker.projectRootAbs) !== identity(projectRoot)
        )
          return [];
        if (
          typeof marker.accessPath === "string" &&
          identity(marker.accessPath) !== identity(accessPath)
        )
          return [];
        return [
          typeof marker.operationId === "string" && marker.operationId.length > 0
            ? marker.operationId
            : fallbackId,
        ];
      }),
    ),
  ];
}

function failWith(
  base: Omit<ProjectConfigDiagnostic, "status" | "writeReady" | "diagnostics" | "remediation">,
  status: ProjectConfigStatus,
  message: string,
  remediation: DiagnosticRemediation,
  code: string = status.toUpperCase().replaceAll("-", "_"),
  warnings: ProjectConfigDiagnostic["diagnostics"] = [],
): ProjectConfigDiagnostic {
  const descText = remediationText(remediation);
  return {
    ...base,
    status,
    writeReady: false,
    diagnostics: [{ code, severity: "error", message, remediation }, ...warnings],
    remediation: descText,
  };
}

/**
 * Issue #967 — `findRunningOperations` with stale-marker auto-cleanup
 * pre-applied. Runs `cleanupStaleMarkers` over the project-local markers
 * folder, then `reapStaleOperationsRegistry` over `operations.json`,
 * BEFORE listing blockers. Best-effort: a single corrupt file surfaces
 * via the inner `errors[]` arrays but never prevents the gate from
 * rendering a verdict.
 *
 * SYNC by design — `diagnoseProjectConfig` runs synchronously on every
 * tool call and adding an async hop there would force the function to
 * become `Promise<...>` and ripple through every caller (MCP resolver,
 * CLI commands, tests). The async port-backed
 * {@link cleanupStaleMarkers} (the unit-testable pure function) is still
 * available for callers that want async semantics — this inlined version
 * uses the same algorithm but mirrored onto sync filesystem I/O.
 */
function reapStaleMarkerFiles(markersRoot: string, thresholdMs: number): void {
  if (!existsSync(markersRoot)) return;
  const nowMs = Date.now();
  let entries: string[];
  try {
    entries = readdirSync(markersRoot);
  } catch {
    return;
  }
  const abandonedAtIso = new Date(nowMs).toISOString();
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const filePath = join(markersRoot, entry);
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isPlainObjectRecord(parsed)) continue;
    const record = isPlainObjectRecord(parsed.marker) ? parsed.marker : parsed;
    if (record.status !== "running") continue;
    const updatedAtMs = typeof record.updatedAt === "string" ? Date.parse(record.updatedAt) : NaN;
    if (!Number.isFinite(updatedAtMs)) continue;
    if (nowMs - updatedAtMs < thresholdMs) continue;
    const next: Record<string, unknown> = {
      ...parsed,
      status: "abandoned",
      abandonedAt: abandonedAtIso,
    };
    if (parsed.marker !== undefined) {
      next.marker = { ...record, status: "abandoned", abandonedAt: abandonedAtIso };
    }
    try {
      writeFileSync(filePath, JSON.stringify(next), "utf8");
    } catch {
      // Best-effort: a single write failure is not a gate-stopping event.
    }
  }
}
