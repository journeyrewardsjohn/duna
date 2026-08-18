from __future__ import annotations

import hmac
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from typing import Any
from urllib.parse import urljoin

import httpx
import uvicorn
from fastapi import FastAPI, Header, HTTPException, Response, status

from .config import Settings, get_settings
from .jobs import JobRegistry
from .model import OnnxVolleyballAnalyzer
from .pipeline import artifact_manifest, build_result
from .quality import load_verified_quality_gate
from .schemas import AnalysisCommand, QualityGate, WorkerResult, safe_failure_code
from .storage import PrivateVideoStorage

app = FastAPI(title="Duna Vision Worker", docs_url=None, redoc_url=None)
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="duna-vision-gpu")
_runtime_lock = Lock()
_runtime: dict[str, Any] = {}


def runtime() -> tuple[Settings, JobRegistry]:
    with _runtime_lock:
        if not _runtime:
            settings = get_settings()
            settings.work_dir.mkdir(parents=True, exist_ok=True)
            _runtime["settings"] = settings
            _runtime["jobs"] = JobRegistry(
                settings.job_db_path, settings.stale_job_seconds
            )
        return _runtime["settings"], _runtime["jobs"]


def model_runtime(settings: Settings) -> tuple[OnnxVolleyballAnalyzer, QualityGate]:
    with _runtime_lock:
        if "analyzer" not in _runtime:
            analyzer = OnnxVolleyballAnalyzer(
                settings.model_bundle, settings.target_fps
            )
            _runtime["analyzer"] = analyzer
            _runtime["quality_gate"] = load_verified_quality_gate(
                settings.promotion_attestation,
                settings.promotion_public_key,
                analyzer.bundle_sha256,
            )
        return _runtime["analyzer"], _runtime["quality_gate"]


def authorized(authorization: str | None, expected: str) -> bool:
    if not authorization or not authorization.lower().startswith("bearer "):
        return False
    return hmac.compare_digest(authorization[7:].strip(), expected)


def callback(
    settings: Settings, command: AnalysisCommand, result: WorkerResult
) -> None:
    url = urljoin(
        str(settings.control_plane_url).rstrip("/") + "/",
        command.callbackPath.lstrip("/"),
    )
    payload = result.model_dump(mode="json", exclude_none=True)
    last_error: Exception | None = None
    for attempt in range(settings.callback_attempts):
        try:
            response = httpx.post(
                url,
                json=payload,
                headers={
                    "authorization": f"Bearer {settings.worker_token}",
                    "x-request-id": f"vision-worker-{command.runId}",
                },
                timeout=30,
            )
            response.raise_for_status()
            return
        except (httpx.HTTPError, OSError) as error:
            last_error = error
            if attempt + 1 < settings.callback_attempts:
                time.sleep(min(2**attempt, 30))
    raise RuntimeError("CALLBACK_DELIVERY_FAILED") from last_error


def failure(command: AnalysisCommand, code: str) -> WorkerResult:
    return WorkerResult(
        runId=command.runId, status="failed", failureCode=safe_failure_code(code)
    )


def execute(command: AnalysisCommand) -> None:
    settings, jobs = runtime()
    run_dir = settings.work_dir / str(command.runId)
    result_path = run_dir / "result.json"
    try:
        if result_path.is_file():
            callback(
                settings,
                command,
                WorkerResult.model_validate_json(result_path.read_text()),
            )
            jobs.finish(str(command.runId), True)
            return
        run_dir.mkdir(parents=True, exist_ok=True)
        try:
            if not command.r2ObjectKey:
                result = failure(command, "SOURCE_REFERENCE_UNSUPPORTED")
            else:
                storage = PrivateVideoStorage(settings)
                source_path = run_dir / "source-video"
                source_provenance = storage.download(command.r2ObjectKey, source_path)
                analyzer, quality_gate = model_runtime(settings)
                output = analyzer.analyze(source_path, command.court)
                artifact_key = f"video-analysis/{command.videoId}/runs/{command.runId}/manifest.json"
                result = build_result(command, output, quality_gate, artifact_key)
                storage.upload_manifest(
                    artifact_key,
                    artifact_manifest(command, output, result, source_provenance),
                )
        # This is the per-job trust boundary: provider, decoder, model, and
        # validation failures all become one bounded callback contract.
        except Exception as error:  # noqa: BLE001
            result = failure(command, str(error))
        result_path.write_text(
            result.model_dump_json(exclude_none=True), encoding="utf-8"
        )
        callback(settings, command, result)
        jobs.finish(str(command.runId), True)
    # Delivery failures must release the durable claim so the cached result can
    # be retried without repeating GPU inference.
    except Exception as error:  # noqa: BLE001
        error_code = safe_failure_code(str(error))
        jobs.finish(str(command.runId), False, error_code)
    finally:
        source = run_dir / "source-video"
        if source.exists():
            source.unlink()


@app.get("/health")
def health() -> dict[str, str]:
    runtime()
    return {"status": "ok"}


@app.get("/ready")
def ready() -> dict[str, str]:
    settings, _ = runtime()
    try:
        analyzer, gate = model_runtime(settings)
        PrivateVideoStorage(settings)
    # Readiness collapses configuration and provider failures into a quiet 503
    # without exposing model paths or storage details.
    except Exception as error:
        raise HTTPException(status_code=503, detail="Worker is not ready") from error
    return {
        "status": "ready",
        "modelVersion": analyzer.manifest.modelVersion,
        "promotion": gate.decision,
    }


@app.post("/v1/analysis", status_code=status.HTTP_202_ACCEPTED)
def analyze(
    command: AnalysisCommand,
    response: Response,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    settings, jobs = runtime()
    if not authorized(authorization, settings.worker_token):
        raise HTTPException(status_code=401, detail="Unauthorized")
    claimed = jobs.claim(str(command.runId))
    if claimed:
        executor.submit(execute, command)
    response.headers["cache-control"] = "private, no-store"
    return {"accepted": True, "duplicate": not claimed, "runId": str(command.runId)}


def main() -> None:
    uvicorn.run(app, host="0.0.0.0", port=8080, access_log=False)
