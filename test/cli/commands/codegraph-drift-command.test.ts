/**
 * Issue #961 (A component) — `dysflow codegraph-drift` command.
 *
 * Behavior contract:
 * - Default run is a read-only dry-run: reports would-be rewrites, writes
 *   nothing, exits 1 when drift exists (automation-friendly signal) and 0
 *   when clean.
 * - `--apply` rewrites the affected files in place and exits 0 on success;
 *   read/write errors or files skipped for malformed closing markers exit 1.
 * - `--help` prints usage without touching the filesystem.
 */

import { describe, expect, it } from "vitest";
import {
  handleCodegraphDriftCommand,
  runCodegraphDriftCommand,
} from "../../../src/cli/commands/codegraph-drift";

const DIRTY = [
  "<!-- user-supplement:a:b -->",
  "Runtime version codegraph-vba v1.10.0 stale reference.",
  "<!-- /user-supplement:a:b -->",
].join("\n");

const CLEAN = [
  "<!-- user-supplement:a:b -->",
  "nothing stale here",
  "<!-- /user-supplement:a:b -->",
].join("\n");

function makeFakeFs(files: Map<string, string>) {
  const writes = new Map<string, string>();
  // The command joins `home` + relative path with the PLATFORM separator, so
  // normalize to posix before the map lookup to keep the fixture portable
  // across Windows and Linux CI.
  const toKey = (filePath: string) => filePath.replace(/\\/g, "/");
  return {
    writes,
    readFile: async (filePath: string) => {
      const content = files.get(toKey(filePath));
      if (content === undefined) throw new Error(`ENOENT: ${filePath}`);
      return content;
    },
    writeFile: async (filePath: string, content: string) => {
      writes.set(toKey(filePath), content);
    },
  };
}

describe("runCodegraphDriftCommand", () => {
  it("dry-run reports drift, writes nothing, exits 1", async () => {
    const fs = makeFakeFs(new Map([["/home/u/A.md", DIRTY]]));

    const result = await runCodegraphDriftCommand({
      home: "/home/u",
      apply: false,
      relativePaths: ["A.md"],
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("v1.10.0");
    expect(result.stdout).toMatch(/dry.?run/i);
    expect(fs.writes.size).toBe(0);
  });

  it("dry-run on a clean tree exits 0", async () => {
    const fs = makeFakeFs(new Map([["/home/u/A.md", CLEAN]]));

    const result = await runCodegraphDriftCommand({
      home: "/home/u",
      apply: false,
      relativePaths: ["A.md"],
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/no drift/i);
  });

  it("--apply rewrites the file in place and exits 0", async () => {
    const fs = makeFakeFs(new Map([["/home/u/A.md", DIRTY]]));

    const result = await runCodegraphDriftCommand({
      home: "/home/u",
      apply: true,
      relativePaths: ["A.md"],
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    expect(result.exitCode).toBe(0);
    expect(fs.writes.get("/home/u/A.md")).toContain("codegraph --version");
    expect(fs.writes.get("/home/u/A.md")).not.toContain("v1.10.0");
  });

  it("missing files are reported and flip the exit code, without aborting the sweep", async () => {
    const fs = makeFakeFs(new Map([["/home/u/B.md", CLEAN]]));

    const result = await runCodegraphDriftCommand({
      home: "/home/u",
      apply: false,
      relativePaths: ["missing.md", "B.md"],
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("missing.md");
  });

  it("a malformed closing marker is skipped fail-closed and flips the exit code", async () => {
    const malformed = ["<!-- user-supplement:a:b -->", "codegraph-vba v1.10.0 stale"].join("\n");
    const fs = makeFakeFs(new Map([["/home/u/M.md", malformed]]));

    const result = await runCodegraphDriftCommand({
      home: "/home/u",
      apply: true,
      relativePaths: ["M.md"],
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/malformed/i);
    expect(fs.writes.size).toBe(0);
  });
});

describe("handleCodegraphDriftCommand — arg parsing", () => {
  it("prints usage on --help without touching the filesystem", async () => {
    const result = await handleCodegraphDriftCommand(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("codegraph-drift");
    expect(result.stdout).toContain("--apply");
  });

  it("rejects unknown flags with usage on stderr", async () => {
    const result = await handleCodegraphDriftCommand(["--frobnicate"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--frobnicate");
  });
});
