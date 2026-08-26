import { resolve } from "node:path";
import { type OperationResult, successResult } from "../contracts/index.js";
import { isAbsolutePath, stringValue } from "../utils/index.js";
import {
  type ConfigFileSystemPort,
  type DysflowConfig,
  loadDysflowConfigAsyncWith,
} from "./dysflow-config.js";

export type ExecutionTargetContext = {
  env: Record<string, string | undefined>;
  cwd: string;
  accessPath?: string;
  destinationRoot?: string;
  timeoutMs?: number;
  fileSystem: ConfigFileSystemPort;
};

export type TargetProvenance =
  | "implicit-cwd"
  | "explicit-project-id"
  | "explicit-access-path"
  | "explicit-cwd"
  | "explicit-backend-path";

declare const resolvedDestinationRootBrand: unique symbol;

/**
 * An absolute destination root that has crossed the canonical execution-target
 * resolver. Raw request/config DTOs deliberately remain strings.
 */
export type ResolvedDestinationRoot = string & {
  readonly [resolvedDestinationRootBrand]: true;
};

export type ExecutionTarget = Omit<
  Pick<
    DysflowConfig,
    | "accessDbPath"
    | "backendPath"
    | "destinationRoot"
    | "projectRoot"
    | "projectId"
    | "configSource"
    | "timeoutMs"
  >,
  "destinationRoot"
> & {
  accessPath?: string;
  destinationRoot: ResolvedDestinationRoot;
  targetProvenance: TargetProvenance;
};

/**
 * Issue #1478 — absolutize a caller-supplied path override against the
 * project base BEFORE it leaves the resolver.
 *
 * A relative override (`destinationRoot: "src"`) used to be returned
 * verbatim, and each downstream consumer then anchored it to a different
 * base. The concrete failure: `executeMappedTool` spawns the VBA worker with
 * `cwd: target.projectRoot` — which #1169 made follow the same raw override —
 * and the worker resolved the relative `destinationRoot` against that cwd,
 * writing `<root>/src/src/forms/` instead of `<root>/src/forms/`.
 *
 * Absolute values (POSIX, Windows drive-letter, UNC) are kept byte-identical:
 * `node:path` is host-platform-specific and would prefix cwd to a Windows path
 * on POSIX, and the `OUTSIDE_PROJECT_ROOT` guard compares the value it is
 * given, so an external absolute root must reach it unchanged.
 */
function absolutizeOverride(value: unknown, base: string): string | undefined {
  const normalized = stringValue(value);
  if (normalized === undefined) return undefined;
  return isAbsolutePath(normalized) ? normalized : resolve(base, normalized);
}

function resolveDestinationRoot(value: string, base: string): ResolvedDestinationRoot {
  const absolute = isAbsolutePath(value) ? value : resolve(base, value);
  return absolute as ResolvedDestinationRoot;
}

export async function resolveExecutionTarget(
  params: Record<string, unknown>,
  context: ExecutionTargetContext,
): Promise<OperationResult<ExecutionTarget>> {
  const explicitTimeoutMs =
    typeof params.timeoutMs === "number"
      ? params.timeoutMs
      : typeof params.timeoutMs === "string" && !Number.isNaN(Number(params.timeoutMs))
        ? Number(params.timeoutMs)
        : undefined;

  const hasExplicitConfigOverride =
    stringValue(params.accessPath) !== undefined || stringValue(params.projectRoot) !== undefined;
  const requestedProjectId = stringValue(params.projectId);
  if (hasExplicitConfigOverride || requestedProjectId !== undefined) {
    const config = await loadDysflowConfigAsyncWith(
      {
        env: context.env,
        cwd: context.cwd,
        accessDbPath: stringValue(params.accessPath),
        backendPath: stringValue(params.backendPath),
        destinationRoot: stringValue(params.destinationRoot),
        projectRoot: stringValue(params.projectRoot),
        projectId: stringValue(params.projectId),
        contextId: stringValue(params.contextId),
        timeoutMs: explicitTimeoutMs,
      },
      context.fileSystem,
    );
    if (!config.ok) return config;
    const explicitBase = config.data.projectRoot ?? context.cwd;
    return successResult({
      ...config.data,
      accessPath: config.data.accessDbPath,
      destinationRoot: resolveDestinationRoot(
        absolutizeOverride(params.destinationRoot, explicitBase) ??
          config.data.destinationRoot ??
          config.data.projectRoot ??
          context.cwd,
        explicitBase,
      ),
      // Issue #1169 — when the caller supplies a `destinationRoot`
      // override, the `projectRoot` MUST also follow the override so a
      // form/serialization consumer can place `sourcePath` inside the
      // override without tripping the path-containment guard. The
      // configured `projectRoot` is preserved only when no override is
      // supplied, so the legacy contract stays unchanged.
      projectRoot:
        absolutizeOverride(params.projectRoot, explicitBase) ??
        absolutizeOverride(params.destinationRoot, explicitBase) ??
        config.data.projectRoot ??
        context.cwd,
      targetProvenance:
        stringValue(params.accessPath) !== undefined
          ? "explicit-access-path"
          : requestedProjectId !== undefined
            ? "explicit-project-id"
            : "explicit-cwd",
    });
  }

  if (context.accessPath === undefined) {
    const repoConfig = await loadDysflowConfigAsyncWith(
      {
        env: context.env,
        cwd: context.cwd,
        timeoutMs: explicitTimeoutMs,
      },
      context.fileSystem,
    );
    if (repoConfig.ok) {
      const repoBase = repoConfig.data.projectRoot ?? context.cwd;
      return successResult({
        ...repoConfig.data,
        accessPath: repoConfig.data.accessDbPath,
        destinationRoot: resolveDestinationRoot(
          absolutizeOverride(params.destinationRoot, repoBase) ??
            repoConfig.data.destinationRoot ??
            repoConfig.data.projectRoot ??
            context.cwd,
          repoBase,
        ),
        // Issue #1169 — see the matching comment in the explicit-override
        // branch above. The override flows through the same precedence.
        projectRoot:
          absolutizeOverride(params.projectRoot, repoBase) ??
          absolutizeOverride(params.destinationRoot, repoBase) ??
          repoConfig.data.projectRoot ??
          context.cwd,
        targetProvenance: "implicit-cwd",
      });
    }
    return repoConfig;
  }

  const destinationRoot = resolveDestinationRoot(
    absolutizeOverride(params.destinationRoot, context.cwd) ??
      absolutizeOverride(params.projectRoot, context.cwd) ??
      context.destinationRoot ??
      context.cwd,
    context.cwd,
  );
  return successResult({
    configSource: "runtime-default" as const,
    accessDbPath: context.accessPath ?? "",
    accessPath: context.accessPath,
    backendPath: stringValue(params.backendPath),
    destinationRoot,
    // Issue #1169 — same override-aware precedence as the configured
    // branches. When the caller passes `destinationRoot`, projectRoot
    // follows so the path-containment guards in the form / serialization
    // tools accept the override root as the authoritative project root.
    projectRoot:
      absolutizeOverride(params.projectRoot, context.cwd) ??
      absolutizeOverride(params.destinationRoot, context.cwd) ??
      context.destinationRoot ??
      context.cwd,
    projectId: undefined,
    timeoutMs: explicitTimeoutMs ?? context.timeoutMs ?? 30000,
    targetProvenance: stringValue(params.backendPath) ? "explicit-backend-path" : "implicit-cwd",
  });
}
