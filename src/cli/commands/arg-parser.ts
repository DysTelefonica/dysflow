export interface ArgOptionSpec {
  name: string;
  type: "string" | "boolean";
  multiple?: boolean;
}

export interface ParseNamedArgsConfig {
  specs: readonly ArgOptionSpec[];
  args: readonly string[];
  onUnknown?: (arg: string) => string;
  onMissing?: (arg: string) => string;
}

export interface ParsedArgs {
  [key: string]: string | boolean | string[] | undefined;
}

export function parseNamedArgs(
  config: ParseNamedArgsConfig,
): { ok: true; values: ParsedArgs } | { ok: false; message: string } {
  const { specs, args, onUnknown, onMissing } = config;
  const values: ParsedArgs = {};
  const specMap = new Map<string, ArgOptionSpec>();
  for (const spec of specs) {
    specMap.set(spec.name, spec);
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    const spec = specMap.get(arg);
    if (!spec) {
      const msg = onUnknown ? onUnknown(arg) : `Unsupported option: ${arg}`;
      return { ok: false, message: msg };
    }

    if (spec.type === "boolean") {
      values[spec.name] = true;
    } else {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        const msg = onMissing ? onMissing(arg) : `Missing value for ${arg}.`;
        return { ok: false, message: msg };
      }
      if (spec.multiple) {
        const arr = (values[spec.name] as string[]) ?? [];
        arr.push(value);
        values[spec.name] = arr;
      } else {
        values[spec.name] = value;
      }
      index += 1;
    }
  }

  return { ok: true, values };
}
