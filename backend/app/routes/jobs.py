from __future__ import annotations

import os
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, not_
from sqlalchemy.orm import Session

from app.db import Application, Job, Skill, User, WorkHistory, ensure_default_admin_settings
from app.dependencies import get_db
from middleware.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class JobListResponse(BaseModel):
    total: int
    page: int
    limit: int
    jobs: list[dict]


def _extract_salary_number(salary: str | None) -> int | None:
    if not salary:
        return None
    numbers = re.findall(r"\d[\d,]*", salary)
    if not numbers:
        return None
    normalized = numbers[0].replace(",", "")
    try:
        return int(normalized)
    except ValueError:
        return None


def _serialize_job(job: Job, include_description: bool = False) -> dict:
    data = {
        "id": str(job.id),
        "title": job.title,
        "company": job.company,
        "location": job.location,
        "salary": job.salary,
        "jobType": job.jobType,
        "workMode": job.workMode,
        "sourceUrl": job.sourceUrl,
        "atsType": job.atsType,
        "isActive": job.isActive,
        "isSponsorsH1B": job.isSponsorsH1B,
        "postedAt": job.postedAt,
        "scrapedAt": job.scrapedAt,
        "expiresAt": job.expiresAt,
        "createdAt": job.createdAt,
    }
    if include_description:
        data["description"] = job.description
        data["requirements"] = job.requirements
    return data


def _max_page_limit(db: Session) -> int:
    settings = ensure_default_admin_settings(db)
    # AdminSettings currently has no dedicated job pagination cap field.
    # Use a stable admin-config-driven cap with env override.
    env_cap = int(os.getenv("MAX_JOBS_PAGE_LIMIT", "100"))
    settings_cap = max(20, int(settings.maxFreeAiFillsPerDay or 10) * 10)
    return min(max(env_cap, 20), settings_cap)


@router.get("", response_model=JobListResponse)
def list_jobs(
    title: str | None = Query(default=None),
    location: str | None = Query(default=None),
    workMode: str | None = Query(default=None),
    jobType: str | None = Query(default=None),
    isSponsorsH1B: bool | None = Query(default=None),
    salaryMin: int | None = Query(default=None, ge=0),
    salaryMax: int | None = Query(default=None, ge=0),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1),
    _current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobListResponse:
    effective_limit = min(limit, _max_page_limit(db))

    filters = [Job.isActive.is_(True)]
    if title:
        filters.append(Job.title.ilike(f"%{title}%"))
    if location:
        filters.append(Job.location.ilike(f"%{location}%"))
    if workMode:
        filters.append(Job.workMode == workMode.upper())
    if jobType:
        filters.append(Job.jobType == jobType.upper())
    if isSponsorsH1B is not None:
        filters.append(Job.isSponsorsH1B.is_(isSponsorsH1B))

    query = db.query(Job).filter(and_(*filters)).order_by(Job.postedAt.desc().nullslast(), Job.createdAt.desc())
    records = query.all()

    if salaryMin is not None or salaryMax is not None:
        filtered: list[Job] = []
        for item in records:
            value = _extract_salary_number(item.salary)
            if value is None:
                continue
            if salaryMin is not None and value < salaryMin:
                continue
            if salaryMax is not None and value > salaryMax:
                continue
            filtered.append(item)
        records = filtered

    total = len(records)
    start = (page - 1) * effective_limit
    end = start + effective_limit
    page_items = records[start:end]

    return JobListResponse(
        total=total,
        page=page,
        limit=effective_limit,
        jobs=[_serialize_job(item) for item in page_items],
    )


@router.get("/matched")
def get_matched_jobs(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, list[dict]]:
    user = db.query(User).filter(User.id == current_user.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    skills = db.query(Skill).filter(Skill.userId == current_user.user_id).all()
    history = db.query(WorkHistory).filter(WorkHistory.userId == current_user.user_id).all()
    applied_job_ids = [row.jobId for row in db.query(Application).filter(Application.userId == current_user.user_id).all()]

    keywords: set[str] = set()
    for skill in skills:
        keywords.update(re.findall(r"[a-zA-Z0-9+#\.]{2,}", skill.name.lower()))
    for item in history:
        keywords.update(re.findall(r"[a-zA-Z0-9+#\.]{2,}", item.title.lower()))

    jobs = (
        db.query(Job)
        .filter(Job.isActive.is_(True), not_(Job.id.in_(applied_job_ids)) if applied_job_ids else True)
        .all()
    )

    matches: list[dict] = []
    keyword_count = max(1, len(keywords))

    for job in jobs:
        text = f"{job.title} {job.company} {job.description or ''} {job.requirements or ''}".lower()
        matched = [kw for kw in keywords if kw in text]
        score = min(100, int((len(matched) / keyword_count) * 100))
        if score <= 0:
            continue

        matches.append(
            {
                **_serialize_job(job),
                "score": score,
                "matchedKeywords": sorted(matched)[:20],
            }
        )

    matches.sort(key=lambda item: item["score"], reverse=True)
    return {"jobs": matches[:20]}


@router.get("/{job_id}")
def get_job(
    job_id: str,
    _current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return _serialize_job(job, include_description=True)
