import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createGraphService } from '@genome/graph';
import { loadConfigFromEnv, createLogger, setLogger, type LogConfig } from '@genome/core';
import { handleListResources, handleReadResource } from './resources';
import { handleCallTool, handleListTools } from './tools';

const logLevel = (process.env.LOG_LEVEL as LogConfig['level']) || 'info';
const logger = createLogger({ level: logLevel, pretty: false }, process.stderr);
setLogger(logger);

async function main() {
    logger.info('Starting GENOME MCP Server...');

    const config = loadConfigFromEnv();
    if (!config.graph) {
        logger.error('Missing graph configuration');
        process.exit(1);
    }
    const graph = createGraphService(config.graph);

    try {
        await graph.connect();
        logger.info('Connected to Neo4j');
    } catch (err) {
        logger.error({ err }, 'Failed to connect to Neo4j');
        process.exit(1);
    }

    const server = new Server(
        {
            name: '@genome/mcp-server',
            version: '0.1.0',
        },
        {
            capabilities: {
                resources: {},
                tools: {},
            },
        }
    );

    // Resources
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
        resources: await handleListResources(graph),
    }));

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => ({
        contents: await handleReadResource(graph, request.params.uri),
    }));

    // Tools
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: await handleListTools(),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => ({
        content: await handleCallTool(graph, request.params.name, request.params.arguments),
    }));

    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('MCP Server listening on stdio');
}

main().catch((err) => {
    logger.error({ err }, 'Fatal error in MCP server');
    process.exit(1);
});
