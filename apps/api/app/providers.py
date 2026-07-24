from dataclasses import dataclass
import httpx
from .config import settings


@dataclass
class Completion:
    text: str
    tokens: int
    model: str


async def _claude(system: str, prompt: str) -> Completion:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=120)
    msg = await client.messages.create(
        model=settings.claude_model, max_tokens=2048, system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in msg.content if b.type == "text")
    tokens = msg.usage.input_tokens + msg.usage.output_tokens
    return Completion(text=text, tokens=tokens, model=settings.claude_model)


async def _ollama(system: str, prompt: str) -> Completion:
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=5.0)) as http:
        r = await http.post(
            f"{settings.ollama_host}/api/chat",
            json={"model": settings.ollama_model, "stream": False, "messages": [
                {"role": "system", "content": system}, {"role": "user", "content": prompt}]},
        )
        r.raise_for_status()
        body = r.json()
    text = body.get("message", {}).get("content", "")
    tokens = body.get("prompt_eval_count", 0) + body.get("eval_count", 0)
    if not tokens:
        tokens = (len(system) + len(prompt) + len(text)) // 4
    return Completion(text=text, tokens=tokens, model=settings.ollama_model)


def _mock(system: str, prompt: str, tier: str) -> Completion:
    if tier == "cloud" and "Planner" in system:
        text = '[{"name": "Implement the goal", "agent": "coder"}, ' \
               '{"name": "Review the result", "agent": "reviewer"}]'
    else:
        text = f"[mock:{tier}] " + prompt.strip()[:200]
    return Completion(text=text, tokens=(len(system) + len(prompt)) // 4 or 1, model=f"mock-{tier}")


async def complete(tier: str, system: str, prompt: str) -> Completion:
    if tier == "cloud" and settings.anthropic_api_key:
        return await _claude(system, prompt)
    if tier == "local" and settings.ollama_host:
        return await _ollama(system, prompt)
    return _mock(system, prompt, tier)


async def complete_with_tools(system, prompt, tool_names, ws, on_tool, max_iters=8, budget_remaining=None):
    """Claude tool-use loop. Stops at max_iters or when cumulative tokens would exceed
    the remaining run budget (so one task cannot blow the whole budget inside the loop)."""
    from anthropic import AsyncAnthropic
    from . import tools as tools_mod

    client = AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=120)
    schemas = tools_mod.schemas(tool_names)
    messages = [{"role": "user", "content": prompt}]
    total, final_text = 0, ""

    for _ in range(max_iters):
        if budget_remaining is not None and total >= budget_remaining:
            final_text += "\n[stopped: run token budget reached]"
            break
        msg = await client.messages.create(
            model=settings.claude_model, max_tokens=2048, system=system, tools=schemas, messages=messages)
        total += msg.usage.input_tokens + msg.usage.output_tokens
        messages.append({"role": "assistant", "content": msg.content})

        results = []
        for block in msg.content:
            if block.type == "text":
                final_text += block.text
            elif block.type == "tool_use":
                out = tools_mod.dispatch(ws, block.name, dict(block.input))
                await on_tool(block.name, block.input, out)
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": out})
        if not results:
            break
        messages.append({"role": "user", "content": results})

    return Completion(text=final_text or "(done)", tokens=total, model=settings.claude_model)