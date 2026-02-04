/**
 * Session Host Tests
 *
 * Tests for session persistence, restoration, and context window rotation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock dependencies
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../mcp/tools/response-handlers', () => ({
  setResponseCallback: vi.fn(),
  addPendingMessage: vi.fn(),
}));

vi.mock('../channels/agent-gateway', () => ({
  getAgentGateway: vi.fn(() => ({
    registerHandler: vi.fn(),
  })),
}));

// Mock BackendManager
const mockBackendManager = Object.assign(new EventEmitter(), {
  initialize: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  getSessionId: vi.fn().mockReturnValue(null),
  getActiveBackendType: vi.fn().mockReturnValue('claude-code'),
  setResponseHandler: vi.fn(),
  resumeSession: vi.fn().mockResolvedValue(true),
  clearSession: vi.fn(),
  getClaudeCodeBackend: vi.fn().mockReturnValue(null),
});

vi.mock('./backend-manager', () => ({
  BackendManager: vi.fn(),
  createBackendManager: vi.fn(() => mockBackendManager),
}));

// Mock Supabase query builder
function createMockQueryBuilder() {
  const builder: Record<string, any> = {};
  builder.from = vi.fn().mockReturnValue(builder);
  builder.select = vi.fn().mockReturnValue(builder);
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.upsert = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.is = vi.fn().mockReturnValue(builder);
  builder.not = vi.fn().mockReturnValue(builder);
  builder.order = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.single = vi.fn().mockResolvedValue({ data: null, error: null });
  return builder;
}

import { SessionHost } from './session-host';

describe('SessionHost', () => {
  let sessionHost: SessionHost;
  let mockQueryBuilder: ReturnType<typeof createMockQueryBuilder>;
  let mockDataComposer: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the mock backend manager events
    mockBackendManager.removeAllListeners();
    mockBackendManager.initialize.mockResolvedValue(undefined);
    mockBackendManager.resumeSession.mockResolvedValue(true);

    mockQueryBuilder = createMockQueryBuilder();
    mockDataComposer = {
      getClient: vi.fn().mockReturnValue(mockQueryBuilder),
      repositories: {
        users: { findById: vi.fn(), findByPlatformId: vi.fn() },
        context: { findAllByUser: vi.fn() },
        projects: { findAllByUser: vi.fn() },
        sessionFocus: { findLatestByUser: vi.fn() },
        memory: { recall: vi.fn(), getActiveSession: vi.fn() },
        conversations: { findByPlatformChatId: vi.fn(), findConversationByPlatformId: vi.fn().mockResolvedValue(null), createConversation: vi.fn(), createMessage: vi.fn() },
        activityStream: { getConversationHistory: vi.fn(), logActivity: vi.fn().mockResolvedValue({ id: 'act-mock' }) },
      },
    };

    sessionHost = new SessionHost({
      backend: { primaryBackend: 'claude-code', backends: {} },
      dataComposer: mockDataComposer,
      agentId: 'myra',
      maxContextTokens: 160000,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Session Restoration on Startup', () => {
    it('should restore Claude session from database on initialize', async () => {
      // Mock: First call to agent_identities returns user_id
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { user_id: 'user-123' },
        error: null,
      });
      // Mock: Second call to sessions returns an active session with claude_session_id
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'session-abc', claude_session_id: 'restored-session-xyz' },
        error: null,
      });

      await sessionHost.initialize();

      // Should have queried both tables
      expect(mockQueryBuilder.from).toHaveBeenCalledWith('agent_identities');
      expect(mockQueryBuilder.from).toHaveBeenCalledWith('sessions');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('agent_id', 'myra');

      // Should have called resumeSession on backend manager
      expect(mockBackendManager.resumeSession).toHaveBeenCalledWith('restored-session-xyz');
    });

    it('should not restore when no active session exists', async () => {
      // Mock: First call to agent_identities returns user_id
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { user_id: 'user-123' },
        error: null,
      });
      // Mock: Second call to sessions returns no session
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      await sessionHost.initialize();

      // Should NOT call resumeSession
      expect(mockBackendManager.resumeSession).not.toHaveBeenCalled();
    });

    it('should not restore when session has no claude_session_id', async () => {
      // Mock: First call to agent_identities returns user_id
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { user_id: 'user-123' },
        error: null,
      });
      // Mock: Second call to sessions returns session without claude_session_id
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'session-abc', claude_session_id: null },
        error: null,
      });

      await sessionHost.initialize();

      expect(mockBackendManager.resumeSession).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully during restoration', async () => {
      mockQueryBuilder.single.mockRejectedValueOnce(new Error('Connection refused'));

      // Should not throw — initialization should continue
      await expect(sessionHost.initialize()).resolves.toBeUndefined();

      // Backend should still be initialized
      expect(mockBackendManager.initialize).toHaveBeenCalled();
    });

    it('should skip restoration when agentId is not set', async () => {
      const hostWithoutAgent = new SessionHost({
        backend: { primaryBackend: 'claude-code', backends: {} },
        dataComposer: mockDataComposer,
      });

      await hostWithoutAgent.initialize();

      // Should not query the database at all
      expect(mockQueryBuilder.from).not.toHaveBeenCalled();
    });
  });

  describe('Session Persistence', () => {
    it('should persist claude_session_id when session:captured fires', async () => {
      await sessionHost.initialize();

      // Mock: DB finds an active PCP session
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'pcp-session-uuid' },
        error: null,
      });

      // Simulate backend capturing a session
      mockBackendManager.emit('session:captured', 'claude-sess-new-123');

      // Wait for async handler
      await vi.waitFor(() => {
        expect(mockQueryBuilder.update).toHaveBeenCalledWith({
          claude_session_id: 'claude-sess-new-123',
          status: 'active',
        });
      });
    });

    it('should not crash when no active PCP session exists to update', async () => {
      await sessionHost.initialize();

      // Mock: no active session found
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      // Should not throw
      mockBackendManager.emit('session:captured', 'claude-orphan-sess');

      // Wait for async handler to complete without error
      await new Promise((r) => setTimeout(r, 10));
    });

    it('should handle DB errors gracefully during persistence', async () => {
      await sessionHost.initialize();

      mockQueryBuilder.single.mockRejectedValueOnce(new Error('DB timeout'));

      // Should not throw
      mockBackendManager.emit('session:captured', 'claude-fail-sess');

      await new Promise((r) => setTimeout(r, 10));
    });
  });

  describe('Context Window Rotation', () => {
    it('should hard-rotate session when input tokens exceed hardRotationThreshold', async () => {
      // With maxContextTokens=160000: hardRotationThreshold = 95% = 152000
      await sessionHost.initialize();

      // Mock: DB finds session to mark as completed
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'session-to-rotate' },
        error: null,
      });

      // Emit usage that exceeds the hard rotation threshold (152000)
      mockBackendManager.emit('session:usage', {
        contextTokens: 155000,
        cumulativeOutputTokens: 40000,
        messageInputTokens: 5000,
        messageOutputTokens: 1000,
      });

      await vi.waitFor(() => {
        // Should mark session as completed
        expect(mockQueryBuilder.update).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'completed' })
        );
        // Should clear session on backend
        expect(mockBackendManager.clearSession).toHaveBeenCalled();
      });
    });

    it('should NOT rotate when tokens are below compaction threshold', async () => {
      await sessionHost.initialize();

      // 50k is well below the compaction threshold (75% of 160k = 120k)
      mockBackendManager.emit('session:usage', {
        contextTokens: 50000,
        cumulativeOutputTokens: 10000,
        messageInputTokens: 5000,
        messageOutputTokens: 1000,
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(mockBackendManager.clearSession).not.toHaveBeenCalled();
      expect(mockBackendManager.sendMessage).not.toHaveBeenCalled();
    });

    it('should emit session:rotated event when rotation occurs', async () => {
      await sessionHost.initialize();

      const rotated: unknown[] = [];
      sessionHost.on('session:rotated', (data) => rotated.push(data));

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'rotating-session' },
        error: null,
      });

      // Exceed hard rotation threshold
      mockBackendManager.emit('session:usage', {
        contextTokens: 200000,
        cumulativeOutputTokens: 50000,
        messageInputTokens: 10000,
        messageOutputTokens: 2000,
      });

      await vi.waitFor(() => {
        expect(rotated.length).toBe(1);
        expect(rotated[0]).toEqual({ agentId: 'myra' });
      });
    });

    it('should respect custom maxContextTokens config', async () => {
      const customHost = new SessionHost({
        backend: { primaryBackend: 'claude-code', backends: {} },
        dataComposer: mockDataComposer,
        agentId: 'myra',
        maxContextTokens: 50000, // Lower threshold — hard rotation at 95% = 47500
      });

      await customHost.initialize();

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'custom-session' },
        error: null,
      });

      // 48k tokens should trigger hard rotation with 50k max (95% = 47.5k)
      mockBackendManager.emit('session:usage', {
        contextTokens: 48000,
        cumulativeOutputTokens: 10000,
        messageInputTokens: 5000,
        messageOutputTokens: 1000,
      });

      await vi.waitFor(() => {
        expect(mockBackendManager.clearSession).toHaveBeenCalled();
      });
    });
  });

  describe('Graceful Compaction', () => {
    it('should send compaction message when tokens reach compaction threshold', async () => {
      // Default: compactionThreshold = 170000
      await sessionHost.initialize();

      // Mock: sendMessage resolves (compaction succeeds)
      mockBackendManager.sendMessage.mockResolvedValueOnce(undefined);
      // Mock: DB session for rotation after compaction
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'compaction-session' },
        error: null,
      });

      // 175k tokens — above compaction (170k) but below hard rotation (190k)
      mockBackendManager.emit('session:usage', {
        contextTokens: 145000,
        cumulativeOutputTokens: 30000,
        messageInputTokens: 5000,
        messageOutputTokens: 1000,
      });

      await vi.waitFor(() => {
        // Should send a compaction message to the agent
        expect(mockBackendManager.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            channel: 'agent',
            metadata: expect.objectContaining({ isInternal: true, isCompaction: true }),
          })
        );
        // Should rotate after compaction
        expect(mockBackendManager.clearSession).toHaveBeenCalled();
      });
    });

    it('should emit compaction events during the compaction lifecycle', async () => {
      await sessionHost.initialize();

      const events: string[] = [];
      sessionHost.on('session:compactionStarted', () => events.push('started'));
      sessionHost.on('session:compactionComplete', () => events.push('complete'));
      sessionHost.on('session:rotated', () => events.push('rotated'));

      mockBackendManager.sendMessage.mockResolvedValueOnce(undefined);
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'event-session' },
        error: null,
      });

      mockBackendManager.emit('session:usage', {
        contextTokens: 145000,
        cumulativeOutputTokens: 30000,
        messageInputTokens: 5000,
        messageOutputTokens: 1000,
      });

      await vi.waitFor(() => {
        expect(events).toEqual(['started', 'complete', 'rotated']);
      });
    });

    it('should still rotate when compaction fails', async () => {
      await sessionHost.initialize();

      const events: string[] = [];
      sessionHost.on('session:compactionFailed', () => events.push('failed'));
      sessionHost.on('session:rotated', () => events.push('rotated'));

      // Compaction fails
      mockBackendManager.sendMessage.mockRejectedValueOnce(new Error('Backend timeout'));
      // DB session for rotation
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'fail-session' },
        error: null,
      });

      mockBackendManager.emit('session:usage', {
        contextTokens: 145000,
        cumulativeOutputTokens: 30000,
        messageInputTokens: 5000,
        messageOutputTokens: 1000,
      });

      await vi.waitFor(() => {
        expect(events).toEqual(['failed', 'rotated']);
        expect(mockBackendManager.clearSession).toHaveBeenCalled();
      });
    });

    it('should not re-trigger compaction when compactionInProgress', async () => {
      await sessionHost.initialize();

      // First compaction: make sendMessage hang (never resolves during this test)
      let resolveCompaction: () => void;
      const compactionPromise = new Promise<void>((resolve) => {
        resolveCompaction = resolve;
      });
      mockBackendManager.sendMessage.mockReturnValueOnce(compactionPromise);

      // First usage event triggers compaction
      mockBackendManager.emit('session:usage', {
        contextTokens: 145000,
        cumulativeOutputTokens: 30000,
        messageInputTokens: 5000,
        messageOutputTokens: 1000,
      });

      // Wait a tick to let the handler start
      await new Promise((r) => setTimeout(r, 5));

      // Second usage event while compaction is in progress — should be skipped
      mockBackendManager.emit('session:usage', {
        contextTokens: 148000,
        cumulativeOutputTokens: 32000,
        messageInputTokens: 5000,
        messageOutputTokens: 2000,
      });

      await new Promise((r) => setTimeout(r, 5));

      // sendMessage should only be called once (from the first event)
      expect(mockBackendManager.sendMessage).toHaveBeenCalledTimes(1);

      // Clean up: resolve the compaction
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'cleanup-session' },
        error: null,
      });
      resolveCompaction!();
    });

    it('should respect custom compaction and hard rotation thresholds', async () => {
      const customHost = new SessionHost({
        backend: { primaryBackend: 'claude-code', backends: {} },
        dataComposer: mockDataComposer,
        agentId: 'myra',
        maxContextTokens: 100000,
        compactionThreshold: 60000, // Custom: 60%
        hardRotationThreshold: 80000, // Custom: 80%
      });

      await customHost.initialize();

      mockBackendManager.sendMessage.mockResolvedValueOnce(undefined);
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'custom-session' },
        error: null,
      });

      // 65k tokens — above custom compaction (60k) but below hard rotation (80k)
      mockBackendManager.emit('session:usage', {
        contextTokens: 65000,
        cumulativeOutputTokens: 15000,
        messageInputTokens: 5000,
        messageOutputTokens: 1000,
      });

      await vi.waitFor(() => {
        expect(mockBackendManager.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({ isCompaction: true }),
          })
        );
      });
    });

    it('should include compaction prompt content in the message', async () => {
      await sessionHost.initialize();

      mockBackendManager.sendMessage.mockResolvedValueOnce(undefined);
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'prompt-session' },
        error: null,
      });

      mockBackendManager.emit('session:usage', {
        contextTokens: 145000,
        cumulativeOutputTokens: 30000,
        messageInputTokens: 5000,
        messageOutputTokens: 1000,
      });

      await vi.waitFor(() => {
        const call = mockBackendManager.sendMessage.mock.calls[0][0];
        expect(call.content).toContain('SESSION COMPACTION REQUEST');
        expect(call.content).toContain('compact_session');
        expect(call.content).toContain('remember');
        expect(call.content).toContain('create_task');
      });
    });
  });

  describe('Tool Call/Result Persistence', () => {
    it('should persist tool:call events to the activity stream', async () => {
      await sessionHost.initialize();

      // Send a message to set currentMessageUserId context
      mockDataComposer.repositories.activityStream.getConversationHistory.mockResolvedValue([]);
      await sessionHost.handleMessage(
        'telegram',
        'chat-123',
        { id: '726555973', name: 'Conor' },
        'Check my emails',
        { userId: 'user-456' }
      );

      // Simulate backend emitting a tool:call event
      mockBackendManager.emit('tool:call', {
        toolUseId: 'toolu_01ABC123',
        toolName: 'mcp__pcp__list_emails',
        input: { userId: 'user-456', maxResults: 5 },
      });

      await vi.waitFor(() => {
        expect(mockDataComposer.repositories.activityStream.logActivity).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-456',
            agentId: 'myra',
            type: 'tool_call',
            subtype: 'mcp__pcp__list_emails',
            content: 'Tool call: mcp__pcp__list_emails',
            payload: expect.objectContaining({
              toolUseId: 'toolu_01ABC123',
              toolName: 'mcp__pcp__list_emails',
              input: { userId: 'user-456', maxResults: 5 },
            }),
            platform: 'telegram',
            platformChatId: 'chat-123',
          })
        );
      });
    });

    it('should persist tool:result events to the activity stream', async () => {
      await sessionHost.initialize();

      // Set up message context
      mockDataComposer.repositories.activityStream.getConversationHistory.mockResolvedValue([]);
      await sessionHost.handleMessage(
        'telegram',
        'chat-123',
        { id: '726555973', name: 'Conor' },
        'Check my emails',
        { userId: 'user-456' }
      );

      const toolResultContent = JSON.stringify({
        success: true,
        emails: [
          { id: '19c27850899dee3d', subject: 'Re: PR #974', from: { name: 'Ian Bicket' } },
          { id: '19c26dc9a4f51c13', subject: '[AINews] Context Graphs', from: { name: 'swyx' } },
        ],
        count: 2,
      });

      // Simulate backend emitting a tool:result event
      mockBackendManager.emit('tool:result', {
        toolUseId: 'toolu_01ABC123',
        content: toolResultContent,
      });

      await vi.waitFor(() => {
        expect(mockDataComposer.repositories.activityStream.logActivity).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-456',
            agentId: 'myra',
            type: 'tool_result',
            content: toolResultContent,
            payload: expect.objectContaining({
              toolUseId: 'toolu_01ABC123',
              fullLength: toolResultContent.length,
            }),
            platform: 'telegram',
            platformChatId: 'chat-123',
          })
        );
      });
    });

    it('should truncate very large tool results to 10k chars', async () => {
      await sessionHost.initialize();

      mockDataComposer.repositories.activityStream.getConversationHistory.mockResolvedValue([]);
      await sessionHost.handleMessage(
        'telegram',
        'chat-123',
        { id: '726555973', name: 'Conor' },
        'Get email details',
        { userId: 'user-456' }
      );

      // Simulate a large tool result (e.g., a full HTML email body)
      const largeContent = 'x'.repeat(25000);
      mockBackendManager.emit('tool:result', {
        toolUseId: 'toolu_02DEF456',
        content: largeContent,
      });

      await vi.waitFor(() => {
        const call = mockDataComposer.repositories.activityStream.logActivity.mock.calls.find(
          (c: unknown[]) => (c[0] as Record<string, unknown>).type === 'tool_result'
        );
        expect(call).toBeTruthy();
        const loggedContent = (call![0] as Record<string, string>).content;
        // Should be truncated to ~10k + truncation notice
        expect(loggedContent.length).toBeLessThan(11000);
        expect(loggedContent).toContain('truncated');
        expect(loggedContent).toContain('25000 total chars');
        // Payload should record the full length
        expect((call![0] as Record<string, Record<string, unknown>>).payload.fullLength).toBe(25000);
      });
    });

    it('should not persist tool events when no message context is set', async () => {
      await sessionHost.initialize();

      // Emit tool events WITHOUT a preceding handleMessage (no currentMessageUserId)
      mockBackendManager.emit('tool:call', {
        toolUseId: 'toolu_orphan',
        toolName: 'some_tool',
        input: {},
      });

      mockBackendManager.emit('tool:result', {
        toolUseId: 'toolu_orphan',
        content: 'result',
      });

      // Wait a tick
      await new Promise((r) => setTimeout(r, 10));

      // logActivity should NOT have been called
      expect(mockDataComposer.repositories.activityStream.logActivity).not.toHaveBeenCalled();
    });

    it('should handle logActivity errors gracefully without crashing', async () => {
      await sessionHost.initialize();

      mockDataComposer.repositories.activityStream.getConversationHistory.mockResolvedValue([]);
      mockDataComposer.repositories.activityStream.logActivity.mockRejectedValue(
        new Error('Database connection lost')
      );

      await sessionHost.handleMessage(
        'telegram',
        'chat-123',
        { id: '726555973', name: 'Conor' },
        'Check something',
        { userId: 'user-456' }
      );

      // Should not throw when logActivity fails
      mockBackendManager.emit('tool:call', {
        toolUseId: 'toolu_fail',
        toolName: 'failing_tool',
        input: {},
      });

      // Wait for the async handler
      await new Promise((r) => setTimeout(r, 10));

      // logActivity was called (and failed), but no crash
      expect(mockDataComposer.repositories.activityStream.logActivity).toHaveBeenCalled();
    });

    it('should persist multiple tool calls from a single message exchange', async () => {
      await sessionHost.initialize();

      mockDataComposer.repositories.activityStream.getConversationHistory.mockResolvedValue([]);
      await sessionHost.handleMessage(
        'telegram',
        'chat-123',
        { id: '726555973', name: 'Conor' },
        'Check emails and calendar',
        { userId: 'user-456' }
      );

      // First tool call: list_emails
      mockBackendManager.emit('tool:call', {
        toolUseId: 'toolu_01ABC',
        toolName: 'mcp__pcp__list_emails',
        input: { maxResults: 5 },
      });

      // First tool result
      mockBackendManager.emit('tool:result', {
        toolUseId: 'toolu_01ABC',
        content: '{"emails": []}',
      });

      // Second tool call: list_calendar_events
      mockBackendManager.emit('tool:call', {
        toolUseId: 'toolu_02DEF',
        toolName: 'mcp__pcp__list_calendar_events',
        input: { calendarId: 'primary' },
      });

      // Second tool result
      mockBackendManager.emit('tool:result', {
        toolUseId: 'toolu_02DEF',
        content: '{"events": []}',
      });

      await vi.waitFor(() => {
        const calls = mockDataComposer.repositories.activityStream.logActivity.mock.calls;
        const toolCallLogs = calls.filter(
          (c: unknown[]) => (c[0] as Record<string, unknown>).type === 'tool_call'
        );
        const toolResultLogs = calls.filter(
          (c: unknown[]) => (c[0] as Record<string, unknown>).type === 'tool_result'
        );
        expect(toolCallLogs).toHaveLength(2);
        expect(toolResultLogs).toHaveLength(2);
        expect((toolCallLogs[0][0] as Record<string, unknown>).subtype).toBe('mcp__pcp__list_emails');
        expect((toolCallLogs[1][0] as Record<string, unknown>).subtype).toBe('mcp__pcp__list_calendar_events');
      });
    });
  });

  describe('Session Resumption E2E Flow', () => {
    it('should persist session ID then restore it after simulated restart', async () => {
      // === Phase 1: First boot, receive a session ===
      // Mock: agent_identities lookup
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { user_id: 'user-123' },
        error: null,
      });
      // Mock: sessions lookup (no existing session)
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      await sessionHost.initialize();

      // Session captured from Claude Code
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'pcp-session-1' },
        error: null,
      });

      mockBackendManager.emit('session:captured', 'claude-sess-original');

      await vi.waitFor(() => {
        expect(mockQueryBuilder.update).toHaveBeenCalledWith({
          claude_session_id: 'claude-sess-original',
          status: 'active',
        });
      });

      // === Phase 2: Simulate restart — create a new SessionHost ===
      vi.clearAllMocks();
      mockBackendManager.removeAllListeners();

      const restartedHost = new SessionHost({
        backend: { primaryBackend: 'claude-code', backends: {} },
        dataComposer: mockDataComposer,
        agentId: 'myra',
      });

      // Mock: agent_identities lookup
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { user_id: 'user-123' },
        error: null,
      });
      // Mock: sessions lookup returns the persisted session
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { id: 'pcp-session-1', claude_session_id: 'claude-sess-original' },
        error: null,
      });

      await restartedHost.initialize();

      // Should have resumed with the original session ID
      expect(mockBackendManager.resumeSession).toHaveBeenCalledWith('claude-sess-original');
    });
  });
});
