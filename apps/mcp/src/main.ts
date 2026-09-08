import { ApiClient } from '@/api-client';
import { registerTools } from '@/register-tools';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const apiKey = process.env.MCP_API_KEY;
const baseUrl = process.env.MCP_BASE_URL ?? 'http://localhost:3001';

if (apiKey === undefined || apiKey.length === 0) {
	throw new Error('MCP_API_KEY is required. Generate one with `pnpm --filter @i-finances/api mcp:api-key`.');
}

const apiClient = new ApiClient({ apiKey, baseUrl });
const server = new McpServer({ name: 'i-finances', version: '0.1.0' });

registerTools(server, apiClient);

await server.connect(new StdioServerTransport());
