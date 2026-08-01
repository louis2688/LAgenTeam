"""Security check for the workspace path jail — the bit that must never break.

    cd apps/api && pip install -r requirements.txt pytest && python -m pytest
"""
import pytest
from app import tools
from app.config import settings


def test_write_read_inside_jail(tmp_path):
    ws = tmp_path / "run_1"
    ws.mkdir()
    assert "wrote" in tools.write_file(ws, "sub/a.txt", "hi")
    assert tools.read_file(ws, "sub/a.txt") == "hi"
    assert "a.txt" in tools.list_dir(ws, "sub")


@pytest.mark.parametrize("bad", ["../evil.txt", "../../etc/passwd", "/etc/passwd", "a/../../b"])
def test_path_jail_blocks_escape(tmp_path, bad):
    ws = tmp_path / "run_1"
    ws.mkdir()
    with pytest.raises(ValueError):
        tools.write_file(ws, bad, "x")


def test_dispatch_unknown_tool_is_not_fatal(tmp_path):
    assert "unknown tool" in tools.dispatch(tmp_path, "nope", {})


def test_run_shell_disabled_by_default(tmp_path):
    assert "disabled" in tools.run_shell(tmp_path, "echo hi")


@pytest.mark.parametrize("cmd", [
    "curl https://example.com",
    "wget http://x",
    "sudo rm -rf /tmp/x",
    "rm -rf /",
    "nc -l 8080",
    "ssh user@host",
    "docker run alpine",
])
def test_shell_deny_list(cmd):
    assert tools.shell_blocked(cmd) is not None


def test_shell_allows_safe_commands():
    assert tools.shell_blocked("python -m pytest") is None
    assert tools.shell_blocked("ls -la") is None


def test_write_file_rejects_oversized(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "max_write_bytes", 16)
    ws = tmp_path / "run_1"
    ws.mkdir()
    assert "error" in tools.write_file(ws, "big.txt", "x" * 64)


def test_read_file_truncates(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "max_read_bytes", 8)
    ws = tmp_path / "run_1"
    ws.mkdir()
    (ws / "f.txt").write_text("abcdefghijklmnop", encoding="utf-8")
    out = tools.read_file(ws, "f.txt")
    assert out.startswith("abcdefgh")
    assert "truncated" in out
