"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";

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
        setRuns([]);
      } finally {
        setLoaded(true);
      }
    }
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  const queue = runs.filter((r) => r.status === "needs_review");

  return (
    <div>
      <div className="phead">
        <div>
          <h1>Review Gate</h1>
          <div className="desc">Diffs waiting for a human before they ship</div>
        </div>
      </div>
      {!loaded ? (
        <div className="empty">Loading review queue...</div>
      ) : queue.length === 0 ? (
        <div className="empty">
          Nothing to review. Completed runs land here when the coder produces changes.
        </div>
      ) : (
        queue.map((r) => (
          <div className="gate review" key={r.id}>
            <h3>{"JOB-" + String(r.id).padStart(4, "0")}</h3>
            <p>{r.goal}</p>
            <div className="acts">
              <a className="btn approve" href={"/review/" + r.id}>
                Review diff
              </a>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
