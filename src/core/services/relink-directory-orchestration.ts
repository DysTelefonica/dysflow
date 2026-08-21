import { win32 } from "node:path";

import type {
  RelinkDirectoryFileResult,
  RelinkDirectoryLinkResult,
  RelinkDirectoryReport,
} from "../contracts/index.js";

export type RelinkDirectoryMap = { from: string; to: string };

export type RelinkDirectoryOrchestrationInput = {
  rootPath: string;
  dryRun: boolean;
  recursive: boolean;
  noBackup?: boolean;
  removeUnresolved?: boolean;
  maps?: readonly RelinkDirectoryMap[];
  denyPrefixes?: readonly string[];
};

export type RelinkDirectoryCandidate = { filePath: string };

export type RelinkDirectoryRawTable = {
  name: string;
  sourceTableName: string;
  backendPath: string | null;
  backendExists: boolean;
};

export type RelinkDirectoryInspection = {
  filePath: string;
  tables: readonly RelinkDirectoryRawTable[];
  error?: string;
};

export type RelinkDirectoryApplyAction =
  | {
      kind: "relink";
      linkName: string;
      targetPath: string;
      targetTable: string;
    }
  | { kind: "remove"; linkName: string };

export type RelinkDirectoryFilePlan = {
  filePath: string;
  createBackup: boolean;
  actions: RelinkDirectoryApplyAction[];
};

export type RelinkDirectoryApplyActionResult = {
  kind: RelinkDirectoryApplyAction["kind"];
  linkName: string;
  ok: boolean;
  error?: string;
};

export type RelinkDirectoryFileApplyResult = {
  filePath: string;
  backupPath?: string;
  backupError?: string;
  openError?: string;
  actionResults: readonly RelinkDirectoryApplyActionResult[];
};

export type RelinkDirectoryOrchestrationPort = {
  enumerateFiles(rootPath: string): Promise<readonly RelinkDirectoryCandidate[]>;
  inspectFile(filePath: string): Promise<RelinkDirectoryInspection>;
  applyFile(plan: RelinkDirectoryFilePlan): Promise<RelinkDirectoryFileApplyResult>;
};

type LinkEvidence = { filePath: string; linkName: string; backendExists: boolean };

export type RelinkDirectoryInspectState = {
  input: RelinkDirectoryOrchestrationInput;
  files: string[];
};

export type RelinkDirectoryApplyState = RelinkDirectoryInspectState & {
  inspections: RelinkDirectoryInspection[];
  fileResults: RelinkDirectoryFileResult[];
  linkEvidence: LinkEvidence[];
  plans: RelinkDirectoryFilePlan[];
  errors: string[];
};

export type RelinkDirectoryDecision =
  | { kind: "inspect"; state: RelinkDirectoryInspectState; files: string[] }
  | {
      kind: "apply";
      state: RelinkDirectoryApplyState;
      plans: RelinkDirectoryFilePlan[];
      continueOnError: true;
    }
  | { kind: "complete"; report: RelinkDirectoryReport };

type Classification = {
  classification: "alreadyLocal" | "plannedRelink" | "unresolved";
  resolvedLocalPath: string | null;
};

type PlannedLink = {
  filePath: string;
  raw: RelinkDirectoryRawTable;
  link: RelinkDirectoryLinkResult;
  initialTarget: string;
};

type ChainResult =
  | { kind: "resolved"; targetPath: string; targetTable: string; hops: number }
  | { kind: "fallback"; targetPath: string; targetTable: string; hops: number }
  | { kind: "missing"; targetPath: string; hops: number }
  | { kind: "cycle"; hops: number };

export function startRelinkDirectoryOrchestration(
  input: RelinkDirectoryOrchestrationInput,
  candidates: readonly RelinkDirectoryCandidate[],
): RelinkDirectoryDecision {
  const runtimeInput = input as RelinkDirectoryOrchestrationInput & {
    maps?: RelinkDirectoryMap | readonly RelinkDirectoryMap[];
    denyPrefixes?: string | readonly string[];
  };
  const normalizedInput: RelinkDirectoryOrchestrationInput = {
    ...input,
    noBackup: input.noBackup === true,
    removeUnresolved: input.removeUnresolved === true,
    maps: normalizePortArray(runtimeInput.maps).filter(
      (entry): entry is RelinkDirectoryMap =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as RelinkDirectoryMap).from === "string" &&
        typeof (entry as RelinkDirectoryMap).to === "string",
    ),
    denyPrefixes: normalizePortArray(runtimeInput.denyPrefixes).filter(
      (prefix): prefix is string => typeof prefix === "string",
    ),
  };
  const files = selectFiles(normalizedInput, candidates);
  return { kind: "inspect", state: { input: normalizedInput, files }, files: [...files] };
}

