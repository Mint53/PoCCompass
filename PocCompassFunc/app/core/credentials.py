"""Entra ID credential for Cosmos DB and AI Foundry (both have key auth disabled).

DefaultAzureCredential walks a chain of credential types and, on a developer PC, spent 45-60 s on the
first token (and once hung a request). We pick the one credential we actually use:
- Azure (WEBSITE_INSTANCE_ID set): the Function App's system-assigned managed identity
- local: the developer's `az login`
"""

from __future__ import annotations

from functools import lru_cache

from azure.core.credentials import TokenCredential

from app.config.settings import get_settings


@lru_cache(maxsize=1)
def get_credential() -> TokenCredential:
    if get_settings().running_on_azure:
        from azure.identity import ManagedIdentityCredential

        return ManagedIdentityCredential()
    from azure.identity import AzureCliCredential

    return AzureCliCredential(process_timeout=30)
