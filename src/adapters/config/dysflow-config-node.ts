import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import {
  type ConfigFileSystemPort,
  type DysflowConfig,
  type DysflowConfigInput,
  loadDysflowConfigAsyncWith,
  loadDysflowConfigWith,
} from "../../core/config/dysflow-config.js";
import type { OperationResult } from "../../core/contracts/index.js";
import { readJsonFileAsync, readJsonFileSync } from "../../core/utils/index.js";

/**
 * Node.js-backed {@link ConfigFileSystemPort}. This is the production default
 * the CLI/MCP composition root injects into the pure config loaders in core.
 */
export const nodeConfigFileSystem: ConfigFileSystemPort = {
  existsSync: (path) => existsSync(path),
  existsAsync: async (path) => {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  readJsonSync: <T>(path: string): T => readJsonFileSync<T>(path),
  readJsonAsync: <T>(path: string): Promise<T> => readJsonFileAsync<T>(path),
};

/** Convenience wrapper: load config from the real filesystem (sync). */
export function loadDysflowConfig(input: DysflowConfigInput = {}): OperationResult<DysflowConfig> {
  return loadDysflowConfigWith(input, nodeConfigFileSystem);
}

/** Convenience wrapper: load config from the real filesystem (async). */
export function loadDysflowConfigAsync(
  input: DysflowConfigInput = {},
): Promise<OperationResult<DysflowConfig>> {
  return loadDysflowConfigAsyncWith(input, nodeConfigFileSystem);
}
