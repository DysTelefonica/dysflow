#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASELINE = "scripts/baselines/mcp-context-budget.json";
const DEFAULT_FIXTURE = "scripts/fixtures/mcp-context-budget";
const DEFAULT_TIMEOUT_MS = 30_000;
const PROTOCOL_VERSION = "2025-03-26";

export function canonicalJson(value) {
  return JSON.stringify(sortJson(value));
}

export function measureLogicalBytes(value) {
  return Buffer.byteLength(canonicalJson(value), "utf8");
}

export function summarizeContributors(entries, limit = 10) {
  const totals = new Map();
  for (const entry of entries) {
    const name = String(entry.name);
    const bytes = Number(entry.logicalBytes);
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new Error(`Contributor ${name} has invalid logical byte count.`);
    }
    totals.set(name, (totals.get(name) ?? 0) + bytes);
  }
  const total = [...totals.values()].reduce((sum, bytes) => sum + bytes, 0);
  return [...totals.entries()]
    .map(([name, logicalBytes]) => ({
      name,
      logicalBytes,
      share: total === 0 ? 0 : roundSix(logicalBytes / total),
    }))
    .sort(
      (left, right) =>
        right.logicalBytes - left.logicalBytes || compareStrings(left.name, right.name),
    )
    .slice(0, limit);
}

export function compareBudget(current, baseline) {
  const differences = [];
  walkNumbers(current, baseline, [], differences);
  return differences;
}

