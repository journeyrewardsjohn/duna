from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urljoin
from uuid import NAMESPACE_URL, UUID, uuid5

import httpx
from pydantic import BaseModel, Field, model_validator

from .config import Settings, get_settings
from .model import OnnxVolleyballAnalyzer
from .pipeline import build_events
from .quality import sha256_bundle, sha256_file
from .schemas import AnalysisCommand, CourtMap, safe_failure_code
from .storage import PrivateVideoStorage
from .validation import evaluate, signed_envelope


class TrainingCommand(BaseModel):
    kind: Literal["training"]
    runId: UUID
    requestedModelVersion: str = Field(min_length=3, max_length=80)
    datasetR2Key: str = Field(
        pattern=r"^vision-training/datasets/[a-zA-Z0-9_./-]+\.zip$"
    )
    baseModelVersion: str | None = Field(default=None, max_length=80)
    baseModelBundleR2Prefix: str | None = Field(
        default=None, pattern=r"^vision-models/[a-zA-Z0-9_./-]+/$"
    )
    codeCommitSha: str = Field(pattern=r"^[a-f0-9]{7,64}$")
    budgetCents: int = Field(ge=100, le=100_000)
    callbackPath: Literal["/api/vision/operations"]


class BenchmarkCommand(BaseModel):
    kind: Literal["benchmark"]
    runId: UUID
    modelId: UUID
    modelVersion: str = Field(min_length=1, max_length=80)
    modelBundleR2Prefix: str = Field(pattern=r"^vision-models/[a-zA-Z0-9_./-]+/$")
    benchmarkId: str = Field(min_length=3, max_length=120)
    datasetManifestR2Key: str = Field(
        pattern=r"^vision-benchmarks/[a-zA-Z0-9_./-]+\.json$"
    )
    callbackPath: Literal["/api/vision/operations"]


class TrainingRecord(BaseModel):
    image: str = Field(min_length=1, max_length=500)
    split: Literal["train2017", "val2017"]
    sourceVideoId: UUID
    consentRecordId: UUID
    annotationReviewerIds: list[UUID] = Field(min_length=2, max_length=10)

    @model_validator(mode="after")
    def independent_reviewers(self) -> TrainingRecord:
        if len(set(self.annotationReviewerIds)) < 2:
            raise ValueError("Each annotation needs two independent reviewers")
        return self


class TrainingDatasetManifest(BaseModel):
    schemaVersion: Literal["duna-vision-training-v1"]
    kind: Literal["private-consented-real-match"]
    sourceLicense: str = Field(min_length=3, max_length=160)
    records: list[TrainingRecord] = Field(min_length=20, max_length=100_000)
    epochs: int = Field(default=40, ge=5, le=120)
    batchSize: int = Field(default=8, ge=1, le=32)


def _safe_relative(value: str) -> Path:
    candidate = Path(value)
    if candidate.is_absolute() or not candidate.parts or ".." in candidate.parts:
        raise ValueError("DATASET_PATH_INVALID")
    return candidate


def _safe_extract(archive_path: Path, destination: Path) -> None:
    maximum_files = 250_000
    maximum_bytes = 25 * 1024 * 1024 * 1024
    with zipfile.ZipFile(archive_path) as archive:
        members = archive.infolist()
        if len(members) > maximum_files:
            raise ValueError("DATASET_ARCHIVE_TOO_MANY_FILES")
        if sum(member.file_size for member in members) > maximum_bytes:
            raise ValueError("DATASET_ARCHIVE_TOO_LARGE")
        for member in members:
            relative = _safe_relative(member.filename)
            if member.is_dir():
                continue
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)


def _load_coco(path: Path, split: str) -> tuple[set[str], int]:
    document = json.loads(path.read_text(encoding="utf-8"))
    categories = document.get("categories")
    if not isinstance(categories, list) or len(categories) != 1:
        raise ValueError(f"{split.upper()}_CATEGORY_CONTRACT_INVALID")
    category = categories[0]
    if str(category.get("name", "")).lower() not in {"ball", "volleyball"}:
        raise ValueError(f"{split.upper()}_BALL_CATEGORY_MISSING")
    images = document.get("images")
    annotations = document.get("annotations")
    if not isinstance(images, list) or not isinstance(annotations, list):
        raise TypeError(f"{split.upper()}_COCO_INVALID")
    names = {str(image.get("file_name", "")) for image in images}
    if "" in names or not names or not annotations:
        raise ValueError(f"{split.upper()}_COCO_EMPTY")
    return names, len(annotations)


