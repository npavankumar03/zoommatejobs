from __future__ import annotations

import os
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends
from redis import Redis
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import ScraperLog, ensure_default_admin_settings
from app.dependencies import get_db, get_redis

router = APIRouter(tags=["health"])


def _folder_stats(path: Path) -> tuple[float, int]:
    if not path.exists() or not path.is_dir():
        return 0.0, 0

    total_bytes = 0
    file_count = 0
    for file_path in path.rglob("*"):
        if file_path.is_file():
            total_bytes += file_path.stat().st_size
            file_count += 1

    return round(total_bytes / (1024 * 1024), 2), file_count


def _disk_usage(path: Path) -> dict:
    target = path if path.exists() else Path("/")
    usage = shutil.disk_usage(target)
    total_gb = round(usage.total / (1024**3), 2)
    used_gb = round(usage.used / (1024**3), 2)
    free_gb = round(usage.free / (1024**3), 2)
    used_percent = round((usage.used / usage.total) * 100, 2) if usage.total > 0 else 0.0
    return {
        "totalGB": total_gb,
        "usedGB": used_gb,
        "freeGB": free_gb,
        "usedPercent": used_percent,
    }


@router.get("/api/health")
def health_check(
    db: Session = Depends(get_db),
    redis_client: Redis = Depends(get_redis),
) -> dict:
    database_status = "connected"
    redis_status = "connected"
    active_provider = "openai"
    scraper_status: dict[str, str | bool | None] = {
        "enabled": False,
        "lastRunAt": None,
        "lastStatus": "unknown",
    }

    try:
        db.execute(text("SELECT 1"))
        settings = ensure_default_admin_settings(db)
        active_provider = (settings.activeAiProvider or "OPENAI").lower()
        scraper_status["enabled"] = bool(settings.scraperEnabled)

        latest_scraper_log = db.query(ScraperLog).order_by(ScraperLog.runAt.desc()).first()
        if latest_scraper_log is not None:
            scraper_status["lastRunAt"] = (
                latest_scraper_log.runAt.isoformat() if latest_scraper_log.runAt is not None else None
            )
            scraper_status["lastStatus"] = (latest_scraper_log.status or "unknown").lower()
    except Exception:  # noqa: BLE001
        database_status = "error"
        # Keep defaults for provider/scraper flags if DB is unavailable.
    finally:
        try:
            redis_client.ping()
        except Exception:  # noqa: BLE001
            redis_status = "error"

    upload_dir = Path(os.getenv("UPLOAD_DIR", "/backend/uploads"))
    uploads_exists = upload_dir.exists() and upload_dir.is_dir()
    uploads_size_mb, uploads_file_count = _folder_stats(upload_dir)

    degraded = database_status != "connected" or redis_status != "connected" or not uploads_exists

    return {
        "status": "degraded" if degraded else "ok",
        "database": database_status,
        "redis": redis_status,
        "uploadsFolder": {
            "exists": uploads_exists,
            "sizeMB": uploads_size_mb,
            "fileCount": uploads_file_count,
        },
        "disk": _disk_usage(upload_dir),
        "activeAiProvider": active_provider,
        "scraperStatus": scraper_status,
    }
