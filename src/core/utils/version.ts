function parseVersionValue(value: string): number[] {
  const clean = (value.split(/[-+]/)[0] ?? "").trim();
  if (clean.length === 0) {
    return [0];
  }

  return clean
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isNaN(part) ? 0 : part));
}

export function compareVersions(a: string, b: string): number {
  const partsA = parseVersionValue(a);
  const partsB = parseVersionValue(b);
  const maxLength = Math.max(partsA.length, partsB.length);

  for (let index = 0; index < maxLength; index += 1) {
    const left = partsA[index] ?? 0;
    const right = partsB[index] ?? 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }

  return 0;
}
