import { readFile, writeFile } from "node:fs/promises";

const [tagName, packagePath = "package.json"] = process.argv.slice(2);
const match = /^v(\d+\.\d+\.\d+)$/.exec(tagName ?? "");
if (!match) {
  console.error(`Invalid release tag: ${tagName ?? "<missing>"}`);
  process.exit(1);
}

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
packageJson.version = match[1];
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const persisted = JSON.parse(await readFile(packagePath, "utf8"));
if (persisted.version !== match[1]) {
  throw new Error(`Failed to stamp ${packagePath} with version ${match[1]}`);
}

console.log(`Stamped ${packagePath} with release version ${match[1]}`);
