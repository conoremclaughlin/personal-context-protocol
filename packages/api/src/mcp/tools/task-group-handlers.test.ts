/**
 * Task Group Handler Tests
 *
 * Tests for MCP tool handlers that create and list task groups.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreateTaskGroup, handleListTaskGroups } from './task-group-handlers';

// =====================================================
// MOCK SETUP
// =====================================================

vi.mock('../../services/user-resolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/user-resolver')>();
  return {
    ...actual,
    resolveUser: vi.fn().mockResolvedValue({
      user: { id: 'user-123' },
      resolvedBy: 'userId',
    }),
  };
});

vi.mock('../../auth/enforce-identity', () => ({
  getEffectiveAgentId: vi.fn().mockReturnValue('wren'),
}));

vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { resolveUser } from '../../services/user-resolver';

const resolveUserMock = vi.mocked(resolveUser);

function parseResponse(response: {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}) {
  return JSON.parse(response.content[0].text);
}

function createMockDataComposer() {
  return {
    getClient: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
    repositories: {
      taskGroups: {
        create: vi.fn(),
        listByUser: vi.fn(),
      },
    },
  };
}

// =====================================================
// handleCreateTaskGroup
// =====================================================

describe('handleCreateTaskGroup', () => {
  let dc: ReturnType<typeof createMockDataComposer>;

  beforeEach(() => {
    vi.clearAllMocks();
    dc = createMockDataComposer();
    resolveUserMock.mockResolvedValue({
      user: { id: 'user-123' } as any,
      resolvedBy: 'userId',
    });
  });

  it('should create a task group', async () => {
    dc.repositories.taskGroups.create.mockResolvedValue({
      id: 'group-1',
      title: 'Strategy tasks',
      description: 'Tasks for the persistence strategy',
      status: 'active',
      priority: 'high',
      tags: ['strategy'],
      thread_key: null,
      created_at: '2026-04-12T00:00:00Z',
    });

    const response = await handleCreateTaskGroup(
      {
        userId: 'user-123',
        title: 'Strategy tasks',
        description: 'Tasks for the persistence strategy',
        priority: 'high',
        tags: ['strategy'],
      },
      dc as any
    );

    const data = parseResponse(response);
    expect(response.isError).toBeFalsy();
    expect(data.success).toBe(true);
    expect(data.taskGroup.id).toBe('group-1');
    expect(data.taskGroup.title).toBe('Strategy tasks');
    expect(data.taskGroup.priority).toBe('high');

    expect(dc.repositories.taskGroups.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        title: 'Strategy tasks',
        description: 'Tasks for the persistence strategy',
        priority: 'high',
        tags: ['strategy'],
      })
    );
  });

  it('should include threadKey when provided', async () => {
    dc.repositories.taskGroups.create.mockResolvedValue({
      id: 'group-2',
      title: 'PR review tasks',
      description: null,
      status: 'active',
      priority: 'normal',
      tags: [],
      thread_key: 'pr:290',
      created_at: '2026-04-12T00:00:00Z',
    });

    const response = await handleCreateTaskGroup(
      {
        userId: 'user-123',
        title: 'PR review tasks',
        threadKey: 'pr:290',
        priority: 'normal',
      },
      dc as any
    );

    const data = parseResponse(response);
    expect(data.success).toBe(true);
    expect(data.taskGroup.threadKey).toBe('pr:290');

    expect(dc.repositories.taskGroups.create).toHaveBeenCalledWith(
      expect.objectContaining({ thread_key: 'pr:290' })
    );
  });

  it('should resolve identity_id from calling agent', async () => {
    // Mock the agent_identities lookup to return an identity
    const mockClient = dc.getClient();
    mockClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'identity-uuid-wren' },
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    dc.repositories.taskGroups.create.mockResolvedValue({
      id: 'group-3',
      title: 'Scoped group',
      description: null,
      status: 'active',
      priority: 'normal',
      tags: [],
      thread_key: null,
      created_at: '2026-04-12T00:00:00Z',
    });

    await handleCreateTaskGroup(
      { userId: 'user-123', title: 'Scoped group', priority: 'normal' },
      dc as any
    );

    expect(dc.repositories.taskGroups.create).toHaveBeenCalledWith(
      expect.objectContaining({ identity_id: 'identity-uuid-wren' })
    );
  });

  it('should return error for unknown user', async () => {
    resolveUserMock.mockResolvedValue(null);

    const response = await handleCreateTaskGroup(
      { userId: 'nonexistent', title: 'Test', priority: 'normal' },
      dc as any
    );

    const data = parseResponse(response);
    expect(response.isError).toBe(true);
    expect(data.success).toBe(false);
    expect(data.error).toBe('User not found');
    expect(dc.repositories.taskGroups.create).not.toHaveBeenCalled();
  });
});

// =====================================================
// handleListTaskGroups
// =====================================================

describe('handleListTaskGroups', () => {
  let dc: ReturnType<typeof createMockDataComposer>;

  beforeEach(() => {
    vi.clearAllMocks();
    dc = createMockDataComposer();
    resolveUserMock.mockResolvedValue({
      user: { id: 'user-123' } as any,
      resolvedBy: 'userId',
    });
  });

  it('should list task groups', async () => {
    dc.repositories.taskGroups.listByUser.mockResolvedValue([
      {
        id: 'group-1',
        title: 'Active strategy',
        description: 'Working on it',
        status: 'active',
        priority: 'high',
        strategy: 'persistence',
        owner_agent_id: 'wren',
        current_task_index: 2,
        thread_key: 'branch:wren/feat/auth',
        plan_uri: 'ink://specs/auth',
        strategy_started_at: '2026-04-11T00:00:00Z',
        created_at: '2026-04-10T00:00:00Z',
      },
      {
        id: 'group-2',
        title: 'Completed work',
        description: null,
        status: 'completed',
        priority: 'normal',
        strategy: null,
        owner_agent_id: null,
        current_task_index: 0,
        thread_key: null,
        plan_uri: null,
        strategy_started_at: null,
        created_at: '2026-04-09T00:00:00Z',
      },
    ]);

    const response = await handleListTaskGroups({ userId: 'user-123', limit: 50 }, dc as any);

    const data = parseResponse(response);
    expect(data.success).toBe(true);
    expect(data.taskGroups).toHaveLength(2);
    expect(data.taskGroups[0]).toMatchObject({
      id: 'group-1',
      title: 'Active strategy',
      strategy: 'persistence',
      ownerAgentId: 'wren',
      planUri: 'ink://specs/auth',
    });
    expect(data.taskGroups[1].strategy).toBeNull();
  });

  it('should pass filters to repository', async () => {
    dc.repositories.taskGroups.listByUser.mockResolvedValue([]);

    await handleListTaskGroups(
      {
        userId: 'user-123',
        status: 'active',
        strategy: 'persistence',
        ownerAgentId: 'wren',
        limit: 10,
      },
      dc as any
    );

    expect(dc.repositories.taskGroups.listByUser).toHaveBeenCalledWith('user-123', {
      status: 'active',
      strategy: 'persistence',
      ownerAgentId: 'wren',
      limit: 10,
    });
  });

  it('should return error for unknown user', async () => {
    resolveUserMock.mockResolvedValue(null);

    const response = await handleListTaskGroups({ userId: 'nonexistent', limit: 50 }, dc as any);

    const data = parseResponse(response);
    expect(response.isError).toBe(true);
    expect(data.error).toBe('User not found');
  });
});
