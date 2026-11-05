/**
 * #1993 — HTTP `POST /vba/test` shares the `test_vba` adapter with MCP, but
 * detached runs are MCP-only. The route refuses `detach`, and it is refused
 * with TEST_RUN_ALREADY_ACTIVE while a detached run holds the database (S2).
 *
 * The HTTP server, the real `VbaSyncAdapter` and the real run store are used;
 * only Access (the PowerShell executor), the detached spawn and process
 * liveness are faked.
 */
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startDysflowHttpServer } from "../../../src/adapters/http/server";
import type { VbaManagerExecutor } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { successResult } from "../../../src/core/contracts/index";
import {
  callTool,
  DetachedRunHarness,
  exited,
  PLAN,
  PROCEDURES_JSON,
  runnerStdout,
} from "../../_helpers/detached-test-runs-1993";

type HttpBody = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; details?: Record<string, unknown> };
};

let harness: DetachedRunHarness;
const servers: Server[] = [];

beforeEach(() => {
  harness = new DetachedRunHarness();
});

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  harness.dispose();
});

const neverEnding: VbaManagerExecutor = () => new Promise(() => undefined);

async function startServer(executor: VbaManagerExecutor) {
  const started = await startDysflowHttpServer({
    host: "127.0.0.1",
    port: 0,
    writesEnabled: true,
    allowedProcedures: [...PLAN],
    services: {
      vbaService: { execute: async () => successResult({ returnValue: "unused" }) },
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
      vbaSyncToolService: harness.adapter(executor),
    },
  });
  servers.push(started.server);
  return started;
}

async function postTest(url: string, body: Record<string, unknown>) {
  const response = await fetch(`${url}/vba/test`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as HttpBody };
}

describe("HTTP POST /vba/test and detached runs (#1993)", () => {
  it("refuses detach: detached runs are MCP-only", async () => {
    let executorCalls = 0;
    const server = await startServer(async () => {
      executorCalls += 1;
      return exited(runnerStdout([true, true]));
    });

    const { status, body } = await postTest(server.url, {
      proceduresJson: PROCEDURES_JSON,
      detach: true,
    });

    expect(status).toBe(400);
    expect(body.error?.code).toBe("HTTP_INVALID_INPUT");
    expect(body.error?.message).toContain("detach");
    expect(executorCalls).toBe(0);
    expect(harness.spawns).toEqual([]);
  });

  it("answers 409 TEST_RUN_ALREADY_ACTIVE while a detached run holds the database", async () => {
    const detached = await callTool(harness.tools(harness.adapter(neverEnding)), "test_vba", {
      proceduresJson: PROCEDURES_JSON,
      apply: true,
      detach: true,
    });
    let executorCalls = 0;
    const server = await startServer(async () => {
      executorCalls += 1;
      return exited(runnerStdout([true, true]));
    });

    const { status, body } = await postTest(server.url, { proceduresJson: PROCEDURES_JSON });

    expect(status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("TEST_RUN_ALREADY_ACTIVE");
    expect(body.error?.details?.activeOperationId).toBe(detached.structuredContent?.operationId);
    expect(executorCalls).toBe(0);
  });

  it("runs as before when no detached run holds the database", async () => {
    const server = await startServer(async () => exited(runnerStdout([true, true])));

    const { status, body } = await postTest(server.url, { proceduresJson: PROCEDURES_JSON });

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ mode: "apply", passed: 2, failed: 0 });
  });
});
