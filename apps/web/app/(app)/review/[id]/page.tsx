"use client";
import { use, useEffect, useState } from "react";
import { API } from "@/lib/api";

function lineClass(line: string) {
  if (line.startsWith("@@")) return "hunk";
  if (
    line.startsWith("diff ") ||
    line.startsWith("index ") ||
    line.startsWith("+++") ||
    line.startsWith("---")
  )
    return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "";
}

export default function Component({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<any>(null);
  const [diff, setDiff] = useState<any>(null);

  async function load() {
    try {
      const r = await fetch(API + "/runs/" + id);
      const rd = await r.json();
      setRun(rd.run);
    } catch (e) {}
    try {
      const d = await fetch(API + "/runs/" + id + "/diff");
      setDiff(await d.json());
    } catch (e) {}
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [id]);

  async function ship() {
    try {
      await fetch(API + "/runs/" + id + "/ship", { method: "POST" });
      window.location.href = "/jobs";
    } catch (e) {}
  }

  async function requestChanges(note: string) {
    try {
      await fetch(API + "/runs/" + id + "/request_changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      load();
    } catch (e) {}
  }

  if (!run) return <div className="empty">Loading job…</div>;

  const status = run.status;
  const files = diff?.files ?? [];
  const lines = (diff?.patch ?? "").split("\n");

  return (
    <div>
      <div className="phead">
        <div>
          <div className="id">{"JOB-" + String(run.id).padStart(4, "0")}</div>
          <h1>{run.goal}</h1>
        </div>
        <span className={"pill " + status}>{status.replace("_", " ")}</span>
      </div>

      <a className="muted" href="/review">back to review</a>

      <div className="panel">
        <h2>Changed files</h2>
        {files.length === 0 ? (
          <div className="empty">No files changed yet.</div>
        ) : (
          <div className="filelist">
            {files.map((f: any) => (
              <div className="f" key={f.path}>
                {f.path}
                <span className="add">{"+" + f.additions}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Diff</h2>
        {!diff?.patch ? (
          <div className="empty">No diff available yet.</div>
        ) : (
          <div className="diff">
            {lines.map((line: string, i: number) => (
              <span className={"ln " + lineClass(line)} key={i}>
                {line}
              </span>
            ))}
          </div>
        )}
      </div>

      {status === "needs_review" ? (
        <div className="gate review">
          <h3>Review gate — approve before it ships</h3>
          <p>Atlas is holding the diff. Approve to commit, or send it back for changes.</p>
          <div className="acts">
            <button className="btn approve" onClick={ship}>
              Approve & commit
            </button>
            <button className="btn" onClick={() => requestChanges("changes requested")}>
              Request changes
            </button>
            <button className="btn reject" onClick={() => requestChanges("rejected")}>
              Reject
            </button>
          </div>
        </div>
      ) : (
        <div className="muted">Current status: {status.replace("_", " ")}</div>
      )}
    </div>
  );
}
