"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";

export default function Component() {
  const [runs, setRuns] = useState<any[] | null>(null);

  async function load() {
    try {
      const res = await fetch(API + "/runs");
      const data = await res.json();
      setRuns(data);
    } catch (e) {
      setRuns([]);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  if (!runs) return <div className="empty">Loading monitoring…</div>;

  const tokens = runs.reduce((s: number, r: any) => s + (r.tokens_used || 0), 0);
  const delivered = runs.filter((r: any) => r.status === "done").length;
  const stopped = runs.filter((r: any) => r.status === "killed" || r.status === "failed").length;

  const counts: any = {};
  for (const r of runs) counts[r.status] = (counts[r.status] || 0) + 1;
  const statuses = Object.keys(counts);
  const maxCount = Math.max(1, ...statuses.map((s) => counts[s]));

  const recent = runs.slice(0, 8);

  return (
    <div>
      <div className="phead">
        <div>
          <h1>Monitoring</h1>
          <div className="desc">Throughput and spend across all runs</div>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="k">Total Runs</div>
          <div className="v">{runs.length}</div>
        </div>
        <div className="kpi">
          <div className="k">Tokens Used</div>
          <div className="v accent">{tokens.toLocaleString()}</div>
        </div>
        <div className="kpi">
          <div className="k">Delivered</div>
          <div className="v">{delivered}</div>
        </div>
        <div className="kpi">
          <div className="k">Stopped</div>
          <div className="v warn">{stopped}</div>
        </div>
      </div>

      <div className="panel">
        <h2>Runs by status</h2>
        {statuses.length === 0 ? (
          <div className="empty">No runs yet</div>
        ) : (
          statuses.map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <span className={"pill " + s} style={{ width: 140, flex: "0 0 auto" }}>{s.replace("_", " ")}</span>
              <div className="meter" style={{ flex: 1 }}>
                <i style={{ width: (counts[s] / maxCount) * 100 + "%" }} />
              </div>
              <span className="muted" style={{ width: 30, textAlign: "right", flex: "0 0 auto" }}>{counts[s]}</span>
            </div>
          ))
        )}
      </div>

      <div className="panel">
        <h2>Recent token spend</h2>
        {recent.length === 0 ? (
          <div className="empty">No runs yet</div>
        ) : (
          recent.map((r: any) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <span style={{ width: 90, flex: "0 0 auto" }}>{"JOB-" + String(r.id).padStart(4, "0")}</span>
              <span className="muted" style={{ flex: "0 0 auto", width: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.goal}</span>
              <div className={"meter" + (r.tokens_used > r.budget_tokens ? " hot" : "")} style={{ flex: 1 }}>
                <i style={{ width: Math.min(100, r.budget_tokens ? (r.tokens_used / r.budget_tokens) * 100 : 0) + "%" }} />
              </div>
              <span className="muted" style={{ width: 70, textAlign: "right", flex: "0 0 auto" }}>{(r.tokens_used || 0).toLocaleString()}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
