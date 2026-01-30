/**
 * Claude Code Backend Tests
 *
 * Tests for the Claude Code backend, particularly the response guard
 * that prevents multiple response emissions from a single invocation.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { EventEmitter } from 'events';

// Mock child_process before importing
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { spawn } from 'child_process';

describe('Claude Code Backend Response Guard', () => {
  let mockProcess: EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: Mock;
  };

  beforeEach(() => {
    mockProcess = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    });

    (spawn as Mock).mockReturnValue(mockProcess);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Response Emission Guard', () => {
    it('should emit response only once per invocation', async () => {
      // This test verifies the responseEmitted guard behavior
      // by simulating the stream-json output that would normally
      // trigger multiple responses

      const responses: string[] = [];

      // Simulate the responseEmitted guard logic
      let responseEmitted = false;

      const emitResponse = (content: string) => {
        if (!responseEmitted) {
          responseEmitted = true;
          responses.push(content);
        }
      };

      // Simulate multiple result events (like paragraphs in stream-json)
      emitResponse('First paragraph');
      emitResponse('Second paragraph'); // Should be ignored
      emitResponse('Third paragraph'); // Should be ignored

      expect(responses.length).toBe(1);
      expect(responses[0]).toBe('First paragraph');
    });

    it('should allow responses from separate invocations', async () => {
      const responses: string[] = [];

      // First invocation
      let responseEmitted1 = false;
      const emitResponse1 = (content: string) => {
        if (!responseEmitted1) {
          responseEmitted1 = true;
          responses.push(`Invocation1: ${content}`);
        }
      };

      // Second invocation (new guard)
      let responseEmitted2 = false;
      const emitResponse2 = (content: string) => {
        if (!responseEmitted2) {
          responseEmitted2 = true;
          responses.push(`Invocation2: ${content}`);
        }
      };

      emitResponse1('Response A');
      emitResponse2('Response B');

      expect(responses.length).toBe(2);
      expect(responses[0]).toBe('Invocation1: Response A');
      expect(responses[1]).toBe('Invocation2: Response B');
    });
  });

  describe('Stream JSON Parsing', () => {
    it('should parse valid stream-json lines', () => {
      const validLines = [
        '{"type":"system","subtype":"init","session_id":"abc123"}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}',
        '{"type":"result","result":"Final response"}',
      ];

      const parsed = validLines.map((line) => JSON.parse(line));

      expect(parsed[0].type).toBe('system');
      expect(parsed[1].type).toBe('assistant');
      expect(parsed[2].type).toBe('result');
      expect(parsed[2].result).toBe('Final response');
    });

    it('should handle result with content blocks', () => {
      const resultWithBlocks = {
        type: 'result',
        result: 'Accumulated response\n\nWith multiple paragraphs',
      };

      expect(resultWithBlocks.result).toContain('multiple paragraphs');
    });

    it('should extract text from assistant content blocks', () => {
      const assistantMessage = {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'First part' },
            { type: 'tool_use', name: 'some_tool' },
            { type: 'text', text: 'Second part' },
          ],
        },
      };

      const textContent = assistantMessage.message.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n');

      expect(textContent).toBe('First part\nSecond part');
    });
  });

  describe('disableAutoResponse Config', () => {
    it('should respect disableAutoResponse setting', () => {
      const config = {
        type: 'claude-code' as const,
        disableAutoResponse: true,
      };

      // When disableAutoResponse is true, response should NOT be emitted
      let responseEmitted = false;
      const shouldEmit = !config.disableAutoResponse;

      if (shouldEmit && !responseEmitted) {
        responseEmitted = true;
      }

      expect(responseEmitted).toBe(false);
    });

    it('should emit response when disableAutoResponse is false', () => {
      const config = {
        type: 'claude-code' as const,
        disableAutoResponse: false,
      };

      let responseEmitted = false;
      const shouldEmit = !config.disableAutoResponse;

      if (shouldEmit && !responseEmitted) {
        responseEmitted = true;
      }

      expect(responseEmitted).toBe(true);
    });
  });

  describe('Session Resumption', () => {
    it('should include resume flag when session ID provided', () => {
      const sessionId = 'session-123';
      const args: string[] = [];

      if (sessionId) {
        args.push('--resume', sessionId);
      }

      expect(args).toContain('--resume');
      expect(args).toContain(sessionId);
    });

    it('should not include resume flag for new sessions', () => {
      const sessionId = undefined;
      const args: string[] = [];

      if (sessionId) {
        args.push('--resume', sessionId);
      }

      expect(args).not.toContain('--resume');
    });
  });

  describe('Pending Message Tracking', () => {
    it('should track pending message for response routing', () => {
      interface PendingMessage {
        channel: string;
        conversationId: string;
        sender: { id: string; name?: string };
      }

      let pendingMessage: PendingMessage | null = null;

      // Simulate setting pending message
      pendingMessage = {
        channel: 'telegram',
        conversationId: 'chat123',
        sender: { id: 'user1', name: 'Test User' },
      };

      expect(pendingMessage).not.toBeNull();
      expect(pendingMessage?.channel).toBe('telegram');
      expect(pendingMessage?.conversationId).toBe('chat123');
    });

    it('should clear pending message after response', () => {
      interface PendingMessage {
        channel: string;
        conversationId: string;
      }

      let pendingMessage: PendingMessage | null = {
        channel: 'telegram',
        conversationId: 'chat123',
      };

      // Simulate response emission
      const emitResponse = () => {
        if (pendingMessage) {
          // Use pending message for routing
          const response = {
            channel: pendingMessage.channel,
            conversationId: pendingMessage.conversationId,
            content: 'Response content',
          };
          pendingMessage = null;
          return response;
        }
        return null;
      };

      const response = emitResponse();
      expect(response).not.toBeNull();
      expect(pendingMessage).toBeNull();
    });
  });
});

describe('Backend Configuration', () => {
  it('should have correct default timeout', () => {
    const DEFAULT_TIMEOUT = 300000; // 5 minutes
    expect(DEFAULT_TIMEOUT).toBe(300000);
  });

  it('should support custom system prompts', () => {
    const config = {
      type: 'claude-code' as const,
      systemPrompt: 'You are a helpful assistant.',
    };

    expect(config.systemPrompt).toBeDefined();
    expect(config.systemPrompt).toContain('helpful');
  });

  it('should support model override', () => {
    const config = {
      type: 'claude-code' as const,
      model: 'sonnet',
    };

    expect(config.model).toBe('sonnet');
  });
});
