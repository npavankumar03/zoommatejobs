import argparse
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from scraper.common import DOMAIN_RATE_LIMITER, get_http_client, is_allowed_by_robots, load_companies, normalize_url, setup_logging
from scraper.db import AtsType, JobType, WorkMode, get_session, persist_jobs
from scraper.h1b_detector import detect_h1b_sponsorship

LEVER_URL_TEMPLATE = "https://api.lever.co/v0/postings/{slug}?mode=json"
logger = setup_logging("scraper.lever")


def infer_job_type(title: str, commitment: str | None, description: str) -> str:
    blob = f"{title} {commitment or ''} {description}".lower()
    if "intern" in blob:
        return JobType.INTERNSHIP.value
    if "contract" in blob or "consultant" in blob:
        return JobType.CONTRACT.value
    if "part time" in blob or "part-time" in blob:
        return JobType.PART_TIME.value
    return JobType.FULL_TIME.value


def infer_work_mode(location: str | None, title: str, description: str) -> str:
    blob = f"{location or ''} {title} {description}".lower()
    if "remote" in blob:
        return WorkMode.REMOTE.value
    if "hybrid" in blob:
        return WorkMode.HYBRID.value
    return WorkMode.ONSITE.value


def parse_posted_at(raw_job: dict[str, Any]) -> datetime | None:
    timestamp_ms = raw_job.get("createdAt")
    if timestamp_ms is None:
        return None
    try:
        return datetime.utcfromtimestamp(float(timestamp_ms) / 1000.0)
    except (TypeError, ValueError):
        return None


def extract_requirements(raw_job: dict[str, Any], description_text: str) -> str:
    lists = raw_job.get("lists") or []
    chunks: list[str] = []

    for entry in lists:
        heading = str(entry.get("text") or entry.get("title") or "")
        if re.search(r"(requirement|qualification)", heading, flags=re.IGNORECASE):
            content = entry.get("content")
            if isinstance(content, list):
                chunks.extend(str(item) for item in content if item)
            elif isinstance(content, str):
                chunks.append(content)

    if chunks:
        return "\n".join(chunks)

    match = re.search(
        r"(?:requirements?|qualifications?)\s*[:\-]?\s*(.{0,4000})",
        description_text,
        flags=re.IGNORECASE | re.DOTALL
    )
    if match:
        return match.group(1).strip()

    return ""


def parse_lever_job(company: dict[str, Any], raw_job: dict[str, Any]) -> dict[str, Any] | None:
    source_url = raw_job.get("hostedUrl") or raw_job.get("applyUrl")
    if not source_url:
        return None

    source_url = normalize_url(source_url)

    title = str(raw_job.get("text") or "").strip() or "Untitled Role"
    location = ((raw_job.get("categories") or {}).get("location") or "").strip() or None
    commitment = ((raw_job.get("categories") or {}).get("commitment") or "").strip() or None

    description_plain = raw_job.get("descriptionPlain")
    if description_plain:
        description = str(description_plain)
    else:
        description_html = raw_job.get("description") or ""
        description = BeautifulSoup(description_html, "html.parser").get_text("\n", strip=True)

    requirements = extract_requirements(raw_job, description)
    is_h1b = detect_h1b_sponsorship(
        f"{description}\n{requirements}",
        default=bool(company.get("isSponsorsH1B", False))
    )

    return {
        "title": title,
        "location": location,
        "description": description,
        "requirements": requirements,
        "sourceUrl": source_url,
        "postedAt": parse_posted_at(raw_job),
        "jobType": infer_job_type(title, commitment, description),
        "workMode": infer_work_mode(location, title, description),
        "isSponsorsH1B": is_h1b
    }


def fetch_lever_jobs(company: dict[str, Any]) -> list[dict[str, Any]]:
    slug = company["slug"]
    endpoint = LEVER_URL_TEMPLATE.format(slug=slug)

    if not is_allowed_by_robots(endpoint, logger):
        raise PermissionError(f"robots.txt disallowed Lever endpoint for {company['name']}")

    domain = urlparse(endpoint).netloc
    DOMAIN_RATE_LIMITER.wait(domain)

    with get_http_client() as client:
        response = client.get(endpoint)
        response.raise_for_status()
        payload = response.json()

    jobs: list[dict[str, Any]] = []
    for raw_job in payload:
        parsed = parse_lever_job(company, raw_job)
        if parsed:
            jobs.append(parsed)

    return jobs


def scrape_company(company: dict[str, Any]) -> dict[str, Any]:
    started = datetime.utcnow()
    try:
        jobs = fetch_lever_jobs(company)
        with get_session() as session:
            persisted = persist_jobs(
                session,
                company_name=company["name"],
                ats_type=AtsType.LEVER,
                jobs=jobs,
                default_is_sponsor=bool(company.get("isSponsorsH1B", False))
            )

        duration = int((datetime.utcnow() - started).total_seconds())
        result = {
            "company": company["name"],
            "atsType": "lever",
            "status": "SUCCESS",
            "totalNew": persisted.new_count,
            "totalUpdated": persisted.updated_count,
            "totalExpired": persisted.expired_count,
            "durationSeconds": duration,
            "error": None
        }
        logger.info("Lever scrape success | %s | %s", company["name"], result)
        return result
    except Exception as exc:  # noqa: BLE001
        logger.exception("Lever scrape failed for %s", company["name"])
        duration = int((datetime.utcnow() - started).total_seconds())
        return {
            "company": company["name"],
            "atsType": "lever",
            "status": "FAILED",
            "totalNew": 0,
            "totalUpdated": 0,
            "totalExpired": 0,
            "durationSeconds": duration,
            "error": str(exc)
        }


def scrape_all_lever(companies_path: str | None = None) -> list[dict[str, Any]]:
    companies = load_companies(None if companies_path is None else Path(companies_path))
    lever_companies = [c for c in companies if str(c.get("atsType", "")).lower() == "lever"]

    logger.info("Starting Lever scrape for %s companies", len(lever_companies))
    results: list[dict[str, Any]] = []

    for company in lever_companies:
        results.append(scrape_company(company))

    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape jobs from Lever postings")
    parser.add_argument("--companies", help="Path to companies.json", default=None)
    args = parser.parse_args()

    results = scrape_all_lever(args.companies)
    success_count = sum(1 for item in results if item["status"] == "SUCCESS")
    failure_count = len(results) - success_count
    logger.info("Lever scraping complete | success=%s failure=%s", success_count, failure_count)


if __name__ == "__main__":
    main()
