import { describe, expect, it } from "vitest";
import {
  isTransientLockContentionError,
  lockErrorCode,
} from "../../../src/core/utils/lock-errors.js";

function errWithCode(code: string): NodeJS.ErrnoException {
  const e: NodeJS.ErrnoException = new Error(code);
  e.code = code;
  return e;
}

describe("isTransientLockContentionError", () => {
  it("treats EEXIST as transient contention (the normal contended case)", () => {
    expect(isTransientLockContentionError(errWithCode("EEXIST"))).toBe(true);
  });

  it("treats EACCES as transient contention (Windows DELETE_PENDING race on lock release)", () => {
    expect(isTransientLockContentionError(errWithCode("EACCES"))).toBe(true);
  });

  it("treats EPERM as transient contention", () => {
    expect(isTransientLockContentionError(errWithCode("EPERM"))).toBe(true);
  });

  it("does NOT treat ENOENT or other codes as transient contention", () => {
    expect(isTransientLockContentionError(errWithCode("ENOENT"))).toBe(false);
    expect(isTransientLockContentionError(errWithCode("EBUSY"))).toBe(false);
  });

  it("returns false for non-errno values", () => {
    expect(isTransientLockContentionError(new Error("no code"))).toBe(false);
    expect(isTransientLockContentionError(null)).toBe(false);
    expect(isTransientLockContentionError("EACCES")).toBe(false);
  });
});

describe("lockErrorCode", () => {
  it("extracts the string code from an errno error", () => {
    expect(lockErrorCode(errWithCode("EACCES"))).toBe("EACCES");
  });

  it("returns undefined when there is no string code", () => {
    expect(lockErrorCode(new Error("x"))).toBeUndefined();
    expect(lockErrorCode(null)).toBeUndefined();
  });
});