export async function measureContextBudget({
  runtimePath = "dist/cli/index.js",
  fixturePath = DEFAULT_FIXTURE,
  cwd = process.cwd(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const runtime = resolve(cwd, runtimePath);
  const fixture = resolve(cwd, fixturePath);
  if (!existsSync(runtime)) throw new Error(`Built runtime not found: ${runtime}`);
  if (!existsSync(fixture)) throw new Error(`Deterministic fixture not found: ${fixture}`);

  const childEnv = { ...process.env, DYSFLOW_HOME: fixture };
  delete childEnv.DYSFLOW_ACCESS_PASSWORD;
  delete childEnv.ACCESS_VBA_PASSWORD;
  delete childEnv.DYSFLOW_BACKEND_PASSWORD;
  const child = spawn(process.execPath, [runtime, "mcp", "--disable-writes"], {
    cwd: fixture,
    // The fixture has no Access paths and the command is read-only. Removing
    // password variables prevents ambient host configuration from changing
    // the result or leaking credentials into the child process.
    env: childEnv,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const client = createJsonRpcClient(child, timeoutMs);
  try {
    await client.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "dysflow-context-budget", version: "1" },
    });
    client.notify("notifications/initialized");

    const toolsList = await client.request("tools/list", {});
    const tools = toolsList.parsed?.result?.tools;
    if (!Array.isArray(tools) || tools.length === 0) {
      throw new Error("stdio tools/list returned no tools; refusing to score an empty surface.");
    }

    const bootstrap = await client.request("tools/call", {
      name: "bootstrap",
      arguments: {},
    });
    // `view: "full"` is explicit because #1483 inverted the default: an omitted
    // view yields the compact snapshot, so this metric silently measured the same
    // payload as `getCapabilitiesCompact` and left the full surface ungated.
    const getCapabilities = await client.request("tools/call", {
      name: "get_capabilities",
      arguments: { projectId: "context-budget", view: "full" },
    });
    const getCapabilitiesCompact = await client.request("tools/call", {
      name: "get_capabilities",
      arguments: {
        projectId: "context-budget",
        compact: true,
        include: ["tools", "sharedBlockSupport", "effectiveDryRunDefault", "migrationNotes"],
      },
    });
    // `view: "full"` is explicit because #1485 made the view mandatory: an omitted
    // view returns a SCHEMA_VIEW_REQUIRED error envelope, so this metric measured
    // the error (198 bytes) instead of the full catalog it names.
    const schemaFull = await client.request("tools/call", {
      name: "schema",
      arguments: { projectId: "context-budget", view: "full" },
    });
    const schemaCompact = await client.request("tools/call", {
      name: "schema",
      arguments: { projectId: "context-budget", view: "compact" },
    });
    const schemaIndex = await client.request("tools/call", {
      name: "schema",
      arguments: { projectId: "context-budget", view: "index", phase: "bootstrap" },
    });

    const descriptions = tools.map((tool) => ({
      name: tool.name,
      logicalBytes: measureLogicalBytes(tool.description ?? ""),
    }));
    const inputSchemas = tools.map((tool) => ({
      name: tool.name,
      logicalBytes: measureLogicalBytes(tool.inputSchema ?? {}),
    }));
    const metadata = tools.map((tool) => {
      const { description: _description, inputSchema: _inputSchema, ...rest } = tool;
      return { name: tool.name, logicalBytes: measureLogicalBytes(rest) };
    });

    const descriptionsByTool = [];
    const describeFrames = [];
    const describeSummaryFrames = [];
    for (const tool of tools) {
      const frame = await client.request("tools/call", {
        name: "describe_tool",
        arguments: { projectId: "context-budget", toolName: tool.name },
      });
      describeFrames.push(frame);
      descriptionsByTool.push({
        name: tool.name,
        logicalBytes: measureLogicalBytes(extractPayload(frame.parsed?.result)),
      });
      describeSummaryFrames.push(
        await client.request("tools/call", {
          name: "describe_tool",
          arguments: {
            projectId: "context-budget",
            toolName: tool.name,
            sections: ["summary", "parameters"],
          },
        }),
      );
    }

    const fullPayload = extractPayload(schemaFull.parsed?.result);
    const compactPayload = extractPayload(schemaCompact.parsed?.result);
    const indexPayload = extractPayload(schemaIndex.parsed?.result);
    const measures = {
      toolsList: measureFrame(toolsList),
      bootstrap: measureFrame(bootstrap),
      getCapabilities: measureFrame(getCapabilities),
      getCapabilitiesCompact: measureFrame(getCapabilitiesCompact),
      schemaFull: measureFrame(schemaFull),
      schemaCompact: measureFrame(schemaCompact),
      schemaIndex: measureFrame(schemaIndex),
      describeTool: aggregateFrames(describeFrames),
      describeToolSelected: aggregateFrames(describeSummaryFrames),
    };
    const parity = buildParity(tools, fullPayload, indexPayload, describeFrames);

    return {
      schemaVersion: 1,
      runtime: {
        version: await readRuntimeVersion(runtime),
        commit: readCommit(cwd),
        runtimePath: relative(cwd, runtime).replaceAll("\\", "/"),
      },
      toolCount: tools.length,
      metrics: measures,
      contributors: {
        inputSchemas: summarizeContributors(inputSchemas),
        descriptions: summarizeContributors(descriptions),
        metadata: summarizeContributors(metadata),
        describeTool: summarizeContributors(descriptionsByTool),
        schemaFull: summarizeSchemaTools(fullPayload),
        schemaCompact: summarizeSchemaTools(compactPayload),
        schemaIndex: summarizeSchemaTools(indexPayload),
      },
      parity,
      tokenizerEstimates: null,
      providerClientObservations: {
        note: "Logical JSON bytes and exact stdio wire bytes are provider/client-neutral measurements; token estimates are intentionally not universalized.",
      },
    };
  } finally {
    child.kill();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const report = await measureContextBudget({
    runtimePath: args.runtime,
    fixturePath: args.fixture,
    cwd,
    timeoutMs: args.timeoutMs,
  });
  const baselinePath = resolve(cwd, args.baseline);
  let violations = [];
  if (!args.writeBaseline) {
    if (!existsSync(baselinePath)) throw new Error(`Baseline not found: ${baselinePath}`);
    const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
    violations = compareBudget(report.metrics, baseline.metrics);
    if (violations.length > 0) {
      for (const violation of violations) {
        console.error(
          `MCP context budget grew: ${violation.metric} baseline=${violation.baseline} current=${violation.current}`,
        );
      }
    }
  } else {
    await mkdir(dirname(baselinePath), { recursive: true });
    await writeFile(
      baselinePath,
      `${JSON.stringify({ ...report, baseline: { generatedFrom: report.runtime } }, null, 2)}\n`,
      "utf8",
    );
  }
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.report) await writeFile(resolve(cwd, args.report), output, "utf8");
  process.stdout.write(output);
  if (violations.length > 0) process.exitCode = 1;
}

function parseArgs(args) {
  const values = {
    runtime: "dist/cli/index.js",
    baseline: DEFAULT_BASELINE,
    fixture: DEFAULT_FIXTURE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    report: undefined,
    writeBaseline: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--write-baseline") {
      values.writeBaseline = true;
      continue;
    }
    const [flag, inline] = arg.split("=", 2);
    if (!["--runtime", "--baseline", "--fixture", "--timeout-ms", "--report"].includes(flag)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    const value = inline ?? args[++index];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === "--runtime") values.runtime = value;
    if (flag === "--baseline") values.baseline = value;
    if (flag === "--fixture") values.fixture = value;
    if (flag === "--timeout-ms") values.timeoutMs = Number(value);
    if (flag === "--report") values.report = value;
  }
  return values;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }
  return value;
}

