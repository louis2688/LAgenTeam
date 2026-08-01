"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";

const tokfmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n || 0));
const prj = (id: number) => "PRJ-" + String(id).padStart(4, "0");

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadProjects() {
    try {
      const list = await (await fetch(API + "/projects")).json();
      const arr = Array.isArray(list) ? list : [];
      setProjects(arr);
      if (arr.length && selected == null) setSelected(arr[0].id);
      return arr;
    } catch (e) {
      return [];
    } finally {
      setLoaded(true);
    }
  }

  async function loadRuns(pid: number) {
    try {
      const list = await (await fetch(API + "/runs?project_id=" + pid)).json();
      setRuns(Array.isArray(list) ? list : []);
    } catch (e) {
      setRuns([]);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selected != null) loadRuns(selected);
  }, [selected]);

  async function createProject(e: any) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(API + "/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const p = await res.json();
      setName("");
      await loadProjects();
      if (p?.id) setSelected(p.id);
    } catch (e) {}
    setBusy(false);
  }

  if (!loaded) return <div className="empty">Loading projects…</div>;

  const current = projects.find((p) => p.id === selected);

  return (
    <div>
      <div className="phead">
        <div>
          <h1>Projects</h1>
          <div className="desc">Group jobs under named workspaces</div>
        </div>
      </div>

      <div className="panel">
        <h2>New project</h2>
        <form onSubmit={createProject} style={{ display: "flex", gap: 9 }}>
          <input
            className="field"
            placeholder="Project name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn primary" type="submit" disabled={busy || !name.trim()} style={{ flex: "none" }}>
            Create
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Workspaces</h2>
        {projects.length === 0 ? (
          <div className="empty">No projects yet.</div>
        ) : (
          <div className="jobs">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className="job"
                onClick={() => setSelected(p.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                  borderColor: selected === p.id ? "var(--accent)" : undefined,
                }}
              >
                <div className="top">
                  <span className="id">{prj(p.id)}</span>
                  <span className="pill running">{p.open_count || 0} open</span>
                </div>
                <div className="goal">{p.name}</div>
                <div className="metarow">
                  <span>{p.run_count || 0} jobs · {p.done_count || 0} shipped</span>
                  <span>{tokfmt(Number(p.tokens_used || 0))} tokens</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>{current ? current.name + " · recent jobs" : "Recent jobs"}</h2>
        {runs.length === 0 ? (
          <div className="empty">No jobs in this project yet — dispatch one from the dashboard.</div>
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
