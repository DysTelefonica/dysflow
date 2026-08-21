import { win32 } from "node:path";

import { describe, expect, it } from "vitest";
import {
  orchestrateRelinkDirectory,
  type RelinkDirectoryCandidate,
  type RelinkDirectoryInspection,
  type RelinkDirectoryOrchestrationPort,
} from "../../../src/core/services/relink-directory-orchestration.js";

const root = "C:\\local";
const external = "C:\\external";

function candidate(filePath: string): RelinkDirectoryCandidate {
  return { filePath };
}

function inspection(
  filePath: string,
  tables: RelinkDirectoryInspection["tables"],
): RelinkDirectoryInspection {
  return { filePath, tables };
}

function nativeTable(name: string): RelinkDirectoryInspection["tables"][number] {
  return { name, sourceTableName: name, backendPath: null, backendExists: true };
}

function linkedTable(
  name: string,
  backendPath: string,
  backendExists = true,
  sourceTableName = name,
): RelinkDirectoryInspection["tables"][number] {
  return { name, sourceTableName, backendPath, backendExists };
}

function fakePort(input: {
  candidates: RelinkDirectoryCandidate[];
  inspections: RelinkDirectoryInspection[];
  apply?: RelinkDirectoryOrchestrationPort["applyFile"];
}) {
  const calls: string[] = [];
  const port: RelinkDirectoryOrchestrationPort = {
    enumerateFiles: async () => {
      calls.push("enumerate");
      return input.candidates;
    },
    inspectFile: async (filePath) => {
      calls.push(`inspect:${filePath}`);
      const result = input.inspections.find(
        (entry) => entry.filePath.toLowerCase() === filePath.toLowerCase(),
      );
      if (result === undefined) throw new Error(`Missing inspection for ${filePath}`);
      return result;
    },
    applyFile:
      input.apply ??
      (async (plan) => {
        calls.push(`apply:${plan.filePath}`);
        return {
          filePath: plan.filePath,
          backupPath: plan.createBackup ? `${plan.filePath}.bak` : undefined,
          actionResults: plan.actions.map((action) => ({
            kind: action.kind,
            linkName: action.linkName,
            ok: true as const,
          })),
        };
      }),
  };
  return { port, calls };
}