export function advanceRelinkDirectoryAfterInspections(
  state: RelinkDirectoryInspectState,
  inspections: readonly RelinkDirectoryInspection[],
): RelinkDirectoryDecision {
  assertOrderedFiles(
    state.files,
    inspections.map((entry) => entry.filePath),
    "inspection",
  );
  const planning = buildPlanningState(state, inspections);
  if (state.input.dryRun || planning.plans.length === 0) {
    return { kind: "complete", report: buildReport(planning, []) };
  }
  return {
    kind: "apply",
    state: planning,
    plans: planning.plans.map(clonePlan),
    continueOnError: true,
  };
}

export function advanceRelinkDirectoryAfterApply(
  state: RelinkDirectoryApplyState,
  results: readonly RelinkDirectoryFileApplyResult[],
): RelinkDirectoryDecision {
  assertOrderedFiles(
    state.plans.map((plan) => plan.filePath),
    results.map((entry) => entry.filePath),
    "apply",
  );
  return { kind: "complete", report: buildReport(state, results) };
}

export async function orchestrateRelinkDirectory(
  input: RelinkDirectoryOrchestrationInput,
  port: RelinkDirectoryOrchestrationPort,
): Promise<RelinkDirectoryReport> {
  const candidates = await port.enumerateFiles(input.rootPath);
  const start = startRelinkDirectoryOrchestration(input, candidates);
  if (start.kind !== "inspect") throw new Error("Relink orchestration did not request inspection.");
  const inspections: RelinkDirectoryInspection[] = [];
  for (const filePath of start.files) inspections.push(await port.inspectFile(filePath));
  const planned = advanceRelinkDirectoryAfterInspections(start.state, inspections);
  if (planned.kind === "complete") return planned.report;
  if (planned.kind !== "apply") throw new Error("Relink orchestration returned an invalid plan.");
  const results: RelinkDirectoryFileApplyResult[] = [];
  for (const plan of planned.plans) results.push(await port.applyFile(plan));
  const completed = advanceRelinkDirectoryAfterApply(planned.state, results);
  if (completed.kind !== "complete") throw new Error("Relink orchestration did not complete.");
  return completed.report;
}

