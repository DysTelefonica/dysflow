/**
 * Issue #1521 — channel resolution order: explicit `--channel` beats
 * `DYSFLOW_CHANNEL`, which beats the channel persisted in install state, which
 * beats the `stable` default. Omitting every one of them must land on `stable`,
 * because that is what every call shape that exists today does.
 */
import { describe, expect, it } from "vitest";
import {
  CHANNEL_ERROR_CODES,
  DEFAULT_INSTALL_CHANNEL,
  describeChannelLines,
  INSECURE_CHANNEL_WARNING,
  resolveInstallChannel,
} from "../../../src/cli/commands/install/channel";
import { parseInstallArgs, parseUpdateArgs } from "../../../src/cli/commands/install/updater";

function installChannel(args: readonly string[], env: NodeJS.ProcessEnv) {
  const parsed = parseInstallArgs(args, env);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.options.requestedChannel;
}

function updateChannel(args: readonly string[], env: NodeJS.ProcessEnv) {
  const parsed = parseUpdateArgs(args, env);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.options.requestedChannel;
}

describe("channel precedence in parseInstallArgs / parseUpdateArgs", () => {
  it("takes the explicit flag over the environment", () => {
    const env = { DYSFLOW_CHANNEL: "main" };
    expect(installChannel(["--channel", "beta"], env)).toEqual({
      channel: "beta",
      source: "flag",
    });
    expect(updateChannel(["--channel", "beta"], env)).toEqual({
      channel: "beta",
      source: "flag",
    });
  });

  it("accepts the --channel=value form", () => {
    expect(installChannel(["--channel=main"], {})).toEqual({ channel: "main", source: "flag" });
    expect(updateChannel(["--channel=main"], {})).toEqual({ channel: "main", source: "flag" });
  });

  it("falls back to DYSFLOW_CHANNEL when the flag is absent", () => {
    expect(installChannel([], { DYSFLOW_CHANNEL: "main" })).toEqual({
      channel: "main",
      source: "env",
    });
    expect(updateChannel([], { DYSFLOW_CHANNEL: "beta" })).toEqual({
      channel: "beta",
      source: "env",
    });
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(installChannel(["--channel", " Beta "], {})).toEqual({
      channel: "beta",
      source: "flag",
    });
    expect(updateChannel([], { DYSFLOW_CHANNEL: "MAIN" })).toEqual({
      channel: "main",
      source: "env",
    });
  });

  it("ignores an empty DYSFLOW_CHANNEL instead of failing on it", () => {
    expect(installChannel([], { DYSFLOW_CHANNEL: "   " })).toEqual({ source: "unset" });
  });

  it("reports nothing requested when neither flag nor environment selects one", () => {
    expect(installChannel([], {})).toEqual({ source: "unset" });
    expect(updateChannel([], {})).toEqual({ source: "unset" });
  });

  it.each([
    ["--channel", "nightly"],
    ["--channel", "dev"],
    ["--channel", "STABLE-ish"],
  ])("rejects an unknown channel %s %s with the documented code", (flag, value) => {
    const parsed = parseUpdateArgs([flag, value], {});
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain(CHANNEL_ERROR_CODES.unknownChannel);
    expect(parsed.message).toContain("stable, beta, main");
    expect(parsed.message).toContain("docs/security/update-trust-model.md");
  });

  it("rejects an unknown DYSFLOW_CHANNEL with the same code", () => {
    const parsed = parseInstallArgs([], { DYSFLOW_CHANNEL: "nightly" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain(CHANNEL_ERROR_CODES.unknownChannel);
    expect(parsed.message).toContain("DYSFLOW_CHANNEL");
  });

  it("reports a missing --channel value instead of silently defaulting", () => {
    const parsed = parseUpdateArgs(["--channel"], {});
    expect(parsed).toEqual({ ok: false, message: "Missing value for --channel." });
  });
});

describe("resolveInstallChannel", () => {
  it("defaults to stable when nothing is requested and nothing is persisted", () => {
    expect(resolveInstallChannel({ source: "unset" }, undefined)).toEqual({
      channel: DEFAULT_INSTALL_CHANNEL,
      source: "default",
    });
  });

  it("uses the persisted channel when the caller requested none", () => {
    expect(resolveInstallChannel({ source: "unset" }, "beta")).toEqual({
      channel: "beta",
      source: "state",
    });
  });

  it("lets an explicit request override the persisted channel", () => {
    expect(resolveInstallChannel({ channel: "main", source: "flag" }, "beta")).toEqual({
      channel: "main",
      source: "flag",
    });
    expect(resolveInstallChannel({ channel: "stable", source: "env" }, "main")).toEqual({
      channel: "stable",
      source: "env",
    });
  });
});

describe("describeChannelLines", () => {
  it("reports the stable channel without a warning", () => {
    expect(describeChannelLines({ channel: "stable", source: "default" })).toEqual([
      "Dysflow install channel: stable (source: default)",
    ]);
  });

  it.each(["beta", "main"] as const)("warns about the unsigned %s channel", (channel) => {
    expect(describeChannelLines({ channel, source: "flag" })).toEqual([
      `Dysflow install channel: ${channel} (source: flag)`,
      INSECURE_CHANNEL_WARNING,
    ]);
    expect(INSECURE_CHANNEL_WARNING).toBe("WARN: insecure channel, expect breakage");
  });
});
