"""Security check for the workspace path jail — the bit that must never break.

    cd apps/api && pip install -r requirements.txt pytest && python -m pytest
"""
import pytest
from app import tools


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
