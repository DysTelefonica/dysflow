import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { createDysflowMcpClient } from "./dysflow-mcp-client.js";
import type { DysflowFacadeInput } from "./native-tool.js";
import { createDysflowNativeTool } from "./native-tool.js";

export default function dysflowPiExtension(pi: ExtensionAPI): void {
  let cwd = process.cwd();
  let updateStatus: ((text: string | undefined) => void) | undefined;
  const client = createDysflowMcpClient({ cwd: () => cwd });
  const native = createDysflowNativeTool({
    callTool: client.callTool,
    setStatus: (text) => updateStatus?.(text),
  });

  pi.registerTool({
    name: native.name,
    label: native.label,
    description: native.description,
    promptSnippet: native.promptSnippet,
    promptGuidelines: native.promptGuidelines,
    parameters: Type.Object({
      tool: Type.String({ description: "Exact Dysflow MCP operation name" }),
      args: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: "Arguments validated by the live Dysflow MCP operation schema",
        }),
      ),
    }),
    renderShell: "self",
    execute: native.execute,
    renderCall(args, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text();
      const input = args as DysflowFacadeInput;
      text.setText(theme.fg("toolTitle", native.renderCallText(input.tool, input.args)));
      return text;
    },
    renderResult(result, options, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text();
      const input = context.args as DysflowFacadeInput;
      const rendered = native.renderResultText(input.tool, result, {
        expanded: options.expanded,
        isPartial: options.isPartial,
        isError: context.isError,
      });
      const color = context.isError ? "error" : options.isPartial ? "warning" : "success";
      text.setText(theme.fg(color, rendered));
      return text;
    },
  });

  pi.on("session_start", (_event, ctx) => {
    cwd = ctx.cwd;
    updateStatus = (text) => ctx.ui.setStatus("dysflow", text);
    updateStatus("⚡ Dysflow · ready");
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    updateStatus?.(undefined);
    updateStatus = undefined;
    await client.close().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Dysflow MCP shutdown: ${message}`, "warning");
    });
  });
}
