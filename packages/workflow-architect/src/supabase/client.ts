import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

let supabaseClient: SupabaseClient<Database> | null = null;
let supabaseAdminClient: SupabaseClient<Database> | null = null;

/**
 * Get the Supabase client for public operations (RLS enforced)
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      throw new Error(
        'Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.',
      );
    }

    supabaseClient = createClient<Database>(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
      },
      global: {
        headers: {
          'x-client-info': 'workflow-architect',
        },
      },
    });
  }

  return supabaseClient;
}

/**
 * Get the Supabase admin client (bypasses RLS)
 * Use with caution - only for server-side operations
 */
export function getSupabaseAdminClient(): SupabaseClient<Database> {
  if (!supabaseAdminClient) {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      throw new Error(
        'Missing Supabase admin configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.',
      );
    }

    supabaseAdminClient = createClient<Database>(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          'x-client-info': 'workflow-architect-admin',
        },
      },
    });
  }

  return supabaseAdminClient;
}

/**
 * Initialize Supabase with explicit configuration (useful for testing)
 */
export function initializeSupabase(config: SupabaseConfig): SupabaseClient<Database> {
  supabaseClient = createClient<Database>(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
    },
  });

  if (config.serviceRoleKey) {
    supabaseAdminClient = createClient<Database>(config.url, config.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseClient;
}

/**
 * Reset clients (useful for testing)
 */
export function resetSupabaseClients(): void {
  supabaseClient = null;
  supabaseAdminClient = null;
}
