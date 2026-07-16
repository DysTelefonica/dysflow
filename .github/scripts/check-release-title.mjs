const releaseName = process.env.RELEASE_NAME ?? "";
const tagName = process.env.RELEASE_TAG_NAME ?? "";

if (releaseName !== tagName) {
  console.error("Release name must equal tag_name.");
  console.error(`  name     = ${releaseName}`);
  console.error(`  tag_name = ${tagName}`);
  console.error("Restore the release title to the exact tag name in the GitHub release editor.");
  process.exit(1);
}

console.log(`Release name matches tag_name: ${tagName}`);
