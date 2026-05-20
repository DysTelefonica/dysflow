import { describe, expect, it } from "vitest";
import { failureResult } from "../../../src/core/contracts/index";
import { translateCoreResultToMcpContent } from "../../../src/adapters/mcp/tools";

function sanitize(message: string): string {
  const result = translateCoreResultToMcpContent(failureResult({
    code: "TEST_ERROR",
    message,
    retryable: false,
  }));
  return result.content[0]?.text ?? "";
}

describe("sanitizeErrorMessage", () => {
  it.each([
    ["Windows database", "C:\\Users\\alice\\repo\\front.accdb", "alice"],
    ["Windows root", "C:\\", "C:\\"],
    ["short Windows directory", "D:\\x", "D:\\x"],
    ["UNC share", "\\\\server\\share\\front.mdb", "\\\\server"],
    ["POSIX database", "/home/alice/db/front.accdb", "/home/alice"],
    ["POSIX config", "/opt/dysflow/project.json", "/opt/dysflow"],
  ])("redacts %s paths", (_name, path, leakedText) => {
    const result = sanitize(`failed at ${path}`);

    expect(result).toContain("[PATH]");
    expect(result).not.toContain(leakedText);
  });

  it("keeps non-path error text and URLs readable", () => {
    expect(sanitize("error 42 expected 'foo' see https://example.test/docs")).toBe("TEST_ERROR: error 42 expected 'foo' see https://example.test/docs");
  });
});
