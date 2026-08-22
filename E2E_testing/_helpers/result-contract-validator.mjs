function parseToolPayload(result, label, allowPlainError = false) {
  // #1471 — past 16 KB the text channel carries only a summary stub and the
  // real payload lives in `structuredContent`. describe_tool for a form tool
  // clears that threshold easily, so reading text first loses `resultContract`
  // and the battery reports the contract as missing rather than as unmatched.
  const structured = result?.response?.result?.structuredContent;
  if (structured !== undefined && structured !== null) return structured;

  const text =
    result?.response?.result?.content?.map((item) => item?.text ?? "").join("\n") ??
    result?.text ??
    "";
  try {
    return JSON.parse(text);
  } catch {
    if (allowPlainError) {
      const match = String(text).match(/^([A-Z][A-Z0-9_]+):\s*(.+)$/s);
      if (match) return { code: match[1], message: match[2] };
    }
    throw new Error(`${label} did not return a JSON text payload`);
  }
}

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "object")
    return typeof value === "object" && value !== null && !Array.isArray(value);
  return typeof value === type;
}

function validateSchema(value, schema, path) {
  if (schema === true || schema === undefined) return [];
  if (schema === false) return [`${path} is forbidden`];
  if (
    Array.isArray(schema.anyOf) &&
    schema.anyOf.some((entry) => validateSchema(value, entry, path).length === 0)
  )
    return [];
  if (
    Array.isArray(schema.oneOf) &&
    schema.oneOf.some((entry) => validateSchema(value, entry, path).length === 0)
  )
    return [];
  if ("const" in schema && value !== schema.const)
    return [`${path} must equal ${JSON.stringify(schema.const)}`];
  if (Array.isArray(schema.enum) && !schema.enum.includes(value))
    return [`${path} must be in enum`];
  if (schema.type !== undefined && !typeMatches(value, schema.type)) {
    return [`${path} must be ${schema.type}`];
  }
  const errors = [];
  if (schema.type === "object") {
    for (const required of schema.required ?? []) {
      if (!(required in value)) errors.push(`${path}.${required} is required`);
    }
    for (const [name, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (name in value)
        errors.push(...validateSchema(value[name], propertySchema, `${path}.${name}`));
    }
  }
  if (schema.type === "array" && schema.items !== undefined) {
    value.forEach((item, index) => {
      errors.push(...validateSchema(item, schema.items, `${path}[${index}]`));
    });
  }
  return errors;
}

function errorEnvelopeSchema(shape) {
  return {
    type: "object",
    properties: Object.fromEntries(
      Object.entries(shape).map(([name, field]) => [name, { type: field.type }]),
    ),
    required: Object.entries(shape)
      .filter(([, field]) => field.optional !== true)
      .map(([name]) => name),
  };
}

export function validateMcpResultAgainstDescription({
  tool,
  descriptionResult,
  executionResult,
  expectError = false,
}) {
  const description = parseToolPayload(descriptionResult, `describe_tool(${tool})`);
  const contract = description.resultContract;
  if (contract === undefined) throw new Error(`${tool}: missing resultContract from describe_tool`);
  const payload = parseToolPayload(executionResult, tool, expectError);
  const schema = expectError
    ? errorEnvelopeSchema(contract.errorEnvelope?.shape ?? {})
    : contract.dataSchema;
  const candidate = expectError ? (payload.error ?? payload) : payload;
  if (!expectError && contract.kind !== "dataSchema") {
    throw new Error(`${tool}: success validation requires a dataSchema contract`);
  }
  const errors = validateSchema(candidate, schema, tool);
  if (errors.length > 0) throw new Error(`${tool}: ${errors.join("; ")}`);
  return { ok: true, contractKind: expectError ? "errorEnvelope" : contract.kind };
}
