// Database types - Auto-generated from Supabase schema
// Run `mcp__supabase__generate_typescript_types` to regenerate

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      agent_sessions: {
        Row: {
          backend: string
          created_at: string
          ended_at: string | null
          id: string
          last_activity_at: string
          mcp_config_path: string | null
          message_count: number | null
          model: string | null
          platform: string | null
          platform_chat_id: string | null
          session_id: string
          session_key: string | null
          status: string
          total_cost: number | null
          updated_at: string
          user_id: string
          working_directory: string | null
        }
        Insert: {
          backend?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          last_activity_at?: string
          mcp_config_path?: string | null
          message_count?: number | null
          model?: string | null
          platform?: string | null
          platform_chat_id?: string | null
          session_id: string
          session_key?: string | null
          status?: string
          total_cost?: number | null
          updated_at?: string
          user_id: string
          working_directory?: string | null
        }
        Update: {
          backend?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          last_activity_at?: string
          mcp_config_path?: string | null
          message_count?: number | null
          model?: string | null
          platform?: string | null
          platform_chat_id?: string | null
          session_id?: string
          session_key?: string | null
          status?: string
          total_cost?: number | null
          updated_at?: string
          user_id?: string
          working_directory?: string | null
        }
      }
      context_summaries: {
        Row: {
          context_key: string | null
          context_type: string
          created_at: string | null
          id: string
          metadata: Json | null
          summary: string
          updated_at: string | null
          user_id: string
          version: number | null
        }
        Insert: {
          context_key?: string | null
          context_type: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          summary: string
          updated_at?: string | null
          user_id: string
          version?: number | null
        }
        Update: {
          context_key?: string | null
          context_type?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          summary?: string
          updated_at?: string | null
          user_id?: string
          version?: number | null
        }
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          platform: string
          platform_conversation_id: string
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          platform: string
          platform_conversation_id: string
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          platform?: string
          platform_conversation_id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
      }
      links: {
        Row: {
          created_at: string | null
          description: string | null
          embedding: string | null
          id: string
          metadata: Json | null
          source: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          source?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          url: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          source?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          url?: string
          user_id?: string
        }
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          embedding: string | null
          id: string
          message_type: string | null
          metadata: Json | null
          platform_message_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          platform_message_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          platform_message_id?: string | null
          user_id?: string
        }
      }
      notes: {
        Row: {
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          is_private: boolean | null
          metadata: Json | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_private?: boolean | null
          metadata?: Json | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_private?: boolean | null
          metadata?: Json | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
      }
      project_tasks: {
        Row: {
          blocked_by: string[] | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          priority: string | null
          project_id: string
          status: string
          tags: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked_by?: string[] | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          project_id: string
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked_by?: string[] | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          project_id?: string
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
      }
      projects: {
        Row: {
          created_at: string | null
          description: string | null
          goals: string[] | null
          id: string
          metadata: Json | null
          name: string
          repository_url: string | null
          status: string | null
          tech_stack: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          goals?: string[] | null
          id?: string
          metadata?: Json | null
          name: string
          repository_url?: string | null
          status?: string | null
          tech_stack?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          goals?: string[] | null
          id?: string
          metadata?: Json | null
          name?: string
          repository_url?: string | null
          status?: string | null
          tech_stack?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
      }
      reminders: {
        Row: {
          channel: string
          created_at: string | null
          id: string
          message: string
          metadata: Json | null
          recurrence: Json | null
          reminder_time: string
          sent_at: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          recurrence?: Json | null
          reminder_time: string
          sent_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          recurrence?: Json | null
          reminder_time?: string
          sent_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
      }
      session_focus: {
        Row: {
          context_snapshot: Json | null
          created_at: string | null
          focus_summary: string | null
          id: string
          project_id: string | null
          session_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          context_snapshot?: Json | null
          created_at?: string | null
          focus_summary?: string | null
          id?: string
          project_id?: string | null
          session_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          context_snapshot?: Json | null
          created_at?: string | null
          focus_summary?: string | null
          id?: string
          project_id?: string | null
          session_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          metadata: Json | null
          priority: string | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json | null
          priority?: string | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json | null
          priority?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
      }
      users: {
        Row: {
          created_at: string | null
          discord_id: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone_number: string | null
          preferences: Json | null
          telegram_id: number | null
          telegram_username: string | null
          updated_at: string | null
          username: string | null
          whatsapp_id: string | null
        }
        Insert: {
          created_at?: string | null
          discord_id?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone_number?: string | null
          preferences?: Json | null
          telegram_id?: number | null
          telegram_username?: string | null
          updated_at?: string | null
          username?: string | null
          whatsapp_id?: string | null
        }
        Update: {
          created_at?: string | null
          discord_id?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone_number?: string | null
          preferences?: Json | null
          telegram_id?: number | null
          telegram_username?: string | null
          updated_at?: string | null
          username?: string | null
          whatsapp_id?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_links: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_user_id?: string
          query_embedding: string
        }
        Returns: {
          description: string
          id: string
          similarity: number
          tags: string[]
          title: string
          url: string
        }[]
      }
      match_messages: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_user_id?: string
          query_embedding: string
        }
        Returns: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          similarity: number
        }[]
      }
      match_notes: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_user_id?: string
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
          tags: string[]
          title: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
