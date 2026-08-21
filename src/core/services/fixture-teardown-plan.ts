import type { AccessQueryRequest, FixtureTeardownPredicate } from "../contracts/index.js";

const ACCESS_IDENTIFIER = /^[\p{L}\p{N}_ -]+$/u;
export const FIXTURE_TEST_ID_MIN = 900_000;

export type FixtureTeardownPlan = {
  tableName: string;
  predicate: FixtureTeardownPredicate;
  sql: string;
};

export type FixtureTeardownPlanResult =
  | { ok: true; plan: FixtureTeardownPlan }
  | {
      ok: false;
      code: "FIXTURE_TEARDOWN_UNBOUNDED" | "FIXTURE_TEARDOWN_PREDICATE_INVALID";
      message: string;
    };

/**
 * Validates and renders the only supported fixture teardown shape.
 *
 * Keeping this in core makes the fail-closed check run before the Access
 * runner is invoked. The PowerShell boundary repeats the validation because
 * it can also be called independently of the TypeScript service.
 */
export function buildFixtureTeardownPlan(
  request: Pick<AccessQueryRequest, "tableName" | "predicate">,
): FixtureTeardownPlanResult {
  const predicate = request.predicate;
  if (predicate === undefined) {
    return {
      ok: false,
      code: "FIXTURE_TEARDOWN_UNBOUNDED",
      message:
        "teardown_fixture requires a bounded predicate with column, min, and max; unbounded DELETE is forbidden.",
    };
  }

  const tableName = request.tableName;
  if (tableName === undefined) {
    return invalid("teardown_fixture tableName must be a valid Access identifier.");
  }
  const quotedTable = formatAccessIdentifier(tableName);
  if (quotedTable === undefined) {
    return invalid("teardown_fixture tableName must be a valid Access identifier.");
  }
  const quotedColumn = formatAccessIdentifier(predicate.column);
  if (quotedColumn === undefined) {
    return invalid("teardown_fixture predicate column must be a valid Access identifier.");
  }
  if (!Number.isSafeInteger(predicate.min) || !Number.isSafeInteger(predicate.max)) {
    return invalid("teardown_fixture predicate range boundaries must be safe integers.");
  }
  if (predicate.min < FIXTURE_TEST_ID_MIN || predicate.max < FIXTURE_TEST_ID_MIN) {
    return invalid(
      `teardown_fixture predicate range boundaries must be at least ${FIXTURE_TEST_ID_MIN}.`,
    );
  }
  if (predicate.min > predicate.max) {
    return invalid(
      "teardown_fixture predicate range requires min to be less than or equal to max.",
    );
  }

  const sql =
    `DELETE FROM ${quotedTable} WHERE ${quotedColumn} ` +
    `BETWEEN ${predicate.min} AND ${predicate.max}`;
  return { ok: true, plan: { tableName, predicate: { ...predicate }, sql } };
}

function formatAccessIdentifier(name: string | undefined): string | undefined {
  return name !== undefined && name.trim().length > 0 && ACCESS_IDENTIFIER.test(name)
    ? `[${name}]`
    : undefined;
}

function invalid(message: string): FixtureTeardownPlanResult {
  return { ok: false, code: "FIXTURE_TEARDOWN_PREDICATE_INVALID", message };
}
