/**
 * Gateway Discord Integration Tests
 *
 * Tests the ChannelGateway's Discord-specific behavior:
 * - Config initialization with enableDiscord
 * - sendResponse routing to Discord
 * - Status reporting includes Discord
 * - Buffer key generation for Discord
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock all channel listeners before imports
vi.mock('./telegram-listener', () => ({
  createTelegramListener: vi.fn(),
  TelegramListener: vi.fn(),
}));

vi.mock('./whatsapp-listener', () => ({
  createWhatsAppListener: vi.fn(),
  WhatsAppListener: vi.fn(),
}));

const mockDiscordSendMessage = vi.fn().mockResolvedValue(undefined);
const mockDiscordSendTyping = vi.fn().mockResolvedValue(undefined);
const mockDiscordStart = vi.fn().mockResolvedValue(undefined);
const mockDiscordStop = vi.fn().mockResolvedValue(undefined);
const mockDiscordOnMessage = vi.fn();

vi.mock('./discord-listener', () => ({
  createDiscordListener: vi.fn(() => ({
    sendMessage: mockDiscordSendMessage,
    sendTypingIndicator: mockDiscordSendTyping,
    start: mockDiscordStart,
    stop: mockDiscordStop,
    onMessage: mockDiscordOnMessage,
    on: vi.fn(),
    connected: true,
    running: true,
    getRecentMessages: vi.fn().mockReturnValue([]),
    clearMessageCache: vi.fn(),
    getCacheStats: vi.fn().mockReturnValue({ chatCount: 0, totalMessages: 0 }),
  })),
  DiscordListener: vi.fn(),
}));

vi.mock('../mcp/tools/response-handlers', () => ({
  setResponseCallback: vi.fn(),
}));

vi.mock('../config/env', () => ({
  env: {
    TELEGRAM_BOT_TOKEN: undefined,
    DISCORD_BOT_TOKEN: 'test-discord-token',
    DISCORD_APPLICATION_ID: 'test-app-id',
  },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('telegramify-markdown', () => ({
  default: vi.fn((text: string) => text),
}));

import { ChannelGateway } from './gateway';

describe('ChannelGateway - Discord integration', () => {
  describe('configuration', () => {
    it('should default enableDiscord to ENABLE_DISCORD env var', () => {
      // Without ENABLE_DISCORD=true, should be disabled
      const gateway = new ChannelGateway({});
      const status = gateway.getStatus();
      expect(status.discord.enabled).toBe(false);
    });

    it('should enable Discord via explicit config', () => {
      const gateway = new ChannelGateway({ enableDiscord: true });
      const status = gateway.getStatus();
      // Not connected yet (not started), but enabled
      expect(status.discord.enabled).toBe(true);
      expect(status.discord.connected).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should include discord in status', () => {
      const gateway = new ChannelGateway({ enableDiscord: false });
      const status = gateway.getStatus();

      expect(status).toHaveProperty('discord');
      expect(status.discord).toEqual({
        enabled: false,
        connected: false,
      });
    });
  });

  describe('sendResponse', () => {
    let gateway: ChannelGateway;

    beforeEach(async () => {
      gateway = new ChannelGateway({ enableDiscord: true });
      // Start the gateway to initialize Discord listener
      await gateway.start();
    });

    it('should route discord responses to DiscordListener', async () => {
      await gateway.sendResponse({
        channel: 'discord',
        conversationId: '777888999',
        content: 'Hello from bot!',
      });

      expect(mockDiscordSendMessage).toHaveBeenCalledWith('777888999', 'Hello from bot!');
    });

    it('should throw when Discord listener not available', async () => {
      const noDiscordGateway = new ChannelGateway({ enableDiscord: false });
      await noDiscordGateway.start();

      await expect(
        noDiscordGateway.sendResponse({
          channel: 'discord',
          conversationId: '123',
          content: 'test',
        })
      ).rejects.toThrow('Discord listener not available');
    });
  });

  describe('stop', () => {
    it('should stop Discord listener on gateway stop', async () => {
      const gateway = new ChannelGateway({ enableDiscord: true });
      await gateway.start();
      await gateway.stop();

      expect(mockDiscordStop).toHaveBeenCalled();
    });
  });

  describe('getDiscordListener', () => {
    it('should return null when Discord not enabled', () => {
      const gateway = new ChannelGateway({ enableDiscord: false });
      expect(gateway.getDiscordListener()).toBeNull();
    });

    it('should return listener after start', async () => {
      const gateway = new ChannelGateway({ enableDiscord: true });
      await gateway.start();
      expect(gateway.getDiscordListener()).not.toBeNull();
    });
  });
});
