import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Auth middleware for Cornerstone OS (spec v2.9 §3.16).
 *
 * Responsibilities:
 *   1. Refresh the Supabase session on every request so route handlers and server
 *      components see a valid JWT.
 *   2. Bounce unauthenticated requests for protected routes to /sign-in.
 *   3. Bounce signed-in users without a workspace to /onboarding (built in M1).
 *
 * Public routes (no auth required):
 *   /sign-in, /sign-up, /api/auth/*, /api/health,
 *   /favicon.ico, /_next/*, anything with a file extension (assets).
 *
 * The /onboarding redirect is gated behind a flag and will be enabled when the
 * onboarding wizard ships in M1.
 */

const PUBLIC_PATH_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/api/auth",
  "/api/health",
  "/_next",
  "/favicon.ico",
];

/** Paths that signed-in-but-no-workspace users must still be able to reach. */
const ONBOARDING_ALLOWED_PREFIXES = [
  "/onboarding",
  "/api/me",
  "/api/workspaces",
  "/api/auth",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  // Static assets (anything with a file extension after the last slash).
  const last = pathname.split("/").pop() ?? "";
  if (last.includes(".")) return true;
  return false;
}

function isOnboardingAllowed(pathname: string): boolean {
  return ONBOARDING_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options as CookieOptions);
          }
        },
      },
    }
  );

  // IMPORTANT: getUser() refreshes the session and rotates cookies via setAll above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return res;
  }

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  // Signed-in users without any workspace are sent to /onboarding (except for
  // the small allowlist that the onboarding flow itself depends on).
  //
  // NOTE: we deliberately do NOT use `{ count: "exact", head: true }` here.
  // In the Next.js Edge runtime, @supabase/ssr's HEAD-based count requests
  // return an empty response body that the client surfaces as an opaque
  // `{"message":""}` PostgrestError instead of a real count. A plain
  // `select … limit 1` is sufficient — we only need to know whether the user
  // has *any* membership, not the exact total.
  if (!isOnboardingAllowed(pathname)) {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1);
    if (error) {
      // A real read error here is a deployment bug (RLS misconfigured, DB
      // unreachable, etc.). Log loudly and fall through to /onboarding so we
      // never strand the user on a 500 — the onboarding page is a safe place
      // to land, and the next request will re-evaluate.
      console.warn("[middleware] workspace_members lookup failed", {
        userId: user.id,
        pathname,
        error: error.message,
      });
    }
    if (!data || data.length === 0) {
      const url = req.nextUrl.clone();
      url.pathname = "/onboarding";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match every request except:
     *   _next/static, _next/image, favicon.ico, the public/ folder.
     * The function above is the actual gate — this matcher just keeps
     * static-asset overhead out of the middleware pipeline.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
