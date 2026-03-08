from __future__ import annotations

import importlib
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from redis import Redis
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.ai_provider import AIProvider, flush_admin_settings_cache
from app.core.encryption import decrypt, encrypt
from app.db import (
    AiUsageLog,
    Application,
    Job,
    ScraperLog,
    User,
    ensure_default_admin_settings,
)
from app.dependencies import get_db, get_redis
from middleware.auth import AuthenticatedUser, get_admin_user

router = APIRouter(prefix="/api/admin", tags=["admin"])


class SettingsUpdateRequest(BaseModel):
    activeAiProvider: str | None = None
    openaiApiKey: str | None = None
    openaiModel: str | None = None
    geminiApiKey: str | None = None
    geminiModel: str | None = None
    maxFreeAiFillsPerDay: int | None = None
    scraperEnabled: bool | None = None
    scraperIntervalHours: int | None = None
    allowRegistration: bool | None = None
    maintenanceMode: bool | None = None
    siteName: str | None = None
    siteTagline: str | None = None


class SwitchAiRequest(BaseModel):
    provider: str


class BanUserRequest(BaseModel):
    isBanned: bool


class AdminJobUpdateRequest(BaseModel):
    isActive: bool | None = None
    isSponsorsH1B: bool | None = None


class AdminJobCreateRequest(BaseModel):
    title: str
    company: str
    location: str | None = None
    description: str
    requirements: str | None = None
    salary: str | None = None
    jobType: str = "FULL_TIME"
    workMode: str = "ONSITE"
    sourceUrl: str
    atsType: str = "OTHER"
    isActive: bool = True
    isSponsorsH1B: bool = False
    postedAt: datetime | None = None
    expiresAt: datetime | None = None


class ScraperConfigUpdateRequest(BaseModel):
    scraperEnabled: bool | None = None
    scraperIntervalHours: int | None = None


def _mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    suffix = value[-4:] if len(value) > 4 else value
    return f"***{suffix}"


def _mask_encrypted_secret(encrypted_value: str | None) -> str | None:
    if not encrypted_value:
        return None
    try:
        return _mask_secret(decrypt(encrypted_value))
    except Exception:  # noqa: BLE001
        # Fall back to masking raw data if decryption fails.
        return _mask_secret(encrypted_value)


def _upload_dir_size_mb(upload_dir: Path) -> float:
    if not upload_dir.exists() or not upload_dir.is_dir():
        return 0.0
    total_bytes = 0
    for path in upload_dir.rglob("*"):
        if path.is_file():
            total_bytes += path.stat().st_size
    return round(total_bytes / (1024 * 1024), 2)


def _provider_display_name(provider: str, settings) -> str:
    normalized = (provider or "").upper()
    if normalized == "GEMINI":
        model = (settings.geminiModel or "gemini-1.5-pro").lower()
        if model == "gemini-1.5-pro":
            return "Gemini 1.5 Pro"
        if model == "gemini-1.5-flash":
            return "Gemini 1.5 Flash"
        if model == "gemini-1.0-pro":
            return "Gemini 1.0 Pro"
        return settings.geminiModel or "Gemini"

    model = (settings.openaiModel or "gpt-4o").lower()
    if model == "gpt-4o":
        return "GPT-4o"
    if model == "gpt-4-turbo":
        return "GPT-4 Turbo"
    if model == "gpt-3.5-turbo":
        return "GPT-3.5 Turbo"
    return settings.openaiModel or "OpenAI"


@router.get("/settings/public")
def get_public_settings(db: Session = Depends(get_db)) -> dict:
    settings = ensure_default_admin_settings(db)
    active_provider = settings.activeAiProvider or "OPENAI"
    return {
        "siteName": settings.siteName,
        "siteTagline": settings.siteTagline,
        "maintenanceMode": settings.maintenanceMode,
        "allowRegistration": settings.allowRegistration,
        "activeAiProvider": active_provider,
        "activeAiProviderName": _provider_display_name(active_provider, settings),
        "maxFreeAiFillsPerDay": int(settings.maxFreeAiFillsPerDay or 10),
        "updatedAt": settings.updatedAt,
    }


