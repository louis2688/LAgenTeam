"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";

const STAGES = [
  { key: "triage", title: "Scout · Triage", detail: "Classify the goal on the local/free tier." },
  { key: "plan", title: "Vector · Plan", detail: "Draft a task list with waves for parallel work." },
  { key: "plan_gate", title: "Plan gate", detail: "Human approval before any coding tokens are spent." },
  { key: "execute", title: "Execute", detail: "Specialists run by wave; shared hard token budget." },
  { key: "review_gate", title: "Review gate", detail: "Diff review — ship, request changes, or reject." },
  { key: "ship", title: "Ship", detail: "Commit the workspace when the review is approved." },
];

export default function WorkflowsPage() {
  const [runs, setRuns] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const list = await (await fetch(API + "/runs")).json();
        setRuns(Array.isArray(list) ? list : []);
      } catch (e) {}
    })();
  }, []);

  const counts: Record<string, number> = {
    triage: runs.filter((r) => r.status === "planning" || r.status === "queued").length,
    plan: runs.filter((r) => r.status === "planning").length,
    plan_gate: runs.filter((r) => r.status === "awaiting_approval").length,
    execute: runs.filter((r) => r.status === "running").length,
    review_gate: runs.filter((r) => r.status === "needs_review").length,
    ship: runs.filter((r) => r.status === "done").length,
  };

  return (
    <div>
      <div className="phead">
        <div>
          <h1>Workflows</h1>
          <div className="desc">The governed delivery pipeline every job follows</div>
        </div>
      </div>

      <div className="panel">
        <h2>Standard delivery</h2>
        <div className="jobs">
          {STAGES.map((s, i) => (
            <div className="job" key={s.key} style={{ cursor: "default" }}>
              <div className="top">
                <span className="id">STEP {String(i + 1).padStart(2, "0")}</span>
                {(counts[s.key] || 0) > 0 ? (
                  <span className="pill running">{counts[s.key]} live</span>
                ) : (
                  <span className="pill done">idle</span>
                )}
              </div>
              <div className="goal">{s.title}</div>
              <div className="metarow"><span>{s.detail}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
