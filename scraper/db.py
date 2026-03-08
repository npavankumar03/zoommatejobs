import os
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from functools import lru_cache
from typing import Iterable

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, create_engine, select
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Session, declarative_base, sessionmaker

Base = declarative_base()


class AtsType(str, Enum):
    GREENHOUSE = "GREENHOUSE"
    LEVER = "LEVER"
    WORKDAY = "WORKDAY"
    ICIMS = "ICIMS"
    OTHER = "OTHER"


class JobType(str, Enum):
    FULL_TIME = "FULL_TIME"
    PART_TIME = "PART_TIME"
    CONTRACT = "CONTRACT"
    INTERNSHIP = "INTERNSHIP"


class WorkMode(str, Enum):
    REMOTE = "REMOTE"
    HYBRID = "HYBRID"
    ONSITE = "ONSITE"


class ScraperRunStatus(str, Enum):
    SUCCESS = "SUCCESS"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"


class Job(Base):
    __tablename__ = "Job"

    id = Column(UUID(as_uuid=False), primary_key=True)
    title = Column(Text, nullable=False)
    company = Column(Text, nullable=False)
    location = Column(Text)
    description = Column(Text, nullable=False)
    requirements = Column(Text)
    salary = Column(Text)
    jobType = Column("jobType", String, nullable=False)
    workMode = Column("workMode", String, nullable=False)
    sourceUrl = Column("sourceUrl", Text, nullable=False, unique=True)
    atsType = Column("atsType", String, nullable=False)
    isActive = Column("isActive", Boolean, nullable=False, default=True)
    isSponsorsH1B = Column("isSponsorsH1B", Boolean, nullable=False, default=False)
    postedAt = Column("postedAt", DateTime)
    scrapedAt = Column("scrapedAt", DateTime)
    expiresAt = Column("expiresAt", DateTime)
    createdAt = Column("createdAt", DateTime, nullable=False)


class AdminSettings(Base):
    __tablename__ = "AdminSettings"

    id = Column(String, primary_key=True)
    scraperEnabled = Column("scraperEnabled", Boolean, nullable=False)
    scraperIntervalHours = Column("scraperIntervalHours", Integer, nullable=False)


class ScraperLog(Base):
    __tablename__ = "ScraperLog"

    id = Column(UUID(as_uuid=False), primary_key=True)
    runAt = Column("runAt", DateTime, nullable=False)
    totalNew = Column("totalNew", Integer, nullable=False, default=0)
    totalUpdated = Column("totalUpdated", Integer, nullable=False, default=0)
    totalExpired = Column("totalExpired", Integer, nullable=False, default=0)
    durationSeconds = Column("durationSeconds", Integer)
    status = Column(String, nullable=False)
    errorLog = Column("errorLog", Text)


def _database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL environment variable is required for scraper")
    return url


@lru_cache(maxsize=1)
def _get_engine():
    return create_engine(_database_url(), pool_pre_ping=True)


@lru_cache(maxsize=1)
def _get_session_factory():
    return sessionmaker(bind=_get_engine(), autocommit=False, autoflush=False)


@contextmanager
def get_session() -> Iterable[Session]:
    session = _get_session_factory()()
    try:
        yield session
    finally:
        session.close()


@dataclass
class PersistResult:
    new_count: int = 0
    updated_count: int = 0
    expired_count: int = 0


@dataclass
class ScraperSettings:
    scraper_enabled: bool = True
    scraper_interval_hours: int = 6


def _select_job_type(job_payload: dict) -> str:
    value = job_payload.get("jobType")
    if value in {member.value for member in JobType}:
        return value
    return JobType.FULL_TIME.value


def _select_work_mode(job_payload: dict) -> str:
    value = job_payload.get("workMode")
    if value in {member.value for member in WorkMode}:
        return value
    return WorkMode.ONSITE.value


def persist_jobs(
    session: Session,
    company_name: str,
    ats_type: AtsType,
    jobs: list[dict],
    default_is_sponsor: bool = False
) -> PersistResult:
    result = PersistResult()
    now = datetime.utcnow()

    deduped_by_url: dict[str, dict] = {}
    for payload in jobs:
        source_url = payload.get("sourceUrl")
        if source_url:
            deduped_by_url[source_url] = payload

    source_urls = list(deduped_by_url.keys())

    existing_by_url: dict[str, Job] = {}
    if source_urls:
        query = select(Job).where(Job.sourceUrl.in_(source_urls))
        existing_by_url = {job.sourceUrl: job for job in session.execute(query).scalars().all()}

    for source_url, payload in deduped_by_url.items():
        existing = existing_by_url.get(source_url)
        is_sponsor = bool(payload.get("isSponsorsH1B", False) or default_is_sponsor)

        if existing is None:
            session.add(
                Job(
                    id=str(uuid.uuid4()),
                    title=payload.get("title", "Untitled Role"),
                    company=company_name,
                    location=payload.get("location"),
                    description=payload.get("description") or "",
                    requirements=payload.get("requirements"),
                    salary=payload.get("salary"),
                    jobType=_select_job_type(payload),
                    workMode=_select_work_mode(payload),
                    sourceUrl=source_url,
                    atsType=ats_type.value,
                    isActive=True,
                    isSponsorsH1B=is_sponsor,
                    postedAt=payload.get("postedAt"),
                    scrapedAt=now,
                    expiresAt=None,
                    createdAt=now
                )
            )
            result.new_count += 1
        else:
            existing.title = payload.get("title", existing.title)
            existing.location = payload.get("location")
            existing.description = payload.get("description") or existing.description
            existing.requirements = payload.get("requirements")
            existing.salary = payload.get("salary")
            existing.jobType = _select_job_type(payload)
            existing.workMode = _select_work_mode(payload)
            existing.postedAt = payload.get("postedAt")
            existing.scrapedAt = now
            existing.expiresAt = None
            existing.atsType = ats_type.value
            existing.company = company_name
            existing.isActive = True
            existing.isSponsorsH1B = is_sponsor
            result.updated_count += 1

    stale_query = select(Job).where(
        Job.company == company_name,
        Job.atsType == ats_type.value,
        Job.isActive.is_(True)
    )
    if source_urls:
        stale_query = stale_query.where(Job.sourceUrl.notin_(source_urls))

    stale_jobs = session.execute(stale_query).scalars().all()
    for stale in stale_jobs:
        stale.isActive = False
        stale.expiresAt = now
        result.expired_count += 1

    session.commit()
    return result


def create_scraper_log(
    session: Session,
    *,
    status: ScraperRunStatus,
    total_new: int = 0,
    total_updated: int = 0,
    total_expired: int = 0,
    duration_seconds: int | None = None,
    error_log: str | None = None,
    run_at: datetime | None = None
) -> ScraperLog:
    log = ScraperLog(
        id=str(uuid.uuid4()),
        runAt=run_at or datetime.utcnow(),
        totalNew=total_new,
        totalUpdated=total_updated,
        totalExpired=total_expired,
        durationSeconds=duration_seconds,
        status=status.value,
        errorLog=error_log
    )
    session.add(log)
    session.commit()
    return log


def fetch_scraper_settings(session: Session) -> ScraperSettings:
    settings = session.get(AdminSettings, "global")
    if settings is None:
        return ScraperSettings()

    interval = int(settings.scraperIntervalHours or 6)
    if interval < 1:
        interval = 1

    return ScraperSettings(
        scraper_enabled=bool(settings.scraperEnabled),
        scraper_interval_hours=interval
    )
