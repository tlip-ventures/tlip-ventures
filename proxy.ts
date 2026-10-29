import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";

/**
 * Runs before every /admin and /pos request: refreshes the Supabase session
 * (Server Components can't write cookies, so expiring tokens are renewed here)
 * and sends signed-out visitors to that area's login page. Pages and actions
 * still check requireAdmin() / requirePosUser() themselves; this is not the
 * only guard.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Verifies the token and refreshes it when it is about to expire.
  const { data } = await supabase.auth.getClaims();

  const loginPath = request.nextUrl.pathname.startsWith("/pos") ? "/pos/login" : "/admin/login";
  if (!data?.claims && request.nextUrl.pathname !== loginPath) {
    const login = request.nextUrl.clone();
    login.pathname = loginPath;
    login.search = "";
    login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/pos", "/pos/:path*"],
};
