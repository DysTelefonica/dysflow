export type DirectMapping = {
  action: string;
  json?: boolean;
  moduleNames(input: Record<string, unknown>): readonly string[];
  extra(input: Record<string, unknown>): Record<string, string | boolean | number | undefined>;
};

export function mapping(
  action: string,
  json = false,
  moduleNames: (input: Record<string, unknown>) => readonly string[] = () => [],
  extra: (
    input: Record<string, unknown>,
  ) => Record<string, string | boolean | number | undefined> = () => ({}),
): DirectMapping {
  return { action, json, moduleNames, extra };
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}
