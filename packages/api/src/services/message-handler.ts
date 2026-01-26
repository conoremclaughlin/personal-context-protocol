/**
 * Message Handler Service
 *
 * Wires together:
 * - Inbound messages from clawdbot/channels
 * - User resolution
 * - Agent orchestrator (Claude Code)
 * - Session persistence (Supabase)
 * - Outbound message delivery
 */

import { EventEmitter } from 'events';
import type { DataComposer } from '../data/composer';
import { AgentOrchestrator, createAgentOrchestrator } from './agent-orchestrator';
import type { InboundMessage, ChannelPlatform } from '../channels/types';
import type { AgentSession } from '../data/repositories/agent-sessions.repository';
import { resolveUser } from './user-resolver';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import path from 'path';

// Telegram API for sending responses
const TELEGRAM_API = 'https://api.telegram.org';

export interface MessageHandlerConfig {
  /** Model to use for Claude Code */
  model?: string;
  /** System prompt to append */
  systemPrompt?: string;
  /** Working directory for Claude Code */
  workingDirectory?: string;
  /** Whether to include context in system prompt */
  includeContext?: boolean;
}

export interface OutboundMessage {
  platform: ChannelPlatform;
  chatId: string;
  text: string;
  replyToMessageId?: string;
}

export interface MessageResult {
  success: boolean;
  response?: string;
  sessionId?: string;
  error?: string;
  cost?: number;
}

export class MessageHandler extends EventEmitter {
  private dataComposer: DataComposer;
  private orchestrator: AgentOrchestrator;
  private config: MessageHandlerConfig;

  // Track chat IDs per platform for users
  private userChatIds: Map<string, Map<ChannelPlatform, string>> = new Map();

  constructor(dataComposer: DataComposer, config?: MessageHandlerConfig) {
    super();
    this.dataComposer = dataComposer;
    this.config = {
      model: config?.model || 'sonnet',
      systemPrompt: config?.systemPrompt,
      workingDirectory: config?.workingDirectory || process.cwd(),
      includeContext: config?.includeContext ?? true,
    };

    // Initialize orchestrator
    const mcpConfigPath = path.resolve(this.config.workingDirectory!, '.mcp.json');
    this.orchestrator = createAgentOrchestrator({
      model: this.config.model,
      workingDirectory: this.config.workingDirectory,
      mcpConfig: mcpConfigPath,
      systemPrompt: this.config.systemPrompt,
    });

    // Forward orchestrator events
    this.orchestrator.on('text', (text) => this.emit('text', text));
    this.orchestrator.on('system', (msg) => this.emit('system', msg));
  }

