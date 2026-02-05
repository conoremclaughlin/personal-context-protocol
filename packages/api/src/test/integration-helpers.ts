/**
 * Integration Test Helpers
 *
 * Utilities for creating real SessionHost instances wired to
 * the echo test agent for end-to-end integration testing.
 */

import { EventEmitter } from 'events';
import path from 'path';
import { SessionHost, type SessionHostConfig } from '../agent/session-host';
import { DataComposer, getDataComposer } from '../data/composer';

const PCP_ROOT = path.resolve(__dirname, '../../../..');
const MCP_CONFIG_PATH = path.resolve(PCP_ROOT, '.mcp.json');

/**
 * Build Echo's system prompt with compaction handling instructions.
 */
function buildEchoSystemPrompt(): string {
  return `## Identity
You are Echo, a test agent for integration testing. Your agentId is "echo".
Use agentId: "echo" when calling MCP tools that require it.

## Response Style
Keep responses under 50 words. Be concise and direct.

## Compaction Handling (CRITICAL)
When you receive a "[SYSTEM: SESSION COMPACTION REQUEST]" message:

1. Call \`mcp__pcp__compact_session\` with your userId to convert session logs to memories.

2. Call \`mcp__pcp__remember\` to create ONE consolidated summary memory:
   - userId: (from your context)
   - agentId: "echo"
   - content: A summary of the conversation and any important facts discussed
   - salience: "high"
   - topics: ["session-summary"]
   - source: "compaction"

3. Do NOT call send_response during compaction — this is an internal system task.

4. Do NOT call end_session — the system handles rotation automatically.

Complete compaction tasks silently and efficiently.`;
}

export interface EchoTestHostOptions {
  /** Max context tokens (default: 5000 — very low to trigger compaction quickly) */
  maxContextTokens?: number;
  /** Compaction threshold as fraction of maxContextTokens (default: 0.75) */
  compactionThreshold?: number;
  /** Hard rotation threshold as fraction of maxContextTokens (default: 0.85) */
  hardRotationThreshold?: number;
  /** Model to use (default: 'sonnet') */
  model?: string;
  /** Whether to disable context injection (default: true — keeps token count predictable) */
  disableContextInjection?: boolean;
}

export interface EchoTestHost {
  sessionHost: SessionHost;
  dataComposer: DataComposer;
  userId: string;
  cleanup: () => Promise<void>;
}

/**
 * Resolve the echo agent's userId from the database.
 * The echo identity is pre-seeded by migration 008.
 */
async function resolveEchoUserId(dataComposer: DataComposer): Promise<string> {
  const client = dataComposer.getClient();
  const { data, error } = await client
    .from('agent_identities')
    .select('user_id')
    .eq('agent_id', 'echo')
    .single();

  if (error || !data) {
    throw new Error(
      'Echo test agent identity not found in database.\n' +
      'Apply migration 008_add_echo_test_agent.sql first.'
    );
  }

  return data.user_id;
}

/**
 * Create a real SessionHost wired to the echo test agent.
 *
 * Uses very low token thresholds so compaction triggers quickly
 * without burning large amounts of quota.
 */
export async function createEchoTestHost(
  options?: EchoTestHostOptions
): Promise<EchoTestHost> {
  const dataComposer = await getDataComposer();
  const userId = await resolveEchoUserId(dataComposer);

  const maxContextTokens = options?.maxContextTokens ?? 5000;
  const compactionFraction = options?.compactionThreshold ?? 0.75;
  const hardFraction = options?.hardRotationThreshold ?? 0.85;

  const config: SessionHostConfig = {
    backend: {
      primaryBackend: 'claude-code',
      backends: {
        'claude-code': {
          mcpConfigPath: MCP_CONFIG_PATH,
          workingDirectory: PCP_ROOT,
          model: options?.model ?? 'sonnet',
          appendSystemPrompt: buildEchoSystemPrompt(),
          disableAutoResponse: false,
        },
      },
    },
    dataComposer,
    agentId: 'echo',
    maxContextTokens,
    compactionThreshold: Math.floor(maxContextTokens * compactionFraction),
    hardRotationThreshold: Math.floor(maxContextTokens * hardFraction),
    disableContextInjection: options?.disableContextInjection ?? true,
  };

  const sessionHost = new SessionHost(config);
  await sessionHost.initialize();

  return {
    sessionHost,
    dataComposer,
    userId,
    cleanup: async () => {
      await sessionHost.shutdown();
      await cleanupEchoTestData(dataComposer, userId);
    },
  };
}

/**
 * Wait for a specific event from an EventEmitter, with timeout.
 */
export function waitForEvent<T = unknown>(
  emitter: EventEmitter,
  eventName: string,
  timeoutMs = 60000
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.removeListener(eventName, handler);
      reject(new Error(`Timed out waiting for event "${eventName}" after ${timeoutMs}ms`));
    }, timeoutMs);

    function handler(data: T) {
      clearTimeout(timer);
      resolve(data);
    }

    emitter.once(eventName, handler);
  });
}

/**
 * Clean up echo test agent data from the database.
 * Removes memories, sessions, and session_logs created by echo.
 */
export async function cleanupEchoTestData(
  dataComposer: DataComposer,
  userId: string
): Promise<void> {
  const client = dataComposer.getClient();

  // Delete echo's memories (agent uses agent_id='echo', source may vary)
  await client
    .from('memories')
    .delete()
    .eq('user_id', userId)
    .eq('agent_id', 'echo');

  // Delete echo's session logs (via agent_sessions join)
  const { data: echoSessions } = await client
    .from('agent_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('agent_id', 'echo');

  if (echoSessions && echoSessions.length > 0) {
    const sessionIds = echoSessions.map((s) => s.id);

    await client
      .from('session_logs')
      .delete()
      .in('session_id', sessionIds);

    await client
      .from('agent_sessions')
      .delete()
      .eq('user_id', userId)
      .eq('agent_id', 'echo');
  }
}
