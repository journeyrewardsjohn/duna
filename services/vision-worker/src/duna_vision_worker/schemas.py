from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ImagePoint(BaseModel):
    x: float = Field(ge=-1.5, le=2.5)
    y: float = Field(ge=-1.5, le=2.5)


class CourtMap(BaseModel):
    widthMeters: float = Field(gt=0, le=30)
    lengthMeters: float = Field(gt=0, le=40)
    coordinateFrame: Literal["canonical-court"]
    calibrationSource: Literal["vision", "manual", "unknown"]
    calibrationQualityScore: int | None = Field(default=None, ge=0, le=100)
    imageCorners: list[ImagePoint] | None = Field(
        default=None, min_length=4, max_length=4
    )


class VisionSetup(BaseModel):
    model_config = ConfigDict(extra="allow")
    settings: dict[str, Any]
    previewJpegBase64: str | None = None
    previewCapturedAt: datetime | None = None
    timeline: list[dict[str, Any]] = Field(default_factory=list, max_length=100_000)


class AnalysisCommand(BaseModel):
    runId: UUID
    videoId: UUID
    r2ObjectKey: str | None = Field(default=None, min_length=1, max_length=1024)
    muxAssetId: str | None = Field(default=None, min_length=1, max_length=200)
    visionSessionId: UUID | None = None
    court: CourtMap
    visionSetup: VisionSetup | None = None
    callbackPath: Literal["/api/video/analysis"]

    @model_validator(mode="after")
    def source_is_referenced(self) -> AnalysisCommand:
        if not self.r2ObjectKey and not self.muxAssetId:
            raise ValueError("A private source reference is required")
        return self


class CourtPoint(BaseModel):
    xMeters: float = Field(ge=0, le=30)
    yMeters: float = Field(ge=0, le=40)
    observed: Literal["visible", "edge", "out-of-frame"]


class WorkerEvent(BaseModel):
    id: UUID
    eventType: Literal[
        "rally-started",
        "rally-ended",
        "ball-contact",
        "ball-landing",
        "player-position",
        "highlight",
        "review-marker",
    ]
    sessionTimeUs: int = Field(ge=0, le=43_200_000_000)
    durationUs: int | None = Field(default=None, ge=0, le=43_200_000_000)
    confidence: float = Field(ge=0, le=1)
    courtPoint: CourtPoint | None = None
    payload: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def event_requirements(self) -> WorkerEvent:
        if self.eventType == "ball-contact" and not self.payload.get("contactKind"):
            raise ValueError("A ball contact requires contactKind")
        if self.eventType == "ball-landing" and not self.courtPoint:
            raise ValueError("A ball landing requires a court point")
        return self


class Coverage(BaseModel):
    sampledDurationUs: int | None = Field(default=None, ge=0, le=43_200_000_000)
    usableDurationUs: int | None = Field(default=None, ge=0, le=43_200_000_000)
    sourceVideoAvailable: bool
    scoreTimelineAvailable: bool

    @model_validator(mode="after")
    def valid_duration(self) -> Coverage:
        if (
            self.sampledDurationUs is not None
            and self.usableDurationUs is not None
            and self.usableDurationUs > self.sampledDurationUs
        ):
            raise ValueError("Usable coverage cannot exceed sampled coverage")
        return self


class QualityMetrics(BaseModel):
    contactF1: float | None = Field(default=None, ge=0, le=1)
    rallyF1: float | None = Field(default=None, ge=0, le=1)
    landingF1: float | None = Field(default=None, ge=0, le=1)
    landingErrorP95Meters: float | None = Field(default=None, ge=0)
    courtErrorP95Pixels: float | None = Field(default=None, ge=0)
    falseEventsPerMinute: float | None = Field(default=None, ge=0)
    usableCoverageRatio: float | None = Field(default=None, ge=0, le=1)


