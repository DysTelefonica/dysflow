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
const LARGE_RESULT_SUMMARY =
  "Full result is available in structuredContent. summary.projection holds a bounded copy of its fields; summary.truncated names each list that was shortened, with its full length.";
const MAX_SUMMARY_FIELDS = 32;
const MAX_SUMMARY_FIELD_LENGTH = 96;
/**
 * Issue #2020 — a client that reads only the text (the Pi facade) must still
 * see the verdict. The projection keeps every scalar and nested object, caps
 * lists and strings, and lists failing entries first. Each stage below is
 * tighter than the previous one; the first that fits the text threshold wins.
 */
const PROJECTION_MAX_DEPTH = 4;
const PROJECTION_ITEM_FIELDS = 12;
/** Bulky lists that rarely decide the next step; they collapse to a count first. */
const PROJECTION_LOW_PRIORITY_KEYS = new Set(["matched", "diffs", "content", "runtimeDiagnostics"]);
const PROJECTION_STAGES: readonly ProjectionStage[] = [
  { arrayCap: 50, stringCap: 300, collapseLowPriority: false },
  { arrayCap: 50, stringCap: 300, collapseLowPriority: true },
  { arrayCap: 20, stringCap: 200, collapseLowPriority: true },
  { arrayCap: 5, stringCap: 120, collapseLowPriority: true },
  { arrayCap: 0, stringCap: 80, collapseLowPriority: true },
];

type ProjectionStage = {
  arrayCap: number;
  stringCap: number;
  collapseLowPriority: boolean;
};
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
    ...(wireOk(result, payload) === undefined ? {} : { ok: wireOk(result, payload) }),
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

/**
 * Issue #1866 item 5 — verify_code's payload `ok` is the comparison verdict. The
 * envelope `ok` only reports that the operation ran, so it must not replace it on
 * the wire; every other tool keeps the envelope value.
 */
function wireOk(
  result: Pick<ResponseEnvelopeShape, "ok">,
  payload: Record<string, unknown>,
): boolean | undefined {
  if (payload.operation === "verify_code" && typeof payload.ok === "boolean") return payload.ok;
  return result.ok;
}

function summaryText(
  result: Pick<ResponseEnvelopeShape, "isError" | "ok" | "error">,
  payload: Record<string, unknown>,
): string {
  const error =
    typeof result.error === "object" && result.error !== null
      ? (result.error as Record<string, unknown>)
      : undefined;
  const build = (projected?: {
    projection: Record<string, unknown>;
    truncated: Record<string, number>;
  }) =>
    JSON.stringify({
      schemaVersion: RESULT_SCHEMA_VERSION,
      isError: result.isError,
      ...(wireOk(result, payload) === undefined ? {} : { ok: wireOk(result, payload) }),
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
        ...(projected === undefined
          ? {}
          : {
              projection: projected.projection,
              ...(Object.keys(projected.truncated).length === 0
                ? {}
                : { truncated: projected.truncated }),
            }),
      },
    });
  for (const stage of PROJECTION_STAGES) {
    const truncated: Record<string, number> = {};
    const projection = projectObject(payload, stage, 0, "", truncated);
    const text = build({ projection, truncated });
    if (byteLength(text) <= LARGE_RESULT_TEXT_THRESHOLD_BYTES) return text;
  }
  return build();
}

function projectObject(
  value: Record<string, unknown>,
  stage: ProjectionStage,
  depth: number,
  path: string,
  truncated: Record<string, number>,
): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = path === "" ? key : `${path}.${key}`;
    if (Array.isArray(child)) {
      if (depth === 0 && stage.collapseLowPriority && PROJECTION_LOW_PRIORITY_KEYS.has(key)) {
        truncated[childPath] = child.length;
        continue;
      }
      projected[key] = projectArray(child, stage, childPath, truncated);
      continue;
    }
    if (isPlainObject(child)) {
      if (depth + 1 >= PROJECTION_MAX_DEPTH) continue;
      projected[key] = projectObject(child, stage, depth + 1, childPath, truncated);
      continue;
    }
    projected[key] = projectScalar(child, stage.stringCap);
  }
  return projected;
}

function projectArray(
  items: readonly unknown[],
  stage: ProjectionStage,
  path: string,
  truncated: Record<string, number>,
): unknown[] {
  if (items.length > stage.arrayCap) truncated[path] = items.length;
  const ordered = [...items].sort((left, right) => failureRank(left) - failureRank(right));
  return ordered.slice(0, stage.arrayCap).map((item) => {
    if (!isPlainObject(item)) return projectScalar(item, stage.stringCap);
    const entry: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(item)) {
      if (Object.keys(entry).length >= PROJECTION_ITEM_FIELDS) break;
      if (Array.isArray(field) || isPlainObject(field)) continue;
      entry[key] = projectScalar(field, stage.stringCap);
    }
    return entry;
  });
}

/** 0 for an entry that reports a failure, so failing tests and modules are listed first. */
function failureRank(item: unknown): number {
  if (!isPlainObject(item)) return 1;
  if (item.passed === false || item.ok === false || typeof item.error === "string") return 0;
  return typeof item.status === "string" && /fail|error|crash/i.test(item.status) ? 0 : 1;
}

function projectScalar(value: unknown, stringCap: number): unknown {
  if (typeof value === "string") {
    return value.length > stringCap ? `${value.slice(0, stringCap)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
