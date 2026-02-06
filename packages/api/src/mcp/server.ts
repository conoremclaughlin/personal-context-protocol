import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import type { Server } from 'http';
import { createClient } from '@supabase/supabase-js';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION, MCP_SERVER_DESCRIPTION } from '../config/constants';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { DataComposer } from '../data/composer';
import { registerAllTools, setMiniAppsRegistry, setTelegramListener } from './tools';
import { loadMiniApps, registerMiniAppTools, getMiniAppsInfo, type LoadedMiniApp } from '../mini-apps';
import adminRouter, { setWhatsAppListener } from '../routes/admin';
import agentTriggerRouter, { getAgentGateway } from '../routes/agent-trigger';
import { ChannelGateway, createChannelGateway, type ChannelGatewayConfig, type IncomingMessageHandler } from '../channels/gateway';
import { setSessionContext } from '../utils/request-context';

export { setWhatsAppListener, getAgentGateway };

export interface MCPServerConfig {
  /** Channel gateway configuration */
  channelGateway?: ChannelGatewayConfig;
  /** Handler for incoming messages from channels */
  messageHandler?: IncomingMessageHandler;
}

/** Tracked MCP client session (one per connected client) */
interface McpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  createdAt: number;
}

export class MCPServer {
  /** Primary server instance (used for stdio transport only) */
  private server: McpServer;
  private dataComposer: DataComposer;
  private httpServer: Server | null = null;

  /** Multi-client session management for HTTP transport */
  private sessions = new Map<string, McpSession>();

  private miniApps: Map<string, LoadedMiniApp> = new Map();
  private miniAppsInfo: Array<{ name: string; version: string; description: string; triggers: string[]; functions: string[] }> = [];
  private toolsVersion = 0;
  private channelGateway: ChannelGateway | null = null;
  private config: MCPServerConfig;

  constructor(dataComposer: DataComposer, config: MCPServerConfig = {}) {
    this.dataComposer = dataComposer;
    this.config = config;

    // Load mini-apps once (shared across all sessions)
    this.miniApps = loadMiniApps();
    setMiniAppsRegistry(this.miniApps);
    this.miniAppsInfo = getMiniAppsInfo(this.miniApps);
    logger.info(`Mini-apps loaded: ${this.miniAppsInfo.map(a => a.name).join(', ') || 'none'}`);

    // Create primary server instance (used for stdio; HTTP creates per-session servers)
    this.server = this.createMcpServerInstance();

    logger.info('MCP Server initialized');
  }

  /**
   * Create a new McpServer instance with all tools registered.
   * Each HTTP client session gets its own instance.
   */
  private createMcpServerInstance(): McpServer {
    const server = new McpServer({
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
      description: MCP_SERVER_DESCRIPTION,
    });

    // Register all tools on this server instance
    registerAllTools(server, this.dataComposer);
    registerMiniAppTools(server, this.miniApps);

    // Error handling
    server.server.onerror = (error) => {
      logger.error('MCP Server instance error:', error);
    };

    return server;
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
   * Single-client: uses the primary server instance.
   */
  private async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP Server started with stdio transport');
  }

  /**
   * Start with Streamable HTTP transport (multi-client)
   * Each connecting client gets its own McpServer + Transport pair.
   */
  private async startHttp(): Promise<void> {
    const port = env.MCP_HTTP_PORT;
    const app = express();

    // ============================================================================
    // Supabase JWT validation helper
    // ============================================================================
    const validateSupabaseToken = async (authHeader: string | undefined): Promise<{ userId: string; email: string } | null> => {
      if (!authHeader?.startsWith('Bearer ')) return null;
      const token = authHeader.substring(7);

      try {
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
          logger.debug('Supabase token validation failed', { error: error?.message });
          return null;
        }

        const { data: pcpUser } = await supabase
          .from('users')
          .select('id, email')
          .eq('email', user.email)
          .single();

        if (!pcpUser) {
          logger.warn('Supabase user not found in PCP', { email: user.email });
          return null;
        }

        return { userId: pcpUser.id, email: pcpUser.email };
      } catch (error) {
        logger.error('Error validating Supabase token', { error });
        return null;
      }
    };

