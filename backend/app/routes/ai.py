from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from redis import Redis
from sqlalchemy.orm import Session

from app.core.ai_provider import AIProvider
from app.db import AiUsageLog, Job, User, ensure_default_admin_settings
from app.dependencies import get_db, get_redis
from middleware.auth import AuthenticatedUser, get_current_user
from prompts import (
    SYSTEM_PROMPT,
    build_cover_letter_prompt,
    build_field_identification_prompt,
    build_form_fill_prompt,
    build_resume_tuning_prompt,
)

router = APIRouter(prefix="/api/ai", tags=["ai"])


class FillField(BaseModel):
    xpath: str | None = None
    field_label: str | None = None
    label: str | None = None
    fieldType: str | None = None
    type: str | None = None
    availableOptions: list[str] | None = None
    options: list[str] | None = None
    isRequired: bool | None = None


class FillFormRequest(BaseModel):
    fields: list[FillField]
    jobDescription: str | None = None
    jobTitle: str | None = None
    companyName: str | None = None


class TuneResumeRequest(BaseModel):
    jobId: str | None = None
    jobDescription: str | None = None
    jobTitle: str | None = None
    companyName: str | None = None

    @model_validator(mode="after")
    def validate_input(self):
        if self.jobId:
            return self
        if self.jobDescription and self.jobTitle:
            return self
        raise ValueError("Provide either jobId or jobDescription+jobTitle")


class CoverLetterRequest(BaseModel):
    jobId: str


class IdentifyFieldsRequest(BaseModel):
    htmlSnippet: str = Field(min_length=10)


class AiFillResponseItem(BaseModel):
    xpath: str | None = None
    field_label: str | None = None
    value: str | None = None
    confidence: float | None = None


class AiUsageLimitError(HTTPException):
    pass


def _usage_key(user_id: str) -> str:
    date_key = datetime.utcnow().strftime("%Y-%m-%d")
    return f"ai_usage:{user_id}:{date_key}"


def _seconds_until_next_utc_midnight() -> int:
    now = datetime.now(timezone.utc)
    next_midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, int((next_midnight - now).total_seconds()))


