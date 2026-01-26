import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from '../config/constants';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { DataComposer } from '../data/composer';
import { registerAllTools } from './tools';

export class MCPServer {
  private server: McpServer;
  private dataComposer: DataComposer;

  constructor(dataComposer: DataComposer) {
    this.dataComposer = dataComposer;

    // Create MCP server instance using the high-level McpServer API
    this.server = new McpServer({
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    });

    // Register all tools
    this.registerTools();

    // Set up error handling on the underlying server
    this.server.server.onerror = (error) => {
      logger.error('MCP Server error:', error);
    };

    logger.info('MCP Server initialized');
  }

  /**
   * Register all MCP tools
   */
  private registerTools(): void {
    // Register all tools
    registerAllTools(this.server, this.dataComposer);
    logger.info('All MCP tools registered');
  }

  /**
   * Start the MCP server with the appropriate transport
   */
  async start(): Promise<void> {
    try {
      if (env.MCP_TRANSPORT === 'stdio') {
        await this.startStdio();
      } else if (env.MCP_TRANSPORT === 'http') {
        await this.startHttp();
      } else {
        throw new Error(`Unknown MCP transport: ${env.MCP_TRANSPORT}`);
      }
    } catch (error) {
      logger.error('Failed to start MCP server:', error);
      throw error;
    }
  }

  /**
   * Start with stdio transport (for local use with Claude Desktop)
   */
  private async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP Server started with stdio transport');
  }

  /**
   * Start with HTTP transport (for cloud deployment)
   */
  private async startHttp(): Promise<void> {
    // HTTP transport will be implemented when deploying to cloud
    // For now, we'll use stdio for local development
    logger.warn('HTTP transport not yet implemented, falling back to stdio');
    await this.startStdio();
  }

  /**
   * Get the underlying server instance
   */
  getServer(): McpServer {
    return this.server;
  }

  /**
   * Gracefully shutdown the server
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down MCP server...');
    await this.server.close();
    logger.info('MCP server shut down');
  }
}

export async function createMCPServer(dataComposer: DataComposer): Promise<MCPServer> {
  return new MCPServer(dataComposer);
}
