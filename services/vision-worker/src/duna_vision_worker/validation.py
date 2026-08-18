from __future__ import annotations

import argparse
import base64
import json
import math
import subprocess
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from pydantic import BaseModel, Field, model_validator

from .quality import canonical_json, sha256_bundle, sha256_file
from .schemas import QualityGate, QualityMetrics


class BenchmarkThresholds(BaseModel):
    minimumClipCount: int = Field(default=20, ge=1)
    minimumContactCount: int = Field(default=100, ge=1)
    minimumRallyCount: int = Field(default=40, ge=1)
    minimumLandingCount: int = Field(default=40, ge=1)
    contactF1: float = Field(ge=0, le=1)
    rallyF1: float = Field(ge=0, le=1)
    landingF1: float = Field(ge=0, le=1)
    maximumLandingErrorP95Meters: float = Field(gt=0)
    maximumCourtErrorP95Pixels: float = Field(gt=0)
    maximumFalseEventsPerMinute: float = Field(ge=0)
    minimumUsableCoverageRatio: float = Field(ge=0, le=1)
    eventToleranceMilliseconds: int = Field(default=500, ge=50, le=3000)
    requiredSlices: dict[str, int] = Field(default_factory=dict)
    minimumSliceContactF1: float = Field(default=0.70, ge=0, le=1)
    minimumSliceContactCount: int = Field(default=10, ge=1)


