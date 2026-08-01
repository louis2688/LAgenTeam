export const SESSION_COOKIE = "lagenteam_session";

function secret(): string {
  return process.env.SESSION_SECRET || process.env.CONSOLE_PASSWORD || process.env.API_TOKEN || "";
}

export function consolePassword(): string {
  return process.env.CONSOLE_PASSWORD || "";
}

/** When no password is configured, the console stays open (local/dev). */
export function authRequired(): boolean {
  return Boolean(consolePassword());
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(message: string, keyMaterial: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(keyMaterial),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(sig);
}

export async function signSession(): Promise<string> {
  const s = secret();
  if (!s) return "";
  return hmacHex("operator:v1", s);
}

export async function validSession(token: string | undefined): Promise<boolean> {
  if (!authRequired()) return true;
  if (!token) return false;
  const expected = await signSession();
  if (!expected || token.length !== expected.length) return false;
  let ok = true;
  for (let i = 0; i < token.length; i++) {
    ok = ok && token.charCodeAt(i) === expected.charCodeAt(i);
  }
  return ok;
}

export async function checkPassword(password: string): Promise<boolean> {
  const expected = consolePassword();
  if (!expected) return true;
  if (password.length !== expected.length) return false;
  let ok = true;
  for (let i = 0; i < password.length; i++) {
    ok = ok && password.charCodeAt(i) === expected.charCodeAt(i);
  }
  return ok;
}
