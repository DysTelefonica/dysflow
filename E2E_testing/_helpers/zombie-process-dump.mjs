// Formats the processes that matter for zombie attribution (#1899): the MCP
// child of a failing tool call, its descendants, and every MSACCESS.EXE, each
// with its full ancestor chain up to the root. Rows are never truncated.
// Pure: the caller supplies the process table, so this is testable without Access.

const MAX_CHAIN_DEPTH = 64;

export function formatZombieReport({ rows, childPid }) {
  const byPid = new Map(rows.map((r) => [r.ProcessId, r]));
  const childrenOf = new Map();
  for (const r of rows) {
    if (!childrenOf.has(r.ParentProcessId)) childrenOf.set(r.ParentProcessId, []);
    childrenOf.get(r.ParentProcessId).push(r.ProcessId);
  }

  const roles = new Map();
  const mark = (pid, role) => {
    if (!roles.has(pid)) roles.set(pid, role);
  };

  if (byPid.has(childPid)) mark(childPid, "child");
  const queue = byPid.has(childPid) ? [childPid] : [];
  while (queue.length > 0) {
    const pid = queue.shift();
    for (const kid of childrenOf.get(pid) ?? []) {
      if (!roles.has(kid)) {
        mark(kid, "descendant");
        queue.push(kid);
      }
    }
  }
  // MSACCESS wins over child/descendant: it is the process the owner question is about.
  for (const r of rows) {
    if (/^MSACCESS\.EXE$/i.test(r.Name ?? "")) roles.set(r.ProcessId, "msaccess");
  }

  if (roles.size === 0) {
    return [
      `ZOMBIE none: childPid=${childPid} not in the process table and no MSACCESS.EXE running.`,
    ];
  }

  const label = (pid) => {
    const r = byPid.get(pid);
    return r ? `${pid}(${r.Name})` : `${pid}(missing)`;
  };

  const chainOf = (pid) => {
    const parts = [label(pid)];
    let current = byPid.get(pid);
    const seen = new Set([pid]);
    for (let depth = 0; current && depth < MAX_CHAIN_DEPTH; depth += 1) {
      const parent = current.ParentProcessId;
      if (parent === undefined || parent === null || parent === 0) break;
      if (seen.has(parent)) {
        parts.push("cycle");
        break;
      }
      seen.add(parent);
      parts.push(label(parent));
      current = byPid.get(parent);
      if (!current) break;
    }
    return parts.join("<-");
  };

  const lines = [];
  for (const [pid, role] of roles) {
    const r = byPid.get(pid);
    const parent = r ? r.ParentProcessId : "?";
    const name = r ? r.Name : "missing";
    const cmd = r && r.CommandLine ? r.CommandLine : "";
    const created = r && r.CreationDate ? r.CreationDate : "unknown";
    lines.push(
      `ZOMBIE pid=${pid} parent=${parent} name=${name} role=${role} chain=${chainOf(pid)} created=${created} cmd=${cmd}`,
    );
  }
  return lines;
}
