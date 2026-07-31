import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type VbaManagerExecutionRequest,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";

describe("sync_binary adapter forwarding (#1284)", () => {
  let root: string;
  let sourceRoot: string;
  let requests: VbaManagerExecutionRequest[];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dysflow-sync-forward-1284-"));
    sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "modules"), { recursive: true });
    await writeFile(join(sourceRoot, "modules", "Module1.bas"), "same", "utf8");
    requests = [];
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function buildAdapter() {
    return new VbaSyncAdapter({
      executor: async (request) => {
        requests.push(request);
        await mkdir(join(request.destinationRoot, "modules"), { recursive: true });
        await writeFile(join(request.destinationRoot, "modules", "Module1.bas"), "same", "utf8");
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 1, timedOut: false };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "C:/db/front.accdb",
      destinationRoot: sourceRoot,
      env: {},
    });
  }

  it("omits an explicit empty moduleNames list at the production verify boundary", async () => {
    const result = await buildAdapter().execute("sync_binary", {
      moduleNames: [],
      dryRun: true,
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ moduleNames: [], moduleNamesProvided: false });
  });

  it("preserves a non-empty moduleNames list for focused verification", async () => {
    const result = await buildAdapter().execute("sync_binary", {
      moduleNames: ["Module1"],
      dryRun: true,
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      moduleNames: ["Module1"],
      moduleNamesProvided: true,
    });
  });
});
