from __future__ import annotations

import json
from dataclasses import dataclass

import google.generativeai as genai
from openai import OpenAI
from redis import Redis
from sqlalchemy.orm import Session

from app.core.encryption import decrypt
from app.db import AdminSettings, ensure_default_admin_settings

SETTINGS_CACHE_KEY = "admin_settings_cache"
SETTINGS_CACHE_TTL_SECONDS = 60


@dataclass
class ProviderResult:
    text: str
    tokens_used: int | None


class AIProvider:
    def __init__(self, db: Session, redis_client: Redis):
        self.db = db
        self.redis_client = redis_client
        settings = self._fetch_settings()

        self.provider = (settings.activeAiProvider or "OPENAI").upper()
        self.model = settings.openaiModel if self.provider == "OPENAI" else settings.geminiModel
        self.log_data = {
            "provider": self.provider,
            "model": self.model,
            "tokensUsed": None,
        }

        if self.provider == "OPENAI":
            if not settings.openaiApiKey:
                raise RuntimeError("OpenAI provider selected but openaiApiKey is empty")
            api_key = decrypt(settings.openaiApiKey)
            self.client = OpenAI(api_key=api_key)
        elif self.provider == "GEMINI":
            if not settings.geminiApiKey:
                raise RuntimeError("Gemini provider selected but geminiApiKey is empty")
            api_key = decrypt(settings.geminiApiKey)
            genai.configure(api_key=api_key)
            self.client = genai.GenerativeModel(settings.geminiModel)
        else:
            raise RuntimeError(f"Unsupported AI provider '{self.provider}'")

    def _fetch_settings(self) -> AdminSettings:
        cached = self.redis_client.get(SETTINGS_CACHE_KEY)
        if cached:
            raw = json.loads(cached)
            return AdminSettings(**raw)

        settings = ensure_default_admin_settings(self.db)
        payload = {
            "id": settings.id,
            "activeAiProvider": settings.activeAiProvider,
            "openaiApiKey": settings.openaiApiKey,
            "openaiModel": settings.openaiModel,
            "geminiApiKey": settings.geminiApiKey,
            "geminiModel": settings.geminiModel,
            "maxFreeAiFillsPerDay": settings.maxFreeAiFillsPerDay,
            "scraperEnabled": settings.scraperEnabled,
            "scraperIntervalHours": settings.scraperIntervalHours,
            "allowRegistration": settings.allowRegistration,
            "maintenanceMode": settings.maintenanceMode,
            "siteName": settings.siteName,
            "siteTagline": settings.siteTagline,
        }
        self.redis_client.setex(SETTINGS_CACHE_KEY, SETTINGS_CACHE_TTL_SECONDS, json.dumps(payload))
        return settings

    def complete(self, system_prompt: str, user_prompt: str) -> ProviderResult:
        if self.provider == "OPENAI":
            response = self.client.chat.completions.create(
                model=self.model,
                temperature=0.3,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            total_tokens = response.usage.total_tokens if response.usage else None
            self.log_data["tokensUsed"] = total_tokens
            return ProviderResult(
                text=(response.choices[0].message.content or "{}"),
                tokens_used=total_tokens,
            )

        full_prompt = f"{system_prompt}\n\n{user_prompt}\n\nRespond ONLY with valid JSON."
        response = self.client.generate_content(full_prompt)
        return ProviderResult(text=(response.text or "{}"), tokens_used=None)



def flush_admin_settings_cache(redis_client: Redis) -> None:
    redis_client.delete(SETTINGS_CACHE_KEY)
