import type { z } from "zod";

import type { AnyExecutableResultContract, InferResultPayload } from "./result-contract.js";

export type ToolContractMetadata = {
  description: string;
  [key: string]: unknown;
};

export type ExecutableToolContract<
  TInputSchema extends z.ZodType,
  TResultContract extends AnyExecutableResultContract,
> = {
  inputSchema: TInputSchema;
  resultContract: TResultContract;
  metadata: ToolContractMetadata;
  handler: (
    input: z.output<TInputSchema>,
  ) => Promise<InferResultPayload<TResultContract>> | InferResultPayload<TResultContract>;
};

export function defineToolContract<
  TInputSchema extends z.ZodType,
  TResultContract extends AnyExecutableResultContract,
>(
  definition: ExecutableToolContract<TInputSchema, TResultContract>,
): ExecutableToolContract<TInputSchema, TResultContract> {
  return definition;
}
