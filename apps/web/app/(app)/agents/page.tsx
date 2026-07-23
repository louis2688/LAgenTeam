"use client";

import { useEffect, useState } from "react";
import { API } from "@/lib/api";

const DISPLAY: any = {
  triage: { nm: "Scout", rl: "Triage" },
  planner: { nm: "Vector", rl: "Planner" },
  coder: { nm: "Forge", rl: "Coder" },
  reviewer: { nm: "Sentinel", rl: "Reviewer" },
};
const ORDER = ["triage", "planner", "coder", "reviewer"];

export default function Component() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(API + "/agents");
        const data = await res.json();
        setAgents(Array.isArray(data) ? data : []);
      } catch (e) {
        // ponytail: fetch failed, roster stays empty
      }
      setLoaded(true);
    }
    load();
  }, []);

  const byName: any = {};
  for (const a of agents) byName[a.name] = a;
  const ordered = ORDER.map((n) => byName[n]).filter(Boolean);

  return (
    <div>
      <div className="phead">
        <div>
          <h1>Agents</h1>
          <div className="desc">Your autonomous engineering team — config, not code</div>
        </div>
      </div>

      {!loaded ? (
        <div className="empty">Loading agents…</div>
      ) : (
        <>
          <div className="node active">
            <div className="av">A</div>
            <div className="nm">Atlas</div>
            <div className="rl">Lead Orchestrator</div>
            <div className="st">
              <span className="dot active" />
            </div>
          </div>

          <div className="pipe">
            <span className="seg" />
            <span className="muted">dispatches to</span>
            <span className="seg" />
          </div>

          {ordered.length === 0 ? (
            <div className="empty">No agents configured.</div>
          ) : (
            <div className="orbit">
              {ordered.map((a: any) => {
                const d = DISPLAY[a.name];
                return (
                  <div className="node" key={a.name}>
                    <div className="av">{d.nm.charAt(0)}</div>
                    <div className="nm">{d.nm}</div>
                    <div className="rl">
                      {d.rl}
                      {a.tools && a.tools.length > 0 ? (
                        <span className="muted" style={{ display: "block", fontSize: 10 }}>
                          {a.tools.join(", ")}
                        </span>
                      ) : null}
                    </div>
                    <div className="st">
                      <span className={"tier " + a.tier}>
                        {a.tier === "local" ? "Local free" : "Claude"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
