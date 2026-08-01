import json
import asyncpg
from .config import settings

_pool: asyncpg.Pool | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runs (
    id            BIGSERIAL PRIMARY KEY,
    goal          TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'queued',
    plan          JSONB,
    budget_tokens INTEGER NOT NULL,
    tokens_used   INTEGER NOT NULL DEFAULT 0,
    review_note   TEXT,
    project_id    BIGINT REFERENCES projects(id),
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
    wave        INTEGER,
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

# Idempotent upgrades for databases created before these columns existed.
# Index on project_id must run AFTER the column is added.
MIGRATIONS = """
ALTER TABLE runs ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS wave INTEGER;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id);
CREATE INDEX IF NOT EXISTS runs_project_idx ON runs(project_id, id DESC);
"""


async def _seed_default_project(con: asyncpg.Connection) -> None:
    """Ensure a Default workspace exists and orphan runs are attached to it."""
    pid = await con.fetchval("SELECT id FROM projects ORDER BY id LIMIT 1")
    if pid is None:
        pid = await con.fetchval(
            "INSERT INTO projects(name) VALUES('Default workspace') RETURNING id"
        )
    await con.execute(
        "UPDATE runs SET project_id=$1 WHERE project_id IS NULL", pid
    )


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
            # projects table must exist before runs.project_id FK migration
            await con.execute(
                "CREATE TABLE IF NOT EXISTS projects ("
                "id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, "
                "created_at TIMESTAMPTZ NOT NULL DEFAULT now())"
            )
            await con.execute(SCHEMA)
            await con.execute(MIGRATIONS)
            await _seed_default_project(con)
    return _pool


async def default_project_id() -> int:
    p = await pool()
    pid = await p.fetchval("SELECT id FROM projects ORDER BY id LIMIT 1")
    if pid is None:
        pid = await p.fetchval(
            "INSERT INTO projects(name) VALUES('Default workspace') RETURNING id"
        )
    return pid
