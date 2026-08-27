/**
 * Install channel selection for `dysflow install`, `dysflow update`, and
 * `dysflow doctor` (issue #1521).
 *
 * Three channels, three different trust levels:
 *
 * | Channel  | Source                                        | Verification                        | Gate |
 * | -------- | --------------------------------------------- | ----------------------------------- | ---- |
 * | `stable` | `releases/latest`                             | Ed25519 over SHA256SUMS, then SHA-256 | none |
 * | `beta`   | latest prerelease tag's release assets         | SHA-256 against published SHA256SUMS  | `DYSFLOW_ALLOW_INSECURE_UPDATE=1` |
 * | `main`   | `archive/refs/heads/main.tar.gz` (repo source) | none — unverified by design           | `DYSFLOW_ALLOW_INSECURE_UPDATE=1` |
 *
 * `stable` is unchanged and remains the default: omitting `--channel` on any
 * existing call shape behaves exactly as it did before this module existed.
 *
 * See docs/security/update-trust-model.md.
 */

export const INSTALL_CHANNELS = ["stable", "beta", "main"] as const;

export type InstallChannel = (typeof INSTALL_CHANNELS)[number];

export const DEFAULT_INSTALL_CHANNEL: InstallChannel = "stable";

/** Environment variable consulted when `--channel` is absent. */
export const INSTALL_CHANNEL_ENV = "DYSFLOW_CHANNEL";

/** Environment variable that unlocks the two unsigned channels. */
export const ALLOW_INSECURE_UPDATE_ENV = "DYSFLOW_ALLOW_INSECURE_UPDATE";

/** Every gate failure points the reader at the trust model. */
export const TRUST_MODEL_DOC = "docs/security/update-trust-model.md";

/**
 * Stable error-code strings. These are part of the CLI contract: they are
 * documented in `references/error-codes.md` and consumers branch on them.
 */
export const CHANNEL_ERROR_CODES = {
  unknownChannel: "DYSFLOW_UNKNOWN_CHANNEL",
  insecureGateMissing: "DYSFLOW_INSECURE_GATE_MISSING",
  skipChecksumRequiresStableChannel: "DYSFLOW_SKIP_CHECKSUM_REQUIRES_STABLE_CHANNEL",
  channelPinRequiresForce: "DYSFLOW_CHANNEL_PIN_REQUIRES_FORCE",
  prereleaseTagNotFound: "DYSFLOW_PRERELEASE_TAG_NOT_FOUND",
} as const;

/** Where the effective channel came from, for `doctor` reporting. */
export type ChannelSource = "flag" | "env" | "state" | "default";

/** What `parseInstallArgs` / `parseUpdateArgs` extracted before install state is known. */
export type RequestedChannel = {
  /** Undefined when neither `--channel` nor `DYSFLOW_CHANNEL` selected one. */
  channel?: InstallChannel;
  source: "flag" | "env" | "unset";
};

export type ResolvedChannel = {
  channel: InstallChannel;
  source: ChannelSource;
};

export function isInstallChannel(value: unknown): value is InstallChannel {
  return typeof value === "string" && (INSTALL_CHANNELS as readonly string[]).includes(value);
}

function unknownChannelMessage(origin: string, raw: string): string {
  return (
    `${CHANNEL_ERROR_CODES.unknownChannel}: unknown channel "${raw}" from ${origin}. ` +
    `Expected one of: ${INSTALL_CHANNELS.join(", ")}. See ${TRUST_MODEL_DOC}.`
  );
}

/**
 * Reads the requested channel from an explicit flag value, falling back to
 * `DYSFLOW_CHANNEL`. Returns `source: "unset"` when neither is present so the
 * caller can still layer the persisted install state underneath.
 */
export function readRequestedChannel(
  flagValue: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; requested: RequestedChannel } | { ok: false; message: string } {
  if (flagValue !== undefined) {
    const normalized = flagValue.trim().toLowerCase();
    if (!isInstallChannel(normalized)) {
      return { ok: false, message: unknownChannelMessage("--channel", flagValue) };
    }
    return { ok: true, requested: { channel: normalized, source: "flag" } };
  }

  const fromEnv = env[INSTALL_CHANNEL_ENV];
  if (fromEnv !== undefined && fromEnv.trim().length > 0) {
    const normalized = fromEnv.trim().toLowerCase();
    if (!isInstallChannel(normalized)) {
      return { ok: false, message: unknownChannelMessage(INSTALL_CHANNEL_ENV, fromEnv) };
    }
    return { ok: true, requested: { channel: normalized, source: "env" } };
  }

  return { ok: true, requested: { source: "unset" } };
}

