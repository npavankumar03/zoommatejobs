# JobFill AI Scraper

This package handles job ingestion from Greenhouse, Lever, and JS-rendered career pages.

## Modules

- `greenhouse.py`: pulls jobs from `boards-api.greenhouse.io`, parses fields, runs H1B detection, and writes to `Job`.
- `lever.py`: pulls jobs from `api.lever.co`, parses fields, runs H1B detection, and writes to `Job`.
- `career_page_scraper.py`: Playwright scraper for custom career pages with pagination + job link heuristics.
- `h1b_detector.py`: detects sponsorship signals from job text.
- `job_queue.py`: Celery queue integration (Redis broker/back end), retries, and per-company logging.
- `scheduler.py`: APScheduler loop that reads `AdminSettings` and runs full queue batches.
- `db.py`: SQLAlchemy models + persistence helpers for `Job`, `AdminSettings`, and `ScraperLog`.
- `common.py`: shared logging, robots.txt checks, rate limiting, HTTP client, and company list loading.
- `companies.json`: 100 target companies with ATS type, slug, and sponsorship hint.

## Runtime Requirements

- `DATABASE_URL` pointing to the JobFill PostgreSQL database.
- `REDIS_URL` for Celery queue and result backend.
- Playwright Chromium installed for career page scraping.

## Typical Commands

```bash
# Run direct ATS scrapers
python -m scraper.greenhouse
python -m scraper.lever
python -m scraper.career_page_scraper

# Start Celery workers (5 concurrency)
celery -A scraper.job_queue.celery_app worker --concurrency=5

# Queue one full batch
python -m scraper.job_queue

# Start periodic scheduler (reads AdminSettings flags/interval)
python -m scraper.scheduler
```
