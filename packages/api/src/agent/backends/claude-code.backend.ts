/**
 * Claude Code Backend
 *
 * Manages a persistent Claude Code process for fast message handling.
 * Instead of spawning per message, keeps the process alive and sends
 * messages via stdin.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import type {
  AgentBackend,
  AgentMessage,
  BackendHealth,
  BackendConfig,
  BackendType,
} from '../types';

interface ClaudeStreamMessage {
  type: 'system' | 'assistant' | 'result' | 'user' | 'error';
  subtype?: string;
  session_id?: string;
  result?: string;
  message?: {
    content: Array<{ type: string; text?: string }>;
  };
  total_cost_usd?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  is_error?: boolean;
}

export interface ClaudeCodeConfig extends BackendConfig {
  type: 'claude-code';
  mcpConfigPath?: string;
  workingDirectory?: string;
  model?: string;
  systemPrompt?: string;
  timeout?: number;
}

const DEFAULT_CONFIG: Partial<ClaudeCodeConfig> = {
  model: 'sonnet',
  workingDirectory: process.cwd(),
  timeout: 300000, // 5 minutes for persistent session
};

export class ClaudeCodeBackend extends EventEmitter implements AgentBackend {
  readonly type: BackendType = 'claude-code';

  private config: ClaudeCodeConfig;
  private process: ChildProcess | null = null;
  private sessionId: string | null = null;
  private ready = false;
  private messageCount = 0;
  private startTime: Date | null = null;
  private lastError: string | null = null;
  private outputBuffer = '';

  // Track pending message for response routing
  private pendingMessage: AgentMessage | null = null;

  constructor(config: Partial<ClaudeCodeConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config, type: 'claude-code' } as ClaudeCodeConfig;
  }

  async initialize(): Promise<void> {
    if (this.process) {
      logger.warn('Claude Code backend already initialized');
      return;
    }

    logger.info('Initializing Claude Code backend...');

    const args = this.buildArgs();
    logger.info(`Spawning Claude Code: claude ${args.join(' ')}`);

    this.process = spawn('claude', args, {
      cwd: this.config.workingDirectory,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.startTime = new Date();
    this.setupProcessHandlers();

    // Wait for the process to be ready
    await this.waitForReady();
  }

  async shutdown(): Promise<void> {
    if (!this.process) {
      return;
    }

    logger.info('Shutting down Claude Code backend...');

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        logger.warn('Force killing Claude Code process');
        this.process?.kill('SIGKILL');
        resolve();
      }, 5000);

      this.process.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });

      // Send exit command
      this.process.stdin?.write('/exit\n');

      // Give it a moment, then SIGTERM
      setTimeout(() => {
        this.process?.kill('SIGTERM');
      }, 1000);
    });
  }

  async sendMessage(message: AgentMessage): Promise<void> {
    if (!this.process || !this.ready) {
      throw new Error('Claude Code backend not ready');
    }

    this.pendingMessage = message;
    this.messageCount++;

    // Format message with channel context
    const formattedInput = this.formatInput(message);

    logger.info(`Sending message to Claude Code [${message.channel}]: ${message.content.substring(0, 100)}...`);

    // Write to stdin
    this.process.stdin?.write(formattedInput + '\n');

    // Response will come via MCP send_response tool, not stdout parsing
    // The tool handler will route it back to the appropriate channel
  }

  isReady(): boolean {
    return this.ready && this.process !== null;
  }

  getHealth(): BackendHealth {
    return {
      healthy: this.ready && this.process !== null,
      lastCheck: new Date(),
      sessionId: this.sessionId || undefined,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : undefined,
      messageCount: this.messageCount,
      error: this.lastError || undefined,
    };
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async resumeSession(sessionId: string): Promise<boolean> {
    if (this.process) {
      // Can't change session while running
      logger.warn('Cannot resume session while process is running');
      return false;
    }

    this.sessionId = sessionId;
    await this.initialize();
    return true;
  }

  /**
   * Get the current pending message (for response routing)
   */
  getPendingMessage(): AgentMessage | null {
    return this.pendingMessage;
  }

  /**
   * Clear the pending message after response is sent
   */
  clearPendingMessage(): void {
    this.pendingMessage = null;
  }

  private buildArgs(): string[] {
    const args = [
      '--output-format', 'stream-json',
      '--verbose',
    ];

    if (this.config.model) {
      args.push('--model', this.config.model);
    }

    if (this.config.mcpConfigPath) {
      args.push('--mcp-config', this.config.mcpConfigPath);
    }

    if (this.config.systemPrompt) {
      args.push('--append-system-prompt', this.config.systemPrompt);
    }

    if (this.sessionId) {
      args.push('--resume', this.sessionId);
    }

    return args;
  }

  private setupProcessHandlers(): void {
    if (!this.process) return;

    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleStdout(data.toString());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      logger.debug('Claude Code stderr:', text);
      // Stderr often contains progress info, not just errors
    });

    this.process.on('close', (code) => {
      logger.info(`Claude Code process exited with code ${code}`);
      this.ready = false;
      this.process = null;
      this.emit('exit', code);
    });

    this.process.on('error', (error) => {
      logger.error('Claude Code process error:', error);
      this.lastError = error.message;
      this.emit('error', error);
    });
  }

  private handleStdout(chunk: string): void {
    this.outputBuffer += chunk;

    // Process complete JSON lines
    const lines = this.outputBuffer.split('\n');
    this.outputBuffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const parsed = JSON.parse(line) as ClaudeStreamMessage;
        this.handleStreamMessage(parsed);
      } catch {
        // Not JSON, emit as raw output
        this.emit('output', line);
      }
    }
  }

  private handleStreamMessage(msg: ClaudeStreamMessage): void {
    switch (msg.type) {
      case 'system':
        if (msg.session_id) {
          this.sessionId = msg.session_id;
        }
        if (msg.subtype === 'init') {
          this.ready = true;
          this.emit('ready');
          logger.info('Claude Code backend ready', { sessionId: this.sessionId });
        }
        break;

      case 'assistant':
        // Emit text chunks for streaming
        if (msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              this.emit('text', block.text);
            }
          }
        }
        break;

      case 'result':
        this.emit('result', {
          success: !msg.is_error,
          content: msg.result || '',
          sessionId: msg.session_id || '',
          cost: msg.total_cost_usd,
          usage: msg.usage,
        });
        break;

      case 'error':
        this.lastError = msg.result || 'Unknown error';
        this.emit('error', new Error(this.lastError));
        logger.error('Claude Code error:', msg);
        break;
    }
  }

  private formatInput(message: AgentMessage): string {
    // Include channel context so Claude knows where the message came from
    // and can respond appropriately via send_response tool
    const parts: string[] = [];

    // Channel indicator
    parts.push(`[Channel: ${message.channel}]`);

    // Conversation context
    if (message.conversationId) {
      parts.push(`[Conversation: ${message.conversationId}]`);
    }

    // Sender info
    if (message.sender.name) {
      parts.push(`[From: ${message.sender.name}]`);
    }

    // The actual message
    parts.push('');
    parts.push(message.content);

    // Instructions for response (remind Claude to use send_response)
    parts.push('');
    parts.push('(Remember: Use the send_response MCP tool to reply to this message)');

    return parts.join('\n');
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Claude Code backend initialization timeout'));
      }, 30000);

      const checkReady = () => {
        if (this.ready) {
          clearTimeout(timeout);
          resolve();
        }
      };

      this.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      // Check immediately in case already ready
      checkReady();
    });
  }
}

/**
 * Create a Claude Code backend instance
 */
export function createClaudeCodeBackend(config?: Partial<ClaudeCodeConfig>): ClaudeCodeBackend {
  return new ClaudeCodeBackend(config);
}
