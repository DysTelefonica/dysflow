/**
 * Parse JSON while rejecting duplicate keys within the same object.
 *
 * `JSON.parse` silently keeps the last value for a repeated object key. This
 * scanner walks the JSON grammar first so each object can track its own decoded
 * key names, then delegates value construction to the native parser.
 */
export function parseJsonRejectingDuplicateKeys<T>(raw: string): T {
  let cursor = 0;

  const skipWhitespace = (): void => {
    while (
      raw[cursor] === " " ||
      raw[cursor] === "\t" ||
      raw[cursor] === "\r" ||
      raw[cursor] === "\n"
    ) {
      cursor += 1;
    }
  };

  function fail(message: string): never {
    throw new SyntaxError(`Invalid JSON: ${message} at position ${cursor}`);
  }

  const consume = (expected: string): void => {
    if (raw[cursor] !== expected) fail(`Expected ${JSON.stringify(expected)}`);
    cursor += 1;
  };

  const parseString = (): string => {
    const start = cursor;
    consume('"');
    while (cursor < raw.length) {
      const character = raw[cursor];
      if (character === '"') {
        cursor += 1;
        return JSON.parse(raw.slice(start, cursor)) as string;
      }
      if (character === "\\") {
        cursor += 2;
      } else {
        cursor += 1;
      }
    }
    return fail("Unterminated JSON string");
  };

  const consumeToken = (token: string): void => {
    if (!raw.startsWith(token, cursor)) fail(`Expected ${token}`);
    cursor += token.length;
  };

  const parseNumber = (): void => {
    const match = raw.slice(cursor).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    const number = match?.[0];
    if (number === undefined) fail("Invalid JSON number");
    cursor += number.length;
  };

  type ContainerFrame =
    | {
        kind: "object";
        keys: Set<string>;
        state: "key-or-end" | "colon" | "value" | "comma-or-end";
      }
    | { kind: "array"; state: "value-or-end" | "comma-or-end" };

  const stack: ContainerFrame[] = [];

  const startValue = (): void => {
    skipWhitespace();
    const character = raw[cursor];
    if (character === "{") {
      cursor += 1;
      stack.push({ kind: "object", keys: new Set<string>(), state: "key-or-end" });
      return;
    }
    if (character === "[") {
      cursor += 1;
      stack.push({ kind: "array", state: "value-or-end" });
      return;
    }
    if (character === '"') {
      parseString();
      return;
    }
    if (character === "t") {
      consumeToken("true");
      return;
    }
    if (character === "f") {
      consumeToken("false");
      return;
    }
    if (character === "n") {
      consumeToken("null");
      return;
    }
    parseNumber();
  };

  let rootComplete = false;
  while (!rootComplete || stack.length > 0) {
    skipWhitespace();
    const frame = stack.at(-1);
    if (frame === undefined) {
      startValue();
      rootComplete = true;
      continue;
    }

    if (frame.kind === "array") {
      if (frame.state === "value-or-end") {
        if (raw[cursor] === "]") {
          cursor += 1;
          stack.pop();
        } else {
          frame.state = "comma-or-end";
          startValue();
        }
      } else if (raw[cursor] === "]") {
        cursor += 1;
        stack.pop();
      } else {
        consume(",");
        frame.state = "value-or-end";
      }
      continue;
    }

    if (frame.state === "key-or-end") {
      if (raw[cursor] === "}") {
        cursor += 1;
        stack.pop();
        continue;
      }
      if (raw[cursor] !== '"') fail("Expected an object key");
      const key = parseString();
      if (frame.keys.has(key))
        throw new SyntaxError(`Duplicate JSON object key ${JSON.stringify(key)}.`);
      frame.keys.add(key);
      frame.state = "colon";
    } else if (frame.state === "colon") {
      consume(":");
      frame.state = "value";
    } else if (frame.state === "value") {
      frame.state = "comma-or-end";
      startValue();
    } else if (raw[cursor] === "}") {
      cursor += 1;
      stack.pop();
    } else {
      consume(",");
      frame.state = "key-or-end";
    }
  }

  skipWhitespace();
  if (cursor !== raw.length) fail("Unexpected JSON token");
  return JSON.parse(raw) as T;
}
