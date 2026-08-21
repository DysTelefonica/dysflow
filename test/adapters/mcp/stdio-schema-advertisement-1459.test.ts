import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import type { DysflowMcpTool } from "../../../src/adapters/mcp/tools.js";
import type {
  SchemaAdvertisementEntry,
  SchemaAdvertisementRecorder,
} from "../../../src/core/telemetry/schema-advertisement.js";

/**
 * Issue #1459 — `tools/list` accounting. The contract under test is narrow on
 * purpose: the advertisement stream must observe the surface without changing
 * it, and a telemetry failure must never turn a good `tools/list` into a bad
 * one.
 */

function collectingRecorder(): {
  recorder: SchemaAdvertisementRecorder;
  entries: SchemaAdvertisementEntry[];
} {
  const entries: SchemaAdvertisementEntry[] = [];
  return {
    entries,
    recorder: {
      record: async (entry) => {
        entries.push(entry);
      },
    },
  };
}

function fakeTool(name: string): DysflowMcpTool {
  return {
    name,
    description: `fake ${name}`,
    handler: async () => ({
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      isError: false,
      ok: true,
    }),
  };
}

async function harness(
  tools: DysflowMcpTool[],
  schemaAdvertisementRecorder?: SchemaAdvertisementRecorder,
) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport, { schemaAdvertisementRecorder });
  const client = new Client({ name: "advertisement-test", version: "1" }, { capabilities: {} });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await serverDone.catch(() => undefined);
    },
  };
}

/** Give the fire-and-forget record a turn of the event loop to land. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("stdio tools/list schema-advertisement accounting (#1459)", () => {
  it("records one entry per advertisement with the advertised tool count and payload size", async () => {
    const { recorder, entries } = collectingRecorder();
    const { client, close } = await harness(
      [fakeTool("get_capabilities"), fakeTool("test_vba")],
      recorder,
    );

    try {
      await client.listTools();
      await settle();
    } finally {
      await close();
    }

    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry?.surface).toBe("tools/list");
    expect(entry?.view).toBe("compact");
    expect(entry?.toolCount).toBe(2);
    expect(entry?.payloadBytes).toBeGreaterThan(0);
    expect(entry?.repetition).toBe(1);
    expect(entry?.msSincePrevious).toBeNull();
  });

  it("counts repetition across a session so a re-listing client is distinguishable", async () => {
    const { recorder, entries } = collectingRecorder();
    const { client, close } = await harness([fakeTool("get_capabilities")], recorder);

    try {
      await client.listTools();
      await client.listTools();
      await client.listTools();
      await settle();
    } finally {
      await close();
    }

    expect(entries.map((entry) => entry.repetition)).toEqual([1, 2, 3]);
    expect(entries[1]?.msSincePrevious).not.toBeNull();
  });

  it("returns the same advertised tools whether or not a recorder is wired", async () => {
    const withoutRecorder = await harness([fakeTool("get_capabilities"), fakeTool("test_vba")]);
    let baseline: unknown;
    try {
      baseline = (await withoutRecorder.client.listTools()).tools;
    } finally {
      await withoutRecorder.close();
    }

    const { recorder } = collectingRecorder();
    const withRecorder = await harness(
      [fakeTool("get_capabilities"), fakeTool("test_vba")],
      recorder,
    );
    let instrumented: unknown;
    try {
      instrumented = (await withRecorder.client.listTools()).tools;
    } finally {
      await withRecorder.close();
    }

    expect(instrumented).toEqual(baseline);
  });

  it("still serves tools/list when the recorder rejects", async () => {
    const failing: SchemaAdvertisementRecorder = {
      record: async () => {
        throw new Error("disk full");
      },
    };
    const { client, close } = await harness([fakeTool("get_capabilities")], failing);

    try {
      const result = await client.listTools();
      await settle();
      expect(result.tools.map((tool) => tool.name)).toEqual(["get_capabilities"]);
    } finally {
      await close();
    }
  });
});