def _extract_json_object(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()

    if cleaned.startswith("{") or cleaned.startswith("["):
        return cleaned

    match = re.search(r"(\{.*\}|\[.*\])", cleaned, flags=re.DOTALL)
    if match:
        return match.group(1)

    raise ValueError("AI response was not valid JSON")


def _parse_json(text: str) -> dict | list:
    payload = _extract_json_object(text)
    return json.loads(payload)


def _ensure_within_daily_limit(user_id: str, db: Session, redis_client: Redis) -> None:
    settings = ensure_default_admin_settings(db)
    current = int(redis_client.get(_usage_key(user_id)) or 0)
    if current >= int(settings.maxFreeAiFillsPerDay or 10):
        raise AiUsageLimitError(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily AI usage limit reached. Please try again tomorrow.",
        )


def _record_usage(
    *,
    user_id: str,
    action: str,
    provider: AIProvider,
    db: Session,
    redis_client: Redis,
    tokens_used: int | None,
) -> None:
    key = _usage_key(user_id)
    count = redis_client.incr(key)
    if count == 1:
        redis_client.expire(key, _seconds_until_next_utc_midnight())

    log = AiUsageLog(
        userId=user_id,
        action=action,
        provider=str(provider.log_data["provider"]),
        model=str(provider.log_data["model"]),
        tokensUsed=tokens_used,
    )
    db.add(log)
    db.commit()


def _load_user_or_404(user_id: str, db: Session) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.get("/usage")
def get_ai_usage(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis_client: Redis = Depends(get_redis),
) -> dict:
    settings = ensure_default_admin_settings(db)
    count = int(redis_client.get(_usage_key(current_user.user_id)) or 0)
    limit = int(settings.maxFreeAiFillsPerDay or 10)
    remaining = max(0, limit - count)
    return {
        "date": datetime.utcnow().strftime("%Y-%m-%d"),
        "count": count,
        "limit": limit,
        "remaining": remaining,
    }


def _iso_date(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "date"):
        return value.date().isoformat()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _normalize_confidence(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        mapping = {
            "high": 0.9,
            "medium": 0.6,
            "low": 0.3,
        }
        normalized = value.strip().lower()
        if normalized in mapping:
            return mapping[normalized]
        try:
            return float(normalized)
        except ValueError:
            return None
    return None


def _build_user_profile_blob(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "fullName": user.fullName,
        "email": user.email,
        "phone": user.phone,
        "location": user.location,
        "image": user.image,
        "workAuthorization": user.workAuthorization,
        "expectedSalary": user.expectedSalary,
        "requiresSponsorship": user.requiresSponsorship,
        "willingToRelocate": user.willingToRelocate,
        "totalYearsExperience": user.totalYearsExperience,
        "links": {
            "linkedinUrl": user.linkedinUrl,
            "githubUrl": user.githubUrl,
            "portfolioUrl": user.portfolioUrl,
            "websiteUrl": user.websiteUrl,
        },
        "personalBio": user.personalBio,
        "resumeSummary": user.resumeSummary,
        "resumeText": user.resumeText,
        "workHistory": [
            {
                "company": item.company,
                "title": item.title,
                "location": item.location,
                "startDate": _iso_date(item.startDate),
                "endDate": _iso_date(item.endDate),
                "isCurrent": item.isCurrent,
                "description": item.description,
                "technologies": item.technologies or [],
            }
            for item in user.workHistory
        ],
        "education": [
            {
                "school": item.school,
                "degree": item.degree,
                "fieldOfStudy": item.fieldOfStudy,
                "graduationYear": item.graduationYear,
                "gpa": item.gpa,
            }
            for item in user.education
        ],
        "skills": [
            {
                "name": item.name,
                "level": item.level,
            }
            for item in user.skills
        ],
    }


@router.post("/fill-form", response_model=list[AiFillResponseItem])
def fill_form(
    payload: FillFormRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis_client: Redis = Depends(get_redis),
) -> list[AiFillResponseItem]:
    _ensure_within_daily_limit(current_user.user_id, db, redis_client)

    user = _load_user_or_404(current_user.user_id, db)
    profile_blob = _build_user_profile_blob(user)
    prompt_fields = []
    for field in payload.fields:
        item = field.model_dump(exclude_none=True)
        if "label" in item and "field_label" not in item:
            item["field_label"] = item["label"]
        if "type" in item and "fieldType" not in item:
            item["fieldType"] = item["type"]
        if "options" in item and "availableOptions" not in item:
            item["availableOptions"] = item["options"]
        prompt_fields.append(item)

    system_prompt = SYSTEM_PROMPT
    user_prompt = build_form_fill_prompt(
        fields=prompt_fields,
        user_profile=profile_blob,
        job_description=payload.jobDescription,
        job_title=payload.jobTitle,
        company_name=payload.companyName,
    )

    provider = AIProvider(db, redis_client)
    response = provider.complete(system_prompt=system_prompt, user_prompt=user_prompt)

    try:
        parsed = _parse_json(response.text)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI returned invalid JSON: {exc}") from exc

    items = parsed.get("items", []) if isinstance(parsed, dict) else parsed
    if not isinstance(items, list):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI response format invalid")

    _record_usage(
        user_id=current_user.user_id,
        action="FORM_FILL",
        provider=provider,
        db=db,
        redis_client=redis_client,
        tokens_used=response.tokens_used,
    )

    normalized_items: list[AiFillResponseItem] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        payload_item = dict(item)
        payload_item["confidence"] = _normalize_confidence(payload_item.get("confidence"))
        normalized_items.append(AiFillResponseItem(**payload_item))

    return normalized_items


@router.post("/tune-resume")
def tune_resume(
    payload: TuneResumeRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis_client: Redis = Depends(get_redis),
) -> dict:
    _ensure_within_daily_limit(current_user.user_id, db, redis_client)

    user = _load_user_or_404(current_user.user_id, db)
    if not user.resumeText:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Resume text is required. Upload resume first.")

    job_description = payload.jobDescription
    job_title = payload.jobTitle
    company_name = payload.companyName

    if payload.jobId:
        job = db.query(Job).filter(Job.id == payload.jobId).first()
        if not job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        job_description = job.description
        job_title = job.title
        company_name = job.company

    system_prompt = SYSTEM_PROMPT
    user_prompt = build_resume_tuning_prompt(
        resume_text=user.resumeText,
        job_description=job_description,
        job_title=job_title,
        company_name=company_name,
    )

    provider = AIProvider(db, redis_client)
    response = provider.complete(system_prompt=system_prompt, user_prompt=user_prompt)

    try:
        parsed = _parse_json(response.text)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI returned invalid JSON: {exc}") from exc

    _record_usage(
        user_id=current_user.user_id,
        action="RESUME_TUNE",
        provider=provider,
        db=db,
        redis_client=redis_client,
        tokens_used=response.tokens_used,
    )
    return parsed


@router.post("/cover-letter")
def create_cover_letter(
    payload: CoverLetterRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis_client: Redis = Depends(get_redis),
) -> dict:
    _ensure_within_daily_limit(current_user.user_id, db, redis_client)

    user = _load_user_or_404(current_user.user_id, db)
    job = db.query(Job).filter(Job.id == payload.jobId).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    profile_blob = _build_user_profile_blob(user)
    system_prompt = SYSTEM_PROMPT
    user_prompt = build_cover_letter_prompt(
        user_profile=profile_blob,
        job_description=job.description,
        job_title=job.title,
        company_name=job.company,
    )

    provider = AIProvider(db, redis_client)
    response = provider.complete(system_prompt=system_prompt, user_prompt=user_prompt)

    cover_letter = ""
    try:
        parsed = _parse_json(response.text)
        if isinstance(parsed, dict):
            cover_letter = (
                str(
                    parsed.get("coverLetter")
                    or parsed.get("cover_letter")
                    or parsed.get("text")
                    or parsed.get("content")
                    or ""
                )
            )
        elif isinstance(parsed, str):
            cover_letter = parsed
    except Exception:
        cover_letter = response.text.strip()

    _record_usage(
        user_id=current_user.user_id,
        action="COVER_LETTER",
        provider=provider,
        db=db,
        redis_client=redis_client,
        tokens_used=response.tokens_used,
    )

    return {"coverLetter": cover_letter.strip()}


@router.post("/identify-fields")
def identify_fields(
    payload: IdentifyFieldsRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis_client: Redis = Depends(get_redis),
) -> dict:
    _ensure_within_daily_limit(current_user.user_id, db, redis_client)

    system_prompt = SYSTEM_PROMPT
    user_prompt = build_field_identification_prompt(payload.htmlSnippet)

    provider = AIProvider(db, redis_client)
    response = provider.complete(system_prompt=system_prompt, user_prompt=user_prompt)

    try:
        parsed = _parse_json(response.text)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI returned invalid JSON: {exc}") from exc

    _record_usage(
        user_id=current_user.user_id,
        action="IDENTIFY_FIELDS",
        provider=provider,
        db=db,
        redis_client=redis_client,
        tokens_used=response.tokens_used,
    )

    if isinstance(parsed, dict) and isinstance(parsed.get("fields"), list):
        return {"fields": parsed["fields"]}
    if isinstance(parsed, list):
        return {"fields": parsed}
    return {"fields": []}
