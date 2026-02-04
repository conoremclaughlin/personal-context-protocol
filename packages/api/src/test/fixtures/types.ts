/**
 * Types for test fixtures.
 *
 * These mirror the internal types from the Claude Code backend
 * for use in fixture files without importing from source.
 */

export interface ClaudeContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | Array<{ type: string; text?: string }>;
}

export interface ClaudeStreamMessage {
  type: 'system' | 'assistant' | 'result' | 'user' | 'error';
  subtype?: string;
  session_id?: string;
  result?: string;
  message?: {
    content: ClaudeContentBlock[];
  };
  total_cost_usd?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  is_error?: boolean;
}
