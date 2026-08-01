"use client";
import { useState, useEffect } from "react";
import { API } from "@/lib/api";

const DISPLAY: any = {
  triage: { nm: "Scout", role: "Triage", code: "TRI-01" },
  planner: { nm: "Vector", role: "Planner", code: "PLN-02" },
  architect: { nm: "Beacon", role: "Solution Architect", code: "ARC-03" },
  coder: { nm: "Forge", role: "Developer", code: "DEV-04" },
  tester: { nm: "Probe", role: "QA Engineer", code: "QA-06" },
  reviewer: { nm: "Sentinel", role: "Reviewer . Security", code: "REV-09" },
  docs: { nm: "Scribe", role: "Documentation", code: "DOC-08" },
};
const ORDER = ["triage", "architect", "planner", "coder", "tester", "reviewer", "docs"];
const NONTERMINAL = ["queued", "planning", "running", "awaiting_approval", "needs_review"];
const tokfmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n || 0));

export default function Component() {
  const [runs, setRuns] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState(120000);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState<number | "">("");

  async function load() {
    try {
      const list = await (await fetch(API + "/runs")).json();
      const arr = Array.isArray(list) ? list : [];
      setRuns(arr);
      const act = arr.find((r) => NONTERMINAL.includes(r.status));
      if (act) setActive(await (await fetch(API + "/runs/" + act.id)).json());
      else setActive(null);
    } catch (e) {} finally { setLoaded(true); }
  }
  useEffect(() => {
    (async () => {
      try { setRoster(await (await fetch(API + "/agents")).json()); } catch (e) {}
      try {
        const ps = await (await fetch(API + "/projects")).json();
        const arr = Array.isArray(ps) ? ps : [];
        setProjects(arr);
        if (arr.length) setProjectId(arr[0].id);
      } catch (e) {}
    })();
    load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, []);

  async function dispatch(e: any) {
    e.preventDefault();
    if (!goal.trim()) return;
    const body: any = { goal, budget_tokens: Number(budget) };
    if (projectId !== "") body.project_id = Number(projectId);
    try {
      await fetch(API + "/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setGoal("");
      await load();
    } catch (e) {}
  }
  async function approve(id: any) { try { await fetch(API + "/runs/" + id + "/approve", { method: "POST" }); await load(); } catch (e) {} }

  const inProgress = runs.filter((r) => ["planning", "running", "queued"].includes(r.status)).length;
  const awaitingReview = runs.filter((r) => ["awaiting_approval", "needs_review"].includes(r.status)).length;
  const delivered = runs.filter((r) => r.status === "done").length;
  const tokensUsed = runs.reduce((s, r) => s + (r.tokens_used || 0), 0);
  const approvals = runs.filter((r) => r.status === "awaiting_approval");
  const reviews = runs.filter((r) => r.status === "needs_review");
  const job = (id: any) => "JOB-" + String(id).padStart(4, "0");
  const pill = (s: string) => <span className={"pill " + s}>{s.replace("_", " ")}</span>;

  const run = active?.run;
  const events: any[] = active?.events || [];
  const tasks: any[] = active?.tasks || [];
  const has = (t: string) => events.some((e) => e.type === t);
  const st: string = run?.status || "";

  function agentState(name: string) {
    const ts = tasks.filter((t) => t.agent === name);
    const tok = ts.reduce((s, t) => s + (t.tokens_used || 0), 0);
    let state = "idle", label = "Idle", line = "standing by";
    if (name === "triage") {
      if (has("triage.done")) { state = "done"; label = "Done"; line = "classified the request"; }
      else if (st === "planning") { state = "active"; label = "Active"; line = "triaging the request"; }
    } else if (name === "planner") {
      if (has("plan.ready")) { state = "done"; label = "Done"; line = "plan delivered"; }
      else if (st === "planning" && has("triage.done")) { state = "active"; label = "Active"; line = "drafting the plan"; }
    } else {
      if (ts.some((t) => t.status === "running")) {
        state = "active"; label = "Active"; line = "working";
        if (name === "coder") {
          const tc = [...events].reverse().find((e) => e.type === "tool.call");
          if (tc) { const d = tc.data || {}; const inp = d.input || {}; line = d.tool + (inp.path ? " " + inp.path : inp.command ? " " + String(inp.command).slice(0, 24) : ""); }
        }
      } else if (ts.length && ts.every((t) => t.status === "done")) {
        if (name === "reviewer" && st === "needs_review") { state = "wait"; label = "Needs Approval"; line = "diff awaiting operator"; }
        else { state = "done"; label = "Done"; line = st === "needs_review" ? "paused . awaiting gate" : "delivered"; }
      } else if (ts.length) { state = "idle"; label = "Queued"; line = "waiting to start"; }
    }
    return { state, label, line, tok };
  }

  const sorted = [...roster].sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
  const inFlight = sorted.filter((a) => agentState(a.name).state === "active").length;
  const atlasActive = !!run && ["planning", "running"].includes(st);
  const atlasLine = !run ? "standing by" : atlasActive ? "dispatching . " + job(run.id) : st === "awaiting_approval" || st === "needs_review" ? "waiting on operator" : "standing by";

  function Card({ name }: { name: string }) {
    const d = DISPLAY[name] || { nm: name, role: "", code: "" };
    const s = agentState(name);
    return (
      <div className={"ocard " + s.state}>
        <div className="ohead"><div className="oav">{d.nm[0]}</div><div><div className="onm">{d.nm}</div><div className="orl">{d.role}</div></div></div>
        <div className="ostatus"><span className={"dot " + (s.state === "wait" ? "wait" : s.state)} /><span className={"olabel " + s.state}>{s.label}</span></div>
        <div className="oline">{s.line}</div>
        <div className="ofoot"><span>TOK {tokfmt(s.tok)}</span><span>{d.code}</span></div>
      </div>
    );
  }

  return (
    <div>
      <div className="phead"><div><h1>Dashboard</h1><div className="desc">Live orchestration and the job pipeline</div></div></div>

      <div className="kpis">
        <div className="kpi"><div className="k">Jobs</div><div className="v">{runs.length}</div></div>
        <div className="kpi"><div className="k">In Progress</div><div className="v accent">{inProgress}</div></div>
        <div className="kpi"><div className="k">Awaiting Review</div><div className="v warn">{awaitingReview}</div></div>
        <div className="kpi"><div className="k">Delivered</div><div className="v">{delivered}</div></div>
        <div className="kpi"><div className="k">Tokens Used</div><div className="v accent">{tokensUsed.toLocaleString()}</div></div>
      </div>

      <div className="panel orch" style={{ marginBottom: 18 }}>
        <div className="orchhead"><h2>Live Orchestration</h2><span className="meta">{sorted.length} agents . {inFlight} in flight</span></div>
        {run ? (
          <>
            <div className="orchjob"><span className="id">{job(run.id)}</span>{pill(run.status)}<span className="goaltxt">{run.goal}</span></div>
            <div className="actline">{atlasLine === "standing by" ? "Waiting on operator" : "Atlas is orchestrating " + job(run.id)}</div>
          </>
        ) : (
          <div className="actline">Team standing by . no active run</div>
        )}
        <div className="atlaswrap">
          <div className={"ocard atlas" + (atlasActive ? " active" : "")}>
            <div className="ohead"><div className="oav">A</div><div><div className="onm">Atlas</div><div className="orl">Lead Orchestrator . ORC-01</div></div></div>
            <div className="ostatus"><span className={"dot " + (atlasActive ? "active" : "idle")} /><span className={"olabel " + (atlasActive ? "active" : "idle")}>{atlasActive ? "Thinking" : "Idle"}</span></div>
            <div className="oline">{atlasLine}</div>
          </div>
        </div>
        <svg className="connectors" viewBox="0 0 100 40" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M50 0 L50 10 L12.5 10 L12.5 40" />
          <path d="M50 0 L50 10 L37.5 10 L37.5 40" />
          <path d="M50 0 L50 10 L62.5 10 L62.5 40" />
          <path d="M50 0 L50 10 L87.5 10 L87.5 40" />
        </svg>
        <div className="orbit2">
          {sorted.length === 0 ? <div className="empty">Loading roster...</div> : sorted.map((a) => <Card key={a.name} name={a.name} />)}
        </div>
        <div className="legend">
          <span><span className="dot active" /> Active</span>
          <span><span className="dot wait" /> Needs Approval</span>
          <span><span className="dot done" /> Done</span>
          <span><span className="dot idle" /> Idle</span>
        </div>
      </div>

      <div className="grid">
        <div>
          <div className="panel">
            <h2>New Request</h2>
            <form onSubmit={dispatch} style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              <input className="field" placeholder="Describe the goal in plain English..." value={goal} onChange={(e) => setGoal(e.target.value)} style={{ flex: "1 1 240px" }} />
              <select
                className="field"
                style={{ width: 180, flex: "none" }}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}
              >
                {projects.length === 0 ? <option value="">Default project</option> : null}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input className="field" style={{ width: 116, flex: "none" }} type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
              <button className="btn primary" type="submit" style={{ flex: "none" }}>Dispatch</button>
            </form>
          </div>
          <div className="panel">
            <h2>Jobs</h2>
            {!loaded ? <div className="empty">Loading...</div> : runs.length === 0 ? <div className="empty">No jobs yet. Dispatch a request to begin.</div> : (
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
                <h3>{job(r.id)}</h3><p>{r.goal}</p>
                <div className="acts"><button className="btn approve" onClick={() => approve(r.id)}>Approve</button><a className="btn" href={"/runs/" + r.id}>Review</a></div>
              </div>
            ))}
          </div>
          <div className="panel">
            <h2>Review Gate</h2>
            {reviews.length === 0 && <div className="empty">No diffs waiting to ship.</div>}
            {reviews.map((r) => (
              <div className="gate review" key={r.id} style={{ marginBottom: 10 }}>
                <h3>{job(r.id)}</h3><p>{r.goal}</p>
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