import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** Public client (anon key) — browser-safe, respects RLS */
export const supabase = createClient(
  url,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/** Server-only client (service role key) — bypasses RLS, never expose to browser */
export const supabaseAdmin = createClient(
  url,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
