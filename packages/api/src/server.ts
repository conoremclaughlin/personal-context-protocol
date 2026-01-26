#!/usr/bin/env npx tsx
/**
 * PCP Server - Personal Context Protocol
 *
 * Main entry point that orchestrates:
 * - Telegram listener for incoming messages
 * - Message handler with Claude Code orchestration
 * - Session persistence to Supabase
 * - MCP server for context tools
 *
 * Run: npx tsx src/server.ts
 *      yarn start
 */

import path from 'path';
import { getDataComposer } from './data/composer';
import { createMessageHandler, MessageHandler } from './services/message-handler';
import { createTelegramListener, TelegramListener } from './channels/telegram-listener';
import { logger } from './utils/logger';
import { env } from './config/env';

// Server configuration
interface ServerConfig {
  /** Model to use for Claude Code (default: sonnet) */
  model?: string;
  /** Working directory for Claude Code */
  workingDirectory?: string;
  /** Telegram polling interval in ms */
  telegramPollingInterval?: number;
  /** Allowed Telegram chat IDs (empty = allow all) */
  allowedTelegramChats?: string[];
}

// Global state
let messageHandler: MessageHandler | null = null;
let telegramListener: TelegramListener | null = null;
let isShuttingDown = false;

/**
 * Start the PCP server
 */
async function startServer(config: ServerConfig = {}): Promise<void> {
  logger.info('Starting PCP Server...');

  // Resolve configuration
  const workingDirectory = config.workingDirectory || path.resolve(__dirname, '../../..');
  const model = config.model || env.DEFAULT_MODEL || 'sonnet';

  logger.info(`Configuration:`, {
    workingDirectory,
    model,
    telegramPollingInterval: config.telegramPollingInterval || 1000,
  });

  // 1. Initialize data layer
  logger.info('Initializing data layer...');
  const dataComposer = await getDataComposer();
  logger.info('Data layer ready');

  // 2. Create message handler
  logger.info('Creating message handler...');
  messageHandler = createMessageHandler(dataComposer, {
    model,
    workingDirectory,
    includeContext: true,
  });

  // Forward handler events to console
  messageHandler.on('text', (text: string) => {
    logger.debug(`[Claude] ${text}`);
  });
  messageHandler.on('system', (msg: string) => {
    logger.debug(`[System] ${msg}`);
  });

  logger.info('Message handler ready');

  // 3. Create and start Telegram listener
  if (env.TELEGRAM_BOT_TOKEN) {
    logger.info('Starting Telegram listener...');
    telegramListener = createTelegramListener({
      pollingInterval: config.telegramPollingInterval || 1000,
      allowedChatIds: config.allowedTelegramChats,
    });

    // Wire up message handling
    telegramListener.onMessage(async (message) => {
      logger.info(`Received message from ${message.sender.username || message.sender.id}`);

      const result = await messageHandler!.handleMessage(message);

      if (result.success) {
        logger.info(`Message processed successfully`, {
          sessionId: result.sessionId,
          cost: result.cost,
        });
      } else {
        logger.error(`Message processing failed: ${result.error}`);
      }
    });

    // Handle listener events
    telegramListener.on('connected', (bot) => {
      logger.info(`Telegram bot connected: @${bot.username}`);
    });

    telegramListener.on('error', (error) => {
      logger.error('Telegram listener error:', error);
    });

    await telegramListener.start();
    logger.info('Telegram listener started');
  } else {
    logger.warn('TELEGRAM_BOT_TOKEN not set - Telegram listener disabled');
  }

  // 4. Print active sessions for terminal attachment
  await printActiveSessions();

  // Ready
  logger.info('PCP Server is running');
  logger.info('Press Ctrl+C to stop');
}

/**
 * Print active sessions that can be attached from terminal
 */
async function printActiveSessions(): Promise<void> {
  if (!messageHandler) return;

  try {
    const sessions = await messageHandler.getActiveSessions();

    if (sessions.length > 0) {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info('Active Sessions (attach from terminal):');
      logger.info('='.repeat(60));

      for (const session of sessions) {
        const cmd = await messageHandler.getSessionAttachCommand(session.session_id);
        logger.info(`\n  Session: ${session.session_key || session.session_id}`);
        logger.info(`  Platform: ${session.platform || 'unknown'}`);
        logger.info(`  Model: ${session.model || 'default'}`);
        logger.info(`  Messages: ${session.message_count}`);
        if (cmd) {
          logger.info(`  Attach: ${cmd}`);
        }
      }

      logger.info(`\n${'='.repeat(60)}\n`);
    }
  } catch (error) {
    logger.debug('Could not list active sessions:', error);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('\nShutting down PCP Server...');

  // Stop Telegram listener
  if (telegramListener) {
    await telegramListener.stop();
    logger.info('Telegram listener stopped');
  }

  // Note: We don't end sessions on shutdown - they can be resumed
  logger.info('Sessions preserved for resumption');

  logger.info('Shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

// Start the server
startServer({
  // Use environment variables or defaults
  model: env.DEFAULT_MODEL || 'sonnet',
  workingDirectory: process.env.PCP_WORKING_DIR || path.resolve(__dirname, '../../..'),
}).catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
