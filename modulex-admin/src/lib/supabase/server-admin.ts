import "server-only";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseAdminConfigured = Boolean(
  supabaseUrl && supabaseSecretKey
);

export const supabaseAdmin = createClient(
  supabaseUrl ?? "http://127.0.0.1:54321",
  supabaseSecretKey ?? "missing-server-secret",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);
