from __future__ import annotations

import os
import uuid
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, create_engine, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker

Base = declarative_base()


class User(Base):
    __tablename__ = "User"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    googleId = Column("googleId", String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    fullName = Column("fullName", String)
    phone = Column(String)
    location = Column(String)
    image = Column(String)
    linkedinUrl = Column("linkedinUrl", String)
    githubUrl = Column("githubUrl", String)
    portfolioUrl = Column("portfolioUrl", String)
    websiteUrl = Column("websiteUrl", String)
    expectedSalary = Column("expectedSalary", Integer)
    workAuthorization = Column("workAuthorization", String)
    requiresSponsorship = Column("requiresSponsorship", Boolean, nullable=False, default=False)
    willingToRelocate = Column("willingToRelocate", Boolean, nullable=False, default=False)
    totalYearsExperience = Column("totalYearsExperience", Integer)
    personalBio = Column("personalBio", Text)
    resumeSummary = Column("resumeSummary", Text)
    resumeText = Column("resumeText", Text)
    resumeFileName = Column("resumeFileName", String)
    resumeFilePath = Column("resumeFilePath", String)
    isAdmin = Column("isAdmin", Boolean, nullable=False, default=False)
    isBanned = Column("isBanned", Boolean, nullable=False, default=False)
    createdAt = Column("createdAt", DateTime, nullable=False, server_default=func.now())
    updatedAt = Column("updatedAt", DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    workHistory = relationship("WorkHistory", back_populates="user", cascade="all, delete-orphan")
    education = relationship("Education", back_populates="user", cascade="all, delete-orphan")
    skills = relationship("Skill", back_populates="user", cascade="all, delete-orphan")
    applications = relationship("Application", back_populates="user", cascade="all, delete-orphan")
    savedJobs = relationship("SavedJob", back_populates="user", cascade="all, delete-orphan")


class WorkHistory(Base):
    __tablename__ = "WorkHistory"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column("userId", UUID(as_uuid=False), ForeignKey('User.id', ondelete="CASCADE"), nullable=False)
    company = Column(String, nullable=False)
    title = Column(String, nullable=False)
    location = Column(String)
    startDate = Column("startDate", DateTime, nullable=False)
    endDate = Column("endDate", DateTime)
    isCurrent = Column("isCurrent", Boolean, nullable=False, default=False)
    description = Column(Text)
    technologies = Column(ARRAY(String), nullable=False, default=list)
    createdAt = Column("createdAt", DateTime, nullable=False, server_default=func.now())

    user = relationship("User", back_populates="workHistory")


class Education(Base):
    __tablename__ = "Education"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column("userId", UUID(as_uuid=False), ForeignKey('User.id', ondelete="CASCADE"), nullable=False)
    school = Column(String, nullable=False)
    degree = Column(String, nullable=False)
    fieldOfStudy = Column("fieldOfStudy", String)
    graduationYear = Column("graduationYear", Integer)
    gpa = Column(String)
    createdAt = Column("createdAt", DateTime, nullable=False, server_default=func.now())

    user = relationship("User", back_populates="education")


class Skill(Base):
    __tablename__ = "Skill"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column("userId", UUID(as_uuid=False), ForeignKey('User.id', ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    level = Column(String, nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False, server_default=func.now())

    user = relationship("User", back_populates="skills")


class Job(Base):
    __tablename__ = "Job"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    company = Column(String, nullable=False)
    location = Column(String)
    description = Column(Text, nullable=False)
    requirements = Column(Text)
    salary = Column(String)
    jobType = Column("jobType", String, nullable=False)
    workMode = Column("workMode", String, nullable=False)
    sourceUrl = Column("sourceUrl", String, nullable=False, unique=True)
    atsType = Column("atsType", String, nullable=False)
    isActive = Column("isActive", Boolean, nullable=False, default=True)
    isSponsorsH1B = Column("isSponsorsH1B", Boolean, nullable=False, default=False)
    postedAt = Column("postedAt", DateTime)
    scrapedAt = Column("scrapedAt", DateTime)
    expiresAt = Column("expiresAt", DateTime)
    createdAt = Column("createdAt", DateTime, nullable=False, server_default=func.now())

    applications = relationship("Application", back_populates="job", cascade="all, delete-orphan")
    savedBy = relationship("SavedJob", back_populates="job", cascade="all, delete-orphan")


class Application(Base):
    __tablename__ = "Application"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column("userId", UUID(as_uuid=False), ForeignKey('User.id', ondelete="CASCADE"), nullable=False)
    jobId = Column("jobId", UUID(as_uuid=False), ForeignKey('Job.id', ondelete="CASCADE"), nullable=False)
    status = Column(String, nullable=False, default="SAVED")
    appliedAt = Column("appliedAt", DateTime)
    notes = Column(Text)
    aiFilledData = Column("aiFilledData", JSONB)
    createdAt = Column("createdAt", DateTime, nullable=False, server_default=func.now())
    updatedAt = Column("updatedAt", DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="applications")
    job = relationship("Job", back_populates="applications")


class SavedJob(Base):
    __tablename__ = "SavedJob"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column("userId", UUID(as_uuid=False), ForeignKey('User.id', ondelete="CASCADE"), nullable=False)
    jobId = Column("jobId", UUID(as_uuid=False), ForeignKey('Job.id', ondelete="CASCADE"), nullable=False)
    createdAt = Column("createdAt", DateTime, nullable=False, server_default=func.now())

    user = relationship("User", back_populates="savedJobs")
    job = relationship("Job", back_populates="savedBy")


class AdminSettings(Base):
    __tablename__ = "AdminSettings"

    id = Column(String, primary_key=True, default="global")
    activeAiProvider = Column("activeAiProvider", String, nullable=False, default="OPENAI")
    openaiApiKey = Column("openaiApiKey", String)
    openaiModel = Column("openaiModel", String, nullable=False, default="gpt-4o")
    geminiApiKey = Column("geminiApiKey", String)
    geminiModel = Column("geminiModel", String, nullable=False, default="gemini-1.5-pro")
    maxFreeAiFillsPerDay = Column("maxFreeAiFillsPerDay", Integer, nullable=False, default=10)
    scraperEnabled = Column("scraperEnabled", Boolean, nullable=False, default=True)
    scraperIntervalHours = Column("scraperIntervalHours", Integer, nullable=False, default=6)
    allowRegistration = Column("allowRegistration", Boolean, nullable=False, default=True)
    maintenanceMode = Column("maintenanceMode", Boolean, nullable=False, default=False)
    siteName = Column("siteName", String, nullable=False, default="zoommate")
    siteTagline = Column("siteTagline", String)
    updatedAt = Column("updatedAt", DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class ScraperLog(Base):
    __tablename__ = "ScraperLog"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    runAt = Column("runAt", DateTime, nullable=False, server_default=func.now())
    totalNew = Column("totalNew", Integer, nullable=False, default=0)
    totalUpdated = Column("totalUpdated", Integer, nullable=False, default=0)
    totalExpired = Column("totalExpired", Integer, nullable=False, default=0)
    durationSeconds = Column("durationSeconds", Integer)
    status = Column(String, nullable=False)
    errorLog = Column("errorLog", Text)


class AiUsageLog(Base):
    __tablename__ = "AiUsageLog"

    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column("userId", UUID(as_uuid=False), ForeignKey('User.id', ondelete="CASCADE"), nullable=False)
    action = Column(String, nullable=False)
    provider = Column(String, nullable=False)
    model = Column(String, nullable=False)
    tokensUsed = Column("tokensUsed", Integer)
    createdAt = Column("createdAt", DateTime, nullable=False, server_default=func.now())

    user = relationship("User")


def _database_url() -> str:
    value = os.getenv("DATABASE_URL")
    if not value:
        raise RuntimeError("DATABASE_URL is required")
    return value


@lru_cache(maxsize=1)
def get_engine():
    return create_engine(_database_url(), pool_pre_ping=True)


@lru_cache(maxsize=1)
def get_session_factory():
    return sessionmaker(bind=get_engine(), autocommit=False, autoflush=False)


@contextmanager
def session_scope() -> Session:
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def ensure_default_admin_settings(session: Session) -> AdminSettings:
    settings = session.get(AdminSettings, "global")
    if settings is not None:
        return settings

    settings = AdminSettings(id="global")
    session.add(settings)
    session.commit()
    session.refresh(settings)
    return settings
