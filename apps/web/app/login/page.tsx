"use client";
import { FormEvent, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Invalid password");
        setBusy(false);
        return;
      }
      window.location.href = next.startsWith("/") ? next : "/";
    } catch {
      setError("Login failed");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <div className="sub">Operator console</div>
          <h1>L<span>Agen</span>Team</h1>
          <p>Sign in to approve plans, review diffs, and ship runs.</p>
        </div>
        <label className="login-label">
          Password
          <input
            className="field"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Console password"
          />
        </label>
        {error ? <div className="login-error">{error}</div> : null}
        <button className="btn primary" type="submit" disabled={busy || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login"><div className="login-card">Loading…</div></div>}>
      <LoginForm />
    </Suspense>
  );
}
