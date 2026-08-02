/**
 * Stable discriminator for the agent-facing dysflow MCP response contract.
 *
 * Keep the literal independent from the runtime/package version. Additive
 * fields do not require a schema-version bump.
 */
export const RESULT_SCHEMA_VERSION = "dysflow.result/v1" as const;
export type ResultSchemaVersion = typeof RESULT_SCHEMA_VERSION;

type TextContent = { type: "text"; text: string };

export type ResponseEnvelopeShape = {
  schemaVersion?: ResultSchemaVersion;
  content: readonly TextContent[];
  isError: boolean;
  ok?: boolean;
  error?: unknown;
  structuredContent?: Record<string, unknown>;
};

/**
 * Stamp the canonical MCP result envelope. This is the compatibility helper
 * used by tool handlers and error builders.
 */
export function withResponseEnvelope<T extends ResponseEnvelopeShape>(result: T): T {
  if (result.schemaVersion === RESULT_SCHEMA_VERSION) return result;
  return { ...result, schemaVersion: RESULT_SCHEMA_VERSION };
}

/**
 * Stamp the wire projection in addition to the canonical envelope.
 *
 * Some clients flatten the MCP result and discard extension fields. Publish a
 * standard `structuredContent` projection at the final stdio seam so those
 * clients retain the discriminator without changing legacy text payloads.
 */
export function withWireResponseEnvelope<T extends ResponseEnvelopeShape>(result: T): T {
  const payload = parseObjectPayload(result.content[0]?.text);
  return {
    ...result,
    schemaVersion: RESULT_SCHEMA_VERSION,
    structuredContent: {
      ...payload,
      schemaVersion: RESULT_SCHEMA_VERSION,
      content: result.content,
      isError: result.isError,
      ...(result.ok === undefined ? {} : { ok: result.ok }),
      ...(result.error === undefined ? {} : { error: result.error }),
    },
  } as T;
}

export function successResponseEnvelope<T extends { content: readonly TextContent[] }>(
  result: T,
): T & { schemaVersion: ResultSchemaVersion; isError: false } {
  return withResponseEnvelope({ ...result, isError: false }) as T & {
    schemaVersion: ResultSchemaVersion;
    isError: false;
  };
}

export function errorResponseEnvelope<T extends { content: readonly TextContent[] }>(
  result: T,
): T & { schemaVersion: ResultSchemaVersion; isError: true } {
  return withResponseEnvelope({ ...result, isError: true }) as T & {
    schemaVersion: ResultSchemaVersion;
    isError: true;
  };
}

function parseObjectPayload(text: string | undefined): Record<string, unknown> {
  if (text === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {};
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}