/**
 * Resolution order: explicit `--channel` → `DYSFLOW_CHANNEL` → the channel
 * persisted in install state → `stable`.
 */
export function resolveInstallChannel(
  requested: RequestedChannel,
  persistedChannel: InstallChannel | undefined,
): ResolvedChannel {
  if (requested.channel !== undefined && requested.source !== "unset") {
    return { channel: requested.channel, source: requested.source };
  }
  if (persistedChannel !== undefined) {
    return { channel: persistedChannel, source: "state" };
  }
  return { channel: DEFAULT_INSTALL_CHANNEL, source: "default" };
}

/** True when a channel downloads bytes nobody signed. */
export function isInsecureChannel(channel: InstallChannel): boolean {
  return channel !== "stable";
}

/** True when `DYSFLOW_ALLOW_INSECURE_UPDATE` is set to `1` / `true`. */
export function isInsecureUpdateAllowed(env: NodeJS.ProcessEnv): boolean {
  const raw = env[ALLOW_INSECURE_UPDATE_ENV];
  return raw !== undefined && (raw === "1" || raw.toLowerCase() === "true");
}

export type ChannelGateFailure = { ok: false; code: string; message: string };
export type ChannelGateResult = { ok: true } | ChannelGateFailure;

/**
 * The gates that guard a channel-selecting command, in a fixed order:
 *
 * 1. `--skip-checksum` is a stable-only escape hatch — combining it with an
 *    already-unsigned channel is a contradiction, not a stronger bypass.
 * 2. `beta` / `main` require `DYSFLOW_ALLOW_INSECURE_UPDATE=1`.
 *
 * The order is deliberate: the contradiction is a caller mistake and is worth
 * reporting even when the insecure gate would also have refused the run.
 */
export function checkChannelGates(input: {
  channel: InstallChannel;
  skipChecksum?: boolean;
  env: NodeJS.ProcessEnv;
}): ChannelGateResult {
  if (input.skipChecksum === true && input.channel !== "stable") {
    return {
      ok: false,
      code: CHANNEL_ERROR_CODES.skipChecksumRequiresStableChannel,
      message:
        `${CHANNEL_ERROR_CODES.skipChecksumRequiresStableChannel}: --skip-checksum applies to the ` +
        `stable channel only; channel "${input.channel}" enforces its own verification policy. ` +
        `Drop --skip-checksum or switch to --channel stable. See ${TRUST_MODEL_DOC}.`,
    };
  }

  if (isInsecureChannel(input.channel) && !isInsecureUpdateAllowed(input.env)) {
    return {
      ok: false,
      code: CHANNEL_ERROR_CODES.insecureGateMissing,
      message:
        `${CHANNEL_ERROR_CODES.insecureGateMissing}: channel "${input.channel}" is not covered by the ` +
        `Ed25519 release trust anchor. Set ${ALLOW_INSECURE_UPDATE_ENV}=1 to accept that risk, or ` +
        `use --channel stable. See ${TRUST_MODEL_DOC}.`,
    };
  }

  return { ok: true };
}

/**
 * `update` refuses to move a runtime between channels unless the operator says
 * so with `--force`. Re-running `update` on the pinned channel is always
 * allowed, so idempotent updates keep working.
 */
export function checkChannelPin(input: {
  requestedChannel: InstallChannel;
  persistedChannel: InstallChannel | undefined;
  force: boolean;
}): ChannelGateResult {
  if (input.force) return { ok: true };
  if (input.persistedChannel === undefined) return { ok: true };
  if (input.persistedChannel === input.requestedChannel) return { ok: true };

  return {
    ok: false,
    code: CHANNEL_ERROR_CODES.channelPinRequiresForce,
    message:
      `${CHANNEL_ERROR_CODES.channelPinRequiresForce}: this runtime is pinned to channel ` +
      `"${input.persistedChannel}" and the request asked for "${input.requestedChannel}". ` +
      `Re-run with --force to switch channels. See ${TRUST_MODEL_DOC}.`,
  };
}

/** The warning `doctor` prints for a channel nobody signed. */
export const INSECURE_CHANNEL_WARNING = "WARN: insecure channel, expect breakage";

/** Plain-text channel report shared by `doctor`. */
export function describeChannelLines(resolved: ResolvedChannel): string[] {
  const lines = [`Dysflow install channel: ${resolved.channel} (source: ${resolved.source})`];
  if (isInsecureChannel(resolved.channel)) lines.push(INSECURE_CHANNEL_WARNING);
  return lines;
}
