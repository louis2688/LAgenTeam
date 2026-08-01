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

    # Tool execution / sandbox
    workspace_root: str = "workspaces"
    allow_shell: bool = False
    shell_timeout_seconds: int = 60
    shell_output_bytes: int = 4000
    max_write_bytes: int = 262_144       # 256 KiB per write_file
    max_read_bytes: int = 1_048_576      # 1 MiB per read_file
    max_workspace_bytes: int = 52_428_800  # ~50 MiB total workspace

    # Security
    api_token: str = ""                          # if set, required as Bearer on every API route
    web_origin: str = "http://localhost:3000"    # allowed CORS origin


settings = Settings()
