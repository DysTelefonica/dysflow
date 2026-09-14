import { readFile, writeFile } from "node:fs/promises";

const [tagName, ...requestedPackagePaths] = process.argv.slice(2);
const match = /^v(\d+\.\d+\.\d+)$/.exec(tagName ?? "");
if (!match) {
  console.error(`Invalid release tag: ${tagName ?? "<missing>"}`);
  process.exit(1);
}

const packagePaths =
  requestedPackagePaths.length > 0
    ? requestedPackagePaths
    : ["package.json", "plugin/pi/package.json"];

async function readPackageJson(packagePath) {
  const raw = await readFile(packagePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid package manifest at ${packagePath}.`, { cause: error });
  }
}

for (const packagePath of packagePaths) {
  const packageJson = await readPackageJson(packagePath);
  packageJson.version = match[1];
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const persisted = await readPackageJson(packagePath);
  if (persisted.version !== match[1]) {
    throw new Error(`Failed to stamp ${packagePath} with version ${match[1]}`);
  }

  console.log(`Stamped ${packagePath} with release version ${match[1]}`);
}
