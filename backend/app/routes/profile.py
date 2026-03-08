from __future__ import annotations

import os
from datetime import datetime
from io import BytesIO
from pathlib import Path

import pdfplumber
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.db import Education, Skill, User, WorkHistory
from app.dependencies import get_db
from middleware.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/api/profile", tags=["profile"])

_ALLOWED_SKILL_LEVELS = {"BEGINNER", "INTERMEDIATE", "EXPERT"}
_MAX_RESUME_SIZE = 5 * 1024 * 1024


class BasicProfileUpdate(BaseModel):
    fullName: str | None = None
    phone: str | None = None
    location: str | None = None
    linkedinUrl: str | None = None
    githubUrl: str | None = None
    portfolioUrl: str | None = None
    websiteUrl: str | None = None
    expectedSalary: int | None = None
    workAuthorization: str | None = None
    requiresSponsorship: bool | None = None
    willingToRelocate: bool | None = None
    totalYearsExperience: int | None = None
    personalBio: str | None = None
    resumeSummary: str | None = None


class WorkHistoryCreate(BaseModel):
    company: str
    title: str
    location: str | None = None
    startDate: datetime
    endDate: datetime | None = None
    isCurrent: bool = False
    description: str | None = None
    technologies: list[str] = Field(default_factory=list)


class WorkHistoryUpdate(BaseModel):
    company: str | None = None
    title: str | None = None
    location: str | None = None
    startDate: datetime | None = None
    endDate: datetime | None = None
    isCurrent: bool | None = None
    description: str | None = None
    technologies: list[str] | None = None


class EducationCreate(BaseModel):
    school: str
    degree: str
    fieldOfStudy: str | None = None
    graduationYear: int | None = None
    gpa: str | None = None


class EducationUpdate(BaseModel):
    school: str | None = None
    degree: str | None = None
    fieldOfStudy: str | None = None
    graduationYear: int | None = None
    gpa: str | None = None


class SkillPayload(BaseModel):
    name: str
    level: str = "INTERMEDIATE"


class SkillCreateRequest(BaseModel):
    name: str | None = None
    level: str = "INTERMEDIATE"
    skills: list[SkillPayload] | None = None


class ResumeUploadResponse(BaseModel):
    fileName: str
    uploadedAt: datetime
    resumeTextPreview: str


class ProfileResponse(BaseModel):
    user: dict
    workHistory: list[dict]
    education: list[dict]
    skills: list[dict]


class ItemResponse(BaseModel):
    item: dict


def _serialize_profile(user: User) -> ProfileResponse:
    return ProfileResponse(
        user={
            "id": str(user.id),
            "googleId": user.googleId,
            "email": user.email,
            "fullName": user.fullName,
            "phone": user.phone,
            "location": user.location,
            "image": user.image,
            "linkedinUrl": user.linkedinUrl,
            "githubUrl": user.githubUrl,
            "portfolioUrl": user.portfolioUrl,
            "websiteUrl": user.websiteUrl,
            "expectedSalary": user.expectedSalary,
            "workAuthorization": user.workAuthorization,
            "requiresSponsorship": user.requiresSponsorship,
            "willingToRelocate": user.willingToRelocate,
            "totalYearsExperience": user.totalYearsExperience,
            "personalBio": user.personalBio,
            "resumeSummary": user.resumeSummary,
            "resumeText": user.resumeText,
            "resumeFileName": user.resumeFileName,
            "resumeFilePath": user.resumeFilePath,
            "isAdmin": user.isAdmin,
            "isBanned": user.isBanned,
            "createdAt": user.createdAt,
            "updatedAt": user.updatedAt,
        },
        workHistory=[
            {
                "id": str(item.id),
                "company": item.company,
                "title": item.title,
                "location": item.location,
                "startDate": item.startDate,
                "endDate": item.endDate,
                "isCurrent": item.isCurrent,
                "description": item.description,
                "technologies": item.technologies,
                "createdAt": item.createdAt,
            }
            for item in user.workHistory
        ],
        education=[
            {
                "id": str(item.id),
                "school": item.school,
                "degree": item.degree,
                "fieldOfStudy": item.fieldOfStudy,
                "graduationYear": item.graduationYear,
                "gpa": item.gpa,
                "createdAt": item.createdAt,
            }
            for item in user.education
        ],
        skills=[
            {
                "id": str(item.id),
                "name": item.name,
                "level": item.level,
                "createdAt": item.createdAt,
            }
            for item in user.skills
        ],
    )