def _validate_training_dataset(
    root: Path,
) -> tuple[TrainingDatasetManifest, dict[str, int]]:
    manifest_path = root / "dataset-manifest.json"
    manifest = TrainingDatasetManifest.model_validate_json(
        manifest_path.read_text(encoding="utf-8")
    )
    coco_root = root / "COCO"
    train_names, train_annotations = _load_coco(
        coco_root / "annotations" / "instances_train2017.json", "train"
    )
    val_names, val_annotations = _load_coco(
        coco_root / "annotations" / "instances_val2017.json", "validation"
    )
    records = {(record.split, record.image) for record in manifest.records}
    expected = {("train2017", name) for name in train_names} | {
        ("val2017", name) for name in val_names
    }
    if records != expected:
        raise ValueError("DATASET_CONSENT_LEDGER_INCOMPLETE")
    for split, image in expected:
        target = coco_root / split / _safe_relative(image)
        if not target.is_file() or target.stat().st_size == 0:
            raise ValueError("DATASET_IMAGE_MISSING")
    if len(train_names) < 16 or len(val_names) < 4:
        raise ValueError("DATASET_SPLIT_TOO_SMALL")
    return manifest, {
        "trainImages": len(train_names),
        "validationImages": len(val_names),
        "trainAnnotations": train_annotations,
        "validationAnnotations": val_annotations,
    }


def _callback(
    command: TrainingCommand | BenchmarkCommand, result: dict[str, Any]
) -> None:
    settings = get_settings()
    url = urljoin(
        str(settings.control_plane_url).rstrip("/") + "/",
        command.callbackPath.lstrip("/"),
    )
    last_error: Exception | None = None
    for attempt in range(settings.callback_attempts):
        try:
            response = httpx.post(
                url,
                json=result,
                headers={
                    "authorization": f"Bearer {settings.worker_token}",
                    "x-request-id": f"vision-operation-{command.runId}",
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


def _result_path(settings: Settings, run_id: UUID) -> Path:
    return settings.work_dir / "operations" / str(run_id) / "result.json"


def _deliver_cached(command: TrainingCommand | BenchmarkCommand) -> bool:
    path = _result_path(get_settings(), command.runId)
    if not path.is_file():
        return False
    _callback(command, json.loads(path.read_text(encoding="utf-8")))
    return True


def _finish(
    command: TrainingCommand | BenchmarkCommand, result: dict[str, Any]
) -> None:
    path = _result_path(get_settings(), command.runId)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, sort_keys=True), encoding="utf-8")
    _callback(command, result)


def _failed(kind: str, run_id: UUID, error: Exception) -> dict[str, Any]:
    return {
        "kind": kind,
        "runId": str(run_id),
        "status": "failed",
        "failureCode": safe_failure_code(str(error)),
    }


