# Route by task CLASS, not by model preference — a lookup table, never an LLM call
# (don't spend tokens deciding how to spend tokens).
LOCAL = {"classify", "summarize", "extract", "route"}
CLOUD = {"plan", "code", "review", "debug", "test", "docs"}


def tier_for(task_class: str) -> str:
    if task_class in LOCAL:
        return "local"
    return "cloud"  # default anything unknown to the capable tier
