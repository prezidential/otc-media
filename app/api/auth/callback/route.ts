import { NextResponse, type NextRequest } from "next/server";
import { supabaseUser } from "@/lib/supabase/server";

/**
 * OAuth / magic-link callback. Supabase redirects here with a `code` query param;
 * we exchange it for a session and bounce the user to `?next=` (default `/`).
 *
 * Used by future LinkedIn-via-Supabase or magic-link flows. Email + password
 * sign-in does not require this endpoint.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=missing_code", url.origin));
  }

  const supabase = await supabaseUser();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, url.origin)
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
