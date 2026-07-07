import { buildHiddenToolRegistry } from './src/adapters/mcp/stdio-wrappers.ts';
import { createDysflowMcpTools } from './src/adapters/mcp/tools.ts';

const tools = createDysflowMcpTools({
  vbaService: { execute: async () => ({ ok: true, returnValue: 'ok' }) },
  queryService: { execute: async () => ({ ok: true, rows: [] }) },
  diagnosticsService: { run: async () => ({ ok: true, checks: [] }) },
});
const hidden = buildHiddenToolRegistry(tools);
const advertised = tools.filter((t) => !hidden.has(t.name));
console.log('total tools:', tools.length);
console.log('advertised count:', advertised.length);