import { createRequire } from "node:module";
import type { CliResult } from "./types.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../../package.json") as { version?: unknown };

export const PACKAGE_VERSION =
	typeof packageJson.version === "string" ? packageJson.version : "0.0.0";

export function handleVersionCommand(): CliResult {
	return { exitCode: 0, stdout: PACKAGE_VERSION, stderr: "" };
}
