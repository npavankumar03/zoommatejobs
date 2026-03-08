import argparse
import asyncio
import re
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from playwright.async_api import BrowserContext, Error as PlaywrightError, Page, async_playwright

from scraper.common import DOMAIN_RATE_LIMITER, USER_AGENT, is_allowed_by_robots, load_companies, normalize_url, setup_logging
from scraper.db import AtsType, JobType, WorkMode, get_session, persist_jobs
from scraper.h1b_detector import detect_h1b_sponsorship

logger = setup_logging("scraper.career_page")

JOB_LINK_KEYWORDS = ["job", "position", "role", "opening", "career"]
LOCATION_HINT_RE = re.compile(r"(remote|hybrid|onsite|on-site|[a-z]+,\s*[a-z]{2})", re.IGNORECASE)


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


def normalize_start_url(slug: str) -> str:
    if slug.startswith("http://") or slug.startswith("https://"):
        return slug
    return f"https://{slug}"


async def discover_job_links(page: Page, base_url: str) -> list[dict[str, str | None]]:
    raw_links = await page.eval_on_selector_all(
        "a[href]",
        """
        (anchors) => anchors.map((anchor) => {
          const href = anchor.getAttribute('href') || '';
          const text = (anchor.innerText || anchor.textContent || '').trim();
          const card = anchor.closest('li,article,div');
          let location = null;
          if (card) {
            const locationNode = card.querySelector('[class*=location],[data-location],[class*=meta]');
            if (locationNode) {
              location = (locationNode.innerText || locationNode.textContent || '').trim();
            }
          }
          return { href, text, location };
        })
        """
    )

    links: list[dict[str, str | None]] = []
    for item in raw_links:
        href = str(item.get("href") or "").strip()
        text = str(item.get("text") or "").strip()
        location = str(item.get("location") or "").strip() or None
        if not href:
            continue

        signal_blob = f"{href} {text}".lower()
        if not any(keyword in signal_blob for keyword in JOB_LINK_KEYWORDS):
            continue

        absolute = normalize_url(href, base_url)
        if not absolute.startswith("http"):
            continue

        if not text:
            title_guess = absolute.rstrip("/").split("/")[-1].replace("-", " ").strip().title()
        else:
            title_guess = text

        links.append({"sourceUrl": absolute, "title": title_guess, "location": location})

    # Heuristic: include repeating "job-card" style nodes.
    repeated_cards = await page.eval_on_selector_all(
        "[class*=job] a[href], [class*=position] a[href], [class*=opening] a[href]",
        """
        (anchors) => anchors.map((anchor) => ({
          href: anchor.getAttribute('href') || '',
          text: (anchor.innerText || anchor.textContent || '').trim()
        }))
        """
    )

    for item in repeated_cards:
        href = str(item.get("href") or "").strip()
        text = str(item.get("text") or "").strip()
        if not href:
            continue
        absolute = normalize_url(href, base_url)
        links.append({"sourceUrl": absolute, "title": text or "Untitled Role", "location": None})

    deduped: dict[str, dict[str, str | None]] = {}
    for item in links:
        deduped[item["sourceUrl"]] = item

    return list(deduped.values())


async def discover_pagination_links(page: Page, base_url: str) -> list[str]:
    raw_links = await page.eval_on_selector_all(
        "a[href]",
        """
        (anchors) => anchors.map((anchor) => ({
          href: anchor.getAttribute('href') || '',
          text: (anchor.innerText || anchor.textContent || '').trim().toLowerCase()
        }))
        """
    )

    pagination_links: list[str] = []
    for item in raw_links:
        href = str(item.get("href") or "").strip()
        text = str(item.get("text") or "").strip().lower()
        if not href:
            continue
        if text == "next" or text == "next >" or re.fullmatch(r"\d+", text) or "page=" in href:
            pagination_links.append(normalize_url(href, base_url))

    return pagination_links


