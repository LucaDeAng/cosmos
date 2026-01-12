// Supabase Configuration
// Initialize Supabase client for backend

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.KG_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.KG_SUPABASE_SERVICE_ROLE_KEY;

// Allow tests to run without real Supabase credentials
const isTest = process.env.NODE_ENV === 'test';

if (!supabaseUrl || !supabaseKey) {
  if (!isTest) {
    throw new Error('Missing Supabase environment variables. Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
  }
}

// Create client only if credentials are available, otherwise use a placeholder
export const supabase: SupabaseClient = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null as unknown as SupabaseClient; // Tests should mock this
