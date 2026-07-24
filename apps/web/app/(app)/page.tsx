"use client";
import { useState, useEffect } from "react";
import { API } from "@/lib/api";

const AGENTS = [
  { key: "triage", av: "S", nm: "Scout", rl: "Triage", tier: "local" },
  { key: "planner", av: "V", nm: "Vector", rl: "Planner", tier: "cloud" },
  { key: "coder", av: "F", nm: "Forge", rl: "Coder", tier: "cloud" },
  { key: "reviewer", av: "N", nm: "Sentinel", rl: "Reviewer", tier: "cloud" },
];
const NONTERMINAL = ["queued", "planning", "running", "awaiting_approval", "needs_review"];

export default function Component() {
  const [runs, setRuns] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState(120000);

  async function load() {
    try {
      const list = await (await fetch(API + "/runs")).json();
      const arr = Array.isArray(list) ? list : [];
      setRuns(arr);
      const act = arr.find((r) => NONTERMINAL.includes(r.status));
      if (act) setActive(await (await fetch(API + "/runs/" + act.id)).json());
      else setActive(null);
    } catch (e) {
      // transient; next poll retries
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, []);

  async function dispatch(e: any) {
    e.preventDefault();
    if (!goal.trim()) return;
    try {
      await fetch(API + "/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal, budget_tokens: Number(budget) }) });
      setGoal("");
      await load();
    } catch (e) {}
  }
  async function approve(id: any) {
    try { await fetch(API + "/runs/" + id + "/approve", { method: "POST" }); await load(); } catch (e) {}
  }

  const inProgress = runs.filter((r) => ["planning", "running", "queued"].includes(r.status)).length;
  const awaitingReview = runs.filter((r) => ["awaiting_approval", "needs_review"].includes(r.status)).length;
  const delivered = runs.filter((r) => r.status === "done").length;
  const tokensUsed = runs.reduce((s, r) => s + (r.tokens_used || 0), 0);
  const approvals = runs.filter((r) => r.status === "awaiting_approval");
  const reviews = runs.filter((r) => r.status === "needs_review");

  const job = (id: any) => "JOB-" + String(id).padStart(4, "0");
  const pill = (s: string) => <span className={"pill " + s}>{s.replace("_", " ")}</span>;

  // ---- live orchestration derived from the active run's real events/tasks ----
  const run = active?.run;
  const events: any[] = active?.events || [];
  const tasks: any[] = active?.tasks || [];
  const has = (t: string) => events.some((e) => e.type === t);
  const st: string = run?.status || "";

  function dotFor(key: string): string {
    if (!run) return "idle";
    if (key === "triage") return has("triage.done") ? "done" : (st === "planning" ? "active" : "idle");
    if (key === "planner") return has("plan.ready") ? "done" : (st === "planning" && has("triage.done") ? "active" : "idle");
    const ts = tasks.filter((t) => t.agent === key);
    if (ts.some((t) => t.status === "running")) return "active";
    if (ts.length && ts.every((t) => t.status === "done")) return "done";
    return "idle";
  }
  const atlasActive = !!run && ["planning", "running"].includes(st);
  const gateState = st === "awaiting_approval" || st === "needs_review" ? "wait" : has("run.approved") ? "done" : "idle";

  function activity(): string {
    if (!run) return "Team standing by";
    if (st === "awaiting_approval") return "Waiting for plan approval";
    if (st === "needs_review") return "Waiting for diff review";
    if (st === "planning") return has("triage.done") ? "Vector is drafting the plan" : "Scout is triaging the request";
    if (st === "running") {
      const rt = tasks.find((t) => t.status === "running");
      const who = rt ? (AGENTS.find((a) => a.key === rt.agent)?.nm || rt.agent) : "Workers";
      const tc = [...events].reverse().find((e) => e.type === "tool.call");
      if (rt && rt.agent === "coder" && tc) {
        const d = tc.data || {}; const inp = d.input || {};
        const arg = inp.path || inp.command || "";
        return who + " . " + d.tool + (arg ? " " + String(arg).slice(0, 34) : "");
      }
      if (rt) return who + " . " + rt.name;
      return "Workers running";
    }
    return st;
  }

  return (
    <div>
      <div className="phead">
        <div><h1>Dashboard</h1><div className="desc">Live orchestration and the job pipeline</div></div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="k">Jobs</div><div className="v">{runs.length}</div></div>
        <div className="kpi"><div className="k">In Progress</div><div className="v accent">{inProgress}</div></div>
        <div className="kpi"><div className="k">Awaiting Review</div><div className="v warn">{awaitingReview}</div></div>
        <div className="kpi"><div className="k">Delivered</div><div className="v">{delivered}</div></div>
        <div className="kpi"><div className="k">Tokens Used</div><div className="v accent">{tokensUsed.toLocaleString()}</div></div>
      </div>

      <div className="grid">
        <div>
          <div className="panel">
            <h2>New Request</h2>
            <form onSubmit={dispatch} style={{ display: "flex", gap: 9 }}>
              <input className="field" placeholder="Describe the goal in plain English..." value={goal} onChange={(e) => setGoal(e.target.value)} />
              <input className="field" style={{ width: 116, flex: "none" }} type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
              <button className="btn primary" type="submit" style={{ flex: "none" }}>Dispatch</button>
            </form>
          </div>

          <div className="panel orch">
            <h2>Live Orchestration</h2>
            {run ? (
              <>
                <div className="orchjob"><span className="id">{job(run.id)}</span>{pill(run.status)}<span className="goaltxt">{run.goal}</span></div>
                <div className="actline">{activity()}</div>
              </>
            ) : (
              <div className="actline">{activity()}</div>
            )}
            <div className={"node" + (atlasActive ? " active" : "")}>
              <div className="av">A</div>
              <div><div className="nm">Atlas</div><div className="rl">Lead Orchestrator</div></div>
              <div className="st"><span className={"dot " + (atlasActive ? "active" : "idle")} /></div>
            </div>
            <div className="pipe"><span className="seg" />dispatches to<span className="seg" /></div>
            <div className="orbit">
              {AGENTS.map((a) => {
                const d = dotFor(a.key);
                return (
                  <div key={a.key} className={"node" + (d === "active" ? " active" : "")}>
                    <div className="av">{a.av}</div>
                    <div><div className="nm">{a.nm}</div><div className="rl">{a.rl}</div></div>
                    <div className="st">
                      <span className={"tier " + a.tier}>{a.tier === "local" ? "Local free" : "Claude"}</span>
                      <span className={"dot " + d} style={{ marginTop: 6 }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={"node gate" + (gateState === "wait" ? " active" : "")} style={{ marginTop: 10 }}>
              <div className="av">&#9672;</div>
              <div><div className="nm">Human Gate</div><div className="rl">Plan &amp; diff approval</div></div>
              <div className="st"><span className={"dot " + gateState} /></div>
            </div>
          </div>

          <div className="panel">
            <h2>Jobs</h2>
            {!loaded ? (
              <div className="empty">Loading...</div>
            ) : runs.length === 0 ? (
              <div className="empty">No jobs yet. Dispatch a request to begin.</div>
            ) : (
              <div className="jobs">
                {runs.map((r) => {
                  const pct = Math.min(100, Math.max(0, ((r.tokens_used || 0) / (r.budget_tokens || 1)) * 100));
                  return (
                    <a key={r.id} className="job" href={"/runs/" + r.id}>
                      <div className="top"><span className="id">{job(r.id)}</span>{pill(r.status)}</div>
                      <div className="goal">{r.goal}</div>
                      <div className={"meter" + (pct > 80 ? " hot" : "")}><i style={{ width: pct + "%" }} /></div>
                      <div className="metarow"><span>{(r.tokens_used || 0).toLocaleString()} / {(r.budget_tokens || 0).toLocaleString()} tokens</span><span>{Math.round(pct)}%</span></div>
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
            {approvals.length === 0 && <div className="empty">Nothing awaiting approval.</div>}
            {approvals.map((r) => (
              <div className="gate" key={r.id} style={{ marginBottom: 10 }}>
                <h3>{job(r.id)}</h3>
                <p>{r.goal}</p>
                <div className="acts"><button className="btn approve" onClick={() => approve(r.id)}>Approve</button><a className="btn" href={"/runs/" + r.id}>Review</a></div>
              </div>
            ))}
          </div>
          <div className="panel">
            <h2>Review Gate</h2>
            {reviews.length === 0 && <div className="empty">No diffs waiting to ship.</div>}
            {reviews.map((r) => (
              <div className="gate review" key={r.id} style={{ marginBottom: 10 }}>
                <h3>{job(r.id)}</h3>
                <p>{r.goal}</p>
                <div className="acts"><a className="btn approve" href={"/review/" + r.id}>Review diff</a></div>
              </div>
            ))}
          </div>
          <div className="panel">
            <h2>Cost Control</h2>
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>A hard token budget kills runaway runs before they burn out. Light triage runs free on local Ollama; only real dev work escalates to Claude.</p>
          </div>
        </div>
      </div>
    </div>
  );
}