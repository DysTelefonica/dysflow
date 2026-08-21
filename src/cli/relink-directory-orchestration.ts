import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  advanceRelinkDirectoryAfterApply,
  advanceRelinkDirectoryAfterInspections,
  type RelinkDirectoryApplyState,
  type RelinkDirectoryCandidate,
  type RelinkDirectoryFileApplyResult,
  type RelinkDirectoryInspection,
  type RelinkDirectoryInspectState,
  type RelinkDirectoryOrchestrationInput,
  startRelinkDirectoryOrchestration,
} from "../core/services/relink-directory-orchestration.js";

const DECISION_MARKER = "DYSFLOW_RELINK_DECISION ";
const PAYLOAD_ENV = "DYSFLOW_RELINK_DECISION_PAYLOAD_BASE64";

type StartPayload = {
  input: RelinkDirectoryOrchestrationInput;
  candidates: RelinkDirectoryCandidate[];
};
type InspectionsPayload = {
  state: RelinkDirectoryInspectState;
  inspections: RelinkDirectoryInspection[];
};
type ApplyPayload = {
  state: RelinkDirectoryApplyState;
  results: RelinkDirectoryFileApplyResult[];
};

export function evaluateRelinkDirectoryDecision(event: string, payload: unknown): unknown {
  if (event === "start") {
    const start = payload as StartPayload;
    return startRelinkDirectoryOrchestration(start.input, start.candidates);
  }
  if (event === "inspections-completed") {
    const inspected = payload as InspectionsPayload;
    return advanceRelinkDirectoryAfterInspections(inspected.state, inspected.inspections);
  }
  if (event === "apply-completed") {
    const applied = payload as ApplyPayload;
    return advanceRelinkDirectoryAfterApply(applied.state, applied.results);
  }
  throw new Error(`Unsupported relink-directory orchestration event: ${event}`);
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function run(): void {
  const event = argumentValue("--event");
  const payloadBase64 = process.env[PAYLOAD_ENV];
  if (event === undefined || payloadBase64 === undefined) {
    throw new Error(`--event and ${PAYLOAD_ENV} are required`);
  }
  const payload = JSON.parse(Buffer.from(payloadBase64, "base64").toString("utf8")) as unknown;
  const decision = evaluateRelinkDirectoryDecision(event, payload);
  const encoded = Buffer.from(JSON.stringify(decision), "utf8").toString("base64");
  process.stdout.write(`${DECISION_MARKER}${encoded}\n`);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && pathToFileURL(resolve(invokedPath)).href === import.meta.url) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
