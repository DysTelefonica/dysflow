import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  advanceVbaImportAfterPass,
  advanceVbaImportAfterSave,
  startVbaImportOrchestration,
  type VbaImportOrchestrationState,
  type VbaImportRawAttempt,
  type VbaImportScope,
} from "../core/services/vba-import-orchestration.js";

const DECISION_MARKER = "DYSFLOW_IMPORT_DECISION ";

type StartPayload = { targets: string[]; scope?: VbaImportScope };
type PassPayload = { state: VbaImportOrchestrationState; attempts: VbaImportRawAttempt[] };
type SavePayload = { state: VbaImportOrchestrationState; warning?: string };

export function evaluateImportDecision(event: string, payload: unknown): unknown {
  if (event === "start") {
    const start = payload as StartPayload;
    return startVbaImportOrchestration(start.targets, start.scope ?? "explicit");
  }
  if (event === "pass-completed") {
    const pass = payload as PassPayload;
    return advanceVbaImportAfterPass(pass.state, pass.attempts);
  }
  if (event === "save-completed") {
    const save = payload as SavePayload;
    return advanceVbaImportAfterSave(save.state, save.warning);
  }
  throw new Error(`Unsupported VBA import orchestration event: ${event}`);
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function run(): void {
  const event = argumentValue("--event");
  const payloadBase64 = argumentValue("--payload-base64");
  if (event === undefined || payloadBase64 === undefined) {
    throw new Error("--event and --payload-base64 are required");
  }
  const payload = JSON.parse(Buffer.from(payloadBase64, "base64").toString("utf8")) as unknown;
  const decision = evaluateImportDecision(event, payload);
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
