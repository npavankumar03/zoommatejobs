import asyncio
import json
import logging
import threading
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 "
    "JobFillAIJobBot/1.0 (+https://jobfill.ai/bot)"
)
REQUEST_TIMEOUT_SECONDS = 30
RATE_LIMIT_SECONDS = 2.0
COMPANIES_PATH = Path(__file__).resolve().parent / "companies.json"


class DomainRateLimiter:
    """Simple per-domain limiter with a minimum interval between requests."""

    def __init__(self, min_interval_seconds: float = RATE_LIMIT_SECONDS) -> None:
        self.min_interval_seconds = min_interval_seconds
        self._next_allowed_at: dict[str, float] = {}
        self._lock = threading.Lock()

    def _reserve_wait_time(self, domain: str) -> float:
        with self._lock:
            now = time.monotonic()
            next_allowed = self._next_allowed_at.get(domain, now)
            wait_for = max(0.0, next_allowed - now)
            self._next_allowed_at[domain] = max(now, next_allowed) + self.min_interval_seconds
            return wait_for

    def wait(self, domain: str) -> None:
        wait_for = self._reserve_wait_time(domain)
        if wait_for > 0:
            time.sleep(wait_for)

    async def async_wait(self, domain: str) -> None:
        wait_for = self._reserve_wait_time(domain)
        if wait_for > 0:
            await asyncio.sleep(wait_for)


DOMAIN_RATE_LIMITER = DomainRateLimiter()

_logger_lock = threading.Lock()
_robots_lock = threading.Lock()
_robots_cache: dict[str, RobotFileParser | None] = {}


def setup_logging(name: str) -> logging.Logger:
    with _logger_lock:
        logger = logging.getLogger(name)
        if logger.handlers:
            return logger

        logger.setLevel(logging.INFO)

        logs_dir = Path(__file__).resolve().parent / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)

        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )

        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)

        file_handler = RotatingFileHandler(
            logs_dir / "scraper.log",
            maxBytes=10_000_000,
            backupCount=5
        )
        file_handler.setFormatter(formatter)

        logger.addHandler(stream_handler)
        logger.addHandler(file_handler)
        logger.propagate = False
        return logger


def get_http_client() -> httpx.Client:
    return httpx.Client(
        timeout=REQUEST_TIMEOUT_SECONDS,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT}
    )


def load_companies(companies_path: Path | None = None) -> list[dict[str, Any]]:
    path = companies_path or COMPANIES_PATH
    with path.open("r", encoding="utf-8") as file:
        companies = json.load(file)
    if not isinstance(companies, list):
        raise ValueError("companies.json must contain a JSON array")
    return companies


def normalize_url(url: str, base_url: str | None = None) -> str:
    absolute = urljoin(base_url, url) if base_url else url
    parsed = urlparse(absolute)
    normalized = parsed._replace(fragment="")
    return normalized.geturl()


def _get_robots_parser(target_url: str, logger: logging.Logger | None = None) -> RobotFileParser | None:
    parsed = urlparse(target_url)
    domain = parsed.netloc

    with _robots_lock:
        if domain in _robots_cache:
            return _robots_cache[domain]

    robots_url = f"{parsed.scheme or 'https'}://{domain}/robots.txt"

    parser = RobotFileParser()
    try:
        DOMAIN_RATE_LIMITER.wait(domain)
        response = httpx.get(
            robots_url,
            timeout=10,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT}
        )
        if response.status_code >= 400:
            if logger:
                logger.warning("robots.txt unavailable for %s (status=%s)", domain, response.status_code)
            parser = None
        else:
            parser.parse(response.text.splitlines())
    except Exception as exc:  # noqa: BLE001
        if logger:
            logger.warning("Failed to fetch robots.txt for %s: %s", domain, exc)
        parser = None

    with _robots_lock:
        _robots_cache[domain] = parser

    return parser


def is_allowed_by_robots(target_url: str, logger: logging.Logger | None = None) -> bool:
    parser = _get_robots_parser(target_url, logger)
    if parser is None:
        return True

    allowed = parser.can_fetch(USER_AGENT, target_url)
    if not allowed and logger:
        logger.info("Skipping disallowed URL by robots.txt: %s", target_url)
    return allowed