  /**
   * Handle an inbound message from any channel
   */
  async handleMessage(message: InboundMessage): Promise<MessageResult> {
    const startTime = Date.now();

    try {
      logger.info(`Handling message from ${message.platform}`, {
        senderId: message.sender.id,
        body: message.body.substring(0, 100),
      });

      // 1. Resolve user
      const userIdentifier = this.buildUserIdentifier(message);
      const resolved = await resolveUser(userIdentifier, this.dataComposer);

      if (!resolved) {
        logger.warn('Could not resolve user', { identifier: userIdentifier });
        return {
          success: false,
          error: 'User not found. Please register first.',
        };
      }

      const { user } = resolved;

      // Store chat ID for later responses
      if (message.sender.id) {
        this.storeChatId(user.id, message.platform, message.sender.id);
      }

      // 2. Build context-aware prompt
      let prompt = message.body;
      if (this.config.includeContext) {
        const contextPrompt = await this.buildContextPrompt(user.id);
        if (contextPrompt) {
          prompt = `${contextPrompt}\n\nUser message: ${message.body}`;
        }
      }

      // 3. Get existing session from DB or orchestrator memory
      let existingDbSession: AgentSession | null = null;
      const sessionKey = `${message.platform}:${message.sender.id}`;

      // Check DB first for persisted session
      existingDbSession = await this.dataComposer.repositories.agentSessions
        .findActiveByUserAndPlatform(user.id, message.platform, message.sender.id);

      // Fall back to orchestrator memory
      const existingMemorySession = this.orchestrator.listSessions().find(
        (s) => s.userId === user.id && s.platform === message.platform
      );

      const sessionIdToUse = existingDbSession?.session_id || existingMemorySession?.sessionId;

      // 4. Send to orchestrator
      const result = await this.orchestrator.sendMessage(prompt, {
        sessionId: sessionIdToUse,
        userId: user.id,
        platform: message.platform,
      });

      // 5. Persist session to DB if new
      if (result.success && result.sessionId) {
        if (existingDbSession) {
          // Update existing session
          await this.dataComposer.repositories.agentSessions.recordActivity(
            existingDbSession.id,
            true,
            result.cost || 0
          );
        } else {
          // Create new session record
          try {
            await this.dataComposer.repositories.agentSessions.create({
              user_id: user.id,
              session_id: result.sessionId,
              session_key: sessionKey,
              platform: message.platform,
              platform_chat_id: message.sender.id,
              backend: 'claude-code',
              model: this.config.model,
              working_directory: this.config.workingDirectory,
              mcp_config_path: path.resolve(this.config.workingDirectory!, '.mcp.json'),
            });
            logger.info(`Created new session record for ${sessionKey}`, { sessionId: result.sessionId });
          } catch (err) {
            // Session may already exist (race condition), that's fine
            logger.warn('Failed to create session record (may already exist):', err);
          }
        }
      }

      if (!result.success) {
        logger.error('Orchestrator returned error', { error: result.error });
        return {
          success: false,
          error: result.error || 'Failed to process message',
        };
      }

      // 6. Send response back to channel
      if (result.content && message.sender.id) {
        await this.sendResponse({
          platform: message.platform,
          chatId: message.sender.id,
          text: result.content,
          replyToMessageId: message.messageId,
        });
      }

      logger.info(`Message handled in ${Date.now() - startTime}ms`, {
        userId: user.id,
        sessionId: result.sessionId,
        cost: result.cost,
      });

      return {
        success: true,
        response: result.content,
        sessionId: result.sessionId,
        cost: result.cost,
      };

    } catch (error) {
      logger.error('Error handling message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build user identifier from inbound message
   */
  private buildUserIdentifier(message: InboundMessage) {
    return {
      platform: message.platform as 'telegram' | 'whatsapp' | 'discord',
      platformId: message.sender.id,
      phone: message.sender.phone,
      email: undefined,
      userId: undefined,
    };
  }

  /**
   * Build context-aware prompt with user/project/focus info
   */
  private async buildContextPrompt(userId: string): Promise<string | null> {
    try {
      const parts: string[] = [];

      // Get user context
      const userContext = await this.dataComposer.repositories.context.findByUserAndType(
        userId,
        'user',
        null
      );
      if (userContext) {
        parts.push(`[User Context]\n${userContext.summary}`);
      }

      // Get assistant context
      const assistantContext = await this.dataComposer.repositories.context.findByUserAndType(
        userId,
        'assistant',
        null
      );
      if (assistantContext) {
        parts.push(`[Assistant Context]\n${assistantContext.summary}`);
      }

      // Get current focus
      const focus = await this.dataComposer.repositories.sessionFocus.findLatestByUser(userId);
      if (focus) {
        let focusText = `[Current Focus]\n${focus.focus_summary || 'No specific focus set.'}`;

        // Add project info if available
        if (focus.project_id) {
          const project = await this.dataComposer.repositories.projects.findById(focus.project_id);
          if (project) {
            focusText += `\n\nActive Project: ${project.name}`;
            if (project.description) {
              focusText += `\nDescription: ${project.description}`;
            }
            if (project.tech_stack && project.tech_stack.length > 0) {
              focusText += `\nTech Stack: ${project.tech_stack.join(', ')}`;
            }
          }
        }
        parts.push(focusText);
      }

      if (parts.length === 0) {
        return null;
      }

      return `--- Personal Context ---\n${parts.join('\n\n')}\n--- End Context ---`;
    } catch (error) {
      logger.warn('Failed to build context prompt:', error);
      return null;
    }
  }

  /**
   * Store chat ID for a user/platform combo
   */
  private storeChatId(userId: string, platform: ChannelPlatform, chatId: string): void {
    if (!this.userChatIds.has(userId)) {
      this.userChatIds.set(userId, new Map());
    }
    this.userChatIds.get(userId)!.set(platform, chatId);
  }

  /**
   * Get stored chat ID for a user/platform
   */
  getChatId(userId: string, platform: ChannelPlatform): string | undefined {
    return this.userChatIds.get(userId)?.get(platform);
  }

  /**
   * Send a response to a channel
   */
  async sendResponse(message: OutboundMessage): Promise<boolean> {
    try {
      switch (message.platform) {
        case 'telegram':
          return await this.sendTelegramMessage(message.chatId, message.text, message.replyToMessageId);
        case 'whatsapp':
          // TODO: Implement WhatsApp sending
          logger.warn('WhatsApp sending not yet implemented');
          return false;
        default:
          logger.warn(`Unsupported platform for sending: ${message.platform}`);
          return false;
      }
    } catch (error) {
      logger.error('Failed to send response:', error);
      return false;
    }
  }

  /**
   * Send a Telegram message
   */
  private async sendTelegramMessage(
    chatId: string,
    text: string,
    replyToMessageId?: string
  ): Promise<boolean> {
    const token = env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      logger.error('TELEGRAM_BOT_TOKEN not configured');
      return false;
    }

    try {
      const url = `${TELEGRAM_API}/bot${token}/sendMessage`;
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
      };

      if (replyToMessageId) {
        body.reply_to_message_id = parseInt(replyToMessageId, 10);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json() as { ok: boolean; description?: string };
      if (!data.ok) {
        // Retry without Markdown if parsing fails
        if (data.description?.includes("can't parse")) {
          body.parse_mode = undefined;
          const retryResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const retryData = await retryResponse.json() as { ok: boolean };
          return retryData.ok;
        }
        logger.error('Telegram API error:', data.description);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Failed to send Telegram message:', error);
      return false;
    }
  }

  /**
   * Get the orchestrator (for direct access if needed)
   */
  getOrchestrator(): AgentOrchestrator {
    return this.orchestrator;
  }

  /**
   * Get all active sessions from database
   * Useful for listing sessions that can be attached from terminal
   */
  async getActiveSessions(userId?: string): Promise<AgentSession[]> {
    if (userId) {
      return this.dataComposer.repositories.agentSessions.listActiveByUser(userId);
    }
    return this.dataComposer.repositories.agentSessions.listAllActive();
  }

  /**
   * Get session info for terminal attachment
   * Returns the command to run to attach to a session
   */
  async getSessionAttachCommand(sessionId: string): Promise<string | null> {
    const session = await this.dataComposer.repositories.agentSessions.findBySessionId(sessionId);
    if (!session || session.backend !== 'claude-code') {
      return null;
    }

    let cmd = `claude --resume ${session.session_id}`;
    if (session.mcp_config_path) {
      cmd += ` --mcp-config "${session.mcp_config_path}"`;
    }
    return cmd;
  }

  /**
   * Get the data composer (for direct access if needed)
   */
  getDataComposer(): DataComposer {
    return this.dataComposer;
  }
}

/**
 * Create a message handler instance
 */
export function createMessageHandler(
  dataComposer: DataComposer,
  config?: MessageHandlerConfig
): MessageHandler {
  return new MessageHandler(dataComposer, config);
}
