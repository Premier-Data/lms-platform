import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
} from "@/i18n/config";

// Long-lived cookie so sessions persist across app restarts (installed PWAs).
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // 400 days (browser max)

// Next.js 16 renamed the `middleware` convention to `proxy`.
// This runs on every matched request (Node.js runtime) and refreshes the
// Supabase auth session cookie. Without it, short-lived access tokens go
// stale and users get logged out even with a valid refresh token, because
// Server Components cannot reliably write cookies.
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        maxAge: COOKIE_MAX_AGE,
        sameSite: "lax",
        secure: true,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              maxAge: COOKIE_MAX_AGE,
            })
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and getUser(). Doing so can
  // cause hard-to-debug issues with users being randomly logged out.
  // IMPORTANT: DO NOT REMOVE getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public routes reachable without being logged in (auth flows).
  const publicPaths = [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/auth",
  ];
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  // Redirect unauthenticated users away from protected page routes.
  // API routes are excluded from the matcher below and enforce their own auth.
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Language: if this device has no language cookie yet but the signed-in
  // user saved a preference on their account, restore it.
  const savedLanguage = user?.user_metadata?.language;
  if (
    user &&
    isLocale(savedLanguage) &&
    !request.cookies.get(LOCALE_COOKIE)?.value
  ) {
    request.cookies.set(LOCALE_COOKIE, savedLanguage);
    // Rebuild the response so this request sees the cookie, but carry over
    // any auth cookies Supabase refreshed above.
    const previous = supabaseResponse;
    supabaseResponse = NextResponse.next({ request });
    previous.cookies.getAll().forEach((c) => supabaseResponse.cookies.set(c));
    supabaseResponse.cookies.set(LOCALE_COOKIE, savedLanguage, {
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }

  // IMPORTANT: return the supabaseResponse object as-is so the refreshed
  // cookies stay in sync between the browser and server.
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes enforce their own auth)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico and common static asset extensions
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
