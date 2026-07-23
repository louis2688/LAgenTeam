"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";

const COLUMNS: { label: string; statuses: string[] }[] = [
  { label: "Queued", statuses: ["queued"] },
  { label: "Triaging", statuses: ["planning"] },
  { label: "In Progress", statuses: ["running"] },
  { label: "Needs Review", statuses: ["awaiting_approval", "needs_review"] },
  { label: "Delivered", statuses: ["done"] },
  { label: "Closed", statuses: ["killed", "failed", "rejected"] },
];

export default function Component() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(API + "/runs");
        const data = await res.json();
        setRuns(Array.isArray(data) ? data : []);
      } catch (e) {
        // ponytail: transient poll failure, next tick retries
      }
      setLoaded(true);
    }
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  if (!loaded) return <div className="empty">Loading jobs…</div>;

  return (
    <div>
      <div className="phead">
        <div>
          <h1>Jobs</h1>
          <div className="desc">Queued to delivered — minor changes auto-commit, majors hold at review</div>
        </div>
      </div>
      <div className="board">
        {COLUMNS.map((col) => {
          const cards = runs.filter((r: any) => col.statuses.includes(r.status));
          return (
            <div className="col" key={col.label}>
              <h3>{col.label}<span className="n">{cards.length}</span></h3>
              {cards.length === 0 ? (
                <div className="muted">Nothing here</div>
              ) : (
                cards.map((r: any) => (
                  <a
                    className="kcard"
                    key={r.id}
                    href={(r.status === "needs_review" ? "/review/" : "/runs/") + r.id}
                  >
                    <div className="id">{"JOB-" + String(r.id).padStart(4, "0")}</div>
                    <span className={"pill " + r.status}>{r.status.replace("_", " ")}</span>
                    <div className="g">{r.goal}</div>
                  </a>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
