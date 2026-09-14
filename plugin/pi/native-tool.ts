import {
  renderDysflowCallText,
  renderDysflowResultText,
} from "./dysflow-tool-chrome.js";
import type { DysflowMcpPort, DysflowMcpResult } from "./dysflow-mcp-client.js";

export type DysflowFacadeInput = {
  tool: string;
  args?: Record<string, unknown>;
};

type PiContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

type ToolDetails = { mcpResult: DysflowMcpResult };
type ToolExecutionResult = { content: PiContent[]; details: ToolDetails };
type ToolUpdate = (result: ToolExecutionResult) => void;

function toPiContent(content: DysflowMcpResult["content"]): PiContent[] {
  return content.map((entry) => {
    if (entry.type === "text" && typeof entry.text === "string") {
      return { type: "text" as const, text: entry.text };
    }
    if (
      entry.type === "image" &&
      typeof entry.data === "string" &&
      typeof entry.mimeType === "string"
    ) {
      return {
        type: "image" as const,
        data: entry.data,
        mimeType: entry.mimeType,
      };
    }
    return { type: "text" as const, text: JSON.stringify(entry) };
  });
}

type NativeToolOptions = Pick<DysflowMcpPort, "callTool"> & {
  setStatus?: (text: string | undefined) => void;
};

export function createDysflowNativeTool(options: NativeToolOptions) {
  return {
    name: "dysflow",
    label: "Dysflow",
    description:
      "Call one Dysflow MCP operation through the Pi-native facade. Use bootstrap first, schema(view=index) for discovery, and pass the selected operation name plus its arguments.",
    promptSnippet: "Call Dysflow Access/VBA operations with native compact rendering",
    promptGuidelines: [
      "Use dysflow for Dysflow operations; call bootstrap before static diagnosis and schema with view=index before selecting unfamiliar operations.",
    ],
    async execute(
      _toolCallId: string,
      params: DysflowFacadeInput,
      signal?: AbortSignal,
      onUpdate?: ToolUpdate,
    ): Promise<ToolExecutionResult> {
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(params.tool)) {
        throw new Error(
          "Dysflow operation names must contain only lowercase letters, digits, and underscores.",
        );
      }
      const args = params.args ?? {};
      options.setStatus?.("⚡ Dysflow · running");
      try {
        const result = await options.callTool(params.tool, args, {
          signal,
          onProgress: () => {
            onUpdate?.({
              content: [{ type: "text", text: "Dysflow operation in progress" }],
              details: { mcpResult: { content: [] } },
            });
          },
        });
        if (result.isError === true) {
          throw new Error("Dysflow operation failed.");
        }
        return {
          content: toPiContent(result.content),
          details: { mcpResult: result },
        };
      } finally {
        options.setStatus?.("⚡ Dysflow · ready");
      }
    },
    renderCallText: renderDysflowCallText,
    renderResultText: renderDysflowResultText,
  };
}
