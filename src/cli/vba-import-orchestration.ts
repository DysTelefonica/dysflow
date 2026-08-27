import { readFileSync } from "node:fs";
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
const PAYLOAD_ARGV_LIMIT = 8 * 1024;

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

function importPayloadBase64(): string {
  const argvPayload = argumentValue("--payload-base64");
  const readsStdin = process.argv.includes("--payload-stdin");
  if (argvPayload !== undefined && readsStdin) {
    throw new Error("Pass exactly one of --payload-base64 or --payload-stdin");
  }
  if (argvPayload !== undefined) {
    if (argvPayload.length > PAYLOAD_ARGV_LIMIT) {
      throw new Error(
        "PAYLOAD_TOO_LARGE_FOR_ARGV: import orchestration payloads above 8192 characters must use --payload-stdin",
      );
    }
    return argvPayload;
  }
  if (readsStdin) {
    const stdinPayload = readFileSync(0, "utf8").trim();
    if (stdinPayload.length === 0) throw new Error("--payload-stdin received an empty payload");
    return stdinPayload;
  }
  throw new Error("one of --payload-base64 or --payload-stdin is required");
}

function run(): void {
  const event = argumentValue("--event");
  if (event === undefined) throw new Error("--event is required");
  const payloadBase64 = importPayloadBase64();
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
