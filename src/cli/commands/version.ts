import { readPackageVersionNear } from "../../core/utils/package-info.js";
import type { CliResult } from "./types.js";

export const PACKAGE_VERSION = readPackageVersionNear(import.meta.url);

export function handleVersionCommand(): CliResult {
	return { exitCode: 0, stdout: PACKAGE_VERSION, stderr: "" };
}
