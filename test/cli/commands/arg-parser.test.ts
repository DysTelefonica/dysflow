import { describe, expect, it } from "vitest";
import { parseNamedArgs } from "../../../src/cli/commands/arg-parser.js";

describe("parseNamedArgs", () => {
  const specs = [
    { name: "--runtime-dir", type: "string" as const },
    { name: "--agents", type: "string" as const },
    { name: "--agent-all", type: "boolean" as const },
    { name: "--no-tui", type: "boolean" as const },
    { name: "--map", type: "string" as const, multiple: true },
  ];

  it("parses string and boolean options correctly", () => {
    const result = parseNamedArgs({
      specs,
      args: ["--runtime-dir", "/my/dir", "--agent-all", "--no-tui"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values["--runtime-dir"]).toBe("/my/dir");
      expect(result.values["--agent-all"]).toBe(true);
      expect(result.values["--no-tui"]).toBe(true);
    }
  });

  it("handles missing value error", () => {
    const result = parseNamedArgs({
      specs,
      args: ["--runtime-dir"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("Missing value for --runtime-dir.");
    }
  });

  it("handles unexpected option error", () => {
    const result = parseNamedArgs({
      specs,
      args: ["--unknown-flag"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("Unsupported option: --unknown-flag");
    }
  });

  it("supports multiple option values", () => {
    const result = parseNamedArgs({
      specs,
      args: ["--map", "a=b", "--map", "c=d"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values["--map"]).toEqual(["a=b", "c=d"]);
    }
  });

  it("supports custom error formats", () => {
    const result = parseNamedArgs({
      specs,
      args: ["--runtime-dir", "--other-flag"],
      onMissing: (arg) => `Oops missing: ${arg}`,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("Oops missing: --runtime-dir");
    }
  });
});
