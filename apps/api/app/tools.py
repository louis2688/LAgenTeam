"""Real tool execution for agents: a path-jailed, git-backed workspace per run.

run_shell is arbitrary code execution. It is gated behind ALLOW_SHELL, cwd-jailed to
the workspace with a timeout, given a MINIMAL env (no secrets), blocked against a
deny-list of dangerous commands, and its output is redacted against the process's
real secret values as defense in depth. NOTE: this is not a true multi-tenant
sandbox. For untrusted input, run it in an isolated container with its own network.
"""
import os
import re
import subprocess
from pathlib import Path
from .config import settings

WORKSPACE_ROOT = Path(settings.workspace_root)

_SECRET_ENV = ("ANTHROPIC_API_KEY", "DATABASE_URL", "REDIS_URL", "API_TOKEN",
               "POSTGRES_PASSWORD", "REDIS_PASSWORD", "SESSION_SECRET",
               "CONSOLE_PASSWORD")
_KEY_RE = re.compile(r"sk-ant-\S+")

# Denied when seen as a command token / path-like argument (case-insensitive).
_SHELL_DENY = re.compile(
    r"(?:^|[\s;&|`$()<>])(?:"
    r"curl|wget|nc|ncat|netcat|ssh|scp|sftp|ftp|telnet|"
    r"docker|podman|kubectl|sudo|su|chmod\s+[0-7]*[67]|"
    r"mkfs|dd\s+if=|/dev/|"
    r"rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?/|"
    r":\(\)\s*\{\s*:\|:&\s*\};:"
    r")",
    re.IGNORECASE,
)


def _safe_env() -> dict:
    # Minimal env for run_shell: never inherit the app's secrets or proxy settings.
    keep = ("PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TERM")
    env = {k: os.environ[k] for k in keep if k in os.environ}
    env.setdefault("PATH", "/usr/local/bin:/usr/local/sbin:/usr/bin:/bin")
    env.setdefault("HOME", "/tmp")
    # Explicitly neutralize proxy leakage if present in parent.
    for k in list(os.environ):
        if k.upper().endswith("_PROXY") or k.upper() in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"):
            env.pop(k, None)
    return env


def _redact(s: str) -> str:
    s = _KEY_RE.sub("[redacted]", s)
    for k in _SECRET_ENV:
        v = os.environ.get(k)
        if v and len(v) >= 8:
            s = s.replace(v, "[redacted]")
    return s


def _git(ws: Path, *args: str):
    try:
        return subprocess.run(["git", "-C", str(ws), *args], capture_output=True, text=True, timeout=30)
    except (FileNotFoundError, subprocess.SubprocessError):
        return None


def _ws_path(run_id: int) -> Path:
    return (WORKSPACE_ROOT / f"run_{run_id}").resolve()


def workspace(run_id: int) -> Path:
    ws = _ws_path(run_id)
    ws.mkdir(parents=True, exist_ok=True)
    if not (ws / ".git").exists():
        if _git(ws, "init", "-q") is not None:
            _git(ws, "config", "user.email", "agents@lagenteam.local")
            _git(ws, "config", "user.name", "LAgenTeam")
            _git(ws, "commit", "-q", "--allow-empty", "-m", "baseline")
    return ws


def diff(run_id: int) -> dict:
    ws = _ws_path(run_id)
    if not (ws / ".git").exists():
        return {"files": [], "patch": ""}
    _git(ws, "add", "-A")
    patch_r = _git(ws, "diff", "--cached", "HEAD")
    stat_r = _git(ws, "diff", "--cached", "HEAD", "--numstat")
    files = []
    if stat_r and stat_r.stdout:
        for line in stat_r.stdout.splitlines():
            parts = line.split("\t")
            if len(parts) == 3:
                files.append({"path": parts[2], "additions": parts[0], "deletions": parts[1]})
    patch = (patch_r.stdout if patch_r else "")[:20000]
    return {"files": files, "patch": patch}


