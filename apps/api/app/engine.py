import re
import json
import asyncio
from . import agents, events, providers, tools
from .config import settings
from .db import pool
from .router import tier_for

QUEUE = "lagenteam:queue"


async def create_run(goal: str, budget_tokens: int | None = None) -> int:
    p = await pool()
    budget = budget_tokens or settings.default_budget_tokens
    run_id = await p.fetchval(
        "INSERT INTO runs(goal, status, budget_tokens) VALUES($1,'queued',$2) RETURNING id",
        goal, budget)
    await events.emit(run_id, "run.created", {"goal": goal, "budget_tokens": budget})
    await _enqueue(run_id, "plan")
    return run_id


async def approve_run(run_id: int) -> bool:
    if not await _is_status(run_id, "awaiting_approval"):
        return False
    await _set_status(run_id, "running")
    await events.emit(run_id, "run.approved")
    await _enqueue(run_id, "execute")
    return True


async def reject_run(run_id: int) -> bool:
    if not await _is_status(run_id, "awaiting_approval"):
        return False
    await _set_status(run_id, "rejected")
    await events.emit(run_id, "run.rejected")
    return True


async def ship_run(run_id: int) -> bool:
    if not await _is_status(run_id, "needs_review"):
        return False
    tools.commit(run_id, "shipped via review gate")
    await _set_status(run_id, "done")
    await events.emit(run_id, "run.shipped")
    return True


async def request_changes(run_id: int, note: str = "") -> bool:
    if not await _is_status(run_id, "needs_review"):
        return False
    await _set_status(run_id, "rejected")
    await events.emit(run_id, "run.changes_requested", {})
    return True


async def reap_orphans() -> None:
    """On startup, fail runs left mid-flight when the worker last stopped."""
    p = await pool()
    rows = await p.fetch("SELECT id FROM runs WHERE status IN ('queued','planning','running')")
    for r in rows:
        await _set_status(r["id"], "failed")
        await events.emit(r["id"], "run.failed", {"reason": "interrupted by restart"})


async def _enqueue(run_id: int, phase: str) -> None:
    await events.redis().rpush(QUEUE, json.dumps({"run_id": run_id, "phase": phase}))


async def worker_loop() -> None:
    r = events.redis()
    while True:
        try:
            item = await r.blpop(QUEUE, timeout=5)
            if item is None:
                continue
            job = json.loads(item[1])
            rid = job.get("run_id")
            try:
                if job["phase"] == "plan":
                    await _plan(rid)
                elif job["phase"] == "execute":
                    await _execute(rid)
            except Exception as e:  # noqa: BLE001 - a failed job must not orphan the run
                print("[worker] job error:", type(e).__name__)
                try:
                    await _fail(rid, "internal error")
                except Exception:  # noqa: BLE001
                    pass
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            print("[worker] loop error:", type(e).__name__)


async def _triage(run_id: int, goal: str) -> str:
    triage = agents.get("triage")
    try:
        c = await providers.complete(tier_for(triage["task_class"]), triage["system_prompt"], f"Goal: {goal} /no_think")
        await _add_tokens(run_id, c.tokens)
        note = re.sub(r"<think>.*?</think>", "", c.text, flags=re.DOTALL).strip()
        await events.emit(run_id, "triage.done", {"classification": note[:200], "model": c.model})
        return note
    except Exception:  # noqa: BLE001
        await events.emit(run_id, "triage.skipped", {"reason": "unavailable"})
        return ""


async def _plan(run_id: int) -> None:
    p = await pool()
    goal = await p.fetchval("SELECT goal FROM runs WHERE id=$1", run_id)
    await _set_status(run_id, "planning")
    await events.emit(run_id, "run.planning")

    note = await _triage(run_id, goal)
    planner = agents.get("planner")
    prompt = f"Goal: {goal}\nTriage: {note}" if note else f"Goal: {goal}"
    try:
        c = await providers.complete(tier_for(planner["task_class"]), planner["system_prompt"], prompt)
    except Exception as e:  # noqa: BLE001
        print("[plan] error:", type(e).__name__)
        await _fail(run_id, "planner error")
        return
    await _add_tokens(run_id, c.tokens)

    plan = _parse_plan(c.text, goal)
    for i, t in enumerate(plan):
        agent_cfg = agents.get(t["agent"])
        await p.execute(
            "INSERT INTO tasks(run_id, name, task_class, agent, model_tier, position) VALUES($1,$2,$3,$4,$5,$6)",
            run_id, t["name"], agent_cfg["task_class"], agent_cfg["name"], tier_for(agent_cfg["task_class"]), i)
    await p.execute("UPDATE runs SET plan=$2, updated_at=now() WHERE id=$1", run_id, plan)
    await _set_status(run_id, "awaiting_approval")
    await events.emit(run_id, "plan.ready", {"tasks": plan, "tokens": c.tokens})
    await events.emit(run_id, "run.awaiting_approval")


