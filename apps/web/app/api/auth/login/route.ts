import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, authRequired, checkPassword, signSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!authRequired()) {
    return NextResponse.json({ ok: true, auth: "disabled" });
  }
  let password = "";
  try {
    const body = await req.json();
    password = String(body?.password || "");
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!(await checkPassword(password))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
