"use client";
import { useEffect, useState } from "react";
import { API } from "@/lib/api";

export default function Component() {
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(API + "/config");
        const data = await res.json();
        setConfig(data);
      } catch (e) {}
    }
    load();
  }, []);

  if (!config) return <div className="empty">Loading configuration…</div>;

  return (
    <div>
      <div className="phead">
        <div>
          <h1>Settings</h1>
          <div className="desc">Runtime configuration (read-only)</div>
        </div>
      </div>

      <div className="panel">
        <h2>Providers</h2>
        <div className="cfg">
          <div className="r">
            <span className="k">Planner / Coder model</span>
            <span className="v">{config.claude_model}</span>
          </div>
          <div className="r">
            <span className="k">Claude API</span>
            <span className="v">
              <span className={config.claude_enabled ? "on" : "off"}>
                {config.claude_enabled ? "connected" : "disabled"}
              </span>
            </span>
          </div>
          <div className="r">
            <span className="k">Triage model</span>
            <span className="v">{config.ollama_model}</span>
          </div>
          <div className="r">
            <span className="k">Local Ollama tier</span>
            <span className="v">
              <span className={config.ollama_enabled ? "on" : "off"}>
                {config.ollama_enabled ? "on" : "off"}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Execution</h2>
        <div className="cfg">
          <div className="r">
            <span className="k">Shell execution (run_shell)</span>
            <span className="v">
              <span className={config.allow_shell ? "on" : "off"}>
                {config.allow_shell ? "on" : "off"}
              </span>
              {config.allow_shell ? <span className="muted"> — agents can run shell commands</span> : null}
            </span>
          </div>
          <div className="r">
            <span className="k">Default token budget</span>
            <span className="v">{Number(config.default_budget_tokens).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="muted">
        Secrets (API keys) are read from .env inside the container and never sent to the browser.
      </div>
    </div>
  );
}
