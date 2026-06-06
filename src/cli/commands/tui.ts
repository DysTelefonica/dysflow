import readline from "node:readline";
import { renderDashboard, renderIntegrationSelection } from "../tui/render.js";
import { handleDoctorCommand } from "./doctor.js";
import {
  type AgentName,
  ALL_AGENTS,
  applyIntegrationSelection,
  handleInstallCommand,
} from "./install.js";
import type { CliCommandContext, CliResult, TuiKey } from "./types.js";
import { PACKAGE_VERSION } from "./version.js";

export async function handleTuiCommand(
  args: readonly string[],
  context: CliCommandContext = {},
): Promise<CliResult> {
  if (context.tuiSelectedAgents !== undefined) {
    return (
      context.tuiApplyIntegrationSelection ??
      ((agents) => applyIntegrationSelection(agents, { env: context.env ?? process.env }))
    )(context.tuiSelectedAgents);
  }

  if (args.length > 0) {
    return (context.tuiHandleInstall ?? ((a, opts) => handleInstallCommand(a, opts)))(args, {
      env: context.env ?? process.env,
    });
  }

  const localVersion = context.localVersion ?? PACKAGE_VERSION;
  const latestVersion = context.latestVersion;
  const interactive =
    context.tuiInteractive ?? (process.stdin.isTTY === true && process.stdout.isTTY === true);

  if (!interactive) {
    return {
      exitCode: 0,
      stdout: renderDashboard({
        localVersion,
        latestVersion,
        cursor: 0,
      }),
      stderr: "",
    };
  }

  return runDashboardLoop({
    localVersion,
    latestVersion,
    readKey: context.readTuiKey ?? readProcessTuiKey,
    writeFrame: context.writeTuiFrame ?? writeProcessFrame,
    context,
  });
}

async function runDashboardLoop(options: {
  localVersion: string;
  latestVersion?: string;
  readKey: () => Promise<TuiKey>;
  writeFrame: (frame: string) => void;
  context: CliCommandContext;
}): Promise<CliResult> {
  let cursor = 0;
  const menuSize = 3;

  while (true) {
    options.writeFrame(
      renderDashboard({
        localVersion: options.localVersion,
        latestVersion: options.latestVersion,
        cursor,
      }),
    );

    const key = await options.readKey();
    if (key === "q") return { exitCode: 0, stdout: "", stderr: "" };
    if (key === "up") cursor = (cursor + menuSize - 1) % menuSize;
    if (key === "down") cursor = (cursor + 1) % menuSize;
    if (key === "enter" && cursor === 0) {
      return runIntegrationSelectionLoop(options);
    }
    if (key === "enter" && cursor === 1) {
      return handleDoctorCommand([], options.context);
    }
    if (key === "enter" && cursor === menuSize - 1) {
      return { exitCode: 0, stdout: "", stderr: "" };
    }
  }
}

async function runIntegrationSelectionLoop(options: {
  readKey: () => Promise<TuiKey>;
  writeFrame: (frame: string) => void;
  context: CliCommandContext;
}): Promise<CliResult> {
  let cursor = 0;
  const selected = new Set<AgentName>();

  while (true) {
    options.writeFrame(
      renderIntegrationSelection({
        agents: ALL_AGENTS,
        selectedAgents: [...selected],
        cursor,
      }),
    );

    const key = await options.readKey();
    if (key === "q") return { exitCode: 0, stdout: "", stderr: "" };
    if (key === "up") cursor = (cursor + ALL_AGENTS.length - 1) % ALL_AGENTS.length;
    if (key === "down") cursor = (cursor + 1) % ALL_AGENTS.length;
    if (key === "space") {
      const agent = ALL_AGENTS[cursor];
      if (agent !== undefined) {
        if (selected.has(agent)) {
          selected.delete(agent);
        } else {
          selected.add(agent);
        }
      }
    }
    if (key === "enter") {
      const agents = ALL_AGENTS.filter((agent) => selected.has(agent));
      return (
        options.context.tuiApplyIntegrationSelection ??
        ((selectedAgents) =>
          applyIntegrationSelection(selectedAgents, {
            env: options.context.env ?? process.env,
          }))
      )(agents);
    }
  }
}

function writeProcessFrame(frame: string): void {
  process.stdout.write("\x1b[2J\x1b[H");
  process.stdout.write(frame);
}

function readProcessTuiKey(): Promise<TuiKey> {
  return new Promise((resolve) => {
    const input = process.stdin;
    const wasRaw = input.isRaw;
    const wasPaused = input.isPaused();
    readline.emitKeypressEvents(input);
    if (input.isTTY) input.setRawMode(true);
    input.resume();

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      input.off("close", onClose);
      input.off("end", onClose);
      if (input.isTTY) input.setRawMode(wasRaw);
      if (wasPaused) input.pause();
    };

    const onClose = (): void => {
      cleanup();
      resolve("q");
    };

    const onKeypress = (_chunk: string, key: readline.Key): void => {
      if (key.ctrl === true && key.name === "c") {
        cleanup();
        resolve("q");
        return;
      }

      const mapped = mapKeypress(key);
      if (mapped !== undefined) {
        cleanup();
        resolve(mapped);
      }
    };

    input.on("keypress", onKeypress);
    input.once("close", onClose);
    input.once("end", onClose);
  });
}

function mapKeypress(key: readline.Key): TuiKey | undefined {
  if (key.name === "up") return "up";
  if (key.name === "down") return "down";
  if (key.name === "return") return "enter";
  if (key.name === "space") return "space";
  if (key.name === "escape" || key.name === "q") return "q";
  return undefined;
}