async def _execute(run_id: int) -> None:
    p = await pool()
    goal = await p.fetchval("SELECT goal FROM runs WHERE id=$1", run_id)
    rows = await p.fetch("SELECT id, name, agent, model_tier FROM tasks WHERE run_id=$1 ORDER BY position", run_id)
    context = f"Goal: {goal}\n"
    for t in rows:
        if await _over_budget(run_id):
            await _set_status(run_id, "killed")
            await events.emit(run_id, "run.killed", {"reason": "budget exceeded"}, task_id=t["id"])
            return

        await p.execute("UPDATE tasks SET status='running' WHERE id=$1", t["id"])
        await events.emit(run_id, "task.started", {"name": t["name"], "agent": t["agent"]}, task_id=t["id"])

        agent_cfg = agents.get(t["agent"])
        try:
            c = await _run_task(run_id, t["id"], agent_cfg, t["model_tier"], context + f"\nTask: {t['name']}")
        except Exception as e:  # noqa: BLE001
            print("[task] error:", type(e).__name__)
            await p.execute("UPDATE tasks SET status='failed', output=$2 WHERE id=$1", t["id"], "task failed")
            await events.emit(run_id, "task.failed", {"error": "internal error"}, task_id=t["id"])
            await _fail(run_id, "task failed")
            return

        await _add_tokens(run_id, c.tokens)
        await p.execute("UPDATE tasks SET status='done', output=$2, model=$3, tokens_used=$4 WHERE id=$1",
                        t["id"], c.text, c.model, c.tokens)
        await events.emit(run_id, "task.done",
            {"name": t["name"], "model": c.model, "tokens": c.tokens, "output": c.text[:500]}, task_id=t["id"])
        context += f"\n[{t['name']}] {c.text}\n"

    d = tools.diff(run_id)
    if d["files"]:
        await _set_status(run_id, "needs_review")
        await events.emit(run_id, "run.needs_review", {"files": [f["path"] for f in d["files"]]})
    else:
        await _set_status(run_id, "done")
        await events.emit(run_id, "run.done")


async def _run_task(run_id, task_id, agent_cfg, tier, prompt):
    tool_names = agent_cfg.get("tools") or []
    if tool_names and tier == "cloud" and settings.anthropic_api_key:
        p = await pool()
        row = await p.fetchrow("SELECT tokens_used, budget_tokens FROM runs WHERE id=$1", run_id)
        remaining = max(0, row["budget_tokens"] - row["tokens_used"]) if row else None
        ws = tools.workspace(run_id)

        async def on_tool(name, inp, out):
            await events.emit(run_id, "tool.call", {"tool": name, "input": inp}, task_id)
            await events.emit(run_id, "tool.result", {"tool": name, "output": out[:500]}, task_id)

        return await providers.complete_with_tools(
            agent_cfg["system_prompt"], prompt, tool_names, ws, on_tool, budget_remaining=remaining)
    return await providers.complete(tier, agent_cfg["system_prompt"], prompt)


def _parse_plan(text: str, goal: str) -> list[dict]:
    text = text.strip()
    try:
        start, end = text.find("["), text.rfind("]")
        parsed = json.loads(text[start:end + 1])
        out = [{"name": str(t["name"]), "agent": t.get("agent", "coder")} for t in parsed if t.get("name")]
        if out:
            return out
    except Exception:  # noqa: BLE001
        pass
    return [{"name": goal, "agent": "coder"}, {"name": "Review the result", "agent": "reviewer"}]


async def _is_status(run_id: int, status: str) -> bool:
    p = await pool()
    return await p.fetchval("SELECT status FROM runs WHERE id=$1", run_id) == status


async def _set_status(run_id: int, status: str) -> None:
    p = await pool()
    await p.execute("UPDATE runs SET status=$2, updated_at=now() WHERE id=$1", run_id, status)


async def _add_tokens(run_id: int, tokens: int) -> None:
    p = await pool()
    await p.execute("UPDATE runs SET tokens_used = tokens_used + $2, updated_at=now() WHERE id=$1", run_id, tokens)


async def _over_budget(run_id: int) -> bool:
    p = await pool()
    row = await p.fetchrow("SELECT tokens_used, budget_tokens FROM runs WHERE id=$1", run_id)
    return row["tokens_used"] >= row["budget_tokens"]


async def _fail(run_id: int, reason: str) -> None:
    await _set_status(run_id, "failed")
    await events.emit(run_id, "run.failed", {"reason": reason})