def _get_user_with_relations(db: Session, user_id: str) -> User:
    user = (
        db.query(User)
        .options(
            joinedload(User.workHistory),
            joinedload(User.education),
            joinedload(User.skills),
        )
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _validate_skill_level(level: str) -> str:
    normalized = level.upper().strip()
    if normalized not in _ALLOWED_SKILL_LEVELS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid skill level")
    return normalized


def _parse_resume_text(content: bytes) -> str:
    text_chunks: list[str] = []
    with pdfplumber.open(BytesIO(content)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            if page_text:
                text_chunks.append(page_text)
    return "\n".join(text_chunks).strip()


def _is_pdf_upload(file: UploadFile, content: bytes) -> bool:
    content_type = (file.content_type or "").lower()
    type_ok = content_type in {"application/pdf", "application/x-pdf", "binary/octet-stream", ""}
    header_ok = content.startswith(b"%PDF")
    return type_ok and header_ok


@router.get("", response_model=ProfileResponse)
def get_profile(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    user = _get_user_with_relations(db, current_user.user_id)
    return _serialize_profile(user)


@router.put("", response_model=ProfileResponse)
def update_profile(
    payload: BasicProfileUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    user = _get_user_with_relations(db, current_user.user_id)
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(user, key, value)

    db.commit()
    db.refresh(user)
    user = _get_user_with_relations(db, current_user.user_id)
    return _serialize_profile(user)


@router.post("/work-history", response_model=ItemResponse)
def add_work_history(
    payload: WorkHistoryCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ItemResponse:
    record = WorkHistory(userId=current_user.user_id, **payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return ItemResponse(
        item={
            "id": str(record.id),
            "company": record.company,
            "title": record.title,
            "location": record.location,
            "startDate": record.startDate,
            "endDate": record.endDate,
            "isCurrent": record.isCurrent,
            "description": record.description,
            "technologies": record.technologies,
            "createdAt": record.createdAt,
        }
    )


@router.put("/work-history/{work_history_id}", response_model=ItemResponse)
def update_work_history(
    work_history_id: str,
    payload: WorkHistoryUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ItemResponse:
    record = db.query(WorkHistory).filter(WorkHistory.id == work_history_id, WorkHistory.userId == current_user.user_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work history not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return ItemResponse(item={
        "id": str(record.id),
        "company": record.company,
        "title": record.title,
        "location": record.location,
        "startDate": record.startDate,
        "endDate": record.endDate,
        "isCurrent": record.isCurrent,
        "description": record.description,
        "technologies": record.technologies,
        "createdAt": record.createdAt,
    })


@router.delete("/work-history/{work_history_id}")
def delete_work_history(
    work_history_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    record = db.query(WorkHistory).filter(WorkHistory.id == work_history_id, WorkHistory.userId == current_user.user_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work history not found")
    db.delete(record)
    db.commit()
    return {"deleted": True}


@router.post("/education", response_model=ItemResponse)
def add_education(
    payload: EducationCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ItemResponse:
    record = Education(userId=current_user.user_id, **payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return ItemResponse(item={
        "id": str(record.id),
        "school": record.school,
        "degree": record.degree,
        "fieldOfStudy": record.fieldOfStudy,
        "graduationYear": record.graduationYear,
        "gpa": record.gpa,
        "createdAt": record.createdAt,
    })


@router.put("/education/{education_id}", response_model=ItemResponse)
def update_education(
    education_id: str,
    payload: EducationUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ItemResponse:
    record = db.query(Education).filter(Education.id == education_id, Education.userId == current_user.user_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Education entry not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return ItemResponse(item={
        "id": str(record.id),
        "school": record.school,
        "degree": record.degree,
        "fieldOfStudy": record.fieldOfStudy,
        "graduationYear": record.graduationYear,
        "gpa": record.gpa,
        "createdAt": record.createdAt,
    })


@router.delete("/education/{education_id}")
def delete_education(
    education_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    record = db.query(Education).filter(Education.id == education_id, Education.userId == current_user.user_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Education entry not found")
    db.delete(record)
    db.commit()
    return {"deleted": True}


@router.post("/skills")
def add_skills(
    payload: SkillCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, list[dict]]:
    entries: list[SkillPayload]
    if payload.skills is not None:
        entries = payload.skills
    elif payload.name:
        entries = [SkillPayload(name=payload.name, level=payload.level)]
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide either name/level or skills[]")

    created: list[dict] = []
    records: list[Skill] = []
    for entry in entries:
        level = _validate_skill_level(entry.level)
        record = Skill(userId=current_user.user_id, name=entry.name.strip(), level=level)
        db.add(record)
        records.append(record)

    db.commit()
    for record in records:
        db.refresh(record)
        created.append(
            {
                "id": str(record.id),
                "name": record.name,
                "level": record.level,
                "createdAt": record.createdAt,
            }
        )
    return {"skills": created}


@router.delete("/skills/{skill_id}")
def delete_skill(
    skill_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    record = db.query(Skill).filter(Skill.id == skill_id, Skill.userId == current_user.user_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
    db.delete(record)
    db.commit()
    return {"deleted": True}


@router.post("/resume", response_model=ResumeUploadResponse)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResumeUploadResponse:
    filename = file.filename or "resume.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Resume must be a PDF")

    content = await file.read()
    if not _is_pdf_upload(file, content):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is not a valid PDF")
    if len(content) > _MAX_RESUME_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Resume exceeds 5MB")

    try:
        resume_text = _parse_resume_text(content)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid PDF file: {exc}") from exc

    upload_dir = Path(os.getenv("UPLOAD_DIR", "/backend/uploads"))
    user_dir = upload_dir / str(current_user.user_id)
    user_dir.mkdir(parents=True, exist_ok=True)

    destination = user_dir / "resume.pdf"
    with destination.open("wb") as output:
        output.write(content)

    user = db.query(User).filter(User.id == current_user.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.resumeText = resume_text
    user.resumeFileName = filename
    user.resumeFilePath = str(destination)
    user.updatedAt = datetime.utcnow()
    db.commit()

    preview = resume_text[:200]
    return ResumeUploadResponse(fileName=filename, uploadedAt=datetime.utcnow(), resumeTextPreview=preview)


@router.get("/resume/download")
def download_resume(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    user = db.query(User).filter(User.id == current_user.user_id).first()
    if not user or not user.resumeFilePath:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    path = Path(user.resumeFilePath)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume file missing")

    safe_filename = user.resumeFileName or "resume.pdf"
    return FileResponse(
        path=str(path),
        filename=safe_filename,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )
