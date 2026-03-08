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

GREENHOUSE_URL_TEMPLATE = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"
logger = setup_logging("scraper.greenhouse")


def infer_job_type(title: str, description: str) -> str:
    blob = f"{title} {description}".lower()
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


def extract_text_from_html(content_html: str | None) -> str:
    if not content_html:
        return ""
    soup = BeautifulSoup(content_html, "html.parser")
    return soup.get_text("\n", strip=True)


def extract_requirements(content_html: str | None) -> str:
    if not content_html:
        return ""

    soup = BeautifulSoup(content_html, "html.parser")
    full_text = soup.get_text("\n", strip=True)

    heading_regex = re.compile(r"(requirement|qualification|what you'?ll need)", re.IGNORECASE)
    for heading in soup.find_all(["h1", "h2", "h3", "h4", "strong", "b"]):
        heading_text = heading.get_text(" ", strip=True)
        if not heading_regex.search(heading_text):
            continue

        chunks: list[str] = []
        sibling = heading.find_next_sibling()
        while sibling is not None and sibling.name not in {"h1", "h2", "h3", "h4"}:
            sibling_text = sibling.get_text(" ", strip=True)
            if sibling_text:
                chunks.append(sibling_text)
            sibling = sibling.find_next_sibling()

        if chunks:
            return "\n".join(chunks)

    match = re.search(
        r"(?:requirements?|qualifications?)\s*[:\-]?\s*(.{0,4000})",
        full_text,
        flags=re.IGNORECASE | re.DOTALL
    )
    if match:
        return match.group(1).strip()

    return ""


def parse_posted_at(raw_job: dict[str, Any]) -> datetime | None:
    for field in ("updated_at", "first_published"):
        value = raw_job.get(field)
        if not value:
            continue
        try:
            normalized = value.replace("Z", "+00:00")
            return datetime.fromisoformat(normalized).replace(tzinfo=None)
        except ValueError:
            continue
    return None


def parse_greenhouse_job(company: dict[str, Any], raw_job: dict[str, Any]) -> dict[str, Any] | None:
    source_url = raw_job.get("absolute_url")
    if not source_url:
        return None

    source_url = normalize_url(source_url)
    title = (raw_job.get("title") or "").strip() or "Untitled Role"
    location = (raw_job.get("location") or {}).get("name")

    content_html = raw_job.get("content") or ""
    description = extract_text_from_html(content_html)
    requirements = extract_requirements(content_html)

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
        "jobType": infer_job_type(title, description),
        "workMode": infer_work_mode(location, title, description),
        "isSponsorsH1B": is_h1b
    }


def fetch_greenhouse_jobs(company: dict[str, Any]) -> list[dict[str, Any]]:
    slug = company["slug"]
    endpoint = GREENHOUSE_URL_TEMPLATE.format(slug=slug)

    if not is_allowed_by_robots(endpoint, logger):
        raise PermissionError(f"robots.txt disallowed Greenhouse endpoint for {company['name']}")

    domain = urlparse(endpoint).netloc
    DOMAIN_RATE_LIMITER.wait(domain)

    with get_http_client() as client:
        response = client.get(endpoint)
        response.raise_for_status()
        payload = response.json()

    jobs: list[dict[str, Any]] = []
    for raw_job in payload.get("jobs", []):
        parsed = parse_greenhouse_job(company, raw_job)
        if parsed:
            jobs.append(parsed)

    return jobs


def scrape_company(company: dict[str, Any]) -> dict[str, Any]:
    started = datetime.utcnow()
    try:
        jobs = fetch_greenhouse_jobs(company)
        with get_session() as session:
            persisted = persist_jobs(
                session,
                company_name=company["name"],
                ats_type=AtsType.GREENHOUSE,
                jobs=jobs,
                default_is_sponsor=bool(company.get("isSponsorsH1B", False))
            )

        duration = int((datetime.utcnow() - started).total_seconds())
        result = {
            "company": company["name"],
            "atsType": "greenhouse",
            "status": "SUCCESS",
            "totalNew": persisted.new_count,
            "totalUpdated": persisted.updated_count,
            "totalExpired": persisted.expired_count,
            "durationSeconds": duration,
            "error": None
        }
        logger.info("Greenhouse scrape success | %s | %s", company["name"], result)
        return result
    except Exception as exc:  # noqa: BLE001
        logger.exception("Greenhouse scrape failed for %s", company["name"])
        duration = int((datetime.utcnow() - started).total_seconds())
        return {
            "company": company["name"],
            "atsType": "greenhouse",
            "status": "FAILED",
            "totalNew": 0,
            "totalUpdated": 0,
            "totalExpired": 0,
            "durationSeconds": duration,
            "error": str(exc)
        }


def scrape_all_greenhouse(companies_path: str | None = None) -> list[dict[str, Any]]:
    companies = load_companies(None if companies_path is None else Path(companies_path))
    greenhouse_companies = [c for c in companies if str(c.get("atsType", "")).lower() == "greenhouse"]

    logger.info("Starting Greenhouse scrape for %s companies", len(greenhouse_companies))
    results: list[dict[str, Any]] = []

    for company in greenhouse_companies:
        results.append(scrape_company(company))

    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape jobs from Greenhouse boards")
    parser.add_argument("--companies", help="Path to companies.json", default=None)
    args = parser.parse_args()

    results = scrape_all_greenhouse(args.companies)
    success_count = sum(1 for item in results if item["status"] == "SUCCESS")
    failure_count = len(results) - success_count
    logger.info("Greenhouse scraping complete | success=%s failure=%s", success_count, failure_count)


if __name__ == "__main__":
    main()
