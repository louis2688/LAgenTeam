"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";

const TABS = ["Home", "Requests", "Deliverables", "Billing"];
const CHIPS = ["Fix a problem", "Add or improve", "Make it more reliable", "Look & feel"];
const TEAM = [
  { av: "S", nm: "Scout", role: "Triage" },
  { av: "V", nm: "Vector", role: "Planner" },
  { av: "F", nm: "Forge", role: "Developer" },
  { av: "N", nm: "Sentinel", role: "Reviewer & Security" },
];
const ACTIVE = ["queued", "planning", "running", "awaiting_approval", "needs_review"];

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="9" r="4.2" stroke="#0f9d6e" strokeWidth="2.2" />
      <circle cx="9" cy="29" r="4.2" stroke="#0f9d6e" strokeWidth="2.2" />
      <circle cx="31" cy="29" r="4.2" stroke="#0f9d6e" strokeWidth="2.2" />
      <path d="M20 13.2V22M20 22l-8 5M20 22l8 5" stroke="#0f9d6e" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="20" cy="22" r="2.2" fill="#0f9d6e" />
    </svg>
  );
}

function statusPill(s: string) {
  if (s === "done") return { cls: "done", label: "delivered" };
  if (s === "needs_review") return { cls: "review", label: "in review" };
  if (s === "awaiting_approval") return { cls: "wait", label: "estimating" };
  if (["running", "planning", "queued"].includes(s)) return { cls: "progress", label: "in progress" };
  return { cls: "", label: s };
}

export default function Portal() {
  const [runs, setRuns] = useState<any[]>([]);
  const [tab, setTab] = useState("Home");
  const [type, setType] = useState("");
  const [details, setDetails] = useState("");

  async function load() { try { const r = await fetch(API + "/runs"); const d = await r.json(); setRuns(Array.isArray(d) ? d : []); } catch (e) {} }
  useEffect(() => { load(); const t = setInterval(load, 2500); return () => clearInterval(t); }, []);

  async function submit(e: any) {
    e.preventDefault();
    if (!details.trim()) return;
    const goal = type ? type + ": " + details : details;
    try { await fetch(API + "/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal, budget_tokens: 120000 }) }); } catch (e) {}
    setDetails(""); setType(""); setTab("Requests"); load();
  }

  const active = runs.filter((r) => ACTIVE.includes(r.status));
  const done = runs.filter((r) => r.status === "done");
  const tokens = runs.reduce((s, r) => s + (r.tokens_used || 0), 0);

  function JobRow({ r }: { r: any }) {
    const p = statusPill(r.status);
    return (
      <div className="pjob">
        <span className="pg">{r.goal.length > 70 ? r.goal.slice(0, 70) + "..." : r.goal}</span>
        <span className={"ppill " + p.cls}>{p.label}</span>
      </div>
    );
  }
  const List = ({ items, empty }: { items: any[]; empty: string }) =>
    items.length ? <>{items.map((r) => <JobRow key={r.id} r={r} />)}</> : <div style={{ color: "#93a29b", padding: "12px 0" }}>{empty}</div>;

  return (
    <div>
      <div className="ptop">
        <div className="pbrand"><Logo /><div><b>Acme Robotics</b><small>Powered by LAgenTeam</small></div></div>
        <button className="pbtn" onClick={() => setTab("Home")}>New request</button>
      </div>

      <nav className="pnav">
        {TABS.map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}
      </nav>

      {tab === "Home" && (
        <>
          <h1 className="pgreet">Welcome back, Acme Robotics</h1>
          <p className="psub">Here is where your team stands today.</p>
          <div className="pstats">
            <div className="pstat"><div className="k">Active requests</div><div className="v">{active.length}</div></div>
            <div className="pstat"><div className="k">In review</div><div className="v">{runs.filter((r) => r.status === "needs_review").length}</div></div>
            <div className="pstat"><div className="k">Delivered</div><div className="v">{done.length}</div></div>
            <div className="pstat"><div className="k">Usage</div><div className="v">{tokens.toLocaleString()}</div></div>
          </div>
          <div className="pcard">
            <h2>Your team</h2>
            <div className="pteam">
              {TEAM.map((m) => (
                <div className="pmem" key={m.nm}><div className="pav">{m.av}</div><div><div className="pn">{m.nm}</div><div className="pr">{m.role}</div></div></div>
              ))}
            </div>
          </div>
          <div className="pcard">
            <h2>New request</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {CHIPS.map((c) => <button key={c} type="button" className={"pchip" + (type === c ? " on" : "")} onClick={() => setType(type === c ? "" : c)}>{c}</button>)}
            </div>
            <form onSubmit={submit}>
              <textarea className="pfield" rows={3} placeholder="Describe it in plain English - no technical detail needed." value={details} onChange={(e) => setDetails(e.target.value)} />
              <button className="pbtn" style={{ marginTop: 12 }} type="submit">Submit request</button>
            </form>
          </div>
          <div className="pcard">
            <h2>Recent work</h2>
            <List items={runs.slice(0, 8)} empty="No requests yet." />
          </div>
        </>
      )}

      {tab === "Requests" && (
        <div className="pcard"><h2>Active requests</h2><List items={active} empty="Nothing in progress right now." /></div>
      )}
      {tab === "Deliverables" && (
        <div className="pcard"><h2>Delivered</h2><List items={done} empty="No deliverables yet." /></div>
      )}
      {tab === "Billing" && (
        <>
          <div className="pstats">
            <div className="pstat"><div className="k">Requests this month</div><div className="v">{runs.length}</div></div>
            <div className="pstat"><div className="k">Delivered</div><div className="v">{done.length}</div></div>
            <div className="pstat"><div className="k">Usage units</div><div className="v">{tokens.toLocaleString()}</div></div>
            <div className="pstat"><div className="k">Plan</div><div className="v" style={{ fontSize: 18 }}>Flat</div></div>
          </div>
          <div className="pcard"><h2>Billing</h2><p style={{ color: "#5f6f76", margin: 0, fontSize: 13, lineHeight: 1.6 }}>You are on a flat subscription, not per-token. Usage units above are for transparency only. Light triage runs on a free local model; only real development work uses the paid model.</p></div>
        </>
      )}
    </div>
  );
}