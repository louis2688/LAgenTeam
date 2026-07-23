"""Runnable check for the two bits of non-trivial pure logic: plan parsing + routing.

    cd apps/api && pip install -r requirements.txt pytest && python -m pytest
"""
from app.engine import _parse_plan
from app.router import tier_for


def test_parse_plan_json():
    plan = _parse_plan('[{"name":"a","agent":"coder"},{"name":"b","agent":"reviewer"}]', "goal")
    assert [t["agent"] for t in plan] == ["coder", "reviewer"]


def test_parse_plan_with_surrounding_prose():
    plan = _parse_plan('Here is the plan:\n[{"name":"x","agent":"coder"}]\nDone.', "goal")
    assert plan == [{"name": "x", "agent": "coder"}]


def test_parse_plan_fallback_on_garbage():
    plan = _parse_plan("not json at all", "build a thing")
    assert plan[0] == {"name": "build a thing", "agent": "coder"}
    assert plan[-1]["agent"] == "reviewer"


def test_router_tiers():
    assert tier_for("summarize") == "local"
    assert tier_for("code") == "cloud"
    assert tier_for("unknown") == "cloud"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("ok")
