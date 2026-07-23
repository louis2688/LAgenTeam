"""Real tool execution for agents: a path-jailed, git-backed workspace per run.

fs tools are always available. run_shell is arbitrary code execution, so it is
gated behind ALLOW_SHELL and always cwd-jailed to the workspace with a timeout.
Each workspace is a git repo with an empty baseline commit, so the review gate
can show a real diff of everything the coder produced.
"""
import subprocess
from pathlib import Path
from .config import settings

WORKSPACE_ROOT = Path(settings.workspace_root)


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
    """Unified diff of everything written since the baseline commit."""
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
    # Path jail: the resolved target must be the workspace or live under it.
    target = (ws / rel).resolve()
    if target != ws and ws not in target.parents:
        raise ValueError(f"path escapes workspace: {rel!r}")
    return target


def read_file(ws: Path, path: str) -> str:
    return _resolve(ws, path).read_text(encoding="utf-8")


def write_file(ws: Path, path: str, content: str) -> str:
    t = _resolve(ws, path)
    t.parent.mkdir(parents=True, exist_ok=True)
    t.write_text(content, encoding="utf-8")
    return f"wrote {path} ({len(content)} bytes)"


def list_dir(ws: Path, path: str = ".") -> str:
    t = _resolve(ws, path)
    return "\n".join(sorted(p.name + ("/" if p.is_dir() else "") for p in t.iterdir() if p.name != ".git")) or "(empty)"


def run_shell(ws: Path, command: str) -> str:
    if not settings.allow_shell:
        return "run_shell is disabled (set ALLOW_SHELL=1 to enable)"
    try:
        r = subprocess.run(command, shell=True, cwd=ws, capture_output=True, text=True, timeout=60)
    except subprocess.TimeoutExpired:
        return "run_shell: timed out after 60s"
    return f"exit={r.returncode}\n{r.stdout}{r.stderr}"[:4000]


# --- Anthropic tool-use wiring ---

_SCHEMAS = {
    "read_file": {
        "name": "read_file",
        "description": "Read a UTF-8 text file from the run workspace.",
        "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
    },
    "write_file": {
        "name": "write_file",
        "description": "Create or overwrite a UTF-8 text file in the run workspace.",
        "input_schema": {"type": "object", "properties": {
            "path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]},
    },
    "list_dir": {
        "name": "list_dir",
        "description": "List entries in a workspace directory (default: workspace root).",
        "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}},
    },
    "run_shell": {
        "name": "run_shell",
        "description": "Run a shell command inside the workspace (may be disabled).",
        "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]},
    },
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
    except Exception as e:  # noqa: BLE001 - tool errors return to the model as text, not crashes
        return f"error: {e}"