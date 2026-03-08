from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import Application, Job
from app.dependencies import get_db
from middleware.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/api/applications", tags=["applications"])

_ALLOWED_STATUS = {"SAVED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"}


class ApplicationCreate(BaseModel):
    jobId: str
    status: str = "SAVED"
    appliedAt: datetime | None = None
    notes: str | None = None
    aiFilledData: dict | None = None


class ApplicationUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None
    appliedAt: datetime | None = None
    aiFilledData: dict | None = None


class ApplicationListResponse(BaseModel):
    total: int
    page: int
    limit: int
    applications: list[dict]


def _validate_status(value: str) -> str:
    normalized = value.upper().strip()
    if normalized not in _ALLOWED_STATUS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid application status")
    return normalized


def _serialize_application(item: Application) -> dict:
    return {
        "id": str(item.id),
        "userId": str(item.userId),
        "jobId": str(item.jobId),
        "status": item.status,
        "appliedAt": item.appliedAt,
        "notes": item.notes,
        "aiFilledData": item.aiFilledData,
        "createdAt": item.createdAt,
        "updatedAt": item.updatedAt,
        "job": {
            "id": str(item.job.id),
            "title": item.job.title,
            "company": item.job.company,
            "location": item.job.location,
            "workMode": item.job.workMode,
            "jobType": item.job.jobType,
            "isActive": item.job.isActive,
        }
        if item.job
        else None,
    }


@router.post("", response_model=dict)
def create_application(
    payload: ApplicationCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    job = db.query(Job).filter(Job.id == payload.jobId).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    status_value = _validate_status(payload.status)

    record = Application(
        userId=current_user.user_id,
        jobId=payload.jobId,
        status=status_value,
        appliedAt=payload.appliedAt,
        notes=payload.notes,
        aiFilledData=payload.aiFilledData,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {"application": _serialize_application(record)}


@router.get("", response_model=ApplicationListResponse)
def list_applications(
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicationListResponse:
    query = db.query(Application).filter(Application.userId == current_user.user_id)

    if status_filter:
        query = query.filter(Application.status == _validate_status(status_filter))

    total = query.count()
    items = (
        query.order_by(Application.updatedAt.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    # Load related jobs lazily once in current session
    for item in items:
        _ = item.job

    return ApplicationListResponse(
        total=total,
        page=page,
        limit=limit,
        applications=[_serialize_application(item) for item in items],
    )


@router.put("/{application_id}", response_model=dict)
def update_application(
    application_id: str,
    payload: ApplicationUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    record = db.query(Application).filter(Application.id == application_id, Application.userId == current_user.user_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] is not None:
        updates["status"] = _validate_status(updates["status"])

    for key, value in updates.items():
        setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return {"application": _serialize_application(record)}


@router.delete("/{application_id}")
def delete_application(
    application_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    record = db.query(Application).filter(Application.id == application_id, Application.userId == current_user.user_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    db.delete(record)
    db.commit()
    return {"deleted": True}


@router.get("/stats")
def application_stats(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    rows = (
        db.query(Application.status, func.count(Application.id))
        .filter(Application.userId == current_user.user_id)
        .group_by(Application.status)
        .all()
    )

    counts = {status_name: 0 for status_name in _ALLOWED_STATUS}
    for status_name, count in rows:
        counts[status_name] = int(count)

    return {"counts": counts}
