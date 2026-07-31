"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";

const tokfmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n || 0));

export default function ProjectsPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await (await fetch(API + "/runs")).json();
        setRuns(Array.isArray(list) ? list : []);
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  if (!loaded) return <div className="empty">Loading projects…</div>;

  const open = runs.filter((r) => !["done", "rejected", "failed", "killed"].includes(r.status)).length;
  const done = runs.filter((r) => r.status === "done").length;

  return (
    <div>
      <div className="phead">
        <div>
          <h1>Projects</h1>
          <div className="desc">Workspace runs grouped under the default project</div>
        </div>
      </div>

      <div className="panel">
        <div className="job" style={{ cursor: "default" }}>
          <div className="top">
            <span className="id">PRJ-0001</span>
            <span className="pill running">{open} open</span>
          </div>
          <div className="goal">Default workspace</div>
          <div className="metarow">
            <span>{runs.length} jobs · {done} shipped</span>
            <span>{tokfmt(runs.reduce((s, r) => s + (r.tokens_used || 0), 0))} tokens used</span>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Recent jobs</h2>
        {runs.length === 0 ? (
          <div className="empty">No jobs yet — dispatch one from the dashboard.</div>
        ) : (
          <div className="jobs">
            {runs.slice(0, 20).map((r) => (
              <a className="job" key={r.id} href={"/runs/" + r.id}>
                <div className="top">
                  <span className="id">{"JOB-" + String(r.id).padStart(4, "0")}</span>
                  <span className={"pill " + r.status}>{r.status.replace("_", " ")}</span>
                </div>
                <div className="goal">{r.goal}</div>
                <div className="metarow">
                  <span>{tokfmt(r.tokens_used)} / {tokfmt(r.budget_tokens)}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
