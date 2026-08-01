import asyncio
import hmac
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Header, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from . import engine, events, agents as agents_mod, tools as tools_mod
from .config import settings
from .db import pool
from .router import tier_for


class CreateRun(BaseModel):
    goal: str = Field(min_length=1, max_length=8000)
    budget_tokens: int | None = Field(default=None, ge=1, le=settings.max_budget_tokens)
    project_id: int | None = Field(default=None, ge=1)


class CreateProject(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class Note(BaseModel):
    note: str = Field(default="", max_length=2000)


async def require_auth(request: Request, authorization: str | None = Header(default=None)):
    # Auth is enforced only when API_TOKEN is configured. /health stays open for probes.
    if request.url.path == "/health" or not settings.api_token:
        return
    token = authorization or ""
    if token.startswith("Bearer "):
        token = token[7:].strip()
    if not hmac.compare_digest(token, settings.api_token):
        raise HTTPException(status_code=401, detail="unauthorized")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await pool()
    await engine.reap_orphans()
    worker = asyncio.create_task(engine.worker_loop())
    yield
    worker.cancel()


app = FastAPI(title="LAgenTeam", lifespan=lifespan, dependencies=[Depends(require_auth)])
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_methods=["GET", "POST"],
    allow_headers=["authorization", "content-type"],
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
    items = []
    for n, c in agents_mod.active_registry().items():
        prompt = (c.get("system_prompt") or "").strip()
        summary = prompt.split("\n", 1)[0][:220] if prompt else ""
        items.append({
            "name": n,
            "task_class": c["task_class"],
            "tier": tier_for(c["task_class"]),
            "tools": c.get("tools", []),
            "summary": summary,
        })
    items.sort(key=lambda a: agents_mod.ACTIVE_ORDER.get(a["name"], 99))
    return items


@app.get("/projects")
async def list_projects():
    p = await pool()
    rows = await p.fetch(
        "SELECT p.id, p.name, p.created_at, "
        "COUNT(r.id) AS run_count, "
        "COUNT(r.id) FILTER (WHERE r.status NOT IN ('done','rejected','failed','killed')) AS open_count, "
        "COUNT(r.id) FILTER (WHERE r.status = 'done') AS done_count, "
        "COALESCE(SUM(r.tokens_used), 0) AS tokens_used "
        "FROM projects p LEFT JOIN runs r ON r.project_id = p.id "
        "GROUP BY p.id ORDER BY p.id"
    )
    return [dict(r) for r in rows]


@app.post("/projects")
async def create_project(body: CreateProject):
    p = await pool()
    row = await p.fetchrow(
        "INSERT INTO projects(name) VALUES($1) RETURNING id, name, created_at",
        body.name.strip())
    out = dict(row)
    out.update({"run_count": 0, "open_count": 0, "done_count": 0, "tokens_used": 0})
    return out


@app.get("/projects/{project_id}")
async def get_project(project_id: int):
    p = await pool()
    proj = await p.fetchrow("SELECT id, name, created_at FROM projects WHERE id=$1", project_id)
    if not proj:
        raise HTTPException(404, "project not found")
    runs = await p.fetch(
        "SELECT id, goal, status, budget_tokens, tokens_used, project_id, created_at, updated_at "
        "FROM runs WHERE project_id=$1 ORDER BY id DESC LIMIT 100", project_id)
    return {"project": dict(proj), "runs": [dict(r) for r in runs]}


@app.post("/runs")
async def create_run(body: CreateRun):
    try:
        run_id = await engine.create_run(body.goal, body.budget_tokens, body.project_id)
    except ValueError:
        raise HTTPException(404, "project not found")
    return {"id": run_id}


@app.get("/runs")
async def list_runs(project_id: int | None = Query(default=None, ge=1)):
    p = await pool()
    if project_id is not None:
        rows = await p.fetch(
            "SELECT id, goal, status, budget_tokens, tokens_used, project_id, created_at, updated_at "
            "FROM runs WHERE project_id=$1 ORDER BY id DESC LIMIT 200", project_id)
    else:
        rows = await p.fetch(
            "SELECT id, goal, status, budget_tokens, tokens_used, project_id, created_at, updated_at "
            "FROM runs ORDER BY id DESC LIMIT 200")
    return [dict(r) for r in rows]


@app.get("/runs/{run_id}")
async def get_run(run_id: int):
    p = await pool()
    run = await p.fetchrow("SELECT * FROM runs WHERE id=$1", run_id)
    if not run:
        raise HTTPException(404, "run not found")
    tasks = await p.fetch("SELECT * FROM tasks WHERE run_id=$1 ORDER BY position", run_id)
    evs = await p.fetch("SELECT * FROM events WHERE run_id=$1 ORDER BY id LIMIT 2000", run_id)
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
        raise HTTPException(409, "run is not awaiting approval or review")
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
            "SELECT id, type, data, task_id FROM ("
            "  SELECT id, type, data, task_id FROM events WHERE run_id=$1 ORDER BY id DESC LIMIT 1000"
            ") t ORDER BY id", run_id)
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
