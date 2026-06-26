import type { TransformCallback, TransformOptions, Writable } from "node:stream";
import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";

export const DEFAULT_MAX_REQUEST_BYTES = 1 * 1024 * 1024; // 1 MiB

/**
 * A Node.js Transform stream that enforces a maximum bytes-per-line limit on a
 * newline-delimited input stream.
 *
 * Behavior:
 * - Lines under or at the limit pass through with the trailing `\n` stripped.
 * - Lines over the limit are dropped silently; a JSON-RPC -32700 error frame is
 *   written to `errorOutput` (process.stdout in production).
 * - A trailing `\r` (CRLF line endings) is stripped before the limit check and
 *   before passing the line downstream.
 * - Blank/whitespace-only lines pass through unchanged (let downstream decide).
 * - If the stream closes with buffered data (no final `\n`), the buffer is
 *   dispatched if under the limit, or dropped with an error frame if over.
 * - Processing continues after an oversized line — the transform does NOT close.
 */
export class SizeLimitTransform extends Transform {
  private readonly maxBytes: number;
  private readonly errorOutput: Writable;
  private readonly decoder = new StringDecoder("utf8");
  private buffer = "";
  private pendingBytes = 0;
  private droppingOversizedLine = false;

  constructor(maxBytes: number, errorOutput: Writable, options?: TransformOptions) {
    super(options);
    this.maxBytes = Math.max(1, Math.floor(maxBytes));
    this.errorOutput = errorOutput;
  }

  override _transform(
    chunk: Buffer | string,
    _encoding: string,
    callback: TransformCallback,
  ): void {
    const text = typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    const chunkLength = text.length;
    let cursor = 0;

    while (cursor < chunkLength) {
      const nextNewline = text.indexOf("\n", cursor);

      if (nextNewline === -1) {
        // No newline in the remainder of this chunk — accumulate.
        if (!this.droppingOversizedLine) {
          const tail = text.slice(cursor);
          this.buffer += tail;
          this.pendingBytes += Buffer.byteLength(tail, "utf8");
          if (this.pendingBytes > this.maxBytes) {
            this.emitSizeError();
            this.droppingOversizedLine = true;
            this.buffer = "";
            this.pendingBytes = 0;
          }
        }
        break;
      }

      // Newline found at nextNewline.
      if (!this.droppingOversizedLine) {
        const segment = text.slice(cursor, nextNewline);
        this.buffer += segment;
        this.pendingBytes += Buffer.byteLength(segment, "utf8");

        // Strip trailing \r (CRLF support) BEFORE the byte limit check.
        const line = this.buffer.endsWith("\r") ? this.buffer.slice(0, -1) : this.buffer;
        const lineBytes = Buffer.byteLength(line, "utf8");

        if (lineBytes > this.maxBytes) {
          this.emitSizeError();
        } else {
          this.push(`${line}\n`);
        }

        this.buffer = "";
        this.pendingBytes = 0;
      } else {
        // We were in dropping mode — the newline terminates the oversized line.
        this.droppingOversizedLine = false;
      }

      cursor = nextNewline + 1;
    }

    callback();
  }

  override _flush(callback: TransformCallback): void {
    const remaining = this.decoder.end();
    if (remaining.length > 0 && !this.droppingOversizedLine) {
      this.buffer += remaining;
    }
    // Stream ended. If there is still data in the buffer (no final \n), dispatch it.
    if (this.buffer.length > 0 && !this.droppingOversizedLine) {
      // Strip trailing \r before the byte limit check.
      const line = this.buffer.endsWith("\r") ? this.buffer.slice(0, -1) : this.buffer;
      const lineBytes = Buffer.byteLength(line, "utf8");
      if (lineBytes > this.maxBytes) {
        this.emitSizeError();
      } else {
        this.push(`${line}\n`);
      }
    }
    this.buffer = "";
    this.pendingBytes = 0;
    callback();
  }

  private emitSizeError(): void {
    const frame = JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Request too large" },
    });
    this.errorOutput.write(`${frame}\n`);
    this.destroy();
  }
}
