import json
import redis.asyncio as aioredis
from .config import settings
from .db import pool

_redis: aioredis.Redis | None = None


def redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def channel(run_id: int) -> str:
    return f"run:{run_id}:events"


async def emit(
    run_id: int, type: str, data: dict | None = None, task_id: int | None = None
) -> dict:
    data = data or {}
    p = await pool()
    row = await p.fetchrow(
        "INSERT INTO events(run_id, task_id, type, data) VALUES($1,$2,$3,$4) "
        "RETURNING id, created_at",
        run_id, task_id, type, data,
    )
    event = {
        "id": row["id"],
        "run_id": run_id,
        "task_id": task_id,
        "type": type,
        "data": data,
        "created_at": row["created_at"].isoformat(),
    }
    await redis().publish(channel(run_id), json.dumps(event))
    return event
