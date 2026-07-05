import type { OperationResult } from "../../core/contracts/index.js";
import type { VbaManagerExecutor } from "./vba-sync-adapter.js";
import type { DirectMapping } from "./vba-sync-types.js";

export type FormsExecutionTarget = {
  destinationRoot: string;
  projectRoot?: string;
};

export type ManagedFormSource = {
  sourcePath: string;
  destinationRoot: string;
  moduleName: string;
};

/**
 * Shape surfaced in error.details.rollback so consumers can tell what happened.
 * #692 — extended to disambiguate new-target creation from genuine restore.
 *
 * Cases:
 * - target existed, restore succeeded:      { attempted:true, applied:true, targetExisted:true }
 * - target existed, restore failed:         { attempted:true, applied:false, targetExisted:true, error:{message} }
 * - target did NOT exist, restore succeeded: { attempted:true, applied:true, targetExisted:false,
 *                                              restoredState:"empty-placeholder", requiresManualCleanup:true }
 * - target did NOT exist, restore failed:   { attempted:true, applied:false, targetExisted:false,
 *                                            restoredState:"empty-placeholder", requiresManualCleanup:true,
 *                                            error:{message} }
 */
export type RollbackOutcome =
  | { attempted: true; applied: true; targetExisted: true }
  | { attempted: true; applied: false; targetExisted: true; error: { message: string } }
  | {
      attempted: true;
      applied: true;
      targetExisted: false;
      restoredState: "empty-placeholder";
      requiresManualCleanup: true;
    }
  | {
      attempted: true;
      applied: false;
      targetExisted: false;
      restoredState: "empty-placeholder";
      requiresManualCleanup: true;
      error: { message: string };
    };

export interface VbaFormsOrchestrator {
  executor: VbaManagerExecutor;
  env: Record<string, string | undefined>;
  cwd: string;
  resolveExecutionTarget(params: Record<string, unknown>): Promise<OperationResult<unknown>>;
  validateStrictContext(
    params: Record<string, unknown>,
    target: unknown,
  ): OperationResult<undefined>;
  executeMappedTool(
    toolName: string,
    params: Record<string, unknown>,
    mapping: DirectMapping,
  ): Promise<OperationResult<unknown>>;
}
