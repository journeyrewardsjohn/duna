from __future__ import annotations

import hmac
import os
from pathlib import Path
from typing import Any

import modal
from fastapi import FastAPI, Header, HTTPException, Response, status

SERVICE_DIR = Path(__file__).parent
app = modal.App("duna-vision")
image = modal.Image.from_dockerfile(
    SERVICE_DIR / "Dockerfile",
    context_dir=SERVICE_DIR,
    add_python="3.12",
)
operations_image = modal.Image.from_dockerfile(
    SERVICE_DIR / "Dockerfile.operations",
    context_dir=SERVICE_DIR,
)
runtime_secret = modal.Secret.from_name("duna-vision-runtime")
signer_secret = modal.Secret.from_name("duna-vision-signer")
state_volume = modal.Volume.from_name("duna-vision-state", create_if_missing=True)
model_volume = modal.Volume.from_name("duna-vision-models", create_if_missing=True)
state_env = {
    "DUNA_VISION_JOB_DB_PATH": "/state/jobs.sqlite3",
    "DUNA_VISION_WORK_DIR": "/state/work",
}


@app.function(
    image=image,
    gpu="L4",
    secrets=[runtime_secret],
    volumes={
        "/state": state_volume,
        "/models": model_volume,
    },
    min_containers=0,
    max_containers=1,
    scaledown_window=120,
    timeout=3_600,
    startup_timeout=600,
    env={"DUNA_VISION_MODEL_BUNDLE": "/models/active", **state_env},
)
@modal.asgi_app(label="duna-vision-worker")
def worker():
    from duna_vision_worker.app import app as fastapi_app

    return fastapi_app


@app.function(
    image=operations_image,
    gpu="L4",
    secrets=[runtime_secret],
    volumes={"/state": state_volume},
    env=state_env,
    timeout=21_600,
    startup_timeout=900,
    retries=1,
)
def training_job(command: dict[str, Any], provider_job_id: str) -> None:
    from duna_vision_worker.operations import run_training

    run_training(command, provider_job_id)


@app.function(
    image=operations_image,
    gpu="L4",
    secrets=[runtime_secret, signer_secret],
    volumes={"/state": state_volume},
    env=state_env,
    timeout=21_600,
    startup_timeout=900,
    retries=1,
)
def benchmark_job(command: dict[str, Any], provider_job_id: str) -> None:
    from duna_vision_worker.operations import run_benchmark

    run_benchmark(command, provider_job_id)


operations_api = FastAPI(title="Duna Vision Operations", docs_url=None, redoc_url=None)


def _authorized(authorization: str | None) -> bool:
    expected = os.environ.get("DUNA_ANALYSIS_WORKER_TOKEN", "")
    return bool(
        expected
        and authorization
        and authorization.lower().startswith("bearer ")
        and hmac.compare_digest(authorization[7:].strip(), expected)
    )


@operations_api.get("/health")
def operations_health() -> dict[str, str]:
    return {"status": "ok", "provider": "modal", "gpuType": "L4"}


@operations_api.post("/v1/operations", status_code=status.HTTP_202_ACCEPTED)
def dispatch_operation(
    command: dict[str, Any],
    response: Response,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    if not _authorized(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")
    from duna_vision_worker.operations import BenchmarkCommand, TrainingCommand

    kind = command.get("kind")
    if kind == "training":
        parsed = TrainingCommand.model_validate(command)
        provider_job_id = f"modal-training-{parsed.runId}"
        training_job.spawn(parsed.model_dump(mode="json"), provider_job_id)
    elif kind == "benchmark":
        parsed = BenchmarkCommand.model_validate(command)
        provider_job_id = f"modal-benchmark-{parsed.runId}"
        benchmark_job.spawn(parsed.model_dump(mode="json"), provider_job_id)
    else:
        raise HTTPException(status_code=422, detail="Unsupported operation")
    response.headers["cache-control"] = "private, no-store"
    return {"accepted": True, "providerJobId": provider_job_id}


@app.function(
    image=image,
    secrets=[runtime_secret],
    min_containers=0,
    max_containers=2,
    scaledown_window=60,
    timeout=120,
)
@modal.asgi_app(label="duna-vision-operations")
def operations():
    return operations_api
