from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Lock


class JobRegistry:
    """Persistent run-id claims prevent duplicate inference after dispatch retries."""

    def __init__(self, path: Path, stale_after_seconds: int) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.stale_after = timedelta(seconds=stale_after_seconds)
        self._lock = Lock()
        with self._connection() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    run_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    detail TEXT
                )
                """
            )

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        try:
            yield connection
        finally:
            connection.close()

    def claim(self, run_id: str) -> bool:
        now = datetime.now(UTC)
        with self._lock, self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT status, updated_at FROM jobs WHERE run_id = ?", (run_id,)
            ).fetchone()
            if row:
                updated = datetime.fromisoformat(row[1])
                if row[0] == "completed" or (
                    row[0] == "processing" and now - updated < self.stale_after
                ):
                    connection.execute("COMMIT")
                    return False
                connection.execute(
                    "UPDATE jobs SET status = 'processing', updated_at = ?, detail = NULL WHERE run_id = ?",
                    (now.isoformat(), run_id),
                )
            else:
                connection.execute(
                    "INSERT INTO jobs(run_id, status, updated_at) VALUES (?, 'processing', ?)",
                    (run_id, now.isoformat()),
                )
            connection.execute("COMMIT")
            return True

    def finish(self, run_id: str, completed: bool, detail: str | None = None) -> None:
        with self._lock, self._connection() as connection:
            connection.execute(
                "UPDATE jobs SET status = ?, updated_at = ?, detail = ? WHERE run_id = ?",
                (
                    "completed" if completed else "failed",
                    datetime.now(UTC).isoformat(),
                    detail,
                    run_id,
                ),
            )
