import { existsSync, readFileSync, writeFileSync } from "node:fs";

const scenario = process.env.DYSFLOW_AUDIT_SCENARIO ?? "clean";
const counterPath = process.env.DYSFLOW_AUDIT_COUNTER;
const attempt =
  counterPath && existsSync(counterPath) ? Number(readFileSync(counterPath, "utf8")) + 1 : 1;
if (counterPath) writeFileSync(counterPath, String(attempt));

if (scenario === "clean" || (scenario === "retry-clean" && attempt >= 3)) {
  console.log(JSON.stringify({ metadata: { vulnerabilities: { high: 0, critical: 0 } } }));
  process.exit(0);
}
if (scenario === "vulnerable") {
  console.log(JSON.stringify({ metadata: { vulnerabilities: { high: 1, critical: 0 } } }));
  process.exit(1);
}
if (scenario === "malformed") {
  console.error("registry returned malformed audit response");
  process.exit(1);
}
if (scenario === "wrong-json") {
  console.log(JSON.stringify({ error: "audit unavailable" }));
  process.exit(0);
}
const message =
  scenario === "410"
    ? "ERR_PNPM_AUDIT_BAD_RESPONSE 410 Gone"
    : scenario === "500"
      ? "ERR_PNPM_AUDIT_BAD_RESPONSE 500 Internal Server Error"
      : "ETIMEDOUT request failed Authorization: Bearer should-never-be-logged";
console.error(message);
process.exit(1);
