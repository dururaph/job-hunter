import { type NextRequest, NextResponse } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";

/** Sends anyone without a valid session to /login (only when APP_PASSWORD is set). */
export async function proxy(request: NextRequest) {
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login page, the cron endpoint (it has its own secret), and static assets.
  matcher: ["/((?!login|api/ingest|_next/static|_next/image|favicon.ico).*)"],
};