    // Enable CORS for web portal, MCP clients, and agents
    app.use(cors({
      origin: ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003'],
      credentials: true,
    }));

    // ============================================================================
    // Streamable HTTP MCP endpoint (multi-client)
    // Handles: POST (tool calls + initialize), GET (SSE stream), DELETE (session end)
    // ============================================================================
    app.post('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId) {
        // Existing session - route to correct transport
        const session = this.sessions.get(sessionId);
        if (!session) {
          res.status(404).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Session not found. Client must re-initialize.' },
            id: null,
          });
          return;
        }

        try {
          await session.transport.handleRequest(req, res);
        } catch (error) {
          logger.error('Error handling MCP message:', { sessionId, error });
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal server error' },
              id: null,
            });
          }
        }
      } else {
        // New client - create session
        logger.info('New MCP client connecting (Streamable HTTP)');

        // Validate auth if provided
        const userData = await validateSupabaseToken(req.headers.authorization);
        if (userData) {
          setSessionContext({
            userId: userData.userId,
            email: userData.email,
          });
          logger.info('MCP session authenticated', {
            userId: userData.userId,
            email: userData.email,
          });
        }

        try {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => `pcp-${crypto.randomUUID()}`,
          });
          const mcpServer = this.createMcpServerInstance();

          // Clean up session when transport closes
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid) {
              logger.info('MCP session closed', { sessionId: sid });
              this.sessions.delete(sid);
              mcpServer.close().catch((err) => {
                logger.debug('Error closing MCP server for session', { sessionId: sid, error: err });
              });
            }
          };

          await mcpServer.connect(transport);

          // Handle the initialize request (sessionId is generated during this call)
          await transport.handleRequest(req, res);

          // Store session after handleRequest (sessionId is now available)
          if (transport.sessionId) {
            this.sessions.set(transport.sessionId, {
              server: mcpServer,
              transport,
              createdAt: Date.now(),
            });
            logger.info('MCP session created', {
              sessionId: transport.sessionId,
              activeSessions: this.sessions.size,
            });
          }
        } catch (error) {
          logger.error('Error creating MCP session:', error);
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Failed to create session' },
              id: null,
            });
          }
        }
      }
    });

    // GET /mcp - SSE stream for server-to-client notifications
    app.get('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId) {
        res.status(400).json({ error: 'Missing mcp-session-id header' });
        return;
      }

      const session = this.sessions.get(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      try {
        await session.transport.handleRequest(req, res);
      } catch (error) {
        logger.error('Error handling SSE stream:', { sessionId, error });
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });

    // DELETE /mcp - Session termination
    app.delete('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId) {
        res.status(400).json({ error: 'Missing mcp-session-id header' });
        return;
      }

      const session = this.sessions.get(sessionId);
      if (!session) {
        // Already gone - that's fine
        res.status(204).end();
        return;
      }

      try {
        await session.transport.handleRequest(req, res);
        await session.server.close();
        this.sessions.delete(sessionId);
        logger.info('MCP session terminated', { sessionId, activeSessions: this.sessions.size });
      } catch (error) {
        logger.error('Error terminating MCP session:', { sessionId, error });
        // Clean up anyway
        this.sessions.delete(sessionId);
        if (!res.headersSent) {
          res.status(204).end();
        }
      }
    });

    // ============================================================================
    // Health check
    // ============================================================================
    app.get('/health', async (_req, res) => {
      const startTime = Date.now();
      const checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; error?: string; details?: unknown }> = {};

      try {
        const dbStart = Date.now();
        const { error } = await this.dataComposer.getClient().from('users').select('id').limit(1);
        checks.database = error
          ? { status: 'error', error: error.message }
          : { status: 'ok', latencyMs: Date.now() - dbStart };
      } catch (err) {
        checks.database = { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' };
      }

      if (this.channelGateway) {
        const gatewayStatus = this.channelGateway.getStatus();
        checks.telegram = {
          status: gatewayStatus.telegram.enabled && gatewayStatus.telegram.connected ? 'ok' : 'error',
          ...(gatewayStatus.telegram.enabled && !gatewayStatus.telegram.connected && { error: 'Not connected' }),
          ...(!gatewayStatus.telegram.enabled && { error: 'Disabled' }),
        };
        checks.whatsapp = {
          status: gatewayStatus.whatsapp.enabled && gatewayStatus.whatsapp.connected ? 'ok' : 'error',
          ...(gatewayStatus.whatsapp.enabled && !gatewayStatus.whatsapp.connected && { error: 'Not connected' }),
          ...(!gatewayStatus.whatsapp.enabled && { error: 'Disabled' }),
        };
      }

      checks.mcp = {
        status: 'ok',
        details: {
          activeSessions: this.sessions.size,
          toolsVersion: this.toolsVersion,
          miniApps: this.miniAppsInfo.map((m) => m.name),
        },
      };

      const dbOk = checks.database?.status === 'ok';
      const overallStatus = dbOk ? 'healthy' : 'unhealthy';

      res.status(dbOk ? 200 : 503).json({
        status: overallStatus,
        version: MCP_SERVER_VERSION,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        latencyMs: Date.now() - startTime,
        checks,
      });
    });

    // ============================================================================
    // OAuth 2.0 endpoints for MCP authentication
    // ============================================================================
    interface PendingAuth {
      clientId: string;
      codeChallenge: string;
      redirectUri: string;
      state: string;
      expiresAt: number;
    }
    interface AuthCode {
      clientId: string;
      codeChallenge: string;
      redirectUri: string;
      supabaseToken: string;
      userId: string;
      userEmail: string;
      expiresAt: number;
    }

    const pendingAuths = new Map<string, PendingAuth>();
    const oauthCodes = new Map<string, AuthCode>();

    app.post('/register', express.json(), (req, res) => {
      logger.info('MCP /register called', { body: req.body });

      const clientId = req.body.client_id || `pcp-client-${Date.now()}`;

      res.json({
        client_id: clientId,
        client_secret: 'pcp-local-secret',
        redirect_uris: req.body.redirect_uris || ['http://localhost:3001/callback'],
        token_endpoint_auth_method: 'client_secret_post',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: req.body.client_name || 'Claude Code MCP Client',
        scope: 'mcp:tools',
      });
    });

    app.get('/authorize', (req, res) => {
      const { client_id, redirect_uri, state, code_challenge, response_type } = req.query;

      logger.info('MCP /authorize called', { client_id, redirect_uri, state, response_type });

      if (response_type !== 'code') {
        res.status(400).json({ error: 'unsupported_response_type' });
        return;
      }

      const pendingId = `pending-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      pendingAuths.set(pendingId, {
        clientId: client_id as string,
        codeChallenge: code_challenge as string,
        redirectUri: redirect_uri as string,
        state: state as string,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      const webPortalUrl = process.env.WEB_PORTAL_URL || 'http://localhost:3002';
      const mcpCallback = `http://localhost:${port}/mcp/auth/callback`;

      const loginUrl = new URL(`${webPortalUrl}/login`);
      loginUrl.searchParams.set('redirect', mcpCallback);
      loginUrl.searchParams.set('pending_id', pendingId);

      logger.info('MCP /authorize redirecting to web portal', { pendingId, loginUrl: loginUrl.toString() });
      res.redirect(loginUrl.toString());
    });

    app.get('/mcp/auth/callback', async (req, res) => {
      const pendingId = req.query.pending_id as string;
      const accessToken = req.query.access_token as string;

      logger.info('MCP /mcp/auth/callback called', { pendingId, hasToken: !!accessToken });

      const pending = pendingAuths.get(pendingId);
      if (!pending) {
        res.status(400).send('Invalid or expired authorization request. Please try again.');
        return;
      }

      if (Date.now() > pending.expiresAt) {
        pendingAuths.delete(pendingId);
        res.status(400).send('Authorization request expired. Please try again.');
        return;
      }

      if (!accessToken) {
        res.status(400).send('Missing access token. Please try logging in again.');
        return;
      }

      try {
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
        const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

        if (authError || !user) {
          logger.error('Supabase auth verification failed', { error: authError });
          res.status(401).send('Authentication failed. Please try again.');
          return;
        }

        const { data: pcpUser, error: userError } = await supabase
          .from('users')
          .select('id, email')
          .eq('email', user.email)
          .single();

        if (userError || !pcpUser) {
          logger.error('PCP user not found', { email: user.email, error: userError });
          res.status(403).send('User not found in PCP system. Please contact support.');
          return;
        }

        const code = `pcp-code-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        oauthCodes.set(code, {
          clientId: pending.clientId,
          codeChallenge: pending.codeChallenge,
          redirectUri: pending.redirectUri,
          supabaseToken: accessToken,
          userId: pcpUser.id,
          userEmail: pcpUser.email,
          expiresAt: Date.now() + 10 * 60 * 1000,
        });

        pendingAuths.delete(pendingId);

        const redirectUrl = new URL(pending.redirectUri);
        redirectUrl.searchParams.set('code', code);
        if (pending.state) {
          redirectUrl.searchParams.set('state', pending.state);
        }

        logger.info('MCP auth complete, redirecting to client', {
          userId: pcpUser.id,
          email: pcpUser.email,
        });

        res.redirect(redirectUrl.toString());
      } catch (error) {
        logger.error('Error completing MCP auth', { error });
        res.status(500).send('Authentication error. Please try again.');
      }
    });

    app.post('/token', express.urlencoded({ extended: true }), (req, res) => {
      const { grant_type, code, code_verifier, client_id } = req.body;

      logger.info('MCP /token called', { grant_type, client_id, hasCode: !!code, hasVerifier: !!code_verifier });

      if (grant_type !== 'authorization_code') {
        res.status(400).json({ error: 'unsupported_grant_type' });
        return;
      }

      const codeData = oauthCodes.get(code);
      if (!codeData) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code not found' });
        return;
      }

      if (Date.now() > codeData.expiresAt) {
        oauthCodes.delete(code);
        res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code expired' });
        return;
      }

      if (codeData.codeChallenge && code_verifier) {
        const computedChallenge = crypto
          .createHash('sha256')
          .update(code_verifier)
          .digest('base64url');

        if (computedChallenge !== codeData.codeChallenge) {
          logger.warn('PKCE verification failed', { expected: codeData.codeChallenge, computed: computedChallenge });
          res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
          return;
        }
      }

      oauthCodes.delete(code);

      const expiresIn = 3600;

      logger.info('MCP /token returning Supabase JWT', {
        userId: codeData.userId,
        email: codeData.userEmail,
      });

      res.json({
        access_token: codeData.supabaseToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
        scope: 'mcp:tools',
      });
    });

    // ============================================================================
    // Admin & Agent routes
    // ============================================================================
    app.use(express.json());
    app.use('/api/admin', adminRouter);
    logger.info('Admin API routes registered at /api/admin');

    app.use('/api/agent', agentTriggerRouter);
    logger.info('Agent trigger routes registered at /api/agent');

    app.post('/refresh-tools', async (_req, res) => {
      try {
        await this.notifyToolsChanged();
        res.json({
          success: true,
          message: 'Tools refresh notification sent',
          toolsVersion: this.toolsVersion,
        });
      } catch (error) {
        logger.error('Error refreshing tools:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // ============================================================================
    // Start listening
    // ============================================================================
    this.httpServer = app.listen(port, () => {
      logger.info(`MCP Server started with Streamable HTTP transport on port ${port}`);
      logger.info(`MCP endpoint: http://localhost:${port}/mcp`);
    });

    // Initialize channel gateway if message handler is configured
    if (this.config.messageHandler) {
      await this.startChannelGateway();
    } else {
      logger.info('ChannelGateway not started (no messageHandler configured)');
    }
  }

  /**
   * Initialize and start the channel gateway
   */
  private async startChannelGateway(): Promise<void> {
    logger.info('Initializing ChannelGateway...');

    this.channelGateway = createChannelGateway({
      ...this.config.channelGateway,
      dataComposer: this.dataComposer,
    });

    if (this.config.messageHandler) {
      this.channelGateway.setMessageHandler(this.config.messageHandler);
    }

    this.channelGateway.on('telegram:connected', () => {
      const listener = this.channelGateway?.getTelegramListener();
      if (listener) {
        setTelegramListener(listener);
        logger.info('Telegram listener registered with MCP tools');
      }
    });

    this.channelGateway.on('whatsapp:connected', () => {
      const listener = this.channelGateway?.getWhatsAppListener();
      if (listener) {
        setWhatsAppListener(listener);
        logger.info('WhatsApp listener registered with admin routes');
      }
    });

    await this.channelGateway.start();

    const telegramListener = this.channelGateway.getTelegramListener();
    if (telegramListener) {
      setTelegramListener(telegramListener);
    }

    const whatsAppListener = this.channelGateway.getWhatsAppListener();
    if (whatsAppListener) {
      setWhatsAppListener(whatsAppListener);
    }

    logger.info('ChannelGateway started', this.channelGateway.getStatus());
  }

  /**
   * Get the primary server instance (for stdio transport)
   */
  getServer(): McpServer {
    return this.server;
  }

  /**
   * Gracefully shutdown the server
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down MCP server...');

    // Stop channel gateway first
    if (this.channelGateway) {
      await this.channelGateway.stop();
      this.channelGateway = null;
    }

    // Close all active MCP sessions
    for (const [sessionId, session] of this.sessions) {
      try {
        await session.server.close();
        logger.debug('Closed MCP session', { sessionId });
      } catch (error) {
        logger.warn('Error closing MCP session:', { sessionId, error });
      }
    }
    this.sessions.clear();

    // Close the primary server (stdio)
    try {
      await this.server.close();
    } catch (error) {
      logger.warn('Error closing primary MCP server:', error);
    }

    if (this.httpServer) {
      this.httpServer.closeAllConnections();
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    logger.info('MCP server shut down');
  }

  getChannelGateway(): ChannelGateway | null {
    return this.channelGateway;
  }

  getPort(): number | null {
    if (this.httpServer) {
      const addr = this.httpServer.address();
      if (addr && typeof addr === 'object') {
        return addr.port;
      }
    }
    return null;
  }

  /**
   * Notify ALL connected clients that tools have changed.
   */
  async notifyToolsChanged(): Promise<void> {
    this.toolsVersion++;
    logger.info(`Tools changed, notifying ${this.sessions.size} clients (version ${this.toolsVersion})`);

    const errors: string[] = [];
    for (const [sessionId, session] of this.sessions) {
      try {
        await session.server.server.notification({
          method: 'notifications/tools/list_changed',
          params: {},
        });
      } catch (error) {
        errors.push(sessionId);
        logger.debug('Could not send tools notification to session', { sessionId, error });
      }
    }

    if (errors.length > 0) {
      logger.debug(`Tools notification failed for ${errors.length}/${this.sessions.size} sessions`);
    } else if (this.sessions.size > 0) {
      logger.info('Tools list_changed notification sent to all sessions');
    }
  }

  getToolsVersion(): number {
    return this.toolsVersion;
  }

  /** Get count of active MCP sessions */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}

export async function createMCPServer(dataComposer: DataComposer, config?: MCPServerConfig): Promise<MCPServer> {
  return new MCPServer(dataComposer, config);
}

export { ChannelGateway, type ChannelGatewayConfig, type IncomingMessageHandler };
