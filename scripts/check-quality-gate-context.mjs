#!/usr/bin/env node
// Guard for #1776.
//
// The branch-protection required context is the `quality` job's *literal*
// display name (`Quality gates (26)`), because GitHub only expands a matrix
// suffix when the job actually runs. A skipped job reports its bare name, so
// the required context exists only while that literal stays in sync with the
// Node major `package.json` claims.
//
// The workflow test in test/quality-gates/ci-workflow.test.ts already derives
// that expectation from `engines.node`, but it runs inside the `quality` job —
// the very job whose name it validates, and the one GitHub skips on a docs-only
// pull request. This check runs from a job that always executes, so a desync is
// a loud red check instead of a silent branch-protection break that leaves a
// pull request blocked with every visible check green.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const NAME_PATTERN = /^ {4}name:[ \t]*(\S.*?)[ \t]*$/m;
const MATRIX_PATTERN = /^[ \t]*matrix:/m;
const NODE_VERSION_PATTERN = /^[ \t]*node-version:[ \t]*(\S+)/gm;

/** The single Node major a `>=floor <ceiling` style range claims. */
export function enginesNodeMajor(declared) {
  const majors = [...declared.matchAll(/(\d+)\.\d+\.\d+/g)].map((match) =>
    Number.parseInt(match[1], 10),
  );
  if (majors.length !== 2) {
    return {
      ok: false,
      reason: `engines.node "${declared}" does not name exactly two version boundaries`,
    };
  }
  const [floor, exclusiveCeiling] = majors;
  const ceiling = exclusiveCeiling - 1;
  if (floor !== ceiling) {
    return {
      ok: false,
      reason: `engines.node "${declared}" spans Node ${floor}-${ceiling}; the required context names one major`,
    };
  }
  return { ok: true, major: floor };
}

/** The `quality:` job block, from its key to the next top-level job key. */
export function qualityJobBlock(workflow) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((line) => /^ {2}quality:$/.test(line));
  if (start < 0) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

/** The literal display name the `quality` job reports in both run and skip. */
export function qualityJobName(workflow) {
  const block = qualityJobBlock(workflow);
  if (block === undefined) return undefined;
  return NAME_PATTERN.exec(block)?.[1];
}

/**
 * Every way the required context can silently desync from the workflow.
 * Returns an array of human-readable findings; empty means in sync.
 */
export function checkQualityGateContext({ workflow, declared }) {
  const range = enginesNodeMajor(declared);
  if (!range.ok) return [range.reason];

  const block = qualityJobBlock(workflow);
  if (block === undefined) return ["ci.yml declares no `quality:` job"];

  const findings = [];
  const expectedName = `Quality gates (${range.major})`;
  const nameLine = NAME_PATTERN.exec(block)?.[1];
  if (nameLine !== expectedName) {
    findings.push(
      `the quality job is named "${nameLine ?? "<none>"}" but branch protection requires "${expectedName}"`,
    );
  }
  if (MATRIX_PATTERN.test(block)) {
    findings.push(
      "the quality job declares a matrix; a skipped matrix job reports its bare name, so the required context disappears",
    );
  }
  const nodeVersions = [...block.matchAll(NODE_VERSION_PATTERN)].map((match) => match[1]);
  if (!nodeVersions.includes(String(range.major))) {
    findings.push(
      `the quality job declares node-version ${nodeVersions.join(", ") || "<none>"}, not the claimed major ${range.major}`,
    );
  }
  return findings;
}

/** `package.json`'s `engines.node`, or a reason it could not be read. */
export function readEnginesNode(packageJsonText) {
  let parsed;
  try {
    parsed = JSON.parse(packageJsonText);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `package.json is not valid JSON: ${detail}` };
  }
  const declared = parsed?.engines?.node;
  if (typeof declared !== "string" || declared.length === 0) {
    return { ok: false, reason: "package.json declares no engines.node" };
  }
  return { ok: true, declared };
}

async function main() {
  const root = resolve(process.argv[2] ?? process.cwd());
  const [workflow, packageJsonText] = await Promise.all([
    readFile(resolve(root, ".github/workflows/ci.yml"), "utf8"),
    readFile(resolve(root, "package.json"), "utf8"),
  ]);

  const engines = readEnginesNode(packageJsonText);
  const findings = engines.ok
    ? checkQualityGateContext({ workflow, declared: engines.declared })
    : [engines.reason];

  if (findings.length > 0) {
    console.error(
      `Required context drift${engines.ok ? ` (engines.node "${engines.declared}")` : ""}:`,
    );
    for (const finding of findings) console.error(`  - ${finding}`);
    console.error(
      "Branch protection requires the exact context name; fix .github/workflows/ci.yml before merging.",
    );
    process.exit(1);
  }
  process.stdout.write(
    `Required context OK: github reports "${qualityJobName(workflow)}" whether the job runs or is skipped (engines.node "${engines.declared}").\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
