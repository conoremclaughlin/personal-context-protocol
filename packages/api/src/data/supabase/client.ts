import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import type { Database } from './types';

let supabaseClient: SupabaseClient<Database> | null = null;

export function createSupabaseClient(): SupabaseClient<Database> {
  if (supabaseClient) {
    return supabaseClient;
  }

  try {
    supabaseClient = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
      },
    });

    logger.info('Supabase client created successfully', {
      url: env.SUPABASE_URL,
      keyType: 'secret',
    });
    return supabaseClient;
  } catch (error) {
    logger.error('Failed to create Supabase client:', error);
    throw new Error('Failed to initialize database connection');
  }
}

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabaseClient) {
    return createSupabaseClient();
  }
  return supabaseClient;
}
