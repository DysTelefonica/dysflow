import { describe, expect, it, vi } from "vitest";
import {
  removeTemporaryDirectoryWithRetry,
  TemporaryDirectoryCleanupError,
} from "../../../src/core/utils/temporary-directory-cleanup.js";

function ioError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: locked temporary database`), { code });
}

describe("removeTemporaryDirectoryWithRetry (#1233)", () => {
  it("removes the directory immediately when no Windows handle is pending", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);

    await removeTemporaryDirectoryWithRetry("C:/temp/dysflow-export", { remove });

    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith("C:/temp/dysflow-export", {
      recursive: true,
      force: true,
    });
  });

  it("backs off across EBUSY and EPERM before succeeding", async () => {
    const remove = vi
      .fn()
      .mockRejectedValueOnce(ioError("EBUSY"))
      .mockRejectedValueOnce(ioError("EPERM"))
      .mockResolvedValue(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await removeTemporaryDirectoryWithRetry("C:/temp/dysflow-findrefs", {
      remove,
      sleep,
      maxAttempts: 4,
      initialDelayMs: 20,
    });

    expect(remove).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([20, 40]);
  });

  it("does not retry unrelated filesystem failures", async () => {
    const remove = vi.fn().mockRejectedValue(ioError("EACCES"));
    const sleep = vi.fn();

    await expect(
      removeTemporaryDirectoryWithRetry("C:/temp/dysflow-export", { remove, sleep }),
    ).rejects.toMatchObject({ code: "TEMP_CLEANUP_FAILED", causeCode: "EACCES" });
    expect(remove).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("exhausts the bounded retry budget with a typed error instead of raw EBUSY", async () => {
    const remove = vi.fn().mockRejectedValue(ioError("EBUSY"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      removeTemporaryDirectoryWithRetry("C:/temp/dysflow-export", {
        remove,
        sleep,
        maxAttempts: 3,
        initialDelayMs: 10,
      }),
    ).rejects.toBeInstanceOf(TemporaryDirectoryCleanupError);
    await expect(
      removeTemporaryDirectoryWithRetry("C:/temp/dysflow-export", {
        remove: vi.fn().mockRejectedValue(ioError("EBUSY")),
        sleep,
        maxAttempts: 1,
      }),
    ).rejects.toMatchObject({ code: "TEMP_CLEANUP_FAILED", causeCode: "EBUSY" });
  });
});
