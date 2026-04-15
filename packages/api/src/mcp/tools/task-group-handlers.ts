/**
 * MCP Tool Handlers for Task Groups
 *
 * Tools for creating and managing task groups, which are collections
 * of ordered tasks that can be executed via work strategies.
 */

import { z } from 'zod';
import type { DataComposer } from '../../data/composer';
import { resolveUser, type UserIdentifier } from '../../services/user-resolver';
import { getEffectiveAgentId } from '../../auth/enforce-identity';
import { logger } from '../../utils/logger';

const userIdentifierSchema = z.object({
  userId: z
    .string()
    .uuid()
    .optional()
    .describe('User UUID — usually unnecessary, auto-resolved from OAuth token'),
  email: z
    .string()
    .email()
    .optional()
    .describe('User email — usually unnecessary, auto-resolved from OAuth token'),
  platform: z
    .enum(['telegram', 'whatsapp', 'discord'])
    .optional()
    .describe('Platform name — only needed for platform-based user lookup'),
  platformId: z
    .string()
    .optional()
    .describe('Platform-specific user ID — only needed for platform-based user lookup'),
});

type McpResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function mcpResponse(data: object, isError = false): McpResponse {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    isError,
  };
}

// ============================================================================
// CREATE TASK GROUP
// ============================================================================

export const createTaskGroupSchema = z.object({
  ...userIdentifierSchema.shape,
  title: z.string().min(1).max(500).describe('Task group title'),
  description: z.string().optional().describe('Detailed description of the task group'),
  instructions: z
    .string()
    .optional()
    .describe(
      'Free-form instructions injected into every strategy prompt. Use for branch context, env setup, tool hints, constraints — anything that applies to ALL tasks in the group.'
    ),
  projectId: z.string().uuid().optional().describe('Project ID to scope the group to'),
  priority: z
    .enum(['low', 'normal', 'high', 'urgent'])
    .optional()
    .default('normal')
    .describe('Priority level'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
  threadKey: z
    .string()
    .optional()
    .describe('Thread key for linking the group to a conversation (e.g., "pr:290")'),
});

export async function handleCreateTaskGroup(
  args: z.infer<typeof createTaskGroupSchema>,
  dataComposer: DataComposer
): Promise<McpResponse> {
  try {
    const resolved = await resolveUser(args as UserIdentifier, dataComposer);
    if (!resolved) {
      return mcpResponse({ success: false, error: 'User not found' }, true);
    }

    const agentId = getEffectiveAgentId(undefined);

    // Resolve identity_id from agentId
    let identityId: string | undefined;
    if (agentId) {
      const { data: identity } = await dataComposer
        .getClient()
        .from('agent_identities')
        .select('id')
        .eq('agent_id', agentId)
        .eq('user_id', resolved.user.id)
        .limit(1)
        .single();
      if (identity) identityId = identity.id;
    }

    const group = await dataComposer.repositories.taskGroups.create({
      user_id: resolved.user.id,
      identity_id: identityId,
      project_id: args.projectId,
      title: args.title,
      description: args.description,
      instructions: args.instructions,
      priority: args.priority,
      tags: args.tags,
      thread_key: args.threadKey,
    });

    return mcpResponse({
      success: true,
      taskGroup: {
        id: group.id,
        title: group.title,
        description: group.description,
        instructions: group.instructions,
        status: group.status,
        priority: group.priority,
        tags: group.tags,
        threadKey: group.thread_key,
        createdAt: group.created_at,
      },
    });
  } catch (error) {
    return mcpResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task group',
      },
      true
    );
  }
}

// ============================================================================
// LIST TASK GROUPS
// ============================================================================

export const listTaskGroupsSchema = z.object({
  ...userIdentifierSchema.shape,
  status: z
    .enum(['active', 'paused', 'completed', 'cancelled'])
    .optional()
    .describe('Filter by status'),
  strategy: z
    .enum(['persistence', 'review', 'architect', 'parallel', 'swarm'])
    .optional()
    .describe('Filter by strategy preset'),
  ownerAgentId: z.string().optional().describe('Filter by owner agent'),
  limit: z.number().optional().default(50),
});

export async function handleListTaskGroups(
  args: z.infer<typeof listTaskGroupsSchema>,
  dataComposer: DataComposer
): Promise<McpResponse> {
  try {
    const resolved = await resolveUser(args as UserIdentifier, dataComposer);
    if (!resolved) {
      return mcpResponse({ success: false, error: 'User not found' }, true);
    }

    const groups = await dataComposer.repositories.taskGroups.listByUser(resolved.user.id, {
      status: args.status as any,
      strategy: args.strategy as any,
      ownerAgentId: args.ownerAgentId,
      limit: args.limit,
    });

    return mcpResponse({
      success: true,
      taskGroups: groups.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        status: g.status,
        priority: g.priority,
        strategy: g.strategy,
        ownerAgentId: g.owner_agent_id,
        currentTaskIndex: g.current_task_index,
        threadKey: g.thread_key,
        planUri: g.plan_uri,
        strategyStartedAt: g.strategy_started_at,
        createdAt: g.created_at,
      })),
    });
  } catch (error) {
    return mcpResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list task groups',
      },
      true
    );
  }
}
