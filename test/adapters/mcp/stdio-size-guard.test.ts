import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_REQUEST_BYTES,
  SizeLimitTransform,
} from "../../../src/adapters/mcp/stdio-size-guard";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pipe input bytes through a SizeLimitTransform and collect all readable
 * chunks into a single string.
 *
 * @param chunks   - Raw byte chunks to write to the transform
 * @param maxBytes - Byte limit per line (defaults to DEFAULT_MAX_REQUEST_BYTES)
 * @param end      - Whether to close the write side (default true)
 */
async function collect(
  chunks: string[],
  maxBytes: number = DEFAULT_MAX_REQUEST_BYTES,
): Promise<{ output: string; errors: string }> {
  return new Promise((resolve, reject) => {
    const errorOutput = new PassThrough({ encoding: "utf8" });
    const transform = new SizeLimitTransform(maxBytes, errorOutput);

    const outputChunks: Buffer[] = [];
    const errorChunks: string[] = [];

    transform.on("data", (chunk: Buffer) => outputChunks.push(chunk));
    transform.on("error", reject);
    transform.on("end", () => {
      errorOutput.end();
    });

    errorOutput.on("data", (chunk: string) => errorChunks.push(chunk));
    errorOutput.on("end", () => {
      resolve({
        output: Buffer.concat(outputChunks).toString("utf8"),
        errors: errorChunks.join(""),
      });
    });
    errorOutput.on("error", reject);

    for (const chunk of chunks) {
      transform.write(chunk);
    }
    transform.end();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SizeLimitTransform", () => {
  it("passes a normal line under the limit through (with trailing newline for downstream transport)", async () => {
    const line = "hello world";
    const { output } = await collect([`${line}\n`]);

    expect(output).toBe(`${line}\n`);
  });

  it("passes a line exactly at the byte limit through (boundary: > maxBytes is dropped, === maxBytes passes)", async () => {
    const maxBytes = 10;
    const line = "a".repeat(maxBytes); // exactly 10 bytes
    const { output } = await collect([`${line}\n`], maxBytes);

    expect(output).toBe(`${line}\n`);
  });

  it("drops a line over the limit and writes a -32700 error frame to errorOutput", async () => {
    const maxBytes = 10;
    const oversizedLine = "a".repeat(maxBytes + 1); // 11 bytes
    const { output, errors } = await collect([`${oversizedLine}\n`], maxBytes);

    expect(output).toBe("");
    const errorFrame = JSON.parse(errors.trim()) as {
      jsonrpc: string;
      id: unknown;
      error: { code: number; message: string };
    };
    expect(errorFrame).toMatchObject({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Request too large" },
    });
  });

  it("continues processing the next line after dropping an oversized one", async () => {
    const maxBytes = 10;
    const oversizedLine = "a".repeat(maxBytes + 1);
    const normalLine = "hello";
    const { output, errors } = await collect([`${oversizedLine}\n${normalLine}\n`], maxBytes);

    expect(output).toBe(`${normalLine}\n`);
    expect(errors).toContain("-32700");
  });

  it("strips a trailing \\r from CRLF lines before passing through", async () => {
    const line = "hello";
    const { output } = await collect([`${line}\r\n`]);

    expect(output).toBe(`${line}\n`);
  });

  it("strips a trailing \\r before applying the byte limit check (CRLF line at limit)", async () => {
    const maxBytes = 5;
    const line = "hello"; // 5 bytes, exactly at limit — should pass
    const { output } = await collect([`${line}\r\n`], maxBytes);

    expect(output).toBe(`${line}\n`);
  });

  it("handles multiple lines delivered in a single chunk", async () => {
    const { output } = await collect(["foo\nbar\n"]);

    // Each line is re-emitted with its newline so the downstream transport can delimit messages.
    expect(output).toBe("foo\nbar\n");
  });

  it("accumulates a line split across two chunks and passes it through as one unit", async () => {
    const { output } = await collect(["hel", "lo\n"]);

    expect(output).toBe("hello\n");
  });

  it("flushes a partial buffer (no trailing newline) under the limit when the stream ends", async () => {
    const line = "no-newline";
    const { output } = await collect([line]); // no \n

    expect(output).toBe(`${line}\n`);
  });

  it("drops a partial buffer over the limit on stream end and emits a -32700 error", async () => {
    const maxBytes = 5;
    const oversized = "a".repeat(maxBytes + 1); // 6 bytes, no \n
    const { output, errors } = await collect([oversized], maxBytes);

    expect(output).toBe("");
    const errorFrame = JSON.parse(errors.trim()) as { error: { code: number } };
    expect(errorFrame.error.code).toBe(-32700);
  });

  it("passes a blank/whitespace-only line through unchanged", async () => {
    const { output } = await collect(["   \n"]);

    // Blank lines pass through with \n — the downstream SDK decides what to do with them.
    expect(output).toBe("   \n");
  });

  it("DEFAULT_MAX_REQUEST_BYTES is exactly 1 MiB (1_048_576 bytes)", () => {
    expect(DEFAULT_MAX_REQUEST_BYTES).toBe(1_048_576);
  });
});
