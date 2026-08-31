import { describe, expect, it, vi } from "vitest";
import { removeRecoveryTokenTrioFixtureWithRetry } from "../../E2E_testing/_helpers/suite-owned-cleanup.mjs";

function ioError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: resource busy or locked`), { code });
}

describe("recovery-token-trio suite-owned cleanup (#1683)", () => {
  it.each(["EBUSY", "EPERM", "ENOTEMPTY"])(
    "retries transient Windows %s from the competing worktree before succeeding",
    async (code) => {
    const remove = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(ioError(code), {
          path: "C:/temp/dysflow-e2e-recovery-token-trio/competing",
        }),
      )
      .mockResolvedValue(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await removeRecoveryTokenTrioFixtureWithRetry("C:/temp/dysflow-e2e-recovery-token-trio", {
      remove,
      sleep,
      platform: "win32",
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    expect(remove).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
    },
  );

  it("fails actionably after the bounded retry budget is exhausted", async () => {
    const lockedPath = "C:/temp/dysflow-e2e-recovery-token-trio/competing";
    const remove = vi
      .fn()
      .mockRejectedValue(Object.assign(ioError("EBUSY"), { path: lockedPath }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      removeRecoveryTokenTrioFixtureWithRetry("C:/temp/dysflow-e2e-recovery-token-trio", {
        remove,
        sleep,
        platform: "win32",
        maxAttempts: 3,
        initialDelayMs: 5,
      }),
    ).rejects.toThrow(
      /recovery-token-trio cleanup failed after 3 attempts.*EBUSY.*recovery-token-trio\/competing.*rerun release E2E/i,
    );
    expect(remove).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([5, 10]);
  });

  it("does not retry unrelated Windows filesystem errors", async () => {
    const remove = vi.fn().mockRejectedValue(ioError("EACCES"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      removeRecoveryTokenTrioFixtureWithRetry("C:/temp/dysflow-e2e-recovery-token-trio", {
        remove,
        sleep,
        platform: "win32",
      }),
    ).rejects.toThrow(/failed after 1 attempt.*EACCES/i);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry EBUSY outside Windows", async () => {
    const remove = vi.fn().mockRejectedValue(ioError("EBUSY"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      removeRecoveryTokenTrioFixtureWithRetry("/tmp/dysflow-e2e-recovery-token-trio", {
        remove,
        sleep,
        platform: "linux",
      }),
    ).rejects.toThrow(/failed after 1 attempt.*EBUSY/i);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("refuses cleanup outside the suite-owned recovery-token fixture", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);

    await expect(
      removeRecoveryTokenTrioFixtureWithRetry("C:/temp/unrelated", { remove }),
    ).rejects.toThrow(/Refusing.*outside a suite-owned fixture/i);
    expect(remove).not.toHaveBeenCalled();
  });
});
