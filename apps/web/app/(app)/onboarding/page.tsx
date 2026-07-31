"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";

const STEPS = [
  { id: "keys", title: "Connect a model", body: "Add ANTHROPIC_API_KEY (and optional Ollama) in .env, or stay on the mock provider." },
  { id: "auth", title: "Lock the console", body: "Set CONSOLE_PASSWORD so the operator UI requires sign-in." },
  { id: "dispatch", title: "Dispatch a goal", body: "From the dashboard, submit a plain-English goal with a token budget." },
  { id: "plan", title: "Approve the plan", body: "At the plan gate, review the task list before any coding spend." },
  { id: "review", title: "Review the diff", body: "Ship, request changes (rework loop), or reject at the review gate." },
];

export default function OnboardingPage() {
  const [config, setConfig] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [authOn, setAuthOn] = useState(false);

  useEffect(() => {
    (async () => {
      try { setConfig(await (await fetch(API + "/config")).json()); } catch (e) {}
      try {
        const list = await (await fetch(API + "/runs")).json();
        setRuns(Array.isArray(list) ? list : []);
      } catch (e) {}
      try {
        const st = await (await fetch("/api/auth/status")).json();
        setAuthOn(Boolean(st.required));
      } catch (e) {}
    })();
  }, []);

  const done = {
    keys: Boolean(config?.claude_enabled || config?.ollama_enabled),
    auth: authOn,
    dispatch: runs.length > 0,
    plan: runs.some((r) => ["awaiting_approval", "running", "needs_review", "done"].includes(r.status)),
    review: runs.some((r) => ["needs_review", "done"].includes(r.status)),
  };

  return (
    <div>
      <div className="phead">
        <div>
          <h1>Onboarding</h1>
          <div className="desc">Get from zero to a shipped run</div>
        </div>
      </div>

      <div className="jobs">
        {STEPS.map((s, i) => (
          <div className="panel" key={s.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <h2 style={{ margin: 0 }}>
                {String(i + 1).padStart(2, "0")} · {s.title}
              </h2>
              <span className={"pill " + (done[s.id as keyof typeof done] ? "done" : "queued")}>
                {done[s.id as keyof typeof done] ? "ready" : "todo"}
              </span>
            </div>
            <p style={{ margin: "10px 0 0", color: "var(--muted)", lineHeight: 1.45 }}>{s.body}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        <a className="btn primary" href="/">Go to dashboard</a>
      </div>
    </div>
  );
}
