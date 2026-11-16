import { resolveTestRunsRoot, TestRunStore } from "../../core/test-runs/test-run-store.js";
import { nodeRunnerProcessProbe } from "./node-runner-process-probe.js";
import { nodeTestRunFileSystem } from "./node-test-run-file-system.js";

export { nodeRunnerProcessProbe } from "./node-runner-process-probe.js";
export { nodeTestRunFileSystem } from "./node-test-run-file-system.js";
export {
  projectRootForRunDir,
  resolveCliEntryPoint,
  spawnDetachedTestRunner,
} from "./spawn-detached-test-runner.js";

/** The production detached test-run store of one project (#1993). */
export function createNodeTestRunStore(projectRoot: string): TestRunStore {
  return new TestRunStore({
    runsRoot: resolveTestRunsRoot(projectRoot),
    fileSystem: nodeTestRunFileSystem,
    processProbe: nodeRunnerProcessProbe,
  });
}
