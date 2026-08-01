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
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    try {
      await fetch(API + "/runs/" + id + "/ship", { method: "POST" });
      window.location.href = "/jobs";
    } catch (e) {
      setBusy(false);
    }
  }

  async function requestChanges() {
    setBusy(true);
    try {
      await fetch(API + "/runs/" + id + "/request_changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || "Please address the review feedback." }),
      });
      setNote("");
      await load();
    } catch (e) {}
    setBusy(false);
  }

  async function reject() {
    setBusy(true);
    try {
      await fetch(API + "/runs/" + id + "/reject", { method: "POST" });
      window.location.href = "/jobs";
    } catch (e) {
      setBusy(false);
    }
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
          <p>Approve to commit, request changes to send it back to the coder, or reject to stop the run.</p>
          <textarea
            className="field"
            rows={3}
            placeholder="Feedback for the coder (used when requesting changes)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <div className="acts">
            <button className="btn approve" onClick={ship} disabled={busy}>
              Approve & commit
            </button>
            <button className="btn" onClick={requestChanges} disabled={busy}>
              Request changes
            </button>
            <button className="btn reject" onClick={reject} disabled={busy}>
              Reject
            </button>
          </div>
        </div>
      ) : status === "running" ? (
        <div className="muted">Rework in progress — coder is applying feedback…</div>
      ) : (
        <div className="muted">Current status: {status.replace("_", " ")}</div>
      )}
    </div>
  );
}