describe("relink-directory core behavior matrix", () => {
  it("classifies contained, uniquely resolvable, missing, and ambiguous links", async () => {
    const frontend = win32.join(root, "frontend.accdb");
    const localBackend = win32.join(root, "backend.accdb");
    const duplicateOne = win32.join(root, "one", "duplicate.accdb");
    const duplicateTwo = win32.join(root, "two", "duplicate.accdb");
    const { port } = fakePort({
      candidates: [
        candidate(frontend),
        candidate(localBackend),
        candidate(duplicateOne),
        candidate(duplicateTwo),
      ],
      inspections: [
        inspection(frontend, [
          linkedTable("Contained", win32.join(root, "inside.accdb")),
          linkedTable("Resolvable", win32.join(external, "backend.accdb")),
          linkedTable("Missing", win32.join(external, "missing.accdb"), false),
          linkedTable("Ambiguous", win32.join(external, "duplicate.accdb")),
        ]),
        inspection(localBackend, [nativeTable("Resolvable")]),
        inspection(duplicateOne, [nativeTable("Ambiguous")]),
        inspection(duplicateTwo, [nativeTable("Ambiguous")]),
      ],
    });

    const report = await orchestrateRelinkDirectory(
      { rootPath: root, dryRun: true, recursive: true },
      port,
    );

    expect(report.fileResults[0]?.links.map((link) => link.classification)).toEqual([
      "alreadyLocal",
      "plannedRelink",
      "unresolved",
      "unresolved",
    ]);
    expect(report.alreadyLocal).toBe(1);
    expect(report.plannedRelinks).toBe(1);
    expect(report.unresolved).toHaveLength(2);
    expect(report.externalLinkCount).toBe(3);
    expect(report.brokenLinkCount).toBe(1);
  });

  it("does not treat a sibling path prefix as contained", async () => {
    const frontend = win32.join(root, "frontend.accdb");
    const { port } = fakePort({
      candidates: [candidate(frontend)],
      inspections: [
        inspection(frontend, [linkedTable("Sibling", "C:\\local-other\\backend.accdb", false)]),
      ],
    });

    const report = await orchestrateRelinkDirectory(
      { rootPath: root, dryRun: true, recursive: true },
      port,
    );

    expect(report.fileResults[0]?.links[0]?.classification).toBe("unresolved");
    expect(report.externalLinkCount).toBe(1);
  });

  it("normalizes singleton map and deny-prefix values emitted by the PowerShell port", async () => {
    const frontend = win32.join(root, "frontend.accdb");
    const backend = win32.join(root, "backend.accdb");
    const { port } = fakePort({
      candidates: [candidate(frontend), candidate(backend)],
      inspections: [
        inspection(frontend, [linkedTable("Products", win32.join(external, "legacy.accdb"))]),
        inspection(backend, [nativeTable("Products")]),
      ],
    });
    const portSerializedInput = {
      rootPath: root,
      dryRun: true,
      recursive: true,
      maps: { from: "legacy.accdb", to: "backend.accdb" },
      denyPrefixes: external,
    } as unknown as Parameters<typeof orchestrateRelinkDirectory>[0];

    const report = await orchestrateRelinkDirectory(portSerializedInput, port);

    expect(report.plannedRelinks).toBe(1);
    expect(report.datosteLinkCount).toBe(1);
  });

  it("keeps dry-run non-mutating and lets core select recursive traversal candidates", async () => {
    const top = win32.join(root, "top.accdb");
    const nested = win32.join(root, "nested", "nested.accdb");
    const backend = win32.join(root, "backend.accdb");
    const { port, calls } = fakePort({
      candidates: [candidate(top), candidate(nested), candidate(backend)],
      inspections: [
        inspection(top, [linkedTable("Products", win32.join(external, "backend.accdb"))]),
        inspection(backend, [nativeTable("Products")]),
      ],
    });

    const report = await orchestrateRelinkDirectory(
      { rootPath: root, dryRun: true, recursive: false },
      port,
    );

    expect(report.filesScanned).toBe(2);
    expect(calls).toEqual(["enumerate", `inspect:${top}`, `inspect:${backend}`]);
  });

  it("plans backup before apply, preserves no-backup, and resolves a multi-hop chain in core", async () => {
    const frontend = win32.join(root, "frontend.accdb");
    const middle = win32.join(root, "middle.accdb");
    const backend = win32.join(root, "backend.accdb");
    const plans: Array<{ createBackup: boolean; targetPath?: string; targetTable?: string }> = [];
    const { port } = fakePort({
      candidates: [candidate(frontend), candidate(middle), candidate(backend)],
      inspections: [
        inspection(frontend, [linkedTable("Products", win32.join(external, "middle.accdb"))]),
        inspection(middle, [linkedTable("Products", win32.join(external, "backend.accdb"))]),
        inspection(backend, [nativeTable("Products")]),
      ],
      apply: async (plan) => {
        const relink = plan.actions.find((action) => action.kind === "relink");
        plans.push({
          createBackup: plan.createBackup,
          targetPath: relink?.targetPath,
          targetTable: relink?.targetTable,
        });
        return {
          filePath: plan.filePath,
          backupPath: plan.createBackup ? `${plan.filePath}.bak` : undefined,
          actionResults: plan.actions.map((action) => ({
            kind: action.kind,
            linkName: action.linkName,
            ok: true as const,
          })),
        };
      },
    });

    const report = await orchestrateRelinkDirectory(
      { rootPath: root, dryRun: false, recursive: true, noBackup: true },
      port,
    );

    expect(plans[0]).toEqual({
      createBackup: false,
      targetPath: backend,
      targetTable: "Products",
    });
    expect(report.fileResults[0]?.links[0]).toMatchObject({
      classification: "applied",
      resolvedLocalPath: backend,
      chainHops: 2,
    });
  });

  it("continues after a backup failure and reports the successful later file", async () => {
    const first = win32.join(root, "a.accdb");
    const second = win32.join(root, "b.accdb");
    const backend = win32.join(root, "backend.accdb");
    const applied: string[] = [];
    const { port } = fakePort({
      candidates: [candidate(first), candidate(second), candidate(backend)],
      inspections: [
        inspection(first, [linkedTable("Products", win32.join(external, "backend.accdb"))]),
        inspection(second, [linkedTable("Products", win32.join(external, "backend.accdb"))]),
        inspection(backend, [nativeTable("Products")]),
      ],
      apply: async (plan) => {
        applied.push(plan.filePath);
        if (plan.filePath === first) {
          return { filePath: first, backupError: "disk full", actionResults: [] };
        }
        return {
          filePath: second,
          backupPath: `${second}.bak`,
          actionResults: plan.actions.map((action) => ({
            kind: action.kind,
            linkName: action.linkName,
            ok: true as const,
          })),
        };
      },
    });

    const report = await orchestrateRelinkDirectory(
      { rootPath: root, dryRun: false, recursive: true },
      port,
    );

    expect(applied).toEqual([first, second]);
    expect(report.appliedRelinks).toBe(1);
    expect(report.errors).toContain(`${first}: Backup failed: disk full`);
    expect(report.backupPaths).toEqual([`${second}.bak`]);
  });

  it("maps a missing target table to an error and removes it only when requested", async () => {
    const frontend = win32.join(root, "frontend.accdb");
    const backend = win32.join(root, "backend.accdb");
    const actions: string[] = [];
    const { port } = fakePort({
      candidates: [candidate(frontend), candidate(backend)],
      inspections: [
        inspection(frontend, [linkedTable("Products", win32.join(external, "backend.accdb"))]),
        inspection(backend, [nativeTable("DifferentTable")]),
      ],
      apply: async (plan) => {
        actions.push(...plan.actions.map((action) => action.kind));
        return {
          filePath: plan.filePath,
          backupPath: `${plan.filePath}.bak`,
          actionResults: plan.actions.map((action) => ({
            kind: action.kind,
            linkName: action.linkName,
            ok: true as const,
          })),
        };
      },
    });

    const report = await orchestrateRelinkDirectory(
      {
        rootPath: root,
        dryRun: false,
        recursive: true,
        removeUnresolved: true,
      },
      port,
    );

    expect(actions).toEqual(["remove"]);
    expect(report.removed).toHaveLength(1);
    expect(report.errors[0]).toContain("target table missing");
  });

  it("detects cycles in core and does not send a mutation action", async () => {
    const first = win32.join(root, "a.accdb");
    const second = win32.join(root, "b.accdb");
    const plans: number[] = [];
    const { port } = fakePort({
      candidates: [candidate(first), candidate(second)],
      inspections: [
        inspection(first, [linkedTable("Ref", win32.join(external, "b.accdb"))]),
        inspection(second, [linkedTable("Ref", first)]),
      ],
      apply: async (plan) => {
        plans.push(plan.actions.length);
        return { filePath: plan.filePath, actionResults: [] };
      },
    });

    const report = await orchestrateRelinkDirectory(
      { rootPath: root, dryRun: false, recursive: true },
      port,
    );

    expect(plans).toEqual([]);
    expect(report.fileResults[0]?.links[0]).toMatchObject({
      classification: "cycle",
      cycleDetected: true,
    });
  });
});
