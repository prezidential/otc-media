import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Uses `@supabase/ssr` so the session is
 * persisted as cookies (not localStorage), which is what the middleware and
 * server clients read. Using `createClient` from `@supabase/supabase-js`
 * here would silently break auth: sign-in succeeds, but the middleware sees
 * no session and bounces every navigation back to /sign-in.
 */
export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);
