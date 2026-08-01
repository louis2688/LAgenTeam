"""Runnable check for the two bits of non-trivial pure logic: plan parsing + routing.

    cd apps/api && pip install -r requirements.txt pytest && python -m pytest
"""
from app.engine import _parse_plan, group_by_wave
from app.router import tier_for


def test_parse_plan_json():
    plan = _parse_plan('[{"name":"a","agent":"coder"},{"name":"b","agent":"reviewer"}]', "goal")
    assert [t["agent"] for t in plan] == ["coder", "reviewer"]
    assert [t["wave"] for t in plan] == [0, 1]


def test_parse_plan_with_waves():
    plan = _parse_plan(
        '[{"name":"code","agent":"coder","wave":0},'
        '{"name":"docs","agent":"docs","wave":1},'
        '{"name":"test","agent":"tester","wave":1}]',
        "goal",
    )
    assert [t["wave"] for t in plan] == [0, 1, 1]


def test_parse_plan_with_surrounding_prose():
    plan = _parse_plan('Here is the plan:\n[{"name":"x","agent":"coder"}]\nDone.', "goal")
    assert plan == [{"name": "x", "agent": "coder", "wave": 0}]


def test_parse_plan_fallback_on_garbage():
    plan = _parse_plan("not json at all", "build a thing")
    assert plan[0] == {"name": "build a thing", "agent": "coder", "wave": 0}
    assert plan[-1]["agent"] == "reviewer"


def test_group_by_wave_parallel():
    tasks = [
        {"name": "a", "wave": 0, "position": 0},
        {"name": "b", "wave": 1, "position": 1},
        {"name": "c", "wave": 1, "position": 2},
    ]
    waves = group_by_wave(tasks)
    assert len(waves) == 2
    assert [t["name"] for t in waves[0]] == ["a"]
    assert [t["name"] for t in waves[1]] == ["b", "c"]


def test_group_by_wave_defaults_to_position():
    tasks = [{"name": "a", "position": 0}, {"name": "b", "position": 1}]
    waves = group_by_wave(tasks)
    assert len(waves) == 2


def test_router_tiers():
    assert tier_for("summarize") == "local"
    assert tier_for("code") == "cloud"
    assert tier_for("unknown") == "cloud"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("ok")
