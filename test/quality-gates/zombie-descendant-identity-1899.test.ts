import { describe, expect, it } from "vitest";
import {
  resetProcessTableSnapshot,
  walkDescendantsPids,
} from "../../E2E_testing/_helpers/mcp-e2e-record.mjs";

// The zombie verdict reads descendants from a process table snapshot cached for 750 ms. After a
// child exits, a cached table can still list descendants whose PIDs were later reused (#1899,
// run 40298562550). The verdict path must be able to drop that snapshot and read a fresh one.
describe("issue #1899: the zombie verdict can read a fresh process table", () => {
  const TABLE = '"ProcessId","ParentProcessId"\n"100","1"\n"200","100"\n';

  it("reuses the snapshot within its TTL (baseline behaviour, unchanged)", () => {
    let reads = 0;
    const probe = () => {
      reads += 1;
      return TABLE;
    };
    resetProcessTableSnapshot();
    walkDescendantsPids(100, probe);
    walkDescendantsPids(100, probe);
    expect(reads).toBe(1);
  });

  it("reads a fresh table after resetProcessTableSnapshot, even within the TTL", () => {
    let reads = 0;
    const probe = () => {
      reads += 1;
      return TABLE;
    };
    resetProcessTableSnapshot();
    walkDescendantsPids(100, probe);
    resetProcessTableSnapshot();
    walkDescendantsPids(100, probe);
    expect(reads).toBe(2);
  });
});
