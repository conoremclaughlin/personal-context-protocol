/**
 * Identity MCP Tool Handlers
 *
 * Tools for managing AI being identities with versioning
 */

import { z } from 'zod';
import type { DataComposer } from '../../data/composer';
import type { Json } from '../../data/supabase/types';
import { logger } from '../../utils/logger';
import { userIdentifierBaseSchema, resolveUserOrThrow } from '../../services/user-resolver';

// =====================================================
// SCHEMAS
// =====================================================

export const saveIdentitySchema = userIdentifierBaseSchema.extend({
  agentId: z.string().describe('Unique identifier for the AI being (e.g., "wren", "benson", "myra")'),
  name: z.string().describe('Display name for the agent'),
  role: z.string().describe('Role description (e.g., "Development collaborator via Claude Code")'),
  description: z.string().optional().describe('Extended description of the agent\'s nature'),
  values: z.array(z.string()).optional().describe('Core values this agent holds'),
  relationships: z.record(z.string()).optional().describe('Map of agentId to relationship description'),
  capabilities: z.array(z.string()).optional().describe('What this agent can do'),
  metadata: z.record(z.unknown()).optional().describe('Additional flexible data'),
});

export const getIdentitySchema = userIdentifierBaseSchema.extend({
  agentId: z.string().describe('Agent identifier to look up'),
});

export const listIdentitiesSchema = userIdentifierBaseSchema.extend({});

export const getIdentityHistorySchema = userIdentifierBaseSchema.extend({
  agentId: z.string().describe('Agent identifier to get history for'),
  limit: z.number().min(1).max(50).optional().describe('Max history entries (default: 10)'),
});

export const restoreIdentitySchema = userIdentifierBaseSchema.extend({
  agentId: z.string().describe('Agent identifier to restore'),
  version: z.number().describe('Version number to restore to'),
});

// =====================================================
// HANDLERS
// =====================================================

