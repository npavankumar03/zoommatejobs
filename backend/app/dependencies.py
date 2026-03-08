from __future__ import annotations

import os
from functools import lru_cache

import redis
from sqlalchemy.orm import Session

from app.db import get_session_factory


@lru_cache(maxsize=1)
def get_redis_client() -> redis.Redis:
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    return redis.Redis.from_url(redis_url, decode_responses=True)


def get_db() -> Session:
    db = get_session_factory()()
    try:
        yield db
    finally:
        db.close()


def get_redis() -> redis.Redis:
    return get_redis_client()