class BenchmarkClip(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    sourcePath: str
    truthPath: str
    predictionPath: str
    durationUs: int = Field(gt=0, le=43_200_000_000)
    sourceSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    truthSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    predictionSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    slices: list[str] = Field(min_length=1)
    consentRecordId: str | None = None
    annotationReviewerIds: list[str] = Field(min_length=2)

    @model_validator(mode="after")
    def independent_reviewers(self) -> BenchmarkClip:
        if len(set(self.annotationReviewerIds)) < 2:
            raise ValueError(
                "At least two independent annotation reviewers are required"
            )
        return self


class BenchmarkManifest(BaseModel):
    schemaVersion: str
    benchmarkId: str = Field(min_length=1, max_length=120)
    kind: Literal["private-real-match-held-out", "synthetic"]
    clips: list[BenchmarkClip]
    thresholds: BenchmarkThresholds

    @model_validator(mode="after")
    def supported_contract(self) -> BenchmarkManifest:
        if self.schemaVersion != "duna-vision-benchmark-v1":
            raise ValueError("Unsupported benchmark manifest")
        return self


@dataclass(frozen=True)
class Event:
    event_type: str
    time_us: int
    contact_kind: str | None
    point: tuple[float, float] | None


@dataclass(frozen=True)
class Counts:
    true_positive: int
    false_positive: int
    false_negative: int
    errors: tuple[float, ...] = ()

    @property
    def f1(self) -> float:
        denominator = 2 * self.true_positive + self.false_positive + self.false_negative
        return 1.0 if denominator == 0 else 2 * self.true_positive / denominator


def percentile(values: Iterable[float], quantile: float) -> float | None:
    ordered = sorted(values)
    if not ordered:
        return None
    index = max(0, min(len(ordered) - 1, math.ceil(quantile * len(ordered)) - 1))
    return ordered[index]


def read_events(path: Path) -> tuple[list[Event], dict[str, Any]]:
    document = json.loads(path.read_text(encoding="utf-8"))
    events = []
    for item in document.get("events", []):
        point = item.get("courtPoint")
        events.append(
            Event(
                event_type=item["eventType"],
                time_us=int(item["sessionTimeUs"]),
                contact_kind=item.get("payload", {}).get("contactKind"),
                point=(float(point["xMeters"]), float(point["yMeters"]))
                if point
                else None,
            )
        )
    return events, document


def probe_video_duration_us(path: Path) -> int:
    try:
        completed = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        seconds = float(json.loads(completed.stdout)["format"]["duration"])
    except (
        FileNotFoundError,
        KeyError,
        ValueError,
        subprocess.SubprocessError,
    ) as error:
        raise ValueError(
            f"Source video is not independently decodable: {path.name}"
        ) from error
    return round(seconds * 1_000_000)


def event_matches(expected: Event, actual: Event) -> bool:
    return expected.event_type == actual.event_type and (
        expected.event_type != "ball-contact"
        or expected.contact_kind == actual.contact_kind
    )


def compare_events(
    expected: list[Event], actual: list[Event], tolerance_us: int
) -> Counts:
    candidates: list[tuple[int, int, int]] = []
    for expected_index, expected_event in enumerate(expected):
        for actual_index, actual_event in enumerate(actual):
            delta = abs(expected_event.time_us - actual_event.time_us)
            if delta <= tolerance_us and event_matches(expected_event, actual_event):
                candidates.append((delta, expected_index, actual_index))
    matched_expected: set[int] = set()
    matched_actual: set[int] = set()
    errors: list[float] = []
    for _, expected_index, actual_index in sorted(candidates):
        if expected_index in matched_expected or actual_index in matched_actual:
            continue
        matched_expected.add(expected_index)
        matched_actual.add(actual_index)
        left = expected[expected_index].point
        right = actual[actual_index].point
        if left and right:
            errors.append(math.dist(left, right))
    return Counts(
        true_positive=len(matched_expected),
        false_positive=len(actual) - len(matched_actual),
        false_negative=len(expected) - len(matched_expected),
        errors=tuple(errors),
    )


def merge_counts(values: Iterable[Counts]) -> Counts:
    items = list(values)
    return Counts(
        sum(item.true_positive for item in items),
        sum(item.false_positive for item in items),
        sum(item.false_negative for item in items),
        tuple(error for item in items for error in item.errors),
    )


def evaluate(manifest_path: Path, model_bundle: Path) -> QualityGate:
    manifest = BenchmarkManifest.model_validate_json(
        manifest_path.read_text(encoding="utf-8")
    )
    root = manifest_path.parent
    model_sha = sha256_bundle(model_bundle)
    tolerance_us = manifest.thresholds.eventToleranceMilliseconds * 1000
    clip_results: list[dict[str, Any]] = []
    for clip in manifest.clips:
        truth_path = root / clip.truthPath
        prediction_path = root / clip.predictionPath
        source_path = root / clip.sourcePath
        if sha256_file(source_path) != clip.sourceSha256:
            raise ValueError(f"Source digest mismatch for {clip.id}")
        if manifest.kind == "private-real-match-held-out":
            probed_duration_us = probe_video_duration_us(source_path)
            duration_tolerance_us = max(1_000_000, round(clip.durationUs * 0.01))
            if abs(probed_duration_us - clip.durationUs) > duration_tolerance_us:
                raise ValueError(f"Source duration mismatch for {clip.id}")
        if sha256_file(truth_path) != clip.truthSha256:
            raise ValueError(f"Truth digest mismatch for {clip.id}")
        if sha256_file(prediction_path) != clip.predictionSha256:
            raise ValueError(f"Prediction digest mismatch for {clip.id}")
        truth, _ = read_events(truth_path)
        prediction, artifact = read_events(prediction_path)
        if artifact.get("modelBundleSha256") != model_sha:
            raise ValueError(f"Prediction model digest mismatch for {clip.id}")
        groups: dict[str, Counts] = {}
        for name, event_type in (
            ("contact", "ball-contact"),
            ("rally", "rally-started"),
            ("landing", "ball-landing"),
        ):
            groups[name] = compare_events(
                [event for event in truth if event.event_type == event_type],
                [event for event in prediction if event.event_type == event_type],
                tolerance_us,
            )
        coverage = artifact.get("coverage", {})
        sampled = int(coverage.get("sampledDurationUs") or clip.durationUs)
        usable = int(coverage.get("usableDurationUs") or 0)
        clip_results.append(
            {
                "clip": clip,
                "groups": groups,
                "coverage": usable / sampled if sampled else 0.0,
                "courtError": artifact.get("diagnostics", {}).get(
                    "courtCalibrationMedianErrorPixels"
                ),
            }
        )

    contacts = merge_counts(item["groups"]["contact"] for item in clip_results)
    rallies = merge_counts(item["groups"]["rally"] for item in clip_results)
    landings = merge_counts(item["groups"]["landing"] for item in clip_results)
    total_minutes = sum(clip.durationUs for clip in manifest.clips) / 60_000_000
    false_events = (
        contacts.false_positive + rallies.false_positive + landings.false_positive
    )
    metrics = QualityMetrics(
        contactF1=contacts.f1,
        rallyF1=rallies.f1,
        landingF1=landings.f1,
        landingErrorP95Meters=percentile(landings.errors, 0.95),
        courtErrorP95Pixels=percentile(
            (
                float(item["courtError"])
                for item in clip_results
                if item["courtError"] is not None
            ),
            0.95,
        ),
        falseEventsPerMinute=false_events / total_minutes if total_minutes else 0,
        usableCoverageRatio=sum(float(item["coverage"]) for item in clip_results)
        / len(clip_results)
        if clip_results
        else 0,
    )
    threshold = manifest.thresholds
    failed: list[str] = []
    if manifest.kind != "private-real-match-held-out":
        failed.append("dataset_is_not_private_real_match_held_out")
    if len(manifest.clips) < threshold.minimumClipCount:
        failed.append("minimum_clip_count")
    expected_contact_count = sum(
        item["groups"]["contact"].true_positive
        + item["groups"]["contact"].false_negative
        for item in clip_results
    )
    expected_rally_count = sum(
        item["groups"]["rally"].true_positive + item["groups"]["rally"].false_negative
        for item in clip_results
    )
    expected_landing_count = sum(
        item["groups"]["landing"].true_positive
        + item["groups"]["landing"].false_negative
        for item in clip_results
    )
    if expected_contact_count < threshold.minimumContactCount:
        failed.append("minimum_contact_count")
    if expected_rally_count < threshold.minimumRallyCount:
        failed.append("minimum_rally_count")
    if expected_landing_count < threshold.minimumLandingCount:
        failed.append("minimum_landing_count")
    if any(not clip.consentRecordId for clip in manifest.clips):
        failed.append("missing_validation_consent_record")
    checks = {
        "contact_f1": (metrics.contactF1 or 0) >= threshold.contactF1,
        "rally_f1": (metrics.rallyF1 or 0) >= threshold.rallyF1,
        "landing_f1": (metrics.landingF1 or 0) >= threshold.landingF1,
        "landing_error_p95": metrics.landingErrorP95Meters is not None
        and metrics.landingErrorP95Meters <= threshold.maximumLandingErrorP95Meters,
        "court_error_p95": metrics.courtErrorP95Pixels is not None
        and metrics.courtErrorP95Pixels <= threshold.maximumCourtErrorP95Pixels,
        "false_events_per_minute": (metrics.falseEventsPerMinute or 0)
        <= threshold.maximumFalseEventsPerMinute,
        "usable_coverage": (metrics.usableCoverageRatio or 0)
        >= threshold.minimumUsableCoverageRatio,
    }
    failed.extend(name for name, passed in checks.items() if not passed)
    all_slices = sorted({value for clip in manifest.clips for value in clip.slices})
    for slice_name, minimum_count in threshold.requiredSlices.items():
        members = [item for item in clip_results if slice_name in item["clip"].slices]
        if len(members) < minimum_count:
            failed.append(f"slice_{slice_name}_minimum_count")
            continue
        slice_contacts = merge_counts(item["groups"]["contact"] for item in members)
        expected_slice_contacts = (
            slice_contacts.true_positive + slice_contacts.false_negative
        )
        if expected_slice_contacts < threshold.minimumSliceContactCount:
            failed.append(f"slice_{slice_name}_minimum_contact_count")
        if slice_contacts.f1 < threshold.minimumSliceContactF1:
            failed.append(f"slice_{slice_name}_contact_f1")

    dataset_sha = sha256_file(manifest_path)
    return QualityGate(
        decision="passed" if not failed else "failed",
        productionEligible=not failed,
        benchmarkId=manifest.benchmarkId,
        modelBundleSha256=model_sha,
        datasetManifestSha256=dataset_sha,
        evaluatedAt=datetime.now(UTC),
        metrics=metrics,
        failedChecks=failed,
        evaluatedSlices=all_slices,
    )


def signed_envelope(gate: QualityGate, private_key_path: Path) -> dict[str, Any]:
    key = serialization.load_pem_private_key(
        private_key_path.read_bytes(), password=None
    )
    if not isinstance(key, Ed25519PrivateKey):
        raise TypeError("Attestation signing key must be Ed25519")
    payload = gate.model_dump(mode="json", exclude_none=True)
    payload["signature"] = base64.b64encode(key.sign(canonical_json(payload))).decode(
        "ascii"
    )
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate Duna Vision on held-out real matches"
    )
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--model-bundle", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--private-key", type=Path)
    arguments = parser.parse_args()
    gate = evaluate(arguments.manifest, arguments.model_bundle)
    document = (
        signed_envelope(gate, arguments.private_key)
        if arguments.private_key
        else gate.model_dump(mode="json", exclude_none=True)
    )
    arguments.output.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n")
    raise SystemExit(0 if gate.productionEligible else 1)
