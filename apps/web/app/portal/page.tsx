"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";

const TYPES = ["Fix a problem", "Add or improve", "Make it more reliable", "Look & feel"];

const TEAM = [
  { name: "Scout", role: "Triage" },
  { name: "Vector", role: "Planner" },
  { name: "Forge", role: "Developer" },
  { name: "Sentinel", role: "Reviewer & Security" },
];

export default function Component() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [type, setType] = useState<string>("");
  const [details, setDetails] = useState("");

  async function load() {
    try {
      const r = await fetch(API + "/runs");
      const data = await r.json();
      setRuns(Array.isArray(data) ? data : []);
    } catch {
      // ponytail: transient poll failure keeps last data
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  async function submit() {
    const text = details.trim();
    if (!text && !type) return;
    const goal = type ? type + ": " + text : text;
    try {
      await fetch(API + "/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, budget_tokens: 120000 }),
      });
      setType("");
      setDetails("");
      load();
    } catch {
      // ponytail: submit failed, form kept so user can retry
    }
  }

  const active = runs.filter((x) =>
    ["planning", "running", "awaiting_approval", "needs_review"].includes(x.status)
  ).length;
  const review = runs.filter((x) => x.status === "needs_review").length;
  const delivered = runs.filter((x) => x.status === "done").length;
  const tokens = runs.reduce((s, x) => s + (x.tokens_used || 0), 0);

  function pill(status: string) {
    if (status === "done") return <span className="ppill done">delivered</span>;
    if (status === "needs_review") return <span className="ppill review">in review</span>;
    if (["running", "planning", "queued"].includes(status))
      return <span className="ppill progress">in progress</span>;
    if (status === "awaiting_approval")
      return <span className="ppill wait">estimating</span>;
    return <span className="muted">{status}</span>;
  }

  return (
    <div>
      <div className="ptop">
        <div className="pbrand">
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
            <circle cx="15" cy="15" r="3.2" stroke="#0f9d6e" strokeWidth="1.6" />
            <circle cx="15" cy="5" r="3.2" stroke="#0f9d6e" strokeWidth="1.6" />
            <circle cx="6" cy="24" r="3.2" stroke="#0f9d6e" strokeWidth="1.6" />
            <circle cx="24" cy="24" r="3.2" stroke="#0f9d6e" strokeWidth="1.6" />
            <line x1="15" y1="12" x2="15" y2="8" stroke="#0f9d6e" strokeWidth="1.6" />
            <line x1="13" y1="17" x2="8" y2="22" stroke="#0f9d6e" strokeWidth="1.6" />
            <line x1="17" y1="17" x2="22" y2="22" stroke="#0f9d6e" strokeWidth="1.6" />
          </svg>
          <div>
            <b>Acme Robotics</b>
            <small>Powered by LAgenTeam</small>
          </div>
        </div>
      </div>

      <h1 className="pgreet">Welcome back, Acme Robotics</h1>
      <p className="psub">Here is where your team stands today.</p>

      <div className="pstats">
        <div className="pstat">
          <div className="k">Active requests</div>
          <div className="v">{active}</div>
        </div>
        <div className="pstat">
          <div className="k">In review</div>
          <div className="v">{review}</div>
        </div>
        <div className="pstat">
          <div className="k">Delivered</div>
          <div className="v">{delivered}</div>
        </div>
        <div className="pstat">
          <div className="k">Tokens used</div>
          <div className="v">{tokens.toLocaleString()}</div>
        </div>
      </div>

      <div className="pcard">
        <h2>Your team</h2>
        <div className="pteam">
          {TEAM.map((m) => (
            <div className="pmem" key={m.name}>
              <div className="pav">{m.name[0]}</div>
              <div className="pn">{m.name}</div>
              <div className="pr">{m.role}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="pcard">
        <h2>New request</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TYPES.map((t) => (
            <button
              key={t}
              className={type === t ? "pchip on" : "pchip"}
              onClick={() => setType(type === t ? "" : t)}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          className="pfield"
          rows={3}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Describe it in plain English — no technical detail needed."
        />
        <button className="pbtn" onClick={submit}>
          Submit request
        </button>
      </div>

      <div className="pcard">
        <h2>Recent work</h2>
        {!loaded ? (
          <div className="empty">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="empty">No requests yet.</div>
        ) : (
          runs.map((x) => (
            <div className="pjob" key={x.id}>
              <div className="pg">
                {String(x.goal || "").length > 80
                  ? String(x.goal).slice(0, 80) + "…"
                  : x.goal}
              </div>
              {pill(x.status)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}