function buildPlanningState(
  state: RelinkDirectoryInspectState,
  inspections: readonly RelinkDirectoryInspection[],
): RelinkDirectoryApplyState {
  const aliasMap = buildAliasMap(state.input.maps ?? []);
  const fileIndex = buildFileIndex(state.files);
  const inspectionIndex = new Map(
    inspections.map((inspection) => [canonical(inspection.filePath), inspection]),
  );
  const fileResults: RelinkDirectoryFileResult[] = [];
  const linkEvidence: LinkEvidence[] = [];
  const errors: string[] = [];
  const plannedLinks: PlannedLink[] = [];

  for (const inspection of inspections) {
    const fileResult: RelinkDirectoryFileResult = {
      filePath: inspection.filePath,
      linkedTablesFound: 0,
      alreadyLocal: 0,
      plannedRelinks: 0,
      appliedRelinks: 0,
      links: [],
      errors: [],
    };
    if (inspection.error !== undefined) {
      fileResult.errors.push(inspection.error);
      errors.push(`${inspection.filePath}: ${inspection.error}`);
    }
    for (const table of inspection.tables) {
      if (table.backendPath === null) continue;
      const classification = classifyBackend(
        table.backendPath,
        state.input.rootPath,
        aliasMap,
        fileIndex,
      );
      const link: RelinkDirectoryLinkResult = {
        database: inspection.filePath,
        linkName: table.name,
        originalBackendPath: table.backendPath,
        classification: classification.classification,
        resolvedLocalPath: classification.resolvedLocalPath,
        chainHops: 0,
        cycleDetected: false,
      };
      fileResult.linkedTablesFound += 1;
      if (classification.classification === "alreadyLocal") fileResult.alreadyLocal += 1;
      if (classification.classification === "plannedRelink") {
        fileResult.plannedRelinks += 1;
        plannedLinks.push({
          filePath: inspection.filePath,
          raw: table,
          link,
          initialTarget: classification.resolvedLocalPath ?? "",
        });
      }
      fileResult.links.push(link);
      linkEvidence.push({
        filePath: inspection.filePath,
        linkName: table.name,
        backendExists: table.backendExists,
      });
    }
    fileResults.push(fileResult);
  }

  const actions = new Map<string, RelinkDirectoryApplyAction[]>();
  if (!state.input.dryRun) {
    for (const planned of plannedLinks) {
      const chain = resolveChain(
        planned,
        state.input.rootPath,
        inspectionIndex,
        aliasMap,
        fileIndex,
      );
      planned.link.chainHops = chain.hops;
      if (chain.kind === "cycle") {
        planned.link.classification = "cycle";
        planned.link.cycleDetected = true;
        continue;
      }
      if (chain.kind === "missing") {
        planned.link.classification = "unresolved";
        planned.link.reason = "target-table-missing";
        const message = `target table missing in ${chain.targetPath}`;
        addLinkError(fileResults, errors, planned.filePath, planned.raw.name, message);
        if (state.input.removeUnresolved === true) {
          addAction(actions, planned.filePath, { kind: "remove", linkName: planned.raw.name });
        }
        continue;
      }
      planned.link.resolvedLocalPath = chain.targetPath;
      addAction(actions, planned.filePath, {
        kind: "relink",
        linkName: planned.raw.name,
        targetPath: chain.targetPath,
        targetTable: chain.targetTable,
      });
    }

    if (state.input.removeUnresolved === true) {
      for (const fileResult of fileResults) {
        for (const link of fileResult.links) {
          if (link.classification === "unresolved" && link.reason !== "target-table-missing") {
            addAction(actions, fileResult.filePath, { kind: "remove", linkName: link.linkName });
          }
        }
      }
    }
  }

  const plans = state.files.flatMap((filePath) => {
    const fileActions = actions.get(canonical(filePath)) ?? [];
    return fileActions.length === 0
      ? []
      : [
          {
            filePath,
            createBackup: state.input.noBackup !== true,
            actions: fileActions,
          },
        ];
  });

  return {
    ...state,
    inspections: inspections.map(cloneInspection),
    fileResults,
    linkEvidence,
    plans,
    errors,
  };
}

function resolveChain(
  planned: PlannedLink,
  rootPath: string,
  inspectionIndex: ReadonlyMap<string, RelinkDirectoryInspection>,
  aliasMap: ReadonlyMap<string, string>,
  fileIndex: ReadonlyMap<string, readonly string[]>,
): ChainResult {
  let currentFile = planned.filePath;
  let currentTable = planned.raw.name;
  let hops = 0;
  const visited = new Set<string>();

  while (true) {
    const key = `${canonical(currentFile)}|${currentTable.toLowerCase()}`;
    if (visited.has(key)) return { kind: "cycle", hops };
    if (hops >= 5) {
      return {
        kind: "fallback",
        targetPath: planned.initialTarget,
        targetTable: planned.raw.sourceTableName,
        hops,
      };
    }
    visited.add(key);
    const inspection = inspectionIndex.get(canonical(currentFile));
    if (inspection?.error !== undefined) {
      return {
        kind: "fallback",
        targetPath: planned.initialTarget,
        targetTable: planned.raw.sourceTableName,
        hops: Math.max(0, hops - 1),
      };
    }
    const table = inspection?.tables.find(
      (candidate) => candidate.name.toLowerCase() === currentTable.toLowerCase(),
    );
    if (table === undefined) return { kind: "missing", targetPath: currentFile, hops };
    if (table.backendPath === null) {
      return { kind: "resolved", targetPath: currentFile, targetTable: table.name, hops };
    }
    const classified = classifyBackend(table.backendPath, rootPath, aliasMap, fileIndex);
    const nextPath = classified.resolvedLocalPath;
    if (
      nextPath === null ||
      (classified.classification !== "alreadyLocal" &&
        classified.classification !== "plannedRelink")
    ) {
      return {
        kind: "fallback",
        targetPath: planned.initialTarget,
        targetTable: planned.raw.sourceTableName,
        hops,
      };
    }
    currentFile = nextPath;
    currentTable = table.sourceTableName;
    hops += 1;
  }
}

