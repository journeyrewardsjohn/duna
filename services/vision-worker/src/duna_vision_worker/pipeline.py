from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from .schemas import (
    AnalysisCommand,
    AnalysisOutput,
    CourtPoint,
    Coverage,
    QualityGate,
    WorkerEvent,
    WorkerResult,
)

RALLY_GAP_US = 5_000_000


def stable_uuid(run_id: UUID, kind: str, time_us: int, sequence: int) -> UUID:
    return uuid5(NAMESPACE_URL, f"duna-vision:{run_id}:{kind}:{time_us}:{sequence}")


def build_events(command: AnalysisCommand, output: AnalysisOutput) -> list[WorkerEvent]:
    events: list[WorkerEvent] = []
    rally_id: UUID | None = None
    rally_started_us = 0
    rally_confidence = 1.0
    last_observation_us: int | None = None
    sequence = 0

    def close_rally(at_us: int) -> None:
        nonlocal rally_id, sequence
        if not rally_id:
            return
        events.append(
            WorkerEvent(
                id=stable_uuid(command.runId, "rally-ended", at_us, sequence),
                eventType="rally-ended",
                sessionTimeUs=max(rally_started_us, at_us),
                confidence=rally_confidence,
                payload={"rallyId": str(rally_id)},
            )
        )
        sequence += 1
        rally_id = None

    for observation in sorted(output.observations, key=lambda item: item.timeUs):
        starts_new = (
            rally_id is None
            or observation.contactKind == "serve"
            or (
                last_observation_us is not None
                and observation.timeUs - last_observation_us > RALLY_GAP_US
            )
        )
        if starts_new:
            if rally_id is not None:
                close_rally(
                    min(
                        observation.timeUs,
                        (last_observation_us or observation.timeUs) + 1_000_000,
                    )
                )
            rally_id = stable_uuid(command.runId, "rally", observation.timeUs, sequence)
            rally_started_us = observation.timeUs
            rally_confidence = observation.confidence
            events.append(
                WorkerEvent(
                    id=stable_uuid(
                        command.runId, "rally-started", observation.timeUs, sequence
                    ),
                    eventType="rally-started",
                    sessionTimeUs=observation.timeUs,
                    confidence=observation.confidence,
                    payload={"rallyId": str(rally_id)},
                )
            )
            sequence += 1
        rally_confidence = min(rally_confidence, observation.confidence)
        payload: dict[str, Any] = {"rallyId": str(rally_id)}
        court_point = None
        if observation.eventType == "ball-contact":
            payload.update(
                {
                    "contactKind": observation.contactKind,
                    "side": observation.side,
                }
            )
        else:
            court_point = CourtPoint(
                xMeters=observation.xMeters,
                yMeters=observation.yMeters,
                observed="visible",
            )
        events.append(
            WorkerEvent(
                id=stable_uuid(
                    command.runId, observation.eventType, observation.timeUs, sequence
                ),
                eventType=observation.eventType,
                sessionTimeUs=observation.timeUs,
                confidence=observation.confidence,
                courtPoint=court_point,
                payload=payload,
            )
        )
        sequence += 1
        last_observation_us = observation.timeUs
        if observation.eventType == "ball-landing":
            close_rally(observation.timeUs)

    if rally_id is not None:
        close_rally(
            min(output.sampledDurationUs, (last_observation_us or 0) + 2_000_000)
        )
    event_order = {
        "rally-started": 0,
        "ball-contact": 1,
        "ball-landing": 2,
        "rally-ended": 3,
    }
    return sorted(
        events,
        key=lambda item: (
            item.sessionTimeUs,
            event_order.get(item.eventType, 2),
            str(item.id),
        ),
    )


def build_result(
    command: AnalysisCommand,
    output: AnalysisOutput,
    quality_gate: QualityGate,
    artifact_key: str,
) -> WorkerResult:
    usable_ratio = (
        output.usableDurationUs / output.sampledDurationUs
        if output.sampledDurationUs
        else 0.0
    )
    current_source_usable = usable_ratio >= 0.70
    status = (
        "ready"
        if quality_gate.decision == "passed"
        and quality_gate.productionEligible
        and current_source_usable
        else "needs-review"
    )
    return WorkerResult(
        runId=command.runId,
        status=status,
        modelVersion=output.modelVersion,
        artifactR2Key=artifact_key,
        coverage=Coverage(
            sampledDurationUs=output.sampledDurationUs,
            usableDurationUs=output.usableDurationUs,
            sourceVideoAvailable=True,
            scoreTimelineAvailable=command.visionSetup is not None,
        ),
        qualityGate=quality_gate,
        events=build_events(command, output),
    )


def artifact_manifest(
    command: AnalysisCommand,
    output: AnalysisOutput,
    result: WorkerResult,
    source: dict[str, Any],
) -> dict[str, Any]:
    return {
        "schemaVersion": "duna-vision-artifact-v1",
        "createdAt": datetime.now(UTC).isoformat(),
        "runId": str(command.runId),
        "videoId": str(command.videoId),
        "visionSessionId": str(command.visionSessionId)
        if command.visionSessionId
        else None,
        "modelVersion": output.modelVersion,
        "modelBundleSha256": output.modelBundleSha256,
        "court": command.court.model_dump(mode="json", exclude_none=True),
        "source": source,
        "coverage": result.coverage.model_dump(mode="json", exclude_none=True)
        if result.coverage
        else None,
        "qualityGate": result.qualityGate.model_dump(mode="json", exclude_none=True)
        if result.qualityGate
        else None,
        "diagnostics": output.diagnostics,
        "events": [
            event.model_dump(mode="json", exclude_none=True) for event in result.events
        ],
    }
