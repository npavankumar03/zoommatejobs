import argparse
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from celery import Celery, group

from scraper.career_page_scraper import scrape_company as scrape_career_company
from scraper.common import load_companies, setup_logging
from scraper.db import ScraperRunStatus, create_scraper_log, get_session
from scraper.greenhouse import scrape_company as scrape_greenhouse_company
from scraper.lever import scrape_company as scrape_lever_company

logger = setup_logging("scraper.queue")

BROKER_URL = __import__("os").getenv("REDIS_URL", "redis://localhost:6379/0")
RESULT_BACKEND = __import__("os").getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery("jobfill_scraper", broker=BROKER_URL, backend=RESULT_BACKEND)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    worker_concurrency=5,
    task_track_started=True,
    timezone="UTC",
    enable_utc=True,
)


def _scrape_company(company: dict[str, Any]) -> dict[str, Any]:
    ats_type = str(company.get("atsType", "")).lower()
    if ats_type == "greenhouse":
        return scrape_greenhouse_company(company)
    if ats_type == "lever":
        return scrape_lever_company(company)
    if ats_type == "career_page":
        return scrape_career_company(company)

    return {
        "company": company.get("name", "Unknown"),
        "atsType": ats_type,
        "status": "FAILED",
        "totalNew": 0,
        "totalUpdated": 0,
        "totalExpired": 0,
        "durationSeconds": 0,
        "error": f"Unsupported atsType '{ats_type}'"
    }


def _log_company_result(result: dict[str, Any]) -> None:
    status = ScraperRunStatus.SUCCESS if result["status"] == "SUCCESS" else ScraperRunStatus.FAILED
    error_log = None
    if result.get("error"):
        error_log = f"{result.get('company')}: {result.get('error')}"

    with get_session() as session:
        create_scraper_log(
            session,
            status=status,
            total_new=int(result.get("totalNew", 0)),
            total_updated=int(result.get("totalUpdated", 0)),
            total_expired=int(result.get("totalExpired", 0)),
            duration_seconds=int(result.get("durationSeconds", 0)),
            error_log=error_log,
            run_at=datetime.utcnow()
        )


@celery_app.task(bind=True, name="scraper.scrape_company_task", max_retries=3)
def scrape_company_task(self, company: dict[str, Any]) -> dict[str, Any]:
    started = time.monotonic()

    try:
        result = _scrape_company(company)

        if result.get("status") == "FAILED":
            raise RuntimeError(result.get("error") or "Unknown scrape failure")

        _log_company_result(result)
        return result
    except Exception as exc:  # noqa: BLE001
        retries = int(self.request.retries)
        if retries < int(self.max_retries):
            backoff_seconds = 2 ** retries
            logger.warning(
                "Task failed for %s (attempt=%s). Retrying in %ss. error=%s",
                company.get("name", "Unknown"),
                retries + 1,
                backoff_seconds,
                exc
            )
            raise self.retry(exc=exc, countdown=backoff_seconds)

        failed_result = {
            "company": company.get("name", "Unknown"),
            "atsType": company.get("atsType", "unknown"),
            "status": "FAILED",
            "totalNew": 0,
            "totalUpdated": 0,
            "totalExpired": 0,
            "durationSeconds": int(time.monotonic() - started),
            "error": str(exc)
        }
        _log_company_result(failed_result)
        return failed_result


def enqueue_all_companies(companies_path: Path | None = None):
    companies = load_companies(companies_path)
    logger.info("Queueing scrape tasks for %s companies", len(companies))

    task_group = group(scrape_company_task.s(company) for company in companies)
    return task_group.apply_async()


def wait_for_results(group_result, timeout_per_task: int = 1800) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for task in group_result.results:
        value = task.get(timeout=timeout_per_task, propagate=False)
        if isinstance(value, Exception):
            results.append(
                {
                    "company": "Unknown",
                    "atsType": "unknown",
                    "status": "FAILED",
                    "totalNew": 0,
                    "totalUpdated": 0,
                    "totalExpired": 0,
                    "durationSeconds": 0,
                    "error": repr(value)
                }
            )
        else:
            results.append(value)
    return results


def run_full_scrape_batch(companies_path: Path | None = None, wait: bool = True) -> list[dict[str, Any]]:
    group_result = enqueue_all_companies(companies_path)
    if not wait:
        return []
    return wait_for_results(group_result)


def main() -> None:
    parser = argparse.ArgumentParser(description="Queue and run JobFill AI scrape tasks")
    parser.add_argument("--companies", help="Path to companies.json", default=None)
    parser.add_argument(
        "--no-wait",
        action="store_true",
        help="Only enqueue tasks without waiting for completion"
    )
    args = parser.parse_args()

    companies_path = None if args.companies is None else Path(args.companies)
    results = run_full_scrape_batch(companies_path, wait=not args.no_wait)
    if args.no_wait:
        logger.info("Tasks queued. Start workers with: celery -A scraper.job_queue.celery_app worker --concurrency=5")
        return

    success_count = sum(1 for item in results if item.get("status") == "SUCCESS")
    failure_count = len(results) - success_count
    logger.info("Queued run complete | success=%s failure=%s", success_count, failure_count)


if __name__ == "__main__":
    main()
