import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter.js";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "issue-1817-port-")));
  roots.push(root);
  const source = join(root, "source", "modules");
  const binary = join(root, "external-binary", "modules");
  mkdirSync(source, { recursive: true });
  mkdirSync(binary, { recursive: true });
  const accessPath = join(root, "Frontend.accdb");
  writeFileSync(accessPath, "External Access I/O fixture");
  const code =
    'Attribute VB_Name = "Probe"\nOption Explicit\nPublic Function Value() As Long\nValue = 1\nEnd Function\n';
  const sourceFile = join(source, "Probe.bas");
  const binaryFile = join(binary, "Probe.bas");
  writeFileSync(sourceFile, code);
  const adapter = new VbaSyncAdapter({
    cwd: root,
    accessPath,
    destinationRoot: join(root, "source"),
    env: {},
    scriptPath: join(root, "external-stub.ps1"),
    preflightCleanup: noopPreflightCleanup(),
    executor: async (request) => {
      if (request.action === "Export") {
        const target = join(String(request.destinationRoot), "modules");
        mkdirSync(target, { recursive: true });
        for (const file of readdirSync(binary)) cpSync(join(binary, file), join(target, file));
      } else if (request.action === "Import") {
        for (const name of request.moduleNames ?? [])
          cpSync(join(source, `${name}.bas`), join(binary, `${name}.bas`));
      } else throw new Error(`Unexpected external action: ${request.action}`);
      return {
        exitCode: 0,
        stdout:
          'DYSFLOW_RESULT {"ok":true,"exported":["Probe"],"imported":["Probe"],"warnings":[]}',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    },
  });
  return { adapter, sourceFile, binaryFile, code };
}

type SyncData = {
  ok: boolean;
  postSync: { missingInBinary: unknown[]; actionable: { total: number } };
  plan: { toImport: string[] };
  execution: { chunksExecuted: number } | null;
  recommendation: string;
};
async function sync(adapter: VbaSyncAdapter, input: Record<string, unknown>) {
  const result = await adapter.execute("sync_binary", input);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.data as SyncData;
}

describe("issue 1817, live sync evidence at the external I/O port", () => {
  it("reports the persisted post-import state and repeats without another mutation", async () => {
    const { adapter, sourceFile, binaryFile } = fixture();
    const applied = await sync(adapter, { direction: "src-to-binary", apply: true });
    expect(readFileSync(binaryFile)).toEqual(readFileSync(sourceFile));
    expect(applied.postSync.missingInBinary).toEqual([]);
    expect(applied.postSync.actionable.total).toBe(0);
    expect(applied.recommendation).toBe("no_action");
    const repeated = await sync(adapter, { direction: "src-to-binary", apply: true });
    expect(repeated.execution?.chunksExecuted ?? 0).toBe(0);
    expect(repeated.postSync.actionable.total).toBe(0);
  });

  it("sees source edits outside Dysflow after a clean preview in the same process", async () => {
    const { adapter, sourceFile, binaryFile, code } = fixture();
    writeFileSync(binaryFile, code);
    const first = await sync(adapter, { direction: "src-to-binary", apply: false });
    expect(first.plan.toImport).toEqual([]);
    writeFileSync(sourceFile, `${code}Public Sub Added()\nEnd Sub\n`);
    const next = await sync(adapter, { direction: "src-to-binary", apply: false });
    expect(next.plan.toImport).toEqual(["Probe"]);
    expect(readFileSync(binaryFile, "utf8")).toBe(code);
  });

  it("preserves an unsuccessful workflow outcome when the requested direction cannot resolve it", async () => {
    const { adapter, sourceFile, code } = fixture();
    const result = await sync(adapter, { direction: "binary-to-src", apply: true });
    expect(result.postSync.missingInBinary).toEqual([{ moduleName: "Probe" }]);
    expect(result.ok).toBe(false);
    expect(readFileSync(sourceFile, "utf8")).toBe(code);
  });
});
