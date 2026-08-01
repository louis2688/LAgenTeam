"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";

export default function KnowledgePage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setAgents(await (await fetch(API + "/agents")).json());
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  if (!loaded) return <div className="empty">Loading knowledge…</div>;

  return (
    <div>
      <div className="phead">
        <div>
          <h1>Knowledge</h1>
          <div className="desc">Agent roles, tiers, tools, and prompt summaries from YAML config</div>
        </div>
      </div>

      <div className="jobs">
        {agents.map((a) => (
          <div className="panel" key={a.name}>
            <div className="top" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <h2 style={{ margin: 0 }}>{a.name}</h2>
              <span className={"tier " + a.tier}>{a.tier}</span>
            </div>
            <div className="metarow" style={{ marginTop: 8 }}>
              <span>class · {a.task_class}</span>
              <span>{(a.tools || []).length ? (a.tools as string[]).join(", ") : "no tools"}</span>
            </div>
            <p style={{ margin: "12px 0 0", color: "var(--muted)", lineHeight: 1.45 }}>
              {a.summary || "No system prompt summary."}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
