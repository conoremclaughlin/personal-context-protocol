import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../utils/logger';

export abstract class BaseRepository {
  protected client: SupabaseClient<any>;

  constructor(client: SupabaseClient<any>) {
    this.client = client;
  }

  protected handleError(error: unknown, operation: string): never {
    logger.error(`Repository error during ${operation}:`, error);
    throw error;
  }
}
