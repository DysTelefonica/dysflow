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

  const parseValue = (): void => {
    skipWhitespace();
    const character = raw[cursor];
    if (character === "{") {
      parseObject();
      return;
    }
    if (character === "[") {
      parseArray();
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

  const parseObject = (): void => {
    consume("{");
    skipWhitespace();
    if (raw[cursor] === "}") {
      cursor += 1;
      return;
    }

    const keys = new Set<string>();
    while (cursor < raw.length) {
      skipWhitespace();
      if (raw[cursor] !== '"') fail("Expected an object key");
      const key = parseString();
      if (keys.has(key)) throw new SyntaxError(`Duplicate JSON object key ${JSON.stringify(key)}.`);
      keys.add(key);
      skipWhitespace();
      consume(":");
      parseValue();
      skipWhitespace();
      if (raw[cursor] === "}") {
        cursor += 1;
        return;
      }
      consume(",");
    }
    fail("Unterminated JSON object");
  };

  const parseArray = (): void => {
    consume("[");
    skipWhitespace();
    if (raw[cursor] === "]") {
      cursor += 1;
      return;
    }

    while (cursor < raw.length) {
      parseValue();
      skipWhitespace();
      if (raw[cursor] === "]") {
        cursor += 1;
        return;
      }
      consume(",");
    }
    fail("Unterminated JSON array");
  };

  parseValue();
  skipWhitespace();
  if (cursor !== raw.length) fail("Unexpected JSON token");
  return JSON.parse(raw) as T;
}