def commit(run_id: int, message: str) -> None:
    ws = _ws_path(run_id)
    if not (ws / ".git").exists():
        return
    _git(ws, "add", "-A")
    _git(ws, "commit", "-q", "-m", message)


def _resolve(ws: Path, rel: str) -> Path:
    target = (ws / rel).resolve()
    if target != ws and ws not in target.parents:
        raise ValueError(f"path escapes workspace: {rel!r}")
    return target


def _workspace_bytes(ws: Path) -> int:
    total = 0
    for p in ws.rglob("*"):
        if p.is_file() and ".git" not in p.parts:
            try:
                total += p.stat().st_size
            except OSError:
                pass
    return total


def read_file(ws: Path, path: str) -> str:
    raw = _resolve(ws, path).read_bytes()
    limit = settings.max_read_bytes
    truncated = len(raw) > limit
    text = raw[:limit].decode("utf-8", errors="replace")
    if truncated:
        return text + f"\n…[truncated at {limit} bytes]"
    return text


def write_file(ws: Path, path: str, content: str) -> str:
    data = content.encode("utf-8")
    if len(data) > settings.max_write_bytes:
        return f"error: write exceeds max_write_bytes ({settings.max_write_bytes})"
    used = _workspace_bytes(ws)
    t = _resolve(ws, path)
    existing = t.stat().st_size if t.exists() and t.is_file() else 0
    if used - existing + len(data) > settings.max_workspace_bytes:
        return f"error: workspace would exceed max_workspace_bytes ({settings.max_workspace_bytes})"
    t.parent.mkdir(parents=True, exist_ok=True)
    t.write_bytes(data)
    return f"wrote {path} ({len(data)} bytes)"


def list_dir(ws: Path, path: str = ".") -> str:
    t = _resolve(ws, path)
    return "\n".join(sorted(p.name + ("/" if p.is_dir() else "") for p in t.iterdir() if p.name != ".git")) or "(empty)"


def shell_blocked(command: str) -> str | None:
    """Return a reason if the command matches the deny-list, else None."""
    if _SHELL_DENY.search(command or ""):
        return "command blocked by sandbox deny-list"
    return None


def run_shell(ws: Path, command: str) -> str:
    if not settings.allow_shell:
        return "run_shell is disabled (set ALLOW_SHELL=1 to enable)"
    reason = shell_blocked(command)
    if reason:
        return f"run_shell: {reason}"
    timeout = max(1, int(settings.shell_timeout_seconds))
    out_limit = max(256, int(settings.shell_output_bytes))
    try:
        r = subprocess.run(
            command, shell=True, cwd=ws, capture_output=True, text=True,
            timeout=timeout, env=_safe_env(),
        )
    except subprocess.TimeoutExpired:
        return f"run_shell: timed out after {timeout}s"
    return _redact(f"exit={r.returncode}\n{r.stdout}{r.stderr}")[:out_limit]


# --- Anthropic tool-use wiring ---

_SCHEMAS = {
    "read_file": {"name": "read_file", "description": "Read a UTF-8 text file from the run workspace.",
        "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    "write_file": {"name": "write_file", "description": "Create or overwrite a UTF-8 text file in the run workspace.",
        "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}},
    "list_dir": {"name": "list_dir", "description": "List entries in a workspace directory (default: workspace root).",
        "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}}},
    "run_shell": {"name": "run_shell", "description": "Run a shell command inside the workspace (may be disabled).",
        "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
}
_IMPL = {"read_file": read_file, "write_file": write_file, "list_dir": list_dir, "run_shell": run_shell}


def schemas(names: list[str]) -> list[dict]:
    return [_SCHEMAS[n] for n in names if n in _SCHEMAS]


def dispatch(ws: Path, name: str, args: dict) -> str:
    fn = _IMPL.get(name)
    if fn is None:
        return f"unknown tool: {name}"
    try:
        return fn(ws, **args)
    except Exception as e:  # noqa: BLE001
        return "error: tool call failed"
