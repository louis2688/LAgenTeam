import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, authRequired, validSession } from "@/lib/auth";

const PUBLIC_PREFIXES = ["/login", "/portal", "/api", "/_next"];

function isPublic(pathname: string): boolean {
  if (pathname === "/favicon.ico") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  if (!authRequired() || isPublic(req.nextUrl.pathname)) {
    return NextResponse.next();
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await validSession(token)) {
    return NextResponse.next();
  }
  const login = new URL("/login", req.url);
  login.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