async def extract_job_details(
    context: BrowserContext,
    company: dict[str, Any],
    job_url: str,
    title_hint: str | None,
    location_hint: str | None
) -> dict[str, Any] | None:
    if not is_allowed_by_robots(job_url, logger):
        return None

    domain = urlparse(job_url).netloc
    await DOMAIN_RATE_LIMITER.async_wait(domain)

    page = await context.new_page()
    try:
        await page.goto(job_url, wait_until="domcontentloaded", timeout=45_000)

        title = (
            await page.text_content("h1")
            or await page.text_content("h2")
            or title_hint
            or "Untitled Role"
        )
        title = (title or "Untitled Role").strip()

        location = None
        for selector in (
            "[class*=location]",
            "[data-location]",
            "[class*=job-location]",
            "[class*=meta]"
        ):
            value = await page.text_content(selector)
            if value and LOCATION_HINT_RE.search(value):
                location = value.strip()
                break
        if not location:
            location = location_hint

        description = (
            await page.text_content("main")
            or await page.text_content("article")
            or await page.text_content("body")
            or ""
        )
        description = description.strip()

        requirements_match = re.search(
            r"(?:requirements?|qualifications?)\s*[:\-]?\s*(.{0,3500})",
            description,
            flags=re.IGNORECASE | re.DOTALL
        )
        requirements = requirements_match.group(1).strip() if requirements_match else ""

        is_h1b = detect_h1b_sponsorship(
            f"{description}\n{requirements}",
            default=bool(company.get("isSponsorsH1B", False))
        )

        return {
            "title": title,
            "location": location,
            "description": description,
            "requirements": requirements,
            "sourceUrl": normalize_url(page.url),
            "postedAt": datetime.utcnow(),
            "jobType": infer_job_type(title, description),
            "workMode": infer_work_mode(location, title, description),
            "isSponsorsH1B": is_h1b,
        }
    finally:
        await page.close()


async def scrape_career_page_jobs(company: dict[str, Any], max_listing_pages: int = 20) -> list[dict[str, Any]]:
    start_url = normalize_start_url(company["slug"])
    if not is_allowed_by_robots(start_url, logger):
        raise PermissionError(f"robots.txt disallowed base career URL for {company['name']}")

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(user_agent=USER_AGENT)
        listing_page = await context.new_page()

        queue: deque[str] = deque([start_url])
        visited: set[str] = set()
        candidate_jobs: dict[str, dict[str, str | None]] = {}

        while queue and len(visited) < max_listing_pages:
            current_url = queue.popleft()
            if current_url in visited:
                continue

            if not is_allowed_by_robots(current_url, logger):
                visited.add(current_url)
                continue

            domain = urlparse(current_url).netloc
            await DOMAIN_RATE_LIMITER.async_wait(domain)

            try:
                await listing_page.goto(current_url, wait_until="domcontentloaded", timeout=45_000)
            except PlaywrightError:
                visited.add(current_url)
                continue

            visited.add(current_url)

            for candidate in await discover_job_links(listing_page, current_url):
                candidate_jobs[candidate["sourceUrl"]] = candidate

            for link in await discover_pagination_links(listing_page, current_url):
                if link not in visited:
                    queue.append(link)

        jobs: list[dict[str, Any]] = []
        for source_url, hints in candidate_jobs.items():
            details = await extract_job_details(
                context,
                company,
                source_url,
                hints.get("title"),
                hints.get("location")
            )
            if details:
                jobs.append(details)

        await listing_page.close()
        await context.close()
        await browser.close()
        return jobs


def scrape_company(company: dict[str, Any]) -> dict[str, Any]:
    started = datetime.utcnow()
    try:
        jobs = asyncio.run(scrape_career_page_jobs(company))
        with get_session() as session:
            persisted = persist_jobs(
                session,
                company_name=company["name"],
                ats_type=AtsType.OTHER,
                jobs=jobs,
                default_is_sponsor=bool(company.get("isSponsorsH1B", False))
            )

        duration = int((datetime.utcnow() - started).total_seconds())
        result = {
            "company": company["name"],
            "atsType": "career_page",
            "status": "SUCCESS",
            "totalNew": persisted.new_count,
            "totalUpdated": persisted.updated_count,
            "totalExpired": persisted.expired_count,
            "durationSeconds": duration,
            "error": None
        }
        logger.info("Career page scrape success | %s | %s", company["name"], result)
        return result
    except Exception as exc:  # noqa: BLE001
        logger.exception("Career page scrape failed for %s", company["name"])
        duration = int((datetime.utcnow() - started).total_seconds())
        return {
            "company": company["name"],
            "atsType": "career_page",
            "status": "FAILED",
            "totalNew": 0,
            "totalUpdated": 0,
            "totalExpired": 0,
            "durationSeconds": duration,
            "error": str(exc)
        }


def scrape_all_career_pages(companies_path: str | None = None) -> list[dict[str, Any]]:
    companies = load_companies(None if companies_path is None else Path(companies_path))
    target_companies = [
        company
        for company in companies
        if str(company.get("atsType", "")).lower() == "career_page"
    ]

    logger.info("Starting career page scrape for %s companies", len(target_companies))
    results: list[dict[str, Any]] = []
    for company in target_companies:
        results.append(scrape_company(company))

    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape JS-rendered career pages with Playwright")
    parser.add_argument("--companies", help="Path to companies.json", default=None)
    args = parser.parse_args()

    results = scrape_all_career_pages(args.companies)
    success_count = sum(1 for item in results if item["status"] == "SUCCESS")
    failure_count = len(results) - success_count
    logger.info("Career page scraping complete | success=%s failure=%s", success_count, failure_count)


if __name__ == "__main__":
    main()
