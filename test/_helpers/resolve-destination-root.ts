import type { ConfigFileSystemPort } from "../../src/core/config/dysflow-config.js";
import {
  type ResolvedDestinationRoot,
  resolveExecutionTarget,
} from "../../src/core/config/execution-target.js";

const unusedFileSystem: ConfigFileSystemPort = {
  existsSync: () => false,
  existsAsync: async () => false,
  readJsonSync: <T>(): T => {
    throw new Error("test destination-root resolver must not read config");
  },
  readJsonAsync: <T>(): Promise<T> =>
    Promise.reject(new Error("test destination-root resolver must not read config")),
};

/** Builds typed test fixtures through the same production resolver as runtime code. */
export async function resolveDestinationRootForTest(
  destinationRoot: string,
): Promise<ResolvedDestinationRoot> {
  const result = await resolveExecutionTarget(
    { destinationRoot },
    {
      env: {},
      cwd: process.cwd(),
      accessPath: "test.accdb",
      fileSystem: unusedFileSystem,
    },
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data.destinationRoot;
}
