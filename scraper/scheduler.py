import time
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

from scraper.common import setup_logging
from scraper.db import ScraperRunStatus, create_scraper_log, fetch_scraper_settings, get_session
from scraper.job_queue import run_full_scrape_batch

logger = setup_logging("scraper.scheduler")


class ScrapeScheduler:
    def __init__(self) -> None:
        self.scheduler = BackgroundScheduler(timezone="UTC")
        self.scrape_job_id = "jobfill-full-scrape"
        self.refresh_job_id = "jobfill-refresh-config"
        self._current_interval_hours: int | None = None

    def _sync_config(self) -> None:
        with get_session() as session:
            settings = fetch_scraper_settings(session)

        scrape_job = self.scheduler.get_job(self.scrape_job_id)

        if not settings.scraper_enabled:
            if scrape_job and scrape_job.next_run_time is not None:
                logger.info("scraperEnabled=false -> pausing scheduled scrapes")
                self.scheduler.pause_job(self.scrape_job_id)
            return

        if scrape_job is None:
            logger.info(
                "Adding scrape schedule job with interval=%s hours",
                settings.scraper_interval_hours
            )
            self.scheduler.add_job(
                self._run_full_scrape,
                trigger="interval",
                hours=settings.scraper_interval_hours,
                id=self.scrape_job_id,
                max_instances=1,
                coalesce=True,
                next_run_time=datetime.utcnow()
            )
            self._current_interval_hours = settings.scraper_interval_hours
            return

        if scrape_job.next_run_time is None:
            logger.info("Resuming scrape scheduler")
            self.scheduler.resume_job(self.scrape_job_id)

        if self._current_interval_hours != settings.scraper_interval_hours:
            logger.info(
                "Rescheduling scrape job interval from %s to %s hours",
                self._current_interval_hours,
                settings.scraper_interval_hours
            )
            self.scheduler.reschedule_job(
                self.scrape_job_id,
                trigger="interval",
                hours=settings.scraper_interval_hours
            )
            self._current_interval_hours = settings.scraper_interval_hours

    def _run_full_scrape(self) -> None:
        started_at = time.monotonic()
        logger.info("Starting scheduled full scrape")

        errors: list[str] = []
        total_new = 0
        total_updated = 0
        total_expired = 0

        try:
            results = run_full_scrape_batch(wait=True)
            for item in results:
                total_new += int(item.get("totalNew", 0))
                total_updated += int(item.get("totalUpdated", 0))
                total_expired += int(item.get("totalExpired", 0))
                if item.get("status") != "SUCCESS":
                    company_name = item.get("company", "Unknown")
                    errors.append(f"{company_name}: {item.get('error', 'Unknown error')}")
        except Exception as exc:  # noqa: BLE001
            errors.append(str(exc))

        duration = int(time.monotonic() - started_at)
        if not errors:
            status = ScraperRunStatus.SUCCESS
        elif total_new + total_updated > 0:
            status = ScraperRunStatus.PARTIAL
        else:
            status = ScraperRunStatus.FAILED

        error_log = "\n".join(errors[:1000]) if errors else None

        with get_session() as session:
            create_scraper_log(
                session,
                status=status,
                total_new=total_new,
                total_updated=total_updated,
                total_expired=total_expired,
                duration_seconds=duration,
                error_log=error_log
            )

        logger.info(
            "Scheduled scrape finished | status=%s new=%s updated=%s expired=%s duration=%ss",
            status.value,
            total_new,
            total_updated,
            total_expired,
            duration
        )

    def start(self) -> None:
        self.scheduler.add_job(
            self._sync_config,
            trigger="interval",
            minutes=1,
            id=self.refresh_job_id,
            max_instances=1,
            coalesce=True,
            next_run_time=datetime.utcnow()
        )
        self._sync_config()
        self.scheduler.start()
        logger.info("Scraper scheduler started")

        try:
            while True:
                time.sleep(30)
        except KeyboardInterrupt:
            logger.info("Scheduler shutdown requested")
            self.scheduler.shutdown(wait=False)


def main() -> None:
    scheduler = ScrapeScheduler()
    scheduler.start()


if __name__ == "__main__":
    main()
