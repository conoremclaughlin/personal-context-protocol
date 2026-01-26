import type { Database } from '../supabase/types';

export type Note = Database['public']['Tables']['notes']['Row'];
export type NoteInsert = Database['public']['Tables']['notes']['Insert'];
export type NoteUpdate = Database['public']['Tables']['notes']['Update'];

export interface CreateNoteDTO {
  user_id: string;
  title?: string;
  content: string;
  tags?: string[];
  is_private?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateNoteDTO {
  title?: string;
  content?: string;
  tags?: string[];
  is_private?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SearchNotesOptions {
  query?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}
