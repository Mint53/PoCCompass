"""LLM access (AI Foundry / Azure OpenAI). The only module that imports `openai`.

Auth: Entra ID only (managed identity on Azure, az login locally). The Foundry account has local (key) auth disabled,
so AZURE_OPENAI_API_KEY is deliberately ignored — many PCs here have it set globally for other tools.
Output: JSON forced by Structured Outputs (json_schema, strict).
"""

from __future__ import annotations

import json
import logging
import time
from functools import lru_cache
from typing import Any, Protocol

from app.config.settings import get_settings
from app.core.credentials import get_credential
from app.core.errors import AiFailed, AiNotConfigured

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 3


class LlmClient(Protocol):
    model_name: str

    def complete_json(self, *, system: str, user: str, schema_name: str, schema: dict[str, Any]) -> dict[str, Any]: ...


class AzureOpenAiClient:
    def __init__(self) -> None:
        from openai import AzureOpenAI

        s = get_settings()
        if not s.ai_configured:
            raise AiNotConfigured()
        kwargs: dict[str, Any] = {
            "azure_endpoint": s.openai_endpoint,
            "api_version": s.openai_api_version,
            "timeout": s.openai_timeout_seconds,
            "max_retries": 0,  # we retry ourselves to log attempts
        }
        from azure.identity import get_bearer_token_provider

        kwargs["azure_ad_token_provider"] = get_bearer_token_provider(
            get_credential(), "https://cognitiveservices.azure.com/.default"
        )
        self._client = AzureOpenAI(**kwargs)
        self.model_name = s.openai_deployment
        self._effort = s.openai_reasoning_effort

    def complete_json(self, *, system: str, user: str, schema_name: str, schema: dict[str, Any]) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                started = time.monotonic()
                resp = self._client.chat.completions.create(
                    model=self.model_name,
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                    response_format={
                        "type": "json_schema",
                        "json_schema": {"name": schema_name, "strict": True, "schema": schema},
                    },
                    reasoning_effort=self._effort,
                )
                content = resp.choices[0].message.content or ""
                usage = getattr(resp, "usage", None)
                logger.info(
                    "llm call ok schema=%s attempt=%d secs=%.1f prompt_tokens=%s completion_tokens=%s",
                    schema_name, attempt, time.monotonic() - started,
                    getattr(usage, "prompt_tokens", None), getattr(usage, "completion_tokens", None),
                )
                return json.loads(content)
            except Exception as e:  # noqa: BLE001 - SDK raises many types; all are retryable here
                last_error = e
                logger.warning("llm call failed schema=%s attempt=%d error=%s", schema_name, attempt, type(e).__name__)
                if attempt < MAX_ATTEMPTS:
                    time.sleep(2 ** attempt)
        logger.error("llm call gave up schema=%s error=%r", schema_name, last_error)
        raise AiFailed()


@lru_cache(maxsize=1)
def get_llm() -> LlmClient:
    return AzureOpenAiClient()
