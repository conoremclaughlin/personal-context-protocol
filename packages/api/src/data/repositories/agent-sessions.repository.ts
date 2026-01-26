/**
 * Agent Sessions Repository
 *
 * Manages Claude Code and agent session persistence for:
 * - Session resumption across restarts
 * - Terminal attachment to running sessions
 * - Multi-platform session routing
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';

// Type alias for the table to help with Supabase generics
type AgentSessionsTable = Database['public']['Tables']['agent_sessions'];

export type AgentSessionStatus = 'active' | 'suspended' | 'ended';
export type AgentBackend = 'claude-code' | 'direct-api';

export interface AgentSession {
  id: string;
  user_id: string;
  session_id: string;
  session_key?: string | null;
  platform?: string | null;
  platform_chat_id?: string | null;
  backend: AgentBackend;
  model?: string | null;
  status: AgentSessionStatus;
  working_directory?: string | null;
  mcp_config_path?: string | null;
  message_count: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  ended_at?: string | null;
}

export interface CreateAgentSessionInput {
  user_id: string;
  session_id: string;
  session_key?: string;
  platform?: string;
  platform_chat_id?: string;
  backend?: AgentBackend;
  model?: string;
  working_directory?: string;
  mcp_config_path?: string;
}

export interface UpdateAgentSessionInput {
  status?: AgentSessionStatus;
  message_count?: number;
  total_cost?: number;
  last_activity_at?: string;
  ended_at?: string;
}

export class AgentSessionsRepository {
  constructor(private client: SupabaseClient<Database>) {}

  /**
   * Create a new agent session
   */
  async create(input: CreateAgentSessionInput): Promise<AgentSession> {
    const insertData: AgentSessionsTable['Insert'] = {
      user_id: input.user_id,
      session_id: input.session_id,
      session_key: input.session_key,
      platform: input.platform,
      platform_chat_id: input.platform_chat_id,
      backend: input.backend || 'claude-code',
      model: input.model,
      working_directory: input.working_directory,
      mcp_config_path: input.mcp_config_path,
      status: 'active',
      message_count: 0,
      total_cost: 0,
    };

    const { data, error } = await this.client
      .from('agent_sessions')
      .insert(insertData as never)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create agent session: ${error.message}`);
    }

    return data as AgentSession;
  }

  /**
   * Find session by ID
   */
  async findById(id: string): Promise<AgentSession | null> {
    const { data, error } = await this.client
      .from('agent_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to find agent session: ${error.message}`);
    }

    return data as AgentSession | null;
  }

  /**
   * Find session by Claude Code session ID
   */
  async findBySessionId(sessionId: string, backend: AgentBackend = 'claude-code'): Promise<AgentSession | null> {
    const { data, error } = await this.client
      .from('agent_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('backend', backend)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to find agent session: ${error.message}`);
    }

    return data as AgentSession | null;
  }

  /**
   * Find active session for a user on a specific platform
   */
  async findActiveByUserAndPlatform(
    userId: string,
    platform: string,
    platformChatId?: string
  ): Promise<AgentSession | null> {
    let query = this.client
      .from('agent_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .eq('status', 'active')
      .order('last_activity_at', { ascending: false })
      .limit(1);

    if (platformChatId) {
      query = query.eq('platform_chat_id', platformChatId);
    }

    const { data, error } = await query.single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to find active session: ${error.message}`);
    }

    return data as AgentSession | null;
  }

  /**
   * Find active session by session key
   */
  async findActiveBySessionKey(sessionKey: string): Promise<AgentSession | null> {
    const { data, error } = await this.client
      .from('agent_sessions')
      .select('*')
      .eq('session_key', sessionKey)
      .eq('status', 'active')
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to find session by key: ${error.message}`);
    }

    return data as AgentSession | null;
  }

  /**
   * List all active sessions for a user
   */
  async listActiveByUser(userId: string): Promise<AgentSession[]> {
    const { data, error } = await this.client
      .from('agent_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('last_activity_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list sessions: ${error.message}`);
    }

    return (data || []) as AgentSession[];
  }

  /**
   * List all active sessions (for server status)
   */
  async listAllActive(): Promise<AgentSession[]> {
    const { data, error } = await this.client
      .from('agent_sessions')
      .select('*')
      .eq('status', 'active')
      .order('last_activity_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list active sessions: ${error.message}`);
    }

    return (data || []) as AgentSession[];
  }

  /**
   * Update a session
   */
  async update(id: string, input: UpdateAgentSessionInput): Promise<AgentSession> {
    const { data, error } = await this.client
      .from('agent_sessions')
      .update(input as never)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update session: ${error.message}`);
    }

    return data as AgentSession;
  }

  /**
   * Update session by session ID
   */
  async updateBySessionId(
    sessionId: string,
    input: UpdateAgentSessionInput,
    backend: AgentBackend = 'claude-code'
  ): Promise<AgentSession | null> {
    const { data, error } = await this.client
      .from('agent_sessions')
      .update(input as never)
      .eq('session_id', sessionId)
      .eq('backend', backend)
      .select()
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to update session: ${error.message}`);
    }

    return data as AgentSession | null;
  }

  /**
   * Record activity (updates last_activity_at and optionally increments message_count)
   */
  async recordActivity(id: string, incrementMessages = true, addCost = 0): Promise<void> {
    const updates: Record<string, unknown> = {
      last_activity_at: new Date().toISOString(),
    };

    // Use RPC or raw SQL for atomic increment if needed
    // For now, fetch and update
    if (incrementMessages || addCost > 0) {
      const session = await this.findById(id);
      if (session) {
        if (incrementMessages) {
          updates.message_count = session.message_count + 1;
        }
        if (addCost > 0) {
          updates.total_cost = Number(session.total_cost) + addCost;
        }
      }
    }

    const { error } = await this.client
      .from('agent_sessions')
      .update(updates as never)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to record activity: ${error.message}`);
    }
  }

  /**
   * End a session
   */
  async endSession(id: string): Promise<AgentSession> {
    return this.update(id, {
      status: 'ended',
      ended_at: new Date().toISOString(),
    });
  }

  /**
   * End session by session ID
   */
  async endBySessionId(sessionId: string, backend: AgentBackend = 'claude-code'): Promise<AgentSession | null> {
    return this.updateBySessionId(sessionId, {
      status: 'ended',
      ended_at: new Date().toISOString(),
    }, backend);
  }

  /**
   * Suspend a session (can be resumed later)
   */
  async suspendSession(id: string): Promise<AgentSession> {
    return this.update(id, { status: 'suspended' });
  }

  /**
   * Reactivate a suspended session
   */
  async reactivateSession(id: string): Promise<AgentSession> {
    return this.update(id, {
      status: 'active',
      last_activity_at: new Date().toISOString(),
    });
  }

  /**
   * Clean up old ended sessions (older than specified days)
   */
  async cleanupOldSessions(olderThanDays = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const { data, error } = await this.client
      .from('agent_sessions')
      .delete()
      .eq('status', 'ended')
      .lt('ended_at', cutoff.toISOString())
      .select('id');

    if (error) {
      throw new Error(`Failed to cleanup sessions: ${error.message}`);
    }

    return data?.length || 0;
  }
}
