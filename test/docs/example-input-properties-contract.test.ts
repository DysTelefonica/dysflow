import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools";
import { successResult } from "../../src/core/contracts/index";

const skillRoot = path.resolve("skills/dysflow-usage");
const examplesRoot = path.join(skillRoot, "assets/examples");
const verifier = path.join(skillRoot, "assets/scripts/verify-examples-vs-runtime.ps1");
const temporaryRoots: string[] = [];

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}

class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}

class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Dysflow example input-property parity (#1613)", () => {
  it("documents the exact live inputSchema.properties set for every advertised tool", async () => {
    const captureDirectory = await writeCapture();
    const reportPath = path.join(captureDirectory, "report.json");
    const result = runVerifier(skillRoot, captureDirectory, reportPath);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const report = JSON.parse(await readFile(reportPath, "utf8")) as { findings: unknown[] };
    expect(report.findings).toEqual([]);
  });

  it("returns a typed finding when a documented property is missing", async () => {
    const captureDirectory = await writeCapture();
    const isolatedSkillRoot = await mkdtemp(path.join(tmpdir(), "dysflow-usage-1613-"));
    temporaryRoots.push(isolatedSkillRoot);
    const isolatedExamples = path.join(isolatedSkillRoot, "assets/examples");
    await mkdir(isolatedExamples, { recursive: true });
    await writeFile(
      path.join(isolatedSkillRoot, "SKILL.md"),
      await readFile(path.join(skillRoot, "SKILL.md")),
    );
    await writeFile(
      path.join(isolatedSkillRoot, "assets/write-flags-matrix.md"),
      await readFile(path.join(skillRoot, "assets/write-flags-matrix.md")),
    );
    for (const file of await readdir(examplesRoot)) {
      if (!file.endsWith(".md")) continue;
      await writeFile(
        path.join(isolatedExamples, file),
        await readFile(path.join(examplesRoot, file)),
      );
    }
    const target = path.join(isolatedExamples, "get-capabilities.md");
    const content = await readFile(target, "utf8");
    await writeFile(target, content.replace(/^\s*- `toolNames`\r?\n/m, ""), "utf8");
    const reportPath = path.join(captureDirectory, "missing-property-report.json");

    const result = runVerifier(isolatedSkillRoot, captureDirectory, reportPath);
    expect(result.status).toBe(1);
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      findings: Array<{ code: string; tool: string; detail: string }>;
    };
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "MISSING_INPUT_PROPERTY",
        tool: "get_capabilities",
        detail: expect.stringContaining("toolNames"),
      }),
    );
  });
});

async function writeCapture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "dysflow-capture-1613-"));
  temporaryRoots.push(root);
  const packageVersion = (JSON.parse(await readFile("package.json", "utf8")) as { version: string })
    .version;
  const tools = createDysflowMcpTools({
    services: {
      vbaService: new FakeVbaService(),
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
    },
  }).map((tool) => {
    const inputSchema = tool.inputSchema as
      | {
          properties?: Record<
            string,
            { type?: unknown; nullable?: unknown; runtimeRequired?: unknown }
          >;
          required?: unknown;
          anyOf?: unknown;
        }
      | undefined;
    if (inputSchema === undefined) throw new Error(`${tool.name} has no input schema`);
    return {
      name: tool.name,
      access: "apply" in (inputSchema.properties ?? {}) ? "conditional-write" : "read-only",
      advertised: !tool.hidden,
      inputSchema: {
        properties: Object.fromEntries(
          Object.entries(inputSchema.properties ?? {}).map(([name, schema]) => [
            name,
            {
              type: schema.type,
              nullable: schema.nullable,
              runtimeRequired: schema.runtimeRequired,
            },
          ]),
        ),
        required: inputSchema.required,
        anyOf: inputSchema.anyOf,
      },
    };
  });
  await writeFile(
    path.join(root, "full.json"),
    JSON.stringify({ schemaVersion: "dysflow.result/v1", tools }),
    "utf8",
  );
  await writeFile(
    path.join(root, "index.json"),
    JSON.stringify({ schemaVersion: "dysflow.result/v1", tools }),
    "utf8",
  );
  await writeFile(
    path.join(root, "bootstrap.json"),
    JSON.stringify({ schemaVersion: "dysflow.result/v1", adapterVersion: packageVersion }),
    "utf8",
  );
  return root;
}

function runVerifier(root: string, captures: string, report: string) {
  return spawnSync(
    "pwsh",
    [
      "-NoProfile",
      "-File",
      verifier,
      "-Path",
      root,
      "-CapturesDir",
      captures,
      "-SkipLive",
      "-OutputJson",
      report,
    ],
    { encoding: "utf8" },
  );
}
