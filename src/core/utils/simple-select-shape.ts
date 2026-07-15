export type SimpleSelectShape = {
  tableName: string;
  columnNames: readonly string[];
};

const IDENTIFIER = String.raw`(?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)`;
const SIMPLE_SELECT = new RegExp(
  String.raw`^\s*SELECT\s+(?:TOP\s+\d+\s+)?(.+?)\s+FROM\s+(${IDENTIFIER})(?:\s+(?:AS\s+)?(${IDENTIFIER}))?\s*(?:WHERE\s+[^;]+)?;?\s*$`,
  "i",
);
const SIMPLE_COLUMN = new RegExp(
  String.raw`^(?:(${IDENTIFIER})\s*\.\s*)?(${IDENTIFIER})(?:\s+AS\s+${IDENTIFIER})?$`,
  "i",
);

function unquoteIdentifier(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("[") && trimmed.endsWith("]")
    ? trimmed.slice(1, -1).replace(/\]\]/g, "]")
    : trimmed;
}

/**
 * Parses only a deliberately small, provable SELECT shape: one physical table,
 * plain projected identifiers, optional TOP/alias/WHERE, and no joins,
 * subqueries, expressions, or wildcards. Returning undefined means callers
 * must preserve the database engine's original error classification.
 */
export function parseSimpleSelectShape(sql: string): SimpleSelectShape | undefined {
  if (/\b(?:JOIN|UNION|TRANSFORM|PIVOT)\b/i.test(sql) || /['"()`*]/.test(sql)) return undefined;
  const match = SIMPLE_SELECT.exec(sql);
  if (match === null) return undefined;
  const tableName = unquoteIdentifier(match[2] ?? "");
  const alias = match[3] === undefined ? undefined : unquoteIdentifier(match[3]);
  const rawColumns = match[1]?.split(",") ?? [];
  if (tableName === "" || rawColumns.length === 0) return undefined;

  const columnNames: string[] = [];
  for (const rawColumn of rawColumns) {
    const columnMatch = SIMPLE_COLUMN.exec(rawColumn.trim());
    if (columnMatch === null) return undefined;
    const qualifier = columnMatch[1] === undefined ? undefined : unquoteIdentifier(columnMatch[1]);
    if (
      qualifier !== undefined &&
      qualifier.toLowerCase() !== tableName.toLowerCase() &&
      qualifier.toLowerCase() !== alias?.toLowerCase()
    ) {
      return undefined;
    }
    columnNames.push(unquoteIdentifier(columnMatch[2] ?? ""));
  }
  return columnNames.every((column) => column.length > 0) ? { tableName, columnNames } : undefined;
}
