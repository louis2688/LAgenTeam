import asyncio
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from . import engine, events, agents as agents_mod, tools as tools_mod
from .config import settings
from .db import pool
from .router import tier_for


class CreateRun(BaseModel):
    goal: str
    budget_tokens: int | None = None


class Note(BaseModel):
    note: str = ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    await pool()  # init connection pool + schema
    worker = asyncio.create_task(engine.worker_loop())
    yield
    worker.cancel()


app = FastAPI(title="LAgenTeam", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.get("/health")
async def health():
    return {"ok": True}


@app.get("/config")
async def config():
    return {
        "claude_model": settings.claude_model,
        "claude_enabled": bool(settings.anthropic_api_key),
        "ollama_model": settings.ollama_model,
        "ollama_enabled": bool(settings.ollama_host),
        "allow_shell": settings.allow_shell,
        "default_budget_tokens": settings.default_budget_tokens,
    }


@app.get("/agents")
async def list_agents():
    order = {"triage": 0, "planner": 1, "coder": 2, "reviewer": 3}
    reg = agents_mod.registry()
    items = [
        {"name": n, "task_class": c["task_class"], "tier": tier_for(c["task_class"]), "tools": c.get("tools", [])}
        for n, c in reg.items()
    ]
    items.sort(key=lambda a: order.get(a["name"], 99))
    return items


@app.post("/runs")
async def create_run(body: CreateRun):
    run_id = await engine.create_run(body.goal, body.budget_tokens)
    return {"id": run_id}


@app.get("/runs")
async def list_runs():
    p = await pool()
    rows = await p.fetch(
        "SELECT id, goal, status, budget_tokens, tokens_used, created_at, updated_at "
        "FROM runs ORDER BY id DESC LIMIT 200"
    )
    return [dict(r) for r in rows]


@app.get("/runs/{run_id}")
async def get_run(run_id: int):
    p = await pool()
    run = await p.fetchrow("SELECT * FROM runs WHERE id=$1", run_id)
    if not run:
        raise HTTPException(404, "run not found")
    tasks = await p.fetch("SELECT * FROM tasks WHERE run_id=$1 ORDER BY position", run_id)
    evs = await p.fetch("SELECT * FROM events WHERE run_id=$1 ORDER BY id", run_id)
    return {"run": dict(run), "tasks": [dict(t) for t in tasks], "events": [dict(e) for e in evs]}


@app.get("/runs/{run_id}/diff")
async def get_diff(run_id: int):
    return tools_mod.diff(run_id)


@app.post("/runs/{run_id}/approve")
async def approve(run_id: int):
    if not await engine.approve_run(run_id):
        raise HTTPException(409, "run is not awaiting approval")
    return {"ok": True}


@app.post("/runs/{run_id}/reject")
async def reject(run_id: int):
    if not await engine.reject_run(run_id):
        raise HTTPException(409, "run is not awaiting approval")
    return {"ok": True}


@app.post("/runs/{run_id}/ship")
async def ship(run_id: int):
    if not await engine.ship_run(run_id):
        raise HTTPException(409, "run is not awaiting review")
    return {"ok": True}


@app.post("/runs/{run_id}/request_changes")
async def request_changes(run_id: int, body: Note | None = None):
    if not await engine.request_changes(run_id, body.note if body else ""):
        raise HTTPException(409, "run is not awaiting review")
    return {"ok": True}


@app.get("/runs/{run_id}/stream")
async def stream(run_id: int):
    async def gen():
        p = await pool()
        history = await p.fetch(
            "SELECT id, type, data, task_id FROM events WHERE run_id=$1 ORDER BY id", run_id
        )
        for e in history:
            yield _sse({"id": e["id"], "type": e["type"], "data": e["data"], "task_id": e["task_id"]})

        pubsub = events.redis().pubsub()
        await pubsub.subscribe(events.channel(run_id))
        try:
            async for msg in pubsub.listen():
                if msg["type"] == "message":
                    yield _sse(json.loads(msg["data"]))
        finally:
            await pubsub.unsubscribe(events.channel(run_id))

    return StreamingResponse(gen(), media_type="text/event-stream")


def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj, default=str)}\n\n"