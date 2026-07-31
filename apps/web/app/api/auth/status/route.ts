import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, authRequired, validSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const required = authRequired();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return NextResponse.json({
    required,
    authenticated: required ? await validSession(token) : true,
  });
}
