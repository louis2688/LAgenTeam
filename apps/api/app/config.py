from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://lagenteam:lagenteam@localhost:5432/lagenteam"
    redis_url: str = "redis://localhost:6379/0"

    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-5"

    ollama_host: str = ""
    ollama_model: str = "qwen3:1.7b"

    default_budget_tokens: int = 50000
    max_budget_tokens: int = 2_000_000
    agents_dir: str = "agents"

    # Tool execution
    workspace_root: str = "workspaces"
    allow_shell: bool = False

    # Security
    api_token: str = ""                          # if set, required as Bearer on every API route
    web_origin: str = "http://localhost:3000"    # allowed CORS origin


settings = Settings()