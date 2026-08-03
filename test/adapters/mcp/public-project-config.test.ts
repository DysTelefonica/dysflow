import { describe, expect, it } from "vitest";
import { projectPublicResolvedConfig } from "../../../src/adapters/mcp/contracts/public-project-config.js";

describe("public resolved project config projection (#1374)", () => {
  it("preserves the documented non-sensitive resolution evidence", () => {
    expect(
      projectPublicResolvedConfig({
        id: "fixture",
        frontendFile: "Frontend.accdb",
        backendPath: "Backend.accdb",
        destinationRoot: "src",
        timeoutMs: 12_345,
        capabilities: { allowWrites: true, writeExecutionPolicy: "safe-by-default" },
      }),
    ).toEqual({
      id: "fixture",
      frontendFile: "Frontend.accdb",
      backendPath: "Backend.accdb",
      destinationRoot: "src",
      timeoutMs: 12_345,
      capabilities: { allowWrites: true, writeExecutionPolicy: "safe-by-default" },
    });
  });

  it("excludes literal secrets, credential references, and unknown fields", () => {
    expect(
      projectPublicResolvedConfig({
        id: "fixture",
        httpToken: "literal-secret",
        httpTokenEnv: "SECRET_ENV",
        passwordEnv: "PASSWORD_ENV",
        extension: "private-extension-value",
      }),
    ).toEqual({ id: "fixture" });
  });

  it("drops unknown or malformed nested capabilities without losing valid siblings", () => {
    expect(
      projectPublicResolvedConfig({
        capabilities: {
          allowWrites: true,
          writeExecutionPolicy: "unsupported-policy",
          credentials: { token: "nested-secret" },
        },
      }),
    ).toEqual({ capabilities: { allowWrites: true } });
    expect(projectPublicResolvedConfig({ capabilities: ["unexpected"] })).toEqual({});
  });
});
