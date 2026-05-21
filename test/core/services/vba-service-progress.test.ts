import { describe, expect, it, vi } from "vitest";
import { AccessVbaService } from "../../../src/core/services/vba-service.js";
import { successResult, type OperationResult } from "../../../src/core/contracts/index.js";
import type { AccessRunner, AccessRunnerOperation, AccessRunnerRunOptions } from "../../../src/core/runner/access-runner.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessVbaResult } from "../../../src/core/services/vba-service.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: false,
  accessDbPath: "C:/data/test.accdb",
  timeoutMs: 1_500,
  processTimeoutMs: 1_500,
};

class CapturingRunner implements AccessRunner {
  public capturedOptions: AccessRunnerRunOptions[] = [];
  public capturedOperations: AccessRunnerOperation[] = [];

  async run<TData>(operation: AccessRunnerOperation, _config?: DysflowConfig, options?: AccessRunnerRunOptions): Promise<OperationResult<TData>> {
    this.capturedOperations.push(operation);
    this.capturedOptions.push(options ?? {});
    return successResult({} as TData);
  }
}

describe("AccessVbaService — onProgress forwarding", () => {
  it("forwards the onProgress callback to runner.run as options.onProgress", async () => {
    const runner = new CapturingRunner();
    const service = new AccessVbaService({ runner, config });
    const onProgress = vi.fn();

    await service.execute({ procedureName: "DoWork", arguments: [] }, onProgress);

    expect(runner.capturedOptions).toHaveLength(1);
    expect(runner.capturedOptions[0]!.onProgress).toBe(onProgress);
  });

  it("calls runner.run without onProgress when no callback is supplied", async () => {
    const runner = new CapturingRunner();
    const service = new AccessVbaService({ runner, config });

    await service.execute({ procedureName: "DoWork", arguments: [] });

    expect(runner.capturedOptions).toHaveLength(1);
    expect(runner.capturedOptions[0]!.onProgress).toBeUndefined();
  });
});