export async function handleSaveIdentity(
  args: unknown,
  dataComposer: DataComposer
) {
  const params = saveIdentitySchema.parse(args);
  const { user, resolvedBy } = await resolveUserOrThrow(params, dataComposer);
  const supabase = dataComposer.getClient();

  const { agentId, name, role, description, values, relationships, capabilities, metadata } = params;

  // Use upsert to handle both create and update
  const { data, error } = await supabase
    .from('agent_identities')
    .upsert(
      {
        user_id: user.id,
        agent_id: agentId,
        name,
        role,
        description: description || null,
        values: (values || []) as unknown as Json,
        relationships: (relationships || {}) as unknown as Json,
        capabilities: (capabilities || []) as unknown as Json,
        metadata: (metadata || {}) as unknown as Json,
      },
      {
        onConflict: 'user_id,agent_id',
      }
    )
    .select()
    .single();

  if (error) {
    logger.error('Failed to save identity', { error, agentId });
    throw new Error(`Failed to save identity: ${error.message}`);
  }

  logger.info('Identity saved', { agentId, version: data.version });

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: true,
            message: data.version === 1 ? 'Identity created' : 'Identity updated',
            user: { id: user.id, resolvedBy },
            identity: {
              id: data.id,
              agentId: data.agent_id,
              name: data.name,
              role: data.role,
              version: data.version,
              createdAt: data.created_at,
              updatedAt: data.updated_at,
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function handleGetIdentity(
  args: unknown,
  dataComposer: DataComposer
) {
  const params = getIdentitySchema.parse(args);
  const { user, resolvedBy } = await resolveUserOrThrow(params, dataComposer);
  const supabase = dataComposer.getClient();

  const { data, error } = await supabase
    .from('agent_identities')
    .select('*')
    .eq('user_id', user.id)
    .eq('agent_id', params.agentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: false,
                message: `No identity found for agent: ${params.agentId}`,
                user: { id: user.id, resolvedBy },
                identity: null,
              },
              null,
              2
            ),
          },
        ],
      };
    }
    logger.error('Failed to get identity', { error, agentId: params.agentId });
    throw new Error(`Failed to get identity: ${error.message}`);
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: true,
            user: { id: user.id, resolvedBy },
            identity: {
              id: data.id,
              agentId: data.agent_id,
              name: data.name,
              role: data.role,
              description: data.description,
              values: data.values,
              relationships: data.relationships,
              capabilities: data.capabilities,
              metadata: data.metadata,
              version: data.version,
              createdAt: data.created_at,
              updatedAt: data.updated_at,
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function handleListIdentities(
  args: unknown,
  dataComposer: DataComposer
) {
  const params = listIdentitiesSchema.parse(args);
  const { user, resolvedBy } = await resolveUserOrThrow(params, dataComposer);
  const supabase = dataComposer.getClient();

  const { data, error } = await supabase
    .from('agent_identities')
    .select('*')
    .eq('user_id', user.id)
    .order('agent_id');

  if (error) {
    logger.error('Failed to list identities', { error });
    throw new Error(`Failed to list identities: ${error.message}`);
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: true,
            user: { id: user.id, resolvedBy },
            identities: data.map((row) => ({
              id: row.id,
              agentId: row.agent_id,
              name: row.name,
              role: row.role,
              description: row.description,
              values: row.values,
              relationships: row.relationships,
              capabilities: row.capabilities,
              version: row.version,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            })),
            count: data.length,
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function handleGetIdentityHistory(
  args: unknown,
  dataComposer: DataComposer
) {
  const params = getIdentityHistorySchema.parse(args);
  const { user, resolvedBy } = await resolveUserOrThrow(params, dataComposer);
  const supabase = dataComposer.getClient();
  const limit = params.limit || 10;

  // First get the current identity to get its ID
  const { data: current } = await supabase
    .from('agent_identities')
    .select('id')
    .eq('user_id', user.id)
    .eq('agent_id', params.agentId)
    .single();

  if (!current) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: false,
              message: `No identity found for agent: ${params.agentId}`,
              user: { id: user.id, resolvedBy },
              history: [],
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Get history entries
  const { data, error } = await supabase
    .from('agent_identity_history')
    .select('*')
    .eq('identity_id', current.id)
    .order('archived_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('Failed to get identity history', { error, agentId: params.agentId });
    throw new Error(`Failed to get identity history: ${error.message}`);
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: true,
            user: { id: user.id, resolvedBy },
            agentId: params.agentId,
            history: data.map((row) => ({
              id: row.id,
              version: row.version,
              name: row.name,
              role: row.role,
              description: row.description,
              values: row.values,
              relationships: row.relationships,
              capabilities: row.capabilities,
              changeType: row.change_type,
              archivedAt: row.archived_at,
              originalCreatedAt: row.created_at,
            })),
            count: data.length,
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function handleRestoreIdentity(
  args: unknown,
  dataComposer: DataComposer
) {
  const params = restoreIdentitySchema.parse(args);
  const { user, resolvedBy } = await resolveUserOrThrow(params, dataComposer);
  const supabase = dataComposer.getClient();

  // First get the current identity
  const { data: current } = await supabase
    .from('agent_identities')
    .select('id')
    .eq('user_id', user.id)
    .eq('agent_id', params.agentId)
    .single();

  if (!current) {
    throw new Error(`No identity found for agent: ${params.agentId}`);
  }

  // Find the history entry for the requested version
  const { data: historyEntry, error: historyError } = await supabase
    .from('agent_identity_history')
    .select('*')
    .eq('identity_id', current.id)
    .eq('version', params.version)
    .single();

  if (historyError || !historyEntry) {
    throw new Error(`Version ${params.version} not found in history for agent: ${params.agentId}`);
  }

  // Restore by updating with the historical values
  const { data, error } = await supabase
    .from('agent_identities')
    .update({
      name: historyEntry.name,
      role: historyEntry.role,
      description: historyEntry.description,
      values: historyEntry.values,
      relationships: historyEntry.relationships,
      capabilities: historyEntry.capabilities,
      metadata: historyEntry.metadata,
    })
    .eq('id', current.id)
    .select()
    .single();

  if (error) {
    logger.error('Failed to restore identity', { error, agentId: params.agentId, version: params.version });
    throw new Error(`Failed to restore identity: ${error.message}`);
  }

  logger.info('Identity restored', { agentId: params.agentId, fromVersion: params.version, toVersion: data.version });

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: true,
            message: `Identity restored from version ${params.version}`,
            user: { id: user.id, resolvedBy },
            identity: {
              id: data.id,
              agentId: data.agent_id,
              name: data.name,
              role: data.role,
              version: data.version,
              restoredFrom: params.version,
            },
          },
          null,
          2
        ),
      },
    ],
  };
}