function walkNumbers(current, baseline, path, differences) {
  if (typeof current === "number" && typeof baseline === "number") {
    if (current > baseline) differences.push({ metric: path.join("."), baseline, current });
    return;
  }
  if (
    current === null ||
    typeof current !== "object" ||
    baseline === null ||
    typeof baseline !== "object"
  )
    return;
  for (const key of Object.keys(baseline).sort()) {
    if (Object.hasOwn(current, key))
      walkNumbers(current[key], baseline[key], [...path, key], differences);
  }
}

function measureFrame(frame) {
  return {
    logicalBytes: measureLogicalBytes(extractPayload(frame.parsed?.result)),
    wireBytes: frame.wireBytes,
  };
}

function aggregateFrames(frames) {
  return frames.reduce(
    (total, frame) => {
      const measured = measureFrame(frame);
      return {
        logicalBytes: total.logicalBytes + measured.logicalBytes,
        wireBytes: total.wireBytes + measured.wireBytes,
      };
    },
    { logicalBytes: 0, wireBytes: 0 },
  );
}

function summarizeSchemaTools(payload) {
  const tools = Array.isArray(payload?.tools) ? payload.tools : [];
  return summarizeContributors(
    tools.map((tool) => ({ name: tool.name, logicalBytes: measureLogicalBytes(tool) })),
  );
}

export function extractPayload(result) {
  const structured = result?.structuredContent;
  if (structured !== null && typeof structured === "object" && !Array.isArray(structured)) {
    const payload = stripEnvelopeMetadata(structured);
    if (Object.keys(payload).length > 0) return payload;
  }
  const content = result?.content;
  if (Array.isArray(content) && content.length === 1 && typeof content[0]?.text === "string") {
    try {
      return JSON.parse(content[0].text);
    } catch {
      return content[0].text;
    }
  }
  return result;
}

function stripEnvelopeMetadata(structured) {
  const {
    schemaVersion: _schemaVersion,
    content: _content,
    isError: _isError,
    ok: _ok,
    error: _error,
    ...payload
  } = structured;
  return payload;
}

function buildParity(tools, fullPayload, indexPayload, describeFrames) {
  const listNames = tools.map((tool) => tool.name).sort();
  const schemaNames = (Array.isArray(fullPayload?.tools) ? fullPayload.tools : [])
    .map((tool) => tool.name)
    .sort();
  const describedNames = describeFrames
    .map((frame) => extractPayload(frame.parsed?.result)?.name)
    .filter(Boolean)
    .sort();
  return {
    stdioToolsListVsSchemaFull: JSON.stringify(listNames) === JSON.stringify(schemaNames),
    stdioToolsListVsDescribeTool: JSON.stringify(listNames) === JSON.stringify(describedNames),
    toolsListCount: listNames.length,
    schemaFullCount: schemaNames.length,
    describeToolCount: describedNames.length,
    schemaIndexCount: Array.isArray(indexPayload?.tools) ? indexPayload.tools.length : 0,
  };
}

async function readRuntimeVersion(runtime) {
  const output = execFileSync(process.execPath, [runtime, "--version"], {
    encoding: "utf8",
  }).trim();
  return output.split(/\r?\n/).at(-1) ?? output;
}

function readCommit(cwd) {
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function roundSix(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createJsonRpcClient(child, timeoutMs) {
  let buffer = Buffer.alloc(0);
  const frames = [];
  let closed = false;
  let sequence = 0;
  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    for (;;) {
      const end = buffer.indexOf(0x0a);
      if (end < 0) return;
      const frame = buffer.subarray(0, end + 1);
      buffer = buffer.subarray(end + 1);
      try {
        frames.push({ wireBytes: frame.length, parsed: JSON.parse(frame.toString("utf8")) });
      } catch {
        throw new Error(`MCP stdio emitted invalid JSON: ${frame.toString("utf8")}`);
      }
    }
  });
  child.stderr.on("data", () => {});
  child.once("close", () => {
    closed = true;
  });

  return {
    async request(method, params) {
      const id = ++sequence;
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      const started = Date.now();
      for (;;) {
        const index = frames.findIndex((frame) => frame.parsed?.id === id);
        if (index >= 0) return frames.splice(index, 1)[0];
        if (closed) throw new Error(`MCP stdio closed before response to ${method}.`);
        if (Date.now() - started > timeoutMs)
          throw new Error(`Timed out waiting for MCP ${method}.`);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
      }
    },
    notify(method) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