function buildReport(
  state: RelinkDirectoryApplyState,
  applyResults: readonly RelinkDirectoryFileApplyResult[],
): RelinkDirectoryReport {
  const fileResults = state.fileResults.map(cloneFileResult);
  const errors = [...state.errors];
  const backupPaths: string[] = [];

  for (let index = 0; index < applyResults.length; index += 1) {
    const result = applyResults[index];
    const plan = state.plans[index];
    if (result === undefined || plan === undefined) continue;
    const fileResult = findFileResult(fileResults, result.filePath);
    if (result.backupPath !== undefined) backupPaths.push(result.backupPath);
    if (result.backupError !== undefined) {
      const message = `Backup failed: ${result.backupError}`;
      fileResult.errors.push(message);
      errors.push(`${result.filePath}: ${message}`);
      continue;
    }
    if (result.openError !== undefined) {
      fileResult.errors.push(result.openError);
      errors.push(`${result.filePath}: ${result.openError}`);
      continue;
    }
    assertActionResults(plan.actions, result.actionResults, result.filePath);
    for (let actionIndex = 0; actionIndex < plan.actions.length; actionIndex += 1) {
      const action = plan.actions[actionIndex];
      const actionResult = result.actionResults[actionIndex];
      if (action === undefined || actionResult === undefined) continue;
      const link = findLink(fileResult, action.linkName);
      if (!actionResult.ok) {
        const prefix = action.kind === "remove" ? "Delete" : "RefreshLink";
        addLinkError(
          fileResults,
          errors,
          result.filePath,
          action.linkName,
          actionResult.error ?? `${prefix} failed`,
          prefix,
        );
        continue;
      }
      if (action.kind === "remove") {
        link.classification = "removed";
      } else {
        link.classification = "applied";
        link.resolvedLocalPath = action.targetPath;
        fileResult.appliedRelinks += 1;
      }
    }
  }

  const allLinks = fileResults.flatMap((fileResult) => fileResult.links);
  let externalLinkCount = 0;
  let datosteLinkCount = 0;
  let brokenLinkCount = 0;
  for (const link of allLinks) {
    if (["alreadyLocal", "applied", "removed"].includes(link.classification)) continue;
    if (!isContained(link.originalBackendPath, state.input.rootPath)) externalLinkCount += 1;
    if (
      (state.input.denyPrefixes ?? []).some((prefix) =>
        link.originalBackendPath.toLowerCase().startsWith(prefix.toLowerCase()),
      )
    ) {
      datosteLinkCount += 1;
    }
    const evidence = state.linkEvidence.find(
      (entry) =>
        entry.filePath.toLowerCase() === link.database.toLowerCase() &&
        entry.linkName.toLowerCase() === link.linkName.toLowerCase(),
    );
    if (
      !isContained(link.originalBackendPath, state.input.rootPath) &&
      evidence?.backendExists === false
    ) {
      brokenLinkCount += 1;
    }
  }

  return {
    mode: state.input.dryRun ? "dry-run" : "apply",
    root: state.input.rootPath,
    filesScanned: state.files.length,
    linkedTablesFound: fileResults.reduce((sum, file) => sum + file.linkedTablesFound, 0),
    alreadyLocal: fileResults.reduce((sum, file) => sum + file.alreadyLocal, 0),
    plannedRelinks: fileResults.reduce((sum, file) => sum + file.plannedRelinks, 0),
    appliedRelinks: fileResults.reduce((sum, file) => sum + file.appliedRelinks, 0),
    unresolved: allLinks.filter((link) => link.classification === "unresolved"),
    removed: allLinks.filter((link) => link.classification === "removed"),
    externalLinkCount,
    datosteLinkCount,
    brokenLinkCount,
    backupPaths,
    errors,
    fileResults,
  };
}

function selectFiles(
  input: RelinkDirectoryOrchestrationInput,
  candidates: readonly RelinkDirectoryCandidate[],
): string[] {
  const root = canonical(input.rootPath);
  return candidates
    .map((candidate) => candidate.filePath)
    .filter((filePath) => {
      const extension = win32.extname(filePath).toLowerCase();
      if (extension !== ".accdb" && extension !== ".mdb") return false;
      if (!isContained(filePath, input.rootPath)) return false;
      return input.recursive || canonical(win32.dirname(filePath)) === root;
    });
}

