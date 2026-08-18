from pathlib import Path

from duna_vision_worker.jobs import JobRegistry


def test_job_claims_are_idempotent_and_failed_delivery_can_retry(
    tmp_path: Path,
) -> None:
    registry = JobRegistry(tmp_path / "jobs.sqlite3", stale_after_seconds=300)
    assert registry.claim("run-1") is True
    assert registry.claim("run-1") is False
    registry.finish("run-1", completed=False, detail="callback")
    assert registry.claim("run-1") is True
    registry.finish("run-1", completed=True)
    assert registry.claim("run-1") is False
