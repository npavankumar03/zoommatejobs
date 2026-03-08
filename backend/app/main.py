from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import ensure_default_admin_settings, session_scope
from app.routes import admin, ai, applications, auth, health, jobs, profile

app = FastAPI(title="zoommate Backend", version="1.0.0")

frontend_origin = os.getenv("NEXTAUTH_URL", "http://localhost:3000")
extra_frontend_origin = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        frontend_origin,
        extra_frontend_origin,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"^chrome-extension://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    upload_dir = Path(os.getenv("UPLOAD_DIR", "/backend/uploads"))
    upload_dir.mkdir(parents=True, exist_ok=True)

    with session_scope() as session:
        ensure_default_admin_settings(session)


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(jobs.router)
app.include_router(applications.router)
app.include_router(ai.router)
app.include_router(admin.router)
