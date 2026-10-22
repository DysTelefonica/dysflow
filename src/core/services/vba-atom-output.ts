/**
 * Issue #1850 — decide whether a VBA test atom's output is a JSON envelope
 * that cannot be parsed.
 *
 * Test atoms return their result envelope (`{"ok":...,"logs":[...]}`) as a
 * string. The runner tries to decode it and, when that fails, silently treats
 * the atom as passing with no payload — so a malformed envelope read as a pass
 * and its `ok:false` never reached the caller. An output that opens like an
 * envelope (`{`) and does not parse is reported instead, per atom, so every
 * other atom of the run is still reported. A plain non-JSON string (`"OK"`)
 * is not an envelope and keeps its existing meaning.
 */

/** Longest excerpt of the raw output carried into the per-atom error. */
export const ATOM_OUTPUT_EXCERPT_LIMIT = 240;

export type UnparsableAtomOutput = {
  /** The JSON parser's own message, e.g. `Expected ',' or '}' … at position 42`. */
  parseError: string;
  /** Zero-based offset the parser reported, when it reported one. */
  position?: number;
  /** At most {@link ATOM_OUTPUT_EXCERPT_LIMIT} characters around `position`. */
  excerpt: string;
};

export function detectUnparsableAtomOutput(returnValue: unknown): UnparsableAtomOutput | undefined {
  if (typeof returnValue !== "string") return undefined;
  const trimmed = returnValue.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    JSON.parse(trimmed);
    return undefined;
  } catch (err) {
    const parseError = err instanceof Error ? err.message : String(err);
    const match = /at position (\d+)/.exec(parseError);
    const position = match?.[1] === undefined ? undefined : Number(match[1]);
    return {
      parseError,
      ...(position === undefined ? {} : { position }),
      excerpt: excerptAround(trimmed, position ?? trimmed.length),
    };
  }
}

function excerptAround(text: string, position: number): string {
  const ellipsis = "…";
  if (text.length <= ATOM_OUTPUT_EXCERPT_LIMIT) return text;
  const budget = ATOM_OUTPUT_EXCERPT_LIMIT - 2 * ellipsis.length;
  const start = Math.max(0, Math.min(position - Math.floor(budget / 2), text.length - budget));
  const end = start + budget;
  return `${start > 0 ? ellipsis : ""}${text.slice(start, end)}${end < text.length ? ellipsis : ""}`;
}
