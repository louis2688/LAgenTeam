from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://lagenteam:lagenteam@localhost:5432/lagenteam"
    redis_url: str = "redis://localhost:6379/0"

    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-5"

    ollama_host: str = ""
    ollama_model: str = "qwen3"

    default_budget_tokens: int = 50000
    agents_dir: str = "agents"

    # Tool execution
    workspace_root: str = "workspaces"
    allow_shell: bool = False


settings = Settings()
