"use client";
import { useState, useEffect } from "react";
import { API } from "@/lib/api";

const AGENTS = [
  { key: "triage", av: "S", nm: "Scout", rl: "Triage", tier: "local" },
  { key: "planner", av: "V", nm: "Vector", rl: "Planner", tier: "cloud" },
  { key: "coder", av: "F", nm: "Forge", rl: "Coder", tier: "cloud" },
  { key: "reviewer", av: "S", nm: "Sentinel", rl: "Reviewer", tier: "cloud" },
];

export default function Component() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState(120000);

  async function load() {
    try {
      const res = await fetch(API + "/runs");
      const data = await res.json();
      setRuns(Array.isArray(data) ? data : []);
    } catch (e) {
      // ignore transient fetch errors; next poll retries
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  async function dispatch(e: any) {
    e.preventDefault();
    if (!goal.trim()) return;
    try {
      await fetch(API + "/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, budget_tokens: Number(budget) }),
      });
      setGoal("");
      await load();
    } catch (e) {
      // ignore
    }
  }

  async function approve(id: any) {
    try {
      await fetch(API + "/runs/" + id + "/approve", { method: "POST" });
      await load();
    } catch (e) {
      // ignore
    }
  }

  const inProgress = runs.filter((r) =>
    ["planning", "running", "queued"].includes(r.status)
  ).length;
  const awaitingReview = runs.filter((r) =>
    ["awaiting_approval", "needs_review"].includes(r.status)
  ).length;
  const delivered = runs.filter((r) => r.status === "done").length;
  const tokensUsed = runs.reduce((s, r) => s + (r.tokens_used || 0), 0);

  const anyActive = runs.some((r) => ["planning", "running"].includes(r.status));
  const scoutActive = runs.some((r) => ["planning", "queued"].includes(r.status));
  const forgeActive = runs.some((r) => r.status === "running");

  const approvals = runs.filter((r) => r.status === "awaiting_approval");
  const reviews = runs.filter((r) => r.status === "needs_review");

  const job = (id: any) => "JOB-" + String(id).padStart(4, "0");
  const pill = (s: string) => <span className={"pill " + s}>{s.replace("_", " ")}</span>;

  return (
    <div>
      <div className="phead">
        <div>
          <h1>Dashboard</h1>
          <div className="desc">Live orchestration and the job pipeline</div>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="k">Jobs</div>
          <div className="v">{runs.length}</div>
        </div>
        <div className="kpi">
          <div className="k">In Progress</div>
          <div className="v accent">{inProgress}</div>
        </div>
        <div className="kpi">
          <div className="k">Awaiting Review</div>
          <div className="v warn">{awaitingReview}</div>
        </div>
        <div className="kpi">
          <div className="k">Delivered</div>
          <div className="v">{delivered}</div>
        </div>
        <div className="kpi">
          <div className="k">Tokens Used</div>
          <div className="v accent">{tokensUsed.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid">
        <div>
          <div className="panel">
            <h2>New Request</h2>
            <form onSubmit={dispatch}>
              <div className="field">
                <input
                  placeholder="Describe the goal…"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </div>
              <div className="field" style={{ width: 116 }}>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                />
              </div>
              <button className="btn primary" type="submit">
                Dispatch
              </button>
            </form>
          </div>

          <div className="panel orch">
            <h2>Live Orchestration</h2>
            <div className={"node" + (anyActive ? " active" : "")}>
              <div className="av">A</div>
              <div className="nm">Atlas</div>
              <div className="rl">Lead Orchestrator</div>
            </div>
            <div className="pipe">
              <span className="seg" />
              <span>dispatches to</span>
              <span className="seg" />
            </div>
            <div className="orbit">
              {AGENTS.map((a) => {
                const active = a.tier === "local" || a.key === "planner" ? scoutActive : forgeActive;
                return (
                  <div key={a.key} className={"node" + (active ? " active" : "")}>
                    <div className="av">{a.av}</div>
                    <div className="nm">{a.nm}</div>
                    <div className="rl">{a.rl}</div>
                    <div className="st">
                      <span className={"tier " + a.tier}>
                        {a.tier === "local" ? "Local free" : "Claude"}
                      </span>
                      <span className={"dot " + (active ? "active" : "idle")} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <h2>Jobs</h2>
            {!loaded ? (
              <div className="empty">Loading…</div>
            ) : runs.length === 0 ? (
              <div className="empty">No jobs yet. Dispatch a request to begin.</div>
            ) : (
              <div className="jobs">
                {runs.map((r) => {
                  const pct = Math.min(
                    100,
                    Math.max(0, ((r.tokens_used || 0) / (r.budget_tokens || 1)) * 100)
                  );
                  return (
                    <a key={r.id} className="job" href={"/runs/" + r.id}>
                      <div className="top">
                        <span className="id">{job(r.id)}</span>
                        {pill(r.status)}
                      </div>
                      <div className="goal">{r.goal}</div>
                      <div className={"meter" + (pct > 80 ? " hot" : "")}>
                        <i style={{ width: pct + "%" }} />
                      </div>
                      <div className="metarow">
                        <span>
                          {(r.tokens_used || 0).toLocaleString()} /{" "}
                          {(r.budget_tokens || 0).toLocaleString()} tokens
                        </span>
                        <span>{Math.round(pct)}%</span>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <h2>Approval Gate</h2>
            {approvals.length === 0 ? (
              <div className="empty">No plans awaiting approval.</div>
            ) : (
              approvals.map((r) => (
                <div key={r.id} className="gate">
                  <h3>{job(r.id)}</h3>
                  <p>{r.goal}</p>
                  <div className="acts">
                    <button className="btn approve" onClick={() => approve(r.id)}>
                      Approve
                    </button>
                    <a className="btn" href={"/runs/" + r.id}>
                      Review
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <h2>Review Gate</h2>
            {reviews.length === 0 ? (
              <div className="empty">No jobs awaiting diff review.</div>
            ) : (
              reviews.map((r) => (
                <div key={r.id} className="gate review">
                  <h3>{job(r.id)}</h3>
                  <p>{r.goal}</p>
                  <div className="acts">
                    <a className="btn" href={"/review/" + r.id}>
                      Review diff
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <h2>Cost Control</h2>
            <p className="muted">
              A hard token budget kills runaway runs before they burn out. Light triage
              runs free on local Ollama; only real dev work escalates to Claude.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}