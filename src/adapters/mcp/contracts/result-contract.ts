import { z } from "zod";

import type {
  ToolDataSchemaFragment,
  ToolErrorEnvelopeShape,
  ToolOutputMode,
  ToolResultContract,
  ToolResultMode,
} from "../schema-tool.js";

const STANDARD_ERROR_ENVELOPE_SHAPE = {
  code: { type: "string" },
  message: { type: "string" },
  rejectedFlag: { type: "string", optional: true },
  rejectedFlags: { type: "array", optional: true, items: { type: "string" } },
  toolCommitFlag: { type: "string", optional: true },
  remediation: { type: "string", optional: true },
  actualShape: { type: "object", optional: true },
  expectedShape: { type: "object", optional: true },
} as const satisfies ToolErrorEnvelopeShape;

export type ResultContractMetadata = {
  description?: string;
  modes?: readonly ToolResultMode[];
  outputModes?: readonly ToolOutputMode[];
  errorEnvelope?: { shape: ToolErrorEnvelopeShape };
};

export type ExecutableResultContract<TSchema extends z.ZodType = z.ZodType> = {
  kind: "dataSchema";
  schema: TSchema;
  introspectionSchema: ToolDataSchemaFragment;
  metadata: ResultContractMetadata & {
    errorEnvelope: { shape: ToolErrorEnvelopeShape };
  };
};

export type EnvelopeOnlyResultContract = {
  kind: "envelope-only";
  justification: string;
  metadata: {
    errorEnvelope: { shape: ToolErrorEnvelopeShape };
  };
};

export type AnyExecutableResultContract = ExecutableResultContract | EnvelopeOnlyResultContract;

export type InferResultPayload<TContract extends AnyExecutableResultContract> =
  TContract extends ExecutableResultContract<infer TSchema> ? z.output<TSchema> : never;

export function defineResultContract<TSchema extends z.ZodType>(
  definition: ResultContractMetadata & { schema: TSchema },
): ExecutableResultContract<TSchema> {
  const introspectionSchema = z.toJSONSchema(definition.schema, {
    target: "draft-2020-12",
    unrepresentable: "throw",
  }) as Record<string, unknown>;

  if (!isStructuredSchema(introspectionSchema)) {
    throw new TypeError("A result contract requires a structured object payload schema.");
  }

  const { schema, description, modes, outputModes } = definition;
  return {
    kind: "dataSchema",
    schema,
    introspectionSchema: stripSchemaDialect(introspectionSchema),
    metadata: {
      ...(description === undefined ? {} : { description }),
      ...(modes === undefined ? {} : { modes }),
      ...(outputModes === undefined ? {} : { outputModes }),
      errorEnvelope: definition.errorEnvelope ?? {
        shape: STANDARD_ERROR_ENVELOPE_SHAPE,
      },
    },
  };
}

export function defineEnvelopeOnlyResultContract(definition: {
  justification: string;
  errorEnvelope?: { shape: ToolErrorEnvelopeShape };
}): EnvelopeOnlyResultContract {
  const justification = definition.justification.trim();
  if (justification.length === 0) {
    throw new TypeError("An envelope-only result contract requires an explicit justification.");
  }
  return {
    kind: "envelope-only",
    justification,
    metadata: {
      errorEnvelope: definition.errorEnvelope ?? {
        shape: STANDARD_ERROR_ENVELOPE_SHAPE,
      },
    },
  };
}

export function toToolResultContract(contract: AnyExecutableResultContract): ToolResultContract {
  if (contract.kind === "envelope-only") {
    return {
      kind: "envelope-only",
      justification: contract.justification,
      errorEnvelope: contract.metadata.errorEnvelope,
    };
  }

  const { description, modes, outputModes, errorEnvelope } = contract.metadata;
  return {
    kind: "dataSchema",
    ...(description === undefined ? {} : { description }),
    dataSchema: contract.introspectionSchema,
    ...(modes === undefined ? {} : { modes }),
    ...(outputModes === undefined ? {} : { outputModes }),
    errorEnvelope,
  };
}

function stripSchemaDialect(schema: Record<string, unknown>): ToolDataSchemaFragment {
  const { $schema: _dialect, ...fragment } = schema;
  return fragment as ToolDataSchemaFragment;
}

function schemaVariants(
  schema: Record<string, unknown>,
  keyword: "anyOf" | "oneOf",
): Record<string, unknown>[] {
  const value = schema[keyword];
  return Array.isArray(value)
    ? value.filter(
        (variant): variant is Record<string, unknown> =>
          typeof variant === "object" && variant !== null,
      )
    : [];
}

function isStructuredSchema(schema: Record<string, unknown>): boolean {
  if (schema.type === "object" || schema.type === "array") return true;
  const variants = [...schemaVariants(schema, "anyOf"), ...schemaVariants(schema, "oneOf")];
  return variants.length > 0 && variants.every(isStructuredSchema);
}
