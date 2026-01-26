/**
 * Agent Orchestrator
 *
 * Manages Claude Code sessions for processing messages from various channels.
 * Spawns Claude Code processes with MCP tools configured, handles message routing,
 * and captures responses.
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface AgentSession {
  sessionId: string;
  userId?: string;
  platform?: string;
  createdAt: number;
  lastActivityAt: number;
  messages: AgentMessage[];
}

export interface AgentResponse {
  success: boolean;
  content: string;
  sessionId: string;
  cost?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  error?: string;
}

export interface ClaudeStreamMessage {
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

export interface OrchestratorConfig {
  /** Path to MCP config file or JSON string */
  mcpConfig?: string;
  /** Model to use (default: claude-sonnet-4-20250514) */
  model?: string;
  /** System prompt to append */
  systemPrompt?: string;
  /** Working directory for Claude Code */
  workingDirectory?: string;
  /** Timeout in ms (default: 120000) */
  timeout?: number;
}

const DEFAULT_CONFIG: Required<OrchestratorConfig> = {
  mcpConfig: '',
  model: 'sonnet',
  systemPrompt: '',
  workingDirectory: process.cwd(),
  timeout: 120000,
};

export class AgentOrchestrator extends EventEmitter {
  private config: Required<OrchestratorConfig>;
  private sessions: Map<string, AgentSession> = new Map();

  constructor(config?: OrchestratorConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Send a message to Claude Code and get a response
   */
  async sendMessage(
    message: string,
    options?: {
      sessionId?: string;
      userId?: string;
      platform?: string;
    }
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const result = await this.executeClaudeCode(message, options?.sessionId);

      // Update or create session
      const session = this.getOrCreateSession(result.sessionId, options?.userId, options?.platform);
      session.messages.push({ role: 'user', content: message, timestamp: startTime });
      session.messages.push({ role: 'assistant', content: result.content, timestamp: Date.now() });
      session.lastActivityAt = Date.now();

      return result;
    } catch (error) {
      logger.error('Agent orchestrator error:', error);
      return {
        success: false,
        content: '',
        sessionId: options?.sessionId || '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute Claude Code as a subprocess
   */
  private executeClaudeCode(message: string, sessionId?: string): Promise<AgentResponse> {
    return new Promise((resolve, reject) => {
      const args = this.buildClaudeArgs(sessionId);

      logger.info(`Spawning Claude Code with args: claude ${args.join(' ')}`);

      const proc = spawn('claude', args, {
        cwd: this.config.workingDirectory,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let finalResult: AgentResponse | null = null;

      proc.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;

        // Parse streaming JSON lines
        const lines = chunk.split('\n').filter((l) => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as ClaudeStreamMessage;
            this.handleStreamMessage(parsed);

            if (parsed.type === 'result') {
              finalResult = {
                success: !parsed.is_error,
                content: parsed.result || '',
                sessionId: parsed.session_id || '',
                cost: parsed.total_cost_usd,
                usage: parsed.usage
                  ? {
                      inputTokens: parsed.usage.input_tokens,
                      outputTokens: parsed.usage.output_tokens,
                    }
                  : undefined,
              };
            }
          } catch {
            // Not JSON or partial line, ignore
          }
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0 && !finalResult) {
          reject(new Error(`Claude Code exited with code ${code}: ${stderr}`));
          return;
        }

        if (finalResult) {
          resolve(finalResult);
        } else {
          // Fallback: try to extract result from stdout
          resolve({
            success: true,
            content: stdout.trim(),
            sessionId: sessionId || '',
          });
        }
      });

      proc.on('error', (error) => {
        reject(new Error(`Failed to spawn Claude Code: ${error.message}`));
      });

      // Set timeout
      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Claude Code timed out after ${this.config.timeout}ms`));
      }, this.config.timeout);

      proc.on('close', () => clearTimeout(timeout));

      // Send the message
      proc.stdin.write(message);
      proc.stdin.end();
    });
  }

  /**
   * Build CLI arguments for Claude Code
   */
  private buildClaudeArgs(sessionId?: string): string[] {
    const args = ['-p', '--output-format', 'stream-json', '--verbose'];

    if (this.config.model) {
      args.push('--model', this.config.model);
    }

    if (this.config.mcpConfig) {
      args.push('--mcp-config', this.config.mcpConfig);
    }

    if (this.config.systemPrompt) {
      args.push('--append-system-prompt', this.config.systemPrompt);
    }

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    return args;
  }

  /**
   * Handle streaming messages from Claude Code
   */
  private handleStreamMessage(msg: ClaudeStreamMessage): void {
    switch (msg.type) {
      case 'system':
        this.emit('system', msg);
        logger.debug('Claude Code initialized', { sessionId: msg.session_id });
        break;
      case 'assistant':
        this.emit('assistant', msg);
        // Extract text content for streaming
        if (msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              this.emit('text', block.text);
            }
          }
        }
        break;
      case 'result':
        this.emit('result', msg);
        break;
      case 'error':
        this.emit('error', msg);
        logger.error('Claude Code error', msg);
        break;
    }
  }

  /**
   * Get or create a session
   */
  private getOrCreateSession(sessionId: string, userId?: string, platform?: string): AgentSession {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        userId,
        platform,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        messages: [],
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  /**
   * Get an existing session
   */
  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all active sessions
   */
  listSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Clean up old sessions
   */
  cleanupSessions(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt > maxAgeMs) {
        this.sessions.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }
}

/**
 * Create an agent orchestrator instance
 */
export function createAgentOrchestrator(config?: OrchestratorConfig): AgentOrchestrator {
  return new AgentOrchestrator(config);
}
