/**
 * Issue #979 — idempotency contract for `verify_code` (read-only drift detector).
 *
 * Consumers run `verify_code` repeatedly during a sync loop. The contract is:
 *
 *   IDEM-1 — N=10 sequential calls return byte-identical content.
 *   IDEM-2 — N=10 parallel calls return byte-identical content.
 *   IDEM-3 — The tool is read-only and never mutates the filesystem.
 *
 * `verify_code` requires resolved Access context (project config + .accdb).
 * For pure-FS idempotency we stub it with a deterministic pair so the
 * handler returns a stable `summaryStructured` shape on every call.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { diagnoseProjectConfig } from "../../src/adapters/config/project-config-diagnostic.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "dysflow-public-979-vc-"));
  writeFileSync(join(workdir, ".git"), "gitdir: fixture");
  mkdirSync(join(workdir, ".dysflow"));
  mkdirSync(join(workdir, "src"));
  writeFileSync(join(workdir, "app.accdb"), "");
  writeFileSync(
    join(workdir, ".dysflow", "project.json"),
    JSON.stringify({
      id: "app",
      accessPath: "app.accdb",
      destinationRoot: "src",
      capabilities: { allowWrites: true },
    }),
  );
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("idempotency: verify_code (issue #979)", () => {
  it("IDEM-1: 10 sequential calls return byte-identical content via vbaSyncToolService stub", async () => {
    const stable = {
      ok: true,
      data: {
        summaryStructured: { equal: 1, drifted: 0, missing: 0, unexpected: 0 },
        actionableDifferent: [],
        nonActionableDifferent: [],
        bulkImportable: [],
        bulkExportable: [],
      },
    };
    const execute = vi.fn(async () => stable as never);
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute },
        queryService: { execute },
        diagnosticsService: { run: execute },
        vbaSyncToolService: { execute },
      } as unknown as DysflowMcpServices,
      writes: true,
      cwd: workdir,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(workdir, input as Record<string, string>),
    });
    const tool = tools.find((t) => t.name === "verify_code");
    expect(tool).toBeDefined();

    const responses: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const result = await tool?.handler({ projectId: "app" });
      expect(result?.isError, `call #${i + 1} must succeed`).toBe(false);
      responses.push(result?.content[0]?.text ?? "");
    }
    const first = responses[0];
    expect(first).toBeDefined();
    for (const [index, text] of responses.entries()) {
      expect(text, `sequential call #${index + 1} byte-equality`).toBe(first);
    }
  });

  it("IDEM-2: 10 parallel calls return byte-identical content", async () => {
    const stable = {
      ok: true,
      data: { summaryStructured: { equal: 1, drifted: 0, missing: 0, unexpected: 0 } },
    };
    const execute = vi.fn(async () => stable as never);
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute },
        queryService: { execute },
        diagnosticsService: { run: execute },
        vbaSyncToolService: { execute },
      } as unknown as DysflowMcpServices,
      writes: true,
      cwd: workdir,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(workdir, input as Record<string, string>),
    });
    const tool = tools.find((t) => t.name === "verify_code");

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => tool?.handler({ projectId: "app" })),
    );
    const texts = responses.map((r) => r?.content[0]?.text ?? "");
    const first = texts[0];
    expect(first).toBeDefined();
    for (const [index, text] of texts.entries()) {
      expect(text, `parallel call #${index + 1} byte-equality`).toBe(first);
    }
  });

  it("IDEM-3: read-only — never mutates the project config file", async () => {
    const execute = vi.fn(async () => successResult({ summaryStructured: {} }));
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute },
        queryService: { execute },
        diagnosticsService: { run: execute },
        vbaSyncToolService: { execute },
      } as unknown as DysflowMcpServices,
      writes: true,
      cwd: workdir,
      projectConfigResolver: (input) =>
        diagnoseProjectConfig(workdir, input as Record<string, string>),
    });
    const tool = tools.find((t) => t.name === "verify_code");

    const { statSync } = await import("node:fs");
    const configPath = join(workdir, ".dysflow", "project.json");
    const before = statSync(configPath).mtimeMs;
    for (let i = 0; i < 10; i += 1) {
      await tool?.handler({ projectId: "app" });
    }
    const after = statSync(configPath).mtimeMs;
    expect(after).toBe(before);
  });
});
