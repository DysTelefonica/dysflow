import { describe, expect, it } from "vitest";
import { wrapWithErrorAbsorber } from "../../../src/adapters/mcp/stdio-wrappers.js";

describe("error envelope has a structured code field", () => {
  const tools = [
    "run_script",
    "list_procedures",
    "get_procedure",
    "find_references",
    "detect_dead_code",
  ];

  for (const tool of tools) {
    it(`${tool} preserves a typed thrown error code`, async () => {
      const handler = wrapWithErrorAbsorber(async () => {
        throw Object.assign(new Error(`${tool} failed`), { code: "PROJECT_CONFIG_NOT_FOUND" });
      });

      const result = await handler({});
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("PROJECT_CONFIG_NOT_FOUND");
      expect(typeof result.error?.code).toBe("string");
      expect(result.error?.code).not.toMatch(/^Error \d+/);
    });
  }
});
