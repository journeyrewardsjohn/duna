from uuid import uuid4

from duna_vision_worker.pipeline import build_events, build_result
from duna_vision_worker.schemas import (
    AnalysisCommand,
    AnalysisOutput,
    QualityGate,
    RawObservation,
)

SHA = "a" * 64


def promoted_gate() -> QualityGate:
    return QualityGate.model_validate(
        {
            "decision": "passed",
            "productionEligible": True,
            "benchmarkId": "held-out-v1",
            "modelBundleSha256": SHA,
            "datasetManifestSha256": "b" * 64,
            "evaluatedAt": "2026-08-17T20:00:00Z",
            "metrics": {
                "contactF1": 0.9,
                "rallyF1": 0.9,
                "landingF1": 0.9,
                "landingErrorP95Meters": 0.5,
                "courtErrorP95Pixels": 8,
                "falseEventsPerMinute": 0.5,
                "usableCoverageRatio": 0.9,
            },
            "evaluatedSlices": ["sunny"],
        }
    )


def command() -> AnalysisCommand:
    return AnalysisCommand.model_validate(
        {
            "runId": str(uuid4()),
            "videoId": str(uuid4()),
            "r2ObjectKey": "private/video.mp4",
            "court": {
                "widthMeters": 8,
                "lengthMeters": 16,
                "coordinateFrame": "canonical-court",
                "calibrationSource": "vision",
            },
            "callbackPath": "/api/video/analysis",
        }
    )


def output(usable: int = 9_000_000) -> AnalysisOutput:
    return AnalysisOutput(
        modelVersion="duna-volleyball-test-v1",
        modelBundleSha256=SHA,
        sampledDurationUs=10_000_000,
        usableDurationUs=usable,
        observations=[
            RawObservation(
                eventType="ball-contact",
                timeUs=1_000_000,
                confidence=0.91,
                contactKind="serve",
            ),
            RawObservation(
                eventType="ball-contact",
                timeUs=1_800_000,
                confidence=0.88,
                contactKind="reception",
            ),
            RawObservation(
                eventType="ball-landing",
                timeUs=3_200_000,
                confidence=0.86,
                xMeters=2.5,
                yMeters=10.5,
            ),
        ],
    )


def test_builds_a_typed_rally_without_inventing_outcomes() -> None:
    events = build_events(command(), output())
    assert [event.eventType for event in events] == [
        "rally-started",
        "ball-contact",
        "ball-contact",
        "ball-landing",
        "rally-ended",
    ]
    contacts = [event for event in events if event.eventType == "ball-contact"]
    assert [event.payload["contactKind"] for event in contacts] == [
        "serve",
        "reception",
    ]
    assert all("outcome" not in event.payload for event in contacts)
    assert contacts[0].payload["rallyId"] == contacts[1].payload["rallyId"]


def test_only_promoted_models_with_usable_current_video_return_ready() -> None:
    job = command()
    gate = promoted_gate()
    ready = build_result(
        job, output(), gate, f"video-analysis/{job.videoId}/manifest.json"
    )
    review = build_result(
        job,
        output(usable=2_000_000),
        gate,
        f"video-analysis/{job.videoId}/manifest.json",
    )
    assert ready.status == "ready"
    assert review.status == "needs-review"


def test_unverified_models_are_always_review_only() -> None:
    job = command()
    gate = QualityGate(
        decision="unverified",
        productionEligible=False,
        modelBundleSha256=SHA,
        failedChecks=["promotion_attestation_missing"],
    )
    result = build_result(
        job, output(), gate, f"video-analysis/{job.videoId}/manifest.json"
    )
    assert result.status == "needs-review"
