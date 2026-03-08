from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import User
from app.dependencies import get_db
from middleware.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SyncRequest(BaseModel):
    googleId: str | None = None
    email: str | None = None
    fullName: str | None = None
    image: str | None = None


class SyncResponse(BaseModel):
    userId: str
    email: str
    isAdmin: bool


@router.post("/sync", response_model=SyncResponse)
def sync_user_after_login(
    payload: SyncRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SyncResponse:
    email = payload.email or current_user.email
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required to sync user")

    user = db.query(User).filter(User.id == current_user.user_id).first()

    if user is None and payload.googleId:
        user = db.query(User).filter(User.googleId == payload.googleId).first()

    if user is None:
        user = db.query(User).filter(User.email == email).first()

    if user is None:
        if not payload.googleId:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="googleId is required for first-time user sync",
            )

        try:
            user_id = str(uuid.UUID(str(current_user.user_id)))
        except ValueError:
            user_id = str(uuid.uuid4())

        user = User(
            id=user_id,
            googleId=payload.googleId,
            email=email,
            fullName=payload.fullName,
            image=payload.image,
            isAdmin=bool(current_user.is_admin),
        )
        db.add(user)
    else:
        if payload.googleId and user.googleId != payload.googleId:
            user.googleId = payload.googleId
        if user.email != email:
            user.email = email
        if payload.fullName and user.fullName != payload.fullName:
            user.fullName = payload.fullName
        if payload.image and user.image != payload.image:
            user.image = payload.image

    db.commit()
    db.refresh(user)

    return SyncResponse(userId=str(user.id), email=user.email, isAdmin=bool(user.isAdmin))
