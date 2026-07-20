import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Server-side auth gate: if there's no live Frappe session cookie, bounce app
// routes to /login before any protected page JS is served. Frappe remains the
// source of truth for real authorization — this is defense-in-depth and a
// faster redirect than the client-side check in AppShell.
const PUBLIC_PATHS = ["/login", "/set-password"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  const sid = req.cookies.get("sid")?.value;
  if (!sid || sid === "Guest") {
    const url = req.nextUrl.clone();
    const dest = pathname + req.nextUrl.search; // preserve the intended destination
    url.pathname = "/login";
    url.search = "";
    if (dest && dest !== "/") url.searchParams.set("next", dest);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // App pages only — skip the proxied API, files, Next internals and the favicon.
  matcher: ["/((?!api|frappe-files|_next/static|_next/image|favicon.ico).*)"],
};