class QualityGate(BaseModel):
    attestationVersion: Literal[1] = 1
    decision: Literal["passed", "failed", "unverified"]
    productionEligible: bool
    benchmarkId: str | None = Field(default=None, min_length=1, max_length=120)
    modelBundleSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    datasetManifestSha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    evaluatedAt: datetime | None = None
    metrics: QualityMetrics = Field(default_factory=QualityMetrics)
    failedChecks: list[str] = Field(default_factory=list, max_length=40)
    evaluatedSlices: list[str] = Field(default_factory=list, max_length=80)

    @model_validator(mode="after")
    def valid_decision(self) -> QualityGate:
        if self.productionEligible and self.decision != "passed":
            raise ValueError("Only a passing gate can be production eligible")
        if self.decision != "passed" and not self.failedChecks:
            raise ValueError("A non-passing gate must explain what remains")
        if self.decision == "passed" and self.failedChecks:
            raise ValueError("A passing quality gate cannot retain failed checks")
        if self.productionEligible and (
            not self.benchmarkId
            or not self.datasetManifestSha256
            or not self.evaluatedAt
            or not self.evaluatedSlices
            or any(
                metric is None
                for metric in (
                    self.metrics.contactF1,
                    self.metrics.rallyF1,
                    self.metrics.landingF1,
                    self.metrics.landingErrorP95Meters,
                    self.metrics.courtErrorP95Pixels,
                    self.metrics.falseEventsPerMinute,
                    self.metrics.usableCoverageRatio,
                )
            )
        ):
            raise ValueError(
                "A production gate needs complete benchmark provenance and metrics"
            )
        return self


class WorkerResult(BaseModel):
    runId: UUID
    status: Literal["ready", "needs-review", "failed"]
    modelVersion: str | None = Field(default=None, min_length=1, max_length=80)
    artifactR2Key: str | None = Field(
        default=None,
        pattern=r"^video-analysis/[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*(?:\.json)?$",
        max_length=500,
    )
    failureCode: str | None = Field(default=None, min_length=1, max_length=80)
    coverage: Coverage | None = None
    qualityGate: QualityGate | None = None
    events: list[WorkerEvent] = Field(default_factory=list, max_length=100_000)

    @model_validator(mode="after")
    def completion_is_evidence_backed(self) -> WorkerResult:
        if self.status == "failed":
            if not self.failureCode or self.events:
                raise ValueError("Failed results need a code and cannot contain events")
            return self
        if (
            not self.modelVersion
            or not self.coverage
            or not self.coverage.sourceVideoAvailable
        ):
            raise ValueError("Completed results require model and source provenance")
        if self.status == "ready" and (
            not self.artifactR2Key
            or not self.qualityGate
            or self.qualityGate.decision != "passed"
            or not self.qualityGate.productionEligible
        ):
            raise ValueError("Ready requires a production promotion attestation")
        return self


class RawObservation(BaseModel):
    eventType: Literal["ball-contact", "ball-landing"]
    timeUs: int = Field(ge=0)
    confidence: float = Field(ge=0, le=1)
    contactKind: (
        Literal["serve", "reception", "set", "attack", "block", "dig", "free-ball"]
        | None
    ) = None
    xMeters: float | None = None
    yMeters: float | None = None
    side: Literal["a", "b", "unknown"] = "unknown"

    @model_validator(mode="after")
    def typed_observation(self) -> RawObservation:
        if self.eventType == "ball-contact" and not self.contactKind:
            raise ValueError("contactKind is required")
        if self.eventType == "ball-landing" and (
            self.xMeters is None or self.yMeters is None
        ):
            raise ValueError("landing coordinates are required")
        return self


class AnalysisOutput(BaseModel):
    modelVersion: str
    modelBundleSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    sampledDurationUs: int = Field(ge=0)
    usableDurationUs: int = Field(ge=0)
    observations: list[RawObservation]
    diagnostics: dict[str, Any] = Field(default_factory=dict)


def safe_failure_code(value: str) -> str:
    candidate = "".join(
        character if character.isalnum() else "_" for character in value
    )
    return candidate.upper()[:80] or "WORKER_FAILURE"
