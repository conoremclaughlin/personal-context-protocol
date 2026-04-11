/**
 * Strategy Service Tests
 *
 * Tests for the work strategy lifecycle: start, advance, pause, resume,
 * event logging, and prompt generation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrategyService } from './strategy.service';
import type { TaskGroup, StrategyConfig } from '../data/repositories/task-groups.repository';
import type { ProjectTask } from '../data/repositories/project-tasks.repository';

// Mock dependencies
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../utils/request-context', () => ({
  getRequestContext: vi.fn().mockReturnValue({ sessionId: 'session-abc' }),
}));

vi.mock('../mcp/tools/inbox-handlers', () => ({
  handleSendToInbox: vi.fn().mockResolvedValue(undefined),
}));

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockGroup(overrides: Partial<TaskGroup> = {}): TaskGroup {
  return {
    id: 'group-1',
    user_id: 'user-123',
    identity_id: null,
    project_id: null,
    title: 'Test Strategy Group',
    description: null,
    status: 'active',
    priority: 'high',
    tags: [],
    metadata: {},
    autonomous: true,
    max_sessions: null,
    sessions_used: 0,
    context_summary: null,
    next_run_after: null,
    output_target: null,
    output_status: null,
    thread_key: 'thread:test',
    strategy: 'persistence',
    strategy_config: {} as StrategyConfig,
    verification_mode: 'self',
    plan_uri: null,
    current_task_index: 0,
    iterations_since_approval: 0,
    strategy_started_at: null,
    strategy_paused_at: null,
    owner_agent_id: 'wren',
    created_at: '2026-04-10T00:00:00Z',
    updated_at: '2026-04-10T00:00:00Z',
    ...overrides,
  } as TaskGroup;
}

function createMockTask(overrides: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: 'task-1',
    project_id: null,
    user_id: 'user-123',
    title: 'First task',
    description: 'Do the thing',
    status: 'pending',
    priority: 'high' as const,
    tags: [],
    blocked_by: null,
    created_by: 'wren',
    completed_at: null,
    task_group_id: 'group-1',
    task_order: 0,
    due_date: null,
    metadata: {},
    created_at: '2026-04-10T00:00:00Z',
    updated_at: '2026-04-10T00:00:00Z',
    ...overrides,
  };
}

function createMockDataComposer() {
  const mockClient = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnValue({
        contains: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  };

  return {
    getClient: vi.fn().mockReturnValue(mockClient),
    repositories: {
      taskGroups: {
        findById: vi.fn(),
        update: vi.fn(),
      },
      tasks: {
        startTask: vi.fn().mockResolvedValue({}),
        findById: vi.fn(),
      },
      activityStream: {
        logActivity: vi.fn().mockResolvedValue({ id: 'activity-1' }),
      },
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('StrategyService', () => {
  let dc: ReturnType<typeof createMockDataComposer>;
  let service: StrategyService;

  beforeEach(() => {
    vi.clearAllMocks();
    dc = createMockDataComposer();
    service = new StrategyService(dc as any);
  });

  describe('startStrategy', () => {
    it('should activate a strategy and return the first task with prompt', async () => {
      const group = createMockGroup({ strategy: null, status: 'active' });
      const task = createMockTask();

      dc.repositories.taskGroups.findById.mockResolvedValue(group);
      dc.repositories.taskGroups.update.mockResolvedValue({
        ...group,
        strategy: 'persistence',
        status: 'active',
      });

      // Mock getTaskByOrder — first task found via exact order match
      const mockClient = dc.getClient();
      mockClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: task, error: null }),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnValue({
          contains: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      const result = await service.startStrategy({
        groupId: 'group-1',
        userId: 'user-123',
        strategy: 'persistence',
        ownerAgentId: 'wren',
      });

      expect(result.action).toBe('next_task');
      expect(result.nextTask).toBeDefined();
      expect(result.prompt).toContain('persistence strategy');
      expect(result.prompt).toContain('CONTRIBUTING.md');
      expect(result.prompt).toContain('complete_task');
      expect(result.prompt).toContain('task_request');

      // Verify task was started
      expect(dc.repositories.tasks.startTask).toHaveBeenCalledWith('task-1');

      // Verify strategy event was logged
      expect(dc.repositories.activityStream.logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'state_change',
          subtype: 'strategy_started',
          taskGroupId: 'group-1',
        })
      );
    });

    it('should reject if strategy already active', async () => {
      const group = createMockGroup({ strategy: 'persistence', status: 'active' });
      dc.repositories.taskGroups.findById.mockResolvedValue(group);

      await expect(
        service.startStrategy({
          groupId: 'group-1',
          userId: 'user-123',
          strategy: 'persistence',
          ownerAgentId: 'wren',
        })
      ).rejects.toThrow('already active');
    });

    it('should reject if group does not belong to user', async () => {
      const group = createMockGroup({ user_id: 'other-user' });
      dc.repositories.taskGroups.findById.mockResolvedValue(group);

      await expect(
        service.startStrategy({
          groupId: 'group-1',
          userId: 'user-123',
          strategy: 'persistence',
          ownerAgentId: 'wren',
        })
      ).rejects.toThrow('does not belong');
    });

    it('should handle empty group with planUri', async () => {
      const group = createMockGroup({ strategy: null, status: 'active' });
      dc.repositories.taskGroups.findById.mockResolvedValue(group);
      dc.repositories.taskGroups.update.mockResolvedValue({
        ...group,
        strategy: 'persistence',
        plan_uri: 'ink://specs/test',
      });

      // Mock getTaskByOrder: no tasks found via either code path
      // Path 1 (exact): from.select.eq(group).eq(order).in(status).limit.single → null
      // Path 2 (fallback): from.select.eq(group).in(status).order.order.limit → []
      const mockClient = dc.getClient();
      const inChain = vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        }),
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });
      const afterFirstEq = {
        eq: vi.fn().mockReturnValue({ in: inChain }),
        in: inChain,
      };
      mockClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue(afterFirstEq),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnValue({
          contains: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      const result = await service.startStrategy({
        groupId: 'group-1',
        userId: 'user-123',
        strategy: 'persistence',
        ownerAgentId: 'wren',
        planUri: 'ink://specs/test',
      });

      expect(result.action).toBe('next_task');
      expect(result.prompt).toContain('no tasks yet');
      expect(result.prompt).toContain('ink://specs/test');
    });
  });

  describe('pauseStrategy', () => {
    it('should pause an active strategy and log event', async () => {
      const group = createMockGroup({ status: 'active' });
      dc.repositories.taskGroups.findById.mockResolvedValue(group);
      dc.repositories.taskGroups.update.mockResolvedValue({ ...group, status: 'paused' });

      const result = await service.pauseStrategy('group-1', 'user-123');

      expect(result.status).toBe('paused');
      expect(dc.repositories.activityStream.logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          subtype: 'strategy_paused',
          taskGroupId: 'group-1',
        })
      );
    });

    it('should reject if strategy is not active', async () => {
      const group = createMockGroup({ status: 'paused' });
      dc.repositories.taskGroups.findById.mockResolvedValue(group);

      await expect(service.pauseStrategy('group-1', 'user-123')).rejects.toThrow('not active');
    });
  });

  describe('getStrategyStatus', () => {
    it('should return comprehensive status with human-friendly summary', async () => {
      const group = createMockGroup({
        strategy_config: { checkInInterval: 3 } as StrategyConfig,
        current_task_index: 2,
        strategy_started_at: '2026-04-10T00:00:00Z',
      });
      dc.repositories.taskGroups.findById.mockResolvedValue(group);

      // Mock getGroupTasks
      const tasks = [
        createMockTask({ id: 't1', title: 'Task 1', status: 'completed', task_order: 0 }),
        createMockTask({ id: 't2', title: 'Task 2', status: 'completed', task_order: 1 }),
        createMockTask({ id: 't3', title: 'Task 3', status: 'in_progress', task_order: 2 }),
        createMockTask({ id: 't4', title: 'Task 4', status: 'pending', task_order: 3 }),
      ];

      const mockClient = dc.getClient();
      mockClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: tasks, error: null }),
            }),
          }),
        }),
      });

      const status = await service.getStrategyStatus('group-1', 'user-123');

      expect(status.strategy).toBe('persistence');
      expect(status.progress.total).toBe(4);
      expect(status.progress.completed).toBe(2);
      expect(status.progress.completionRate).toBe(50);
      expect(status.currentTask).toBeDefined();
      expect(status.currentTask!.title).toBe('Task 3');
      expect(status.summary).toContain('2/4 tasks done');
      expect(status.summary).toContain('Task 3');
    });
  });

  describe('persistence prompt', () => {
    it('should include CONTRIBUTING.md compliance instruction', async () => {
      const group = createMockGroup({ strategy: null });
      const task = createMockTask();

      dc.repositories.taskGroups.findById.mockResolvedValue(group);
      dc.repositories.taskGroups.update.mockResolvedValue(group);

      const mockClient = dc.getClient();
      mockClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: task, error: null }),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnValue({
          contains: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      const result = await service.startStrategy({
        groupId: 'group-1',
        userId: 'user-123',
        strategy: 'persistence',
        ownerAgentId: 'wren',
      });

      expect(result.prompt).toContain('CONTRIBUTING.md');
      expect(result.prompt).toContain('AGENTS.md');
      expect(result.prompt).toContain('Do NOT skip tasks');
      expect(result.prompt).toContain('task_request');
    });

    it('should include verification gates when configured', async () => {
      const group = createMockGroup({
        strategy: null,
        strategy_config: { verificationGates: ['tests', 'type-check'] } as StrategyConfig,
      });
      const task = createMockTask();

      dc.repositories.taskGroups.findById.mockResolvedValue(group);
      dc.repositories.taskGroups.update.mockResolvedValue(group);

      const mockClient = dc.getClient();
      mockClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: task, error: null }),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnValue({
          contains: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      const result = await service.startStrategy({
        groupId: 'group-1',
        userId: 'user-123',
        strategy: 'persistence',
        ownerAgentId: 'wren',
        config: { verificationGates: ['tests', 'type-check'] },
      });

      expect(result.prompt).toContain('tests, type-check');
    });

    it('should include planUri when set', async () => {
      const group = createMockGroup({ strategy: null });
      const task = createMockTask();

      dc.repositories.taskGroups.findById.mockResolvedValue(group);
      dc.repositories.taskGroups.update.mockResolvedValue({
        ...group,
        plan_uri: 'ink://specs/my-plan',
      });

      const mockClient = dc.getClient();
      mockClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: task, error: null }),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnValue({
          contains: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      const result = await service.startStrategy({
        groupId: 'group-1',
        userId: 'user-123',
        strategy: 'persistence',
        ownerAgentId: 'wren',
        planUri: 'ink://specs/my-plan',
      });

      expect(result.prompt).toContain('ink://specs/my-plan');
    });
  });
});