def run_training(payload: dict[str, Any], provider_job_id: str) -> None:
    command = TrainingCommand.model_validate(payload)
    if _deliver_cached(command):
        return
    settings = get_settings()
    storage = PrivateVideoStorage(settings)
    run_dir = _result_path(settings, command.runId).parent
    dataset_zip = run_dir / "dataset.zip"
    dataset_root = run_dir / "dataset"
    bundle = run_dir / "bundle"
    started = time.monotonic()
    try:
        run_dir.mkdir(parents=True, exist_ok=True)
        storage.download_object(command.datasetR2Key, dataset_zip)
        _safe_extract(dataset_zip, dataset_root)
        manifest, counts = _validate_training_dataset(dataset_root)
        checkpoint = Path("/opt/YOLOX/yolox_s.pth")
        if command.baseModelBundleR2Prefix:
            base_bundle = run_dir / "base-model"
            storage.download_prefix(command.baseModelBundleR2Prefix, base_bundle)
            checkpoint = base_bundle / "training-checkpoint.pth"
            if not checkpoint.is_file():
                raise FileNotFoundError("BASE_TRAINING_CHECKPOINT_MISSING")
        maximum_seconds = max(
            900,
            min(
                21_600,
                round(command.budgetCents / settings.l4_cents_per_hour * 3_600),
            ),
        )
        output_dir = run_dir / "training-output"
        environment = {
            **os.environ,
            "DUNA_TRAIN_DATA_DIR": str(dataset_root / "COCO"),
            "DUNA_TRAIN_EPOCHS": str(manifest.epochs),
            "DUNA_TRAIN_WORKERS": "4",
        }
        with (run_dir / "training.log").open("w", encoding="utf-8") as log:
            subprocess.run(
                [
                    sys.executable,
                    "/opt/YOLOX/tools/train.py",
                    "-f",
                    "/opt/duna-vision/src/duna_vision_worker/training_exp.py",
                    "-d",
                    "1",
                    "-b",
                    str(manifest.batchSize),
                    "--fp16",
                    "-o",
                    "-c",
                    str(checkpoint),
                    "--output_dir",
                    str(output_dir),
                ],
                check=True,
                cwd="/opt/YOLOX",
                env=environment,
                stdout=log,
                stderr=subprocess.STDOUT,
                timeout=maximum_seconds,
            )
            best = output_dir / "duna_yolox_s_ball" / "best_ckpt.pth"
            if not best.is_file():
                raise FileNotFoundError("TRAINING_CHECKPOINT_MISSING")
            bundle.mkdir(parents=True, exist_ok=True)
            subprocess.run(
                [
                    sys.executable,
                    "/opt/YOLOX/tools/export_onnx.py",
                    "--output-name",
                    str(bundle / "detector.onnx"),
                    "-f",
                    "/opt/duna-vision/src/duna_vision_worker/training_exp.py",
                    "-c",
                    str(best),
                    "--opset",
                    "13",
                ],
                check=True,
                cwd="/opt/YOLOX",
                env=environment,
                stdout=log,
                stderr=subprocess.STDOUT,
                timeout=900,
            )
            shutil.copy2(best, bundle / "training-checkpoint.pth")
        model_manifest = {
            "contractVersion": "duna-volleyball-onnx-v1",
            "modelVersion": command.requestedModelVersion,
            "detector": {
                "path": "detector.onnx",
                "inputName": "images",
                "outputName": "output",
                "format": "yolox-v1",
                "inputWidth": 640,
                "inputHeight": 640,
                "labels": {"ball": 0},
                "confidenceThreshold": 0.3,
                "batchSize": 1,
                "nmsThreshold": 0.45,
                "strides": [8, 16, 32],
            },
            "temporal": {
                "path": "",
                "inputName": "",
                "outputName": "",
                "mode": "trajectory-heuristic-v1",
                "windowFrames": 9,
                "labels": ["none", "free-ball"],
                "confidenceThreshold": 0.72,
                "debounceMilliseconds": 420,
            },
            "training": {
                "datasetManifestSha256": sha256_file(
                    dataset_root / "dataset-manifest.json"
                ),
                "codeCommitSha": command.codeCommitSha,
                "baseModelVersion": command.baseModelVersion,
                "epochs": manifest.epochs,
                **counts,
            },
        }
        (bundle / "manifest.json").write_text(
            json.dumps(model_manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        bundle_sha = sha256_bundle(bundle)
        prefix = f"vision-models/{command.requestedModelVersion}/{bundle_sha}/"
        storage.upload_file(
            prefix + "detector.onnx",
            bundle / "detector.onnx",
            "application/octet-stream",
            "vision-model-detector-v1",
        )
        storage.upload_file(
            prefix + "training-checkpoint.pth",
            bundle / "training-checkpoint.pth",
            "application/octet-stream",
            "vision-model-training-checkpoint-v1",
        )
        storage.upload_json(
            prefix + "manifest.json", model_manifest, "vision-model-manifest-v1"
        )
        elapsed = time.monotonic() - started
        actual_cost = min(
            command.budgetCents,
            max(1, round(elapsed / 3_600 * settings.l4_cents_per_hour)),
        )
        _finish(
            command,
            {
                "kind": "training",
                "runId": str(command.runId),
                "status": "succeeded",
                "providerJobId": provider_job_id,
                "actualCostCents": actual_cost,
                "model": {
                    "version": command.requestedModelVersion,
                    "bundleSha256": bundle_sha,
                    "bundleR2Prefix": prefix,
                    "detectorFamily": "YOLOX-S",
                    "sourceLicense": (
                        f"Apache-2.0 model; dataset: {manifest.sourceLicense}"
                    )[:80],
                    "manifest": model_manifest,
                    "metrics": {
                        **counts,
                        "epochs": manifest.epochs,
                        "gpuSeconds": round(elapsed),
                    },
                },
            },
        )
    except Exception as error:  # noqa: BLE001
        _finish(command, _failed("training", command.runId, error))
    finally:
        if dataset_zip.exists():
            dataset_zip.unlink()


def _download_benchmark_assets(
    storage: PrivateVideoStorage, manifest_key: str, root: Path
) -> tuple[dict[str, Any], str]:
    manifest_path = root / "benchmark-original.json"
    storage.download_object(manifest_key, manifest_path)
    manifest_sha = sha256_file(manifest_path)
    document = json.loads(manifest_path.read_text(encoding="utf-8"))
    prefix = manifest_key.rsplit("/", 1)[0] + "/"
    for clip in document.get("clips", []):
        for field in ("sourcePath", "truthPath"):
            relative = _safe_relative(str(clip[field]))
            storage.download_object(prefix + relative.as_posix(), root / relative)
    return document, manifest_sha


def _generate_predictions(document: dict[str, Any], root: Path, bundle: Path) -> None:
    analyzer = OnnxVolleyballAnalyzer(bundle, get_settings().target_fps)
    for index, clip in enumerate(document.get("clips", [])):
        if not isinstance(clip.get("court"), dict):
            raise TypeError("BENCHMARK_COURT_MAP_REQUIRED")
        court = CourtMap.model_validate(clip["court"])
        source = root / _safe_relative(str(clip["sourcePath"]))
        output = analyzer.analyze(source, court)
        run_id = uuid5(
            NAMESPACE_URL, f"duna-benchmark:{clip['id']}:{analyzer.bundle_sha256}"
        )
        command = AnalysisCommand.model_validate(
            {
                "runId": str(run_id),
                "videoId": str(
                    uuid5(NAMESPACE_URL, f"duna-benchmark-video:{clip['id']}")
                ),
                "r2ObjectKey": "benchmark/private-source",
                "court": court.model_dump(mode="json"),
                "callbackPath": "/api/video/analysis",
            }
        )
        prediction = {
            "schemaVersion": "duna-vision-benchmark-prediction-v1",
            "modelVersion": output.modelVersion,
            "modelBundleSha256": output.modelBundleSha256,
            "coverage": {
                "sampledDurationUs": output.sampledDurationUs,
                "usableDurationUs": output.usableDurationUs,
            },
            "diagnostics": output.diagnostics,
            "events": [
                event.model_dump(mode="json", exclude_none=True)
                for event in build_events(command, output)
            ],
        }
        relative = Path("generated") / f"{index:04d}.json"
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(prediction, sort_keys=True), encoding="utf-8")
        clip["predictionPath"] = relative.as_posix()
        clip["predictionSha256"] = sha256_file(target)


def run_benchmark(payload: dict[str, Any], provider_job_id: str) -> None:
    command = BenchmarkCommand.model_validate(payload)
    if _deliver_cached(command):
        return
    settings = get_settings()
    storage = PrivateVideoStorage(settings)
    run_dir = _result_path(settings, command.runId).parent
    bundle = run_dir / "model"
    benchmark_root = run_dir / "benchmark"
    try:
        run_dir.mkdir(parents=True, exist_ok=True)
        storage.download_prefix(command.modelBundleR2Prefix, bundle)
        document, original_manifest_sha = _download_benchmark_assets(
            storage, command.datasetManifestR2Key, benchmark_root
        )
        if document.get("benchmarkId") != command.benchmarkId:
            raise ValueError("BENCHMARK_ID_MISMATCH")
        _generate_predictions(document, benchmark_root, bundle)
        evaluation_manifest = benchmark_root / "benchmark-evaluated.json"
        evaluation_manifest.write_text(
            json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        gate = evaluate(evaluation_manifest, bundle).model_copy(
            update={"datasetManifestSha256": original_manifest_sha}
        )
        signer_path = settings.attestation_private_key
        temporary_signer = False
        if not signer_path and settings.attestation_private_key_pem:
            signer_path = Path(f"/tmp/duna-vision-signer-{command.runId}.pem")
            signer_path.write_text(
                settings.attestation_private_key_pem, encoding="utf-8"
            )
            signer_path.chmod(0o600)
            temporary_signer = True
        if not signer_path:
            raise RuntimeError("ATTESTATION_SIGNING_KEY_UNAVAILABLE")
        try:
            envelope = signed_envelope(gate, signer_path)
        finally:
            if temporary_signer and signer_path.exists():
                signer_path.unlink()
        bundle_sha = sha256_bundle(bundle)
        attestation_key = (
            f"vision-models/{command.modelVersion}/"
            f"{bundle_sha}.{command.benchmarkId}.attestation.json"
        )
        storage.upload_json(
            attestation_key, envelope, "vision-promotion-attestation-v1"
        )
        _finish(
            command,
            {
                "kind": "benchmark",
                "runId": str(command.runId),
                "status": "passed" if gate.productionEligible else "failed",
                "providerJobId": provider_job_id,
                "failureCode": None
                if gate.productionEligible
                else "QUALITY_GATE_FAILED",
                "qualityGate": gate.model_dump(mode="json", exclude_none=True),
                "attestationR2Key": attestation_key
                if gate.productionEligible
                else None,
            },
        )
    except Exception as error:  # noqa: BLE001
        _finish(command, _failed("benchmark", command.runId, error))
