import type { DysflowConfig } from "../config/dysflow-config.js";
import type { AccessVbaRequest, OperationResult } from "../contracts/index.js";
import { successResult } from "../contracts/index.js";
import {
  type AccessRunner,
  type AccessRunnerProgressCallback,
  ensureResultShape,
} from "../runner/access-runner.js";
import { isRecord } from "../utils/index.js";

/**
 * Real-execution result shape. PowerShell returns the procedure's return
 * value (or nothing for `Sub` procedures). All other fields from the Access
 * runner are flattened onto the `OperationResult` envelope (diagnostics,
 * durationMs, operation metadata) — `data` stays the slim value carrier.
 */
type AccessVbaExecutionResult = {
  returnValue?: unknown;
};

/**
 * Plan-only result shape for `dryRun: true` requests. Mirrors the import-
 * plan shape used by `VbaModulesAdapter.planImport` (`import_all` /
 * `import_modules` dry-run path): the consumer is told WHAT would have run,
 * without ever spawning PowerShell or opening Access. The #748 fix closes
 * the contract-truth gap where `AccessVbaService.execute({dryRun:true})`
 * silently ignored the flag and still invoked the runner.
 */
type AccessVbaPlan = {
  dryRun: true;
  willExecute: false;
  willModifyAccess: false;
  procedureName: string;
  moduleName: string;
};

/**
 * The runtime result of `AccessVbaService.execute(...)`. Two shapes, one per
 * branch the service can take:
 *
 *  - real execution → `{ returnValue?: unknown }` (Access runner output)
 *  - dry-run plan    → `{ dryRun: true, willExecute: false, willModifyAccess: false, procedureName, moduleName }`
 *
 * Consumers branch on `data.dryRun === true` to render a "would have run"
 * preview without parsing the content text.
 */
export type AccessVbaResult = AccessVbaExecutionResult | AccessVbaPlan;

export type AccessVbaServiceOptions = {
  runner: AccessRunner;
  config: DysflowConfig;
};

export class AccessVbaService {
  private readonly runner: AccessRunner;
  private readonly config: DysflowConfig;

  constructor(options: AccessVbaServiceOptions) {
    this.runner = options.runner;
    this.config = options.config;
  }

  async execute(
    request: AccessVbaRequest,
    onProgress?: AccessRunnerProgressCallback,
  ): Promise<OperationResult<AccessVbaResult>> {
    // Round-3 Item 2 (#748) — honor the documented `dryRun: true` escape
    // hatch. Previously this branch delegated to the runner, which spawned
    // PowerShell even though no Access side-effect was intended. With
    // `allowedProcedures` configured the upstream `ensureProcedureAllowed`
    // gate lets `dryRun: true` through, so callers expected the service to
    // honor the flag and produce a plan; instead they got the
    // `OpenCurrentDatabase failed` PowerShell error. Returning the plan
    // shape here brings the service into line with the PR1a contract.
    if (request.dryRun === true) {
      return successResult<AccessVbaPlan>({
        dryRun: true,
        willExecute: false,
        willModifyAccess: false,
        procedureName: request.procedureName,
        moduleName: request.moduleName,
      });
    }

    const result = await this.runner.run<AccessVbaExecutionResult>(
      { kind: "vba", request },
      this.config,
      {
        onProgress,
      },
    );
    return ensureResultShape(result, isRecord);
  }
}
