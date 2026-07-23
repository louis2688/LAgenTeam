from functools import lru_cache
from pathlib import Path
import yaml
from .config import settings


@lru_cache(maxsize=1)
def registry() -> dict[str, dict]:
    """Agents are config, not classes. New agent = new YAML file, no deploy."""
    agents: dict[str, dict] = {}
    for f in sorted(Path(settings.agents_dir).glob("*.yaml")):
        cfg = yaml.safe_load(f.read_text(encoding="utf-8"))
        agents[cfg["name"]] = cfg
    return agents


def get(name: str) -> dict:
    reg = registry()
    if name not in reg:
        # Unknown agent from the planner -> fall back to the coder role.
        return reg["coder"]
    return reg[name]