function classifyBackend(
  backendPath: string,
  rootPath: string,
  aliasMap: ReadonlyMap<string, string>,
  fileIndex: ReadonlyMap<string, readonly string[]>,
): Classification {
  if (isContained(backendPath, rootPath)) {
    return { classification: "alreadyLocal", resolvedLocalPath: backendPath };
  }
  let basename = win32.basename(backendPath).toLowerCase();
  basename = aliasMap.get(basename)?.toLowerCase() ?? basename;
  const extension = win32.extname(basename).toLowerCase();
  const exact = (fileIndex.get(basename) ?? []).filter(
    (path) => win32.extname(path).toLowerCase() === extension,
  );
  if (exact.length !== 1) return { classification: "unresolved", resolvedLocalPath: null };
  return { classification: "plannedRelink", resolvedLocalPath: exact[0] ?? null };
}

function buildAliasMap(maps: readonly RelinkDirectoryMap[]): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const entry of maps) {
    const from = entry.from.trim();
    const to = entry.to.trim();
    if (from.length > 0 && to.length > 0) result.set(from.toLowerCase(), to);
  }
  return result;
}

function buildFileIndex(files: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, string[]>();
  for (const filePath of files) {
    const key = win32.basename(filePath).toLowerCase();
    const values = result.get(key) ?? [];
    values.push(filePath);
    result.set(key, values);
  }
  return result;
}

function isContained(candidatePath: string, rootPath: string): boolean {
  const candidate = canonical(candidatePath);
  const root = canonical(rootPath);
  return candidate === root || candidate.startsWith(`${root}\\`);
}

function canonical(path: string): string {
  const normalized = win32.normalize(path).replace(/[\\/]+$/u, "");
  return normalized.toLowerCase();
}

function normalizePortArray<T>(value: T | readonly T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? [...value] : [value as T];
}

function addAction(
  actions: Map<string, RelinkDirectoryApplyAction[]>,
  filePath: string,
  action: RelinkDirectoryApplyAction,
): void {
  const key = canonical(filePath);
  const current = actions.get(key) ?? [];
  current.push(action);
  actions.set(key, current);
}

function addLinkError(
  fileResults: RelinkDirectoryFileResult[],
  errors: string[],
  filePath: string,
  linkName: string,
  message: string,
  prefix = "RefreshLink",
): void {
  const fileResult = findFileResult(fileResults, filePath);
  fileResult.errors.push(`${prefix} ${linkName}: ${message}`);
  errors.push(`${filePath}!${linkName}: ${message}`);
}

function findFileResult(
  fileResults: RelinkDirectoryFileResult[],
  filePath: string,
): RelinkDirectoryFileResult {
  const result = fileResults.find((entry) => canonical(entry.filePath) === canonical(filePath));
  if (result === undefined) throw new Error(`Relink result references unknown file '${filePath}'.`);
  return result;
}

function findLink(
  fileResult: RelinkDirectoryFileResult,
  linkName: string,
): RelinkDirectoryLinkResult {
  const link = fileResult.links.find(
    (entry) => entry.linkName.toLowerCase() === linkName.toLowerCase(),
  );
  if (link === undefined) throw new Error(`Relink result references unknown link '${linkName}'.`);
  return link;
}

function assertOrderedFiles(
  expected: readonly string[],
  actual: readonly string[],
  phase: string,
): void {
  if (
    expected.length !== actual.length ||
    expected.some((filePath, index) => canonical(filePath) !== canonical(actual[index] ?? ""))
  ) {
    throw new Error(
      `Relink ${phase} port did not preserve core order: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

function assertActionResults(
  actions: readonly RelinkDirectoryApplyAction[],
  results: readonly RelinkDirectoryApplyActionResult[],
  filePath: string,
): void {
  if (
    actions.length !== results.length ||
    actions.some(
      (action, index) =>
        action.kind !== results[index]?.kind ||
        action.linkName.toLowerCase() !== results[index]?.linkName.toLowerCase(),
    )
  ) {
    throw new Error(
      `Relink apply primitive did not preserve the core action order for '${filePath}'.`,
    );
  }
}

function cloneInspection(inspection: RelinkDirectoryInspection): RelinkDirectoryInspection {
  return { ...inspection, tables: inspection.tables.map((table) => ({ ...table })) };
}

function clonePlan(plan: RelinkDirectoryFilePlan): RelinkDirectoryFilePlan {
  return { ...plan, actions: plan.actions.map((action) => ({ ...action })) };
}

function cloneFileResult(file: RelinkDirectoryFileResult): RelinkDirectoryFileResult {
  return {
    ...file,
    links: file.links.map((link) => ({ ...link })),
    errors: [...file.errors],
  };
}
