/**
 * Stable discriminator for the agent-facing dysflow MCP response contract.
 *
 * Keep the literal independent from the runtime/package version. Additive
 * fields do not require a schema-version bump.
 */
export const RESULT_SCHEMA_VERSION = "dysflow.result/v1" as const;
/**
 * Keep legacy full-text compatibility for small results, but do not serialize
 * an unbounded canonical payload twice when the SDK also carries
 * `structuredContent`.
 */
export const LARGE_RESULT_TEXT_THRESHOLD_BYTES = 16 * 1024;
const LARGE_RESULT_SUMMARY = "Full result is available in structuredContent.";
const MAX_SUMMARY_FIELDS = 32;
const MAX_SUMMARY_FIELD_LENGTH = 96;
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
 * clients retain the discriminator. Small results keep their legacy text
 * projection; large results move the canonical payload to structuredContent
 * and publish a bounded JSON summary as the text fallback.
 */
export function withWireResponseEnvelope<T extends ResponseEnvelopeShape>(result: T): T {
  const text = result.content[0]?.text;
  const payload = parseObjectPayload(text);
  const large = text !== undefined && byteLength(text) > LARGE_RESULT_TEXT_THRESHOLD_BYTES;
  const structuredContent = {
    ...payload,
    schemaVersion: RESULT_SCHEMA_VERSION,
    isError: result.isError,
    ...(result.ok === undefined ? {} : { ok: result.ok }),
    ...(result.error === undefined ? {} : { error: result.error }),
    ...(large ? {} : { content: result.content }),
  };
  return {
    ...result,
    schemaVersion: RESULT_SCHEMA_VERSION,
    ...(large ? { content: [{ type: "text" as const, text: summaryText(result, payload) }] } : {}),
    structuredContent,
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

function summaryText(
  result: Pick<ResponseEnvelopeShape, "isError" | "ok" | "error">,
  payload: Record<string, unknown>,
): string {
  const error =
    typeof result.error === "object" && result.error !== null
      ? (result.error as Record<string, unknown>)
      : undefined;
  return JSON.stringify({
    schemaVersion: RESULT_SCHEMA_VERSION,
    isError: result.isError,
    ...(result.ok === undefined ? {} : { ok: result.ok }),
    ...(error === undefined
      ? {}
      : {
          error: {
            ...(typeof error.code === "string" ? { code: error.code } : {}),
            ...(typeof error.message === "string" ? { message: error.message } : {}),
          },
        }),
    summary: {
      kind: "structuredContent",
      fields: Object.keys(payload)
        .sort()
        .slice(0, MAX_SUMMARY_FIELDS)
        .map((field) => field.slice(0, MAX_SUMMARY_FIELD_LENGTH)),
      fieldCount: Object.keys(payload).length,
      message: LARGE_RESULT_SUMMARY,
    },
  });
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
