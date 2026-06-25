import { describe, expect, it } from "vitest";
import { QUERY_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/query-schemas";

/**
 * Contract test for #546: relink_directory accepts a raw password (and its alias)
 * which invites a consuming agent to inline a secret into the tool-call arguments,
 * where it can be captured in transcripts. The schema must steer callers to
 * passwordEnv and mark the raw arguments as discouraged.
 */
describe("relink_directory advertises passwordEnv over inline secrets (#546)", () => {
  const props = QUERY_TOOL_SCHEMAS.relink_directory.properties as Record<
    string,
    { description?: string }
  >;

  it("advertises passwordEnv as the preferred secret path", () => {
    expect(props.passwordEnv?.description ?? "").toMatch(/prefer/i);
  });

  it("marks the raw backendPassword/password arguments as discouraged", () => {
    expect(props.backendPassword?.description ?? "").toMatch(/discourag/i);
    expect(props.password?.description ?? "").toMatch(/discourag/i);
  });
});