@router.get("/settings")
def get_admin_settings(
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> dict:
    settings = ensure_default_admin_settings(db)
    return {
        "id": settings.id,
        "activeAiProvider": settings.activeAiProvider,
        "openaiApiKey": _mask_encrypted_secret(settings.openaiApiKey),
        "openaiModel": settings.openaiModel,
        "geminiApiKey": _mask_encrypted_secret(settings.geminiApiKey),
        "geminiModel": settings.geminiModel,
        "maxFreeAiFillsPerDay": settings.maxFreeAiFillsPerDay,
        "scraperEnabled": settings.scraperEnabled,
        "scraperIntervalHours": settings.scraperIntervalHours,
        "allowRegistration": settings.allowRegistration,
        "maintenanceMode": settings.maintenanceMode,
        "siteName": settings.siteName,
        "siteTagline": settings.siteTagline,
        "updatedAt": settings.updatedAt,
    }


@router.put("/settings")
def update_admin_settings(
    payload: SettingsUpdateRequest,
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
    redis_client: Redis = Depends(get_redis),
) -> dict:
    settings = ensure_default_admin_settings(db)
    updates = payload.model_dump(exclude_unset=True)

    for key, value in updates.items():
        if key in {"openaiApiKey", "geminiApiKey"} and value:
            setattr(settings, key, encrypt(value))
            continue
        if key == "activeAiProvider" and value:
            setattr(settings, key, value.upper())
            continue
        setattr(settings, key, value)

    db.commit()
    db.refresh(settings)
    flush_admin_settings_cache(redis_client)

    return {
        "updated": True,
        "activeAiProvider": settings.activeAiProvider,
        "updatedAt": settings.updatedAt,
    }


@router.post("/settings/switch-ai")
def switch_ai_provider(
    payload: SwitchAiRequest,
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
    redis_client: Redis = Depends(get_redis),
) -> dict:
    provider = payload.provider.upper().strip()
    if provider not in {"OPENAI", "GEMINI"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="provider must be OPENAI or GEMINI")

    settings = ensure_default_admin_settings(db)
    settings.activeAiProvider = provider
    db.commit()

    flush_admin_settings_cache(redis_client)
    return {"activeAiProvider": provider}


@router.put("/switch-ai")
def switch_ai_provider_put(
    payload: SwitchAiRequest,
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
    redis_client: Redis = Depends(get_redis),
) -> dict:
    provider = payload.provider.upper().strip()
    if provider not in {"OPENAI", "GEMINI"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="provider must be OPENAI or GEMINI")

    settings = ensure_default_admin_settings(db)
    settings.activeAiProvider = provider
    db.commit()

    flush_admin_settings_cache(redis_client)
    return {"activeAiProvider": provider}


@router.post("/settings/test-ai")
def test_current_ai(
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
    redis_client: Redis = Depends(get_redis),
) -> dict:
    started = time.perf_counter()
    provider = AIProvider(db, redis_client)
    response = provider.complete(
        system_prompt='Return JSON in format {"response":"WORKING"}.',
        user_prompt="Reply with: WORKING",
    )
    latency_ms = int((time.perf_counter() - started) * 1000)

    return {
        "provider": provider.log_data["provider"],
        "model": provider.log_data["model"],
        "response": response.text,
        "latencyMs": latency_ms,
    }


@router.get("/users")
def list_users(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> dict:
    total = db.query(func.count(User.id)).scalar() or 0
    users = db.query(User).order_by(User.createdAt.desc()).offset((page - 1) * limit).limit(limit).all()

    user_ids = [user.id for user in users]
    app_counts = {
        row[0]: int(row[1])
        for row in db.query(Application.userId, func.count(Application.id))
        .filter(Application.userId.in_(user_ids) if user_ids else False)
        .group_by(Application.userId)
        .all()
    }
    ai_counts = {
        row[0]: int(row[1])
        for row in db.query(AiUsageLog.userId, func.count(AiUsageLog.id))
        .filter(AiUsageLog.userId.in_(user_ids) if user_ids else False)
        .group_by(AiUsageLog.userId)
        .all()
    }

    return {
        "total": int(total),
        "page": page,
        "limit": limit,
        "users": [
            {
                "id": str(user.id),
                "email": user.email,
                "fullName": user.fullName,
                "isAdmin": user.isAdmin,
                "isBanned": user.isBanned,
                "createdAt": user.createdAt,
                "updatedAt": user.updatedAt,
                "stats": {
                    "applications": app_counts.get(user.id, 0),
                    "aiCalls": ai_counts.get(user.id, 0),
                },
            }
            for user in users
        ],
    }


@router.get("/users/{user_id}")
def get_user_detail(
    user_id: str,
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> dict:
    user = (
        db.query(User)
        .options(
            joinedload(User.workHistory),
            joinedload(User.education),
            joinedload(User.skills),
            joinedload(User.applications),
        )
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {
        "id": str(user.id),
        "email": user.email,
        "googleId": user.googleId,
        "fullName": user.fullName,
        "phone": user.phone,
        "location": user.location,
        "image": user.image,
        "isAdmin": user.isAdmin,
        "isBanned": user.isBanned,
        "createdAt": user.createdAt,
        "updatedAt": user.updatedAt,
        "workHistory": [
            {
                "id": str(item.id),
                "company": item.company,
                "title": item.title,
                "startDate": item.startDate,
                "endDate": item.endDate,
                "isCurrent": item.isCurrent,
            }
            for item in user.workHistory
        ],
        "education": [
            {
                "id": str(item.id),
                "school": item.school,
                "degree": item.degree,
                "graduationYear": item.graduationYear,
            }
            for item in user.education
        ],
        "skills": [{"id": str(item.id), "name": item.name, "level": item.level} for item in user.skills],
        "applications": [
            {
                "id": str(item.id),
                "jobId": str(item.jobId),
                "status": item.status,
                "appliedAt": item.appliedAt,
            }
            for item in user.applications
        ],
    }


@router.put("/users/{user_id}/ban")
def toggle_user_ban(
    user_id: str,
    payload: BanUserRequest,
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.isBanned = payload.isBanned
    db.commit()
    return {"userId": str(user.id), "isBanned": user.isBanned}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.resumeFilePath:
        resume_path = Path(user.resumeFilePath)
        if resume_path.exists():
            resume_path.unlink()
            parent = resume_path.parent
            if parent.exists() and not any(parent.iterdir()):
                parent.rmdir()

    db.delete(user)
    db.commit()
    return {"deleted": True}


@router.post("/users/{user_id}/reset-ai-usage")
def reset_user_ai_usage(
    user_id: str,
    _admin: AuthenticatedUser = Depends(get_admin_user),
    redis_client: Redis = Depends(get_redis),
) -> dict:
    pattern = f"ai_usage:{user_id}:*"
    keys = list(redis_client.scan_iter(match=pattern))
    cleared = 0
    if keys:
        cleared = redis_client.delete(*keys)
    return {"userId": user_id, "clearedKeys": int(cleared)}


@router.get("/jobs")
def list_jobs_admin(
    title: str | None = Query(default=None),
    company: str | None = Query(default=None),
    isActive: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(Job)
    if title:
        query = query.filter(Job.title.ilike(f"%{title}%"))
    if company:
        query = query.filter(Job.company.ilike(f"%{company}%"))
    if isActive is not None:
        query = query.filter(Job.isActive.is_(isActive))

    total = query.count()
    jobs = query.order_by(Job.createdAt.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "jobs": [
            {
                "id": str(job.id),
                "title": job.title,
                "company": job.company,
                "isActive": job.isActive,
                "isSponsorsH1B": job.isSponsorsH1B,
                "jobType": job.jobType,
                "workMode": job.workMode,
                "createdAt": job.createdAt,
            }
            for job in jobs
        ],
    }


@router.put("/jobs/{job_id}")
def update_job_admin(
    job_id: str,
    payload: AdminJobUpdateRequest,
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> dict:
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(job, key, value)

    db.commit()
    db.refresh(job)
    return {
        "id": str(job.id),
        "isActive": job.isActive,
        "isSponsorsH1B": job.isSponsorsH1B,
    }


@router.delete("/jobs/{job_id}")
def delete_job_admin(
    job_id: str,
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    db.delete(job)
    db.commit()
    return {"deleted": True}


@router.post("/jobs")
def create_job_admin(
    payload: AdminJobCreateRequest,
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> dict:
    existing = db.query(Job).filter(Job.sourceUrl == payload.sourceUrl).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Job with this sourceUrl already exists")

    job = Job(**payload.model_dump())
    db.add(job)
    db.commit()
    db.refresh(job)
    return {"id": str(job.id)}


@router.get("/scraper/logs")
def get_scraper_logs(
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> dict:
    logs = db.query(ScraperLog).order_by(ScraperLog.runAt.desc()).limit(50).all()
    return {
        "logs": [
            {
                "id": str(log.id),
                "runAt": log.runAt,
                "totalNew": log.totalNew,
                "totalUpdated": log.totalUpdated,
                "totalExpired": log.totalExpired,
                "durationSeconds": log.durationSeconds,
                "status": log.status,
                "errorLog": log.errorLog,
            }
            for log in logs
        ]
    }


@router.post("/scraper/run")
def run_scraper_now(
    _admin: AuthenticatedUser = Depends(get_admin_user),
) -> dict:
    search_roots = [
        Path(os.getenv("SCRAPER_REPO_ROOT", "")).resolve() if os.getenv("SCRAPER_REPO_ROOT") else None,
        Path.cwd(),
        Path(__file__).resolve().parents[2],
        Path(__file__).resolve().parents[3] if len(Path(__file__).resolve().parents) > 3 else None,
    ]
    for root in search_roots:
        if root and (root / "scraper").exists() and str(root) not in sys.path:
            sys.path.append(str(root))

    try:
        job_queue = importlib.import_module("scraper.job_queue")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Scraper module unavailable in backend runtime: {exc}",
        ) from exc

    try:
        results = job_queue.run_full_scrape_batch(wait=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Scraper run failed: {exc}") from exc

    summary = {
        "total": len(results),
        "success": sum(1 for item in results if item.get("status") == "SUCCESS"),
        "failed": sum(1 for item in results if item.get("status") != "SUCCESS"),
        "totalNew": sum(int(item.get("totalNew", 0)) for item in results),
        "totalUpdated": sum(int(item.get("totalUpdated", 0)) for item in results),
        "totalExpired": sum(int(item.get("totalExpired", 0)) for item in results),
    }
    return {"summary": summary, "results": results}


@router.put("/scraper/config")
def update_scraper_config(
    payload: ScraperConfigUpdateRequest,
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> dict:
    settings = ensure_default_admin_settings(db)
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)

    return {
        "scraperEnabled": settings.scraperEnabled,
        "scraperIntervalHours": settings.scraperIntervalHours,
    }


@router.get("/analytics")
def get_admin_analytics(
    _admin: AuthenticatedUser = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> dict:
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())

    total_users = int(db.query(func.count(User.id)).scalar() or 0)
    new_users_today = int(db.query(func.count(User.id)).filter(User.createdAt >= today_start).scalar() or 0)
    new_users_week = int(db.query(func.count(User.id)).filter(User.createdAt >= week_start).scalar() or 0)

    total_jobs = int(db.query(func.count(Job.id)).scalar() or 0)
    active_jobs = int(db.query(func.count(Job.id)).filter(Job.isActive.is_(True)).scalar() or 0)
    expired_jobs = int(
        db.query(func.count(Job.id))
        .filter((Job.isActive.is_(False)) | ((Job.expiresAt.is_not(None)) & (Job.expiresAt < now)))
        .scalar()
        or 0
    )

    total_applications = int(db.query(func.count(Application.id)).scalar() or 0)
    applications_today = int(
        db.query(func.count(Application.id)).filter(Application.createdAt >= today_start).scalar() or 0
    )

    ai_calls_today = int(db.query(func.count(AiUsageLog.id)).filter(AiUsageLog.createdAt >= today_start).scalar() or 0)
    ai_tokens_today = int(
        db.query(func.coalesce(func.sum(AiUsageLog.tokensUsed), 0)).filter(AiUsageLog.createdAt >= today_start).scalar() or 0
    )
    estimated_ai_cost_today = round(ai_tokens_today * 0.00001, 4)

    last_scraper_run = db.query(ScraperLog).order_by(ScraperLog.runAt.desc()).first()

    upload_dir = Path(os.getenv("UPLOAD_DIR", "/backend/uploads"))
    uploads_size_mb = _upload_dir_size_mb(upload_dir)

    return {
        "totalUsers": total_users,
        "newUsersToday": new_users_today,
        "newUsersThisWeek": new_users_week,
        "totalJobs": total_jobs,
        "activeJobs": active_jobs,
        "expiredJobs": expired_jobs,
        "totalApplications": total_applications,
        "applicationsToday": applications_today,
        "aiCallsToday": ai_calls_today,
        "aiTokensUsedToday": ai_tokens_today,
        "estimatedAiCostToday": estimated_ai_cost_today,
        "scraperLastRun": {
            "status": last_scraper_run.status if last_scraper_run else None,
            "runAt": last_scraper_run.runAt if last_scraper_run else None,
            "totalNew": last_scraper_run.totalNew if last_scraper_run else 0,
        },
        "uploadsFolderSizeMB": uploads_size_mb,
    }
