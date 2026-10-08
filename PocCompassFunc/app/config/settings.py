"""Environment-driven settings. The only place that reads os.environ (besides function_app.py timer guard)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache


def _csv(value: str) -> list[str]:
    return [v.strip().lower() for v in value.split(",") if v.strip()]


@dataclass(frozen=True)
class Settings:
    storage_backend: str = "local"  # local | cosmos
    local_data_dir: str = ".localdata"
    cosmos_endpoint: str = ""
    cosmos_database: str = "poc-compass"

    openai_endpoint: str = ""
    openai_deployment: str = "gpt-5.4"
    openai_api_version: str = "2025-04-01-preview"
    openai_reasoning_effort: str = "low"
    openai_timeout_seconds: float = 120.0

    dev_user_email: str = ""
    dev_user_name: str = ""
    admin_emails: list[str] = field(default_factory=list)
    running_on_azure: bool = False

    @property
    def ai_configured(self) -> bool:
        return bool(self.openai_endpoint and self.openai_deployment)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    env = os.environ.get
    return Settings(
        storage_backend=env("STORAGE_BACKEND", "local").strip().lower(),
        local_data_dir=env("LOCAL_DATA_DIR", ".localdata"),
        cosmos_endpoint=env("COSMOS_ENDPOINT", ""),
        cosmos_database=env("COSMOS_DATABASE_NAME", "poc-compass"),
        openai_endpoint=env("AZURE_OPENAI_ENDPOINT", ""),
        openai_deployment=env("AZURE_OPENAI_DEPLOYMENT", "gpt-5.4"),
        openai_api_version=env("AZURE_OPENAI_API_VERSION", "2025-04-01-preview"),
        openai_reasoning_effort=env("AZURE_OPENAI_REASONING_EFFORT", "low"),
        openai_timeout_seconds=float(env("AZURE_OPENAI_TIMEOUT_SECONDS", "120")),
        dev_user_email=env("DEV_USER_EMAIL", "").strip().lower(),
        dev_user_name=env("DEV_USER_NAME", ""),
        admin_emails=_csv(env("ADMIN_EMAILS", "")),
        running_on_azure=bool(env("WEBSITE_INSTANCE_ID", "").strip()),
    )
