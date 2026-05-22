import { handleRelinkDirectoryCommand } from "./access/relink-directory.js";
import type { CommandHandler } from "./types.js";

export const handleAccessCommand: CommandHandler = async (args, context) => {
  const [subcommand, ...rest] = args;
  if (subcommand === "relink-directory") {
    return handleRelinkDirectoryCommand(rest, context);
  }
  return {
    exitCode: 1,
    stdout: "",
    stderr: `Unknown access subcommand: ${subcommand ?? "(none)"}\nUsage: dysflow access relink-directory --root <path> [options]`,
  };
};
