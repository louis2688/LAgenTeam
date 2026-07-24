import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ORIGIN = process.env.API_ORIGIN || "http://api:8000";
const TOKEN = process.env.API_TOKEN || "";

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = ORIGIN + "/" + (path || []).join("/") + (req.nextUrl.search || "");
  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  const accept = req.headers.get("accept");
  if (accept) headers["accept"] = accept;
  if (TOKEN) headers["authorization"] = "Bearer " + TOKEN;
  const init: RequestInit = { method: req.method, headers, cache: "no-store" };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.text();
  const resp = await fetch(url, init);
  return new Response(resp.body, {
    status: resp.status,
    headers: {
      "content-type": resp.headers.get("content-type") || "application/json",
      "cache-control": "no-cache, no-transform",
    },
  });
}

export const GET = proxy;
export const POST = proxy;