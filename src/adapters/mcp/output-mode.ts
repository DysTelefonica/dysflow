import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { supportsSharedOutputMode } from "../../shared/validation/schema-blocks.js";
import type { DysflowMcpTool, McpToolResult } from "./result-translation.js";

type OutputMode = "summary" | "file" | "full";

function requestedOutputMode(input: unknown): OutputMode {
  if (typeof input !== "object" || input === null) return "full";
  const value = (input as Record<string, unknown>).outputMode;
  return value === "summary" || value === "file" || value === "full" ? value : "full";
}

function structuralSummary(value: unknown): {
  kind: "array" | "object" | "scalar";
  itemCount: number;
  keys: string[];
} {
  if (Array.isArray(value)) {
    return { kind: "array", itemCount: value.length, keys: [] };
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const arrays = Object.values(record).filter(Array.isArray);
    return {
      kind: "object",
      itemCount: arrays.reduce((total, items) => total + items.length, 0),
      keys: Object.keys(record).sort(),
    };
  }
  return { kind: "scalar", itemCount: value === undefined || value === null ? 0 : 1, keys: [] };
}

async function projectOutput(
  toolName: string,
  mode: OutputMode,
  result: McpToolResult,
): Promise<McpToolResult> {
  if (mode === "full" || result.isError) return result;
  const text = result.content.map((item) => item.text).join("\n");
  if (mode === "summary") {
    const parsed: unknown = JSON.parse(text);
    return {
      ...result,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: true,
            outputMode: "summary",
            summary: structuralSummary(parsed),
            originalBytes: Buffer.byteLength(text, "utf8"),
          }),
        },
      ],
    };
  }

  const outputRoot = join(tmpdir(), "dysflow-output");
  await mkdir(outputRoot, { recursive: true });
  const filePath = join(outputRoot, `${toolName}-${randomUUID()}.json`);
  await writeFile(filePath, text, { encoding: "utf8", mode: 0o600 });
  return {
    ...result,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          ok: true,
          outputMode: "file",
          filePath,
          bytes: Buffer.byteLength(text, "utf8"),
        }),
      },
    ],
  };
}

/** Issue #1192 — make outputMode executable for every declared high-volume read tool. */
export function withSharedOutputModes(tools: readonly DysflowMcpTool[]): DysflowMcpTool[] {
  return tools.map((tool) => {
    if (!supportsSharedOutputMode(tool.name)) return tool;
    return {
      ...tool,
      handler: async (input, context) =>
        projectOutput(tool.name, requestedOutputMode(input), await tool.handler(input, context)),
    };
  });
}
