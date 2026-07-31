# LAgenTeam

A governed AI agent orchestrator. Give it a goal in plain English and it plans the
work, stops for your approval before spending any tokens, builds and tests the code,
then stops again to show you the diff before anything ships. Every run carries a hard
token budget that kills it if it overspends.

It came out of a developer post about running an "AI orchestration team": free local
models for the cheap work, Claude for real development, a human in the loop, and cost
control built in from the start rather than bolted on later.

## Two surfaces

- **Operator console** (dark) — Dashboard, Jobs board, Agents, Review Gate, Monitoring,
  Settings. Live orchestration, both approval gates, and the audit feed.
- **Client portal** (light) — where a client files a request in plain words and watches
  it get delivered.

## How a run works

```
plain-English goal
  -> Scout    (triage)   classifies it, free on local Ollama
  -> Vector   (planner)  drafts a task list with Claude
  -> [ PLAN GATE ]       you approve before any tokens are spent
  -> Forge    (coder)    writes files and runs its own tests in a git workspace
  -> Sentinel (reviewer) checks the work
  -> [ REVIEW GATE ]     you see the diff and approve before it ships
  -> done
```

A hard token budget stops any run that goes over, and does not just warn. Every step is
an append-only event, streamed live to the console.

## Stack

- **API** — FastAPI + Postgres (durable state) + Redis (queue and live event fan-out)
- **Web** — Next.js 15: the dark operator console and the light client portal
- **Models** — local Ollama for triage, Claude for plan/code/review, picked by a
  task-class lookup table (never an LLM call to decide)
- **Agents** are YAML config in `apps/api/agents/`. A new agent is a new file, no deploy.
- **Coder tools** — `read_file`, `write_file`, `list_dir`, and `run_shell` (behind
  `ALLOW_SHELL`), all jailed to a per-run git workspace so the review gate can show a
  real diff.

```
apps/
  api/   FastAPI orchestrator, engine, router, agents, providers, tools
  web/   Next.js — (app) console group + portal
```

## Run it

```bash
cp .env.example .env      # add ANTHROPIC_API_KEY; point OLLAMA_HOST at your Ollama if you have one
docker compose up --build
```

- Console: http://localhost:3000
- API docs: http://localhost:8000/docs

With no keys set it runs on a mock provider, so the whole flow works before you add
anything. Add `ANTHROPIC_API_KEY` for real Claude output.

## Add an agent

Drop a YAML file in `apps/api/agents/`:

```yaml
name: tester
task_class: test
tools: [read_file, write_file, run_shell]
system_prompt: |
  You are the Tester. Write and run tests for the prior task output.
```

## Test

```bash
cd apps/api && pip install -r requirements.txt pytest && python -m pytest
```

## Operator auth

Set `CONSOLE_PASSWORD` to require sign-in on the operator console (`/login`).
The client portal stays public. Leave it empty for open local/dev access.
`API_TOKEN` is still the service-to-service Bearer between web and API.

## Recently shipped

- Request-changes rework loop (feedback → coder → re-review)
- Console login / session cookie when `CONSOLE_PASSWORD` is set
- Parallel task waves (`wave` in the plan JSON; shared token budget)
- Projects / Workflows / Knowledge / Onboarding pages (no more stub nav)