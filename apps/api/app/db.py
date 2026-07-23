import json
import asyncpg
from .config import settings

_pool: asyncpg.Pool | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id            BIGSERIAL PRIMARY KEY,
    goal          TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'queued',
    plan          JSONB,
    budget_tokens INTEGER NOT NULL,
    tokens_used   INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
    id          BIGSERIAL PRIMARY KEY,
    run_id      BIGINT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    task_class  TEXT NOT NULL,
    agent       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    model_tier  TEXT,
    model       TEXT,
    output      TEXT,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
    id          BIGSERIAL PRIMARY KEY,
    run_id      BIGINT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    task_id     BIGINT,
    type        TEXT NOT NULL,
    data        JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_run_idx ON events(run_id, id);
"""


async def _init(con: asyncpg.Connection) -> None:
    # Decode JSONB straight to/from Python objects.
    await con.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


async def pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            settings.database_url, init=_init, min_size=1, max_size=10
        )
        async with _pool.acquire() as con:
            await con.execute(SCHEMA)
    return _pool
