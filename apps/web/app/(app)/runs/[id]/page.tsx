"use client";

import { use, useEffect, useState } from "react";
import { API } from "@/lib/api";

const AGENTS: any = {
  triage: "Scout",
  planner: "Vector",
  coder: "Forge",
  reviewer: "Sentinel",
};

function evClass(type: string) {
  const t = type || "";
  if (t.includes("needs_review")) return "violet";
  if (t.includes("killed") || t.includes("failed") || t.includes("rejected")) return "bad";
  if (t.includes("awaiting") || t.includes("gate")) return "warn";
  if (t.includes("done") || t.includes("approved") || t.includes("shipped")) return "info";
  return "";
}

function fmtTime(ts: any) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch (e) {
    return "";
  }
}

function detail(e: any) {
  const d = e.data || {};
  let s = "";
  switch (e.type) {
    case "tool.call":
      s = d.tool + "(" + Object.values(d.inputs || {}).join(", ") + ")";
      break;
    case "tool.result":
      s = d.tool + " → " + String(d.output ?? "").slice(0, 60);
      break;
    case "task.done":
      s = d.name + " [" + d.model + " · " + d.tokens + " tok]";
      break;
    case "triage.done":
      s = d.classification + " [" + d.model + "]";
      break;
    case "run.created":
      s = d.goal || "";
      break;
    case "run.killed":
    case "run.failed":
      s = d.reason || "";
      break;
    default:
      s = "";
  }
  return String(s).slice(0, 90);
}

export default function Component({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(API + "/runs/" + id);
        const d = await r.json();
        setRun(d.run);
        setTasks(d.tasks || []);
        setEvents(d.events || []);
      } catch (e) {}
    }
    load();
    const iv = setInterval(load, 1500);
    return () => clearInterval(iv);
  }, [id]);

  async function post(path: string) {
    try {
      await fetch(API + "/runs/" + id + path, { method: "POST" });
    } catch (e) {}
  }

  if (!run) return <div className="empty">Loading job…</div>;

  const status = run.status;
  const has = (t: string) => events.some((e: any) => e.type === t);
  const taskState = (agent: string) => {
    const ts = tasks.filter((t: any) => t.agent === agent);
    if (ts.some((t: any) => t.status === "running")) return "active";
    if (ts.length && ts.every((t: any) => t.status === "done")) return "done";
    return "idle";
  };

  const scout = has("triage.done") ? "done" : status === "planning" ? "active" : "idle";
  const vector = has("plan.ready") ? "done" : status === "planning" ? "active" : "idle";
  const gate = has("run.approved") ? "done" : status === "awaiting_approval" ? "wait" : "idle";
  const forge = taskState("coder");
  const sentinel = taskState("reviewer");

  const nodes = [
    { av: "S", nm: "Scout", rl: "Triage · local", dot: scout, gate: false },
    { av: "V", nm: "Vector", rl: "Planner · Claude", dot: vector, gate: false },
    { av: "◆", nm: "Gate", rl: "Human", dot: gate, gate: true },
    { av: "F", nm: "Forge", rl: "Coder · Claude", dot: forge, gate: false },
    { av: "S", nm: "Sentinel", rl: "Reviewer · Claude", dot: sentinel, gate: false },
  ];

  const pct = run.budget_tokens
    ? Math.min(100, Math.round((run.tokens_used / run.budget_tokens) * 100))
    : 0;

  const files: string[] = [];
  const seen: any = {};
  events.forEach((e: any) => {
    const d = e.data || {};
    if (e.type === "tool.result" && d.tool === "write_file" && typeof d.output === "string") {
      const m = d.output.match(/wrote\s+(\S+)/);
      if (m && !seen[m[1]]) {
        seen[m[1]] = true;
        files.push(m[1]);
      }
    }
  });

  const feed = events.slice().reverse();

  return (
    <div>
      <a className="muted" href="/">
        ‹ console
      </a>
      <div className="phead">
        <div>
          <div className="id">JOB-{String(id).padStart(4, "0")}</div>
          <h1>{run.goal}</h1>
        </div>
        <span className={"pill " + status}>{status.replace("_", " ")}</span>
      </div>

      <div className="grid">
        <div>
          <div className="panel">
            <h2>Orchestration</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {nodes.map((n, i) => (
                <div className={n.gate ? "node gate" : "node"} key={i}>
                  <div className="av">{n.av}</div>
                  <div className="nm">{n.nm}</div>
                  <div className="rl">{n.rl}</div>
                  <div className="st">
                    <span className={"dot " + n.dot} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {status === "awaiting_approval" && (
            <div className="gate">
              <h3>Human gate — approval required</h3>
              <p>Atlas drafted a plan. Review the tasks, then approve to let the agents run.</p>
              <div className="feed">
                {tasks.map((t: any) => (
                  <div className="row" key={t.id}>
                    <span className="ev info">{AGENTS[t.agent] || t.agent}</span>
                    <span className="dd">{t.name}</span>
                  </div>
                ))}
              </div>
              <div className="acts">
                <button className="btn approve" onClick={() => post("/approve")}>
                  Approve and run
                </button>
                <button className="btn reject" onClick={() => post("/reject")}>
                  Reject
                </button>
              </div>
            </div>
          )}

          {status === "needs_review" && (
            <div className="gate review">
              <h3>Diff ready for review</h3>
              <p>Sentinel finished. Inspect the unified diff before shipping.</p>
              <div className="acts">
                <a className="btn approve" href={"/review/" + id}>
                  Open diff
                </a>
              </div>
            </div>
          )}

          <div className="panel">
            <h2>Budget</h2>
            <div className={pct > 80 ? "meter hot" : "meter"}>
              <i style={{ width: pct + "%" }} />
            </div>
            <div className="metarow">
              <span>
                {run.tokens_used} / {run.budget_tokens} tokens
              </span>
              <span>{pct}%</span>
            </div>
            <div className="muted">hard kill at 100%</div>
          </div>

          {files.length > 0 && (
            <div className="panel">
              <h2>Workspace Artifacts</h2>
              <div className="feed">
                {files.map((f, i) => (
                  <div className="row" key={i}>
                    <span className="ev info">▤</span>
                    <span className="dd">{f}</span>
                  </div>
                ))}
              </div>
              <div className="muted">Written to workspaces/run_{id}/</div>
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Audit Feed</h2>
          {feed.length === 0 ? (
            <div className="empty">No events yet</div>
          ) : (
            <div className="feed">
              {feed.map((e: any) => (
                <div className="row" key={e.id}>
                  <span className="t">{fmtTime(e.created_at)}</span>
                  <span>
                    <span className={("ev " + evClass(e.type)).trim()}>{e.type}</span>
                    <span className="dd">{detail(e)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
