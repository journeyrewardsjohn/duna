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
# A rally is *not* complete merely because the worker reached the end of a
# clip. The narrow proof below is intentionally conservative: dense usable
# coverage, no material observation gap, room on both clip edges, and a
# high-confidence visible landing are all required before bounded rules run.
RALLY_CONTINUITY_MAX_GAP_US = 2_000_000
RALLY_CLIP_EDGE_US = 1_000_000
RALLY_MIN_USABLE_COVERAGE = 0.95
RALLY_LANDING_CONFIDENCE = 0.85


def stable_uuid(run_id: UUID, kind: str, time_us: int, sequence: int) -> UUID:
    return uuid5(NAMESPACE_URL, f"duna-vision:{run_id}:{kind}:{time_us}:{sequence}")


def build_events(command: AnalysisCommand, output: AnalysisOutput) -> list[WorkerEvent]:
    events: list[WorkerEvent] = []
    rally_id: UUID | None = None
    rally_started_us = 0
    rally_confidence = 1.0
    last_observation_us: int | None = None
    rally_last_observation_us: int | None = None
    rally_contact_events: list[WorkerEvent] = []
    rally_has_continuity_gap = False
    sequence = 0

    def close_rally(at_us: int, proven_complete: bool = False) -> None:
        nonlocal rally_id, sequence, rally_contact_events
        nonlocal rally_has_continuity_gap, rally_last_observation_us
        if not rally_id:
            return
        if proven_complete:
            for contact in rally_contact_events:
                # Rule findings remain bounded to this explicitly proven
                # sequence; nothing about a single camera implies 3D facts.
                contact.payload["rallySequenceComplete"] = True
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
        rally_contact_events = []
        rally_has_continuity_gap = False
        rally_last_observation_us = None

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
            rally_contact_events = []
            rally_has_continuity_gap = False
            rally_last_observation_us = None
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
        if (
            rally_last_observation_us is not None
            and observation.timeUs - rally_last_observation_us
            > RALLY_CONTINUITY_MAX_GAP_US
        ):
            rally_has_continuity_gap = True
        payload: dict[str, Any] = {"rallyId": str(rally_id)}
        court_point = None
        if observation.eventType == "ball-contact":
            payload.update(
                {
                    # Default to unavailable. A closed rally changes this only
                    # after all conservative proof conditions are satisfied.
                    "rallySequenceComplete": False,
                    "contactKind": observation.contactKind,
                    "side": observation.side,
                }
            )
            if observation.contactPoint:
                payload["contactPoint"] = observation.contactPoint.model_dump(
                    mode="json", exclude_none=True
                )
            if observation.contactUncertaintyMeters is not None:
                payload["contactUncertaintyMeters"] = observation.contactUncertaintyMeters
            if observation.contactQuality:
                payload["contactQuality"] = observation.contactQuality.model_dump(
                    mode="json", exclude_none=True
                )
            if observation.trajectory:
                payload["trajectory"] = observation.trajectory.model_dump(
                    mode="json", exclude_none=True
                )
        else:
            court_point = CourtPoint(
                xMeters=observation.xMeters,
                yMeters=observation.yMeters,
                observed="visible",
            )
        event = WorkerEvent(
            id=stable_uuid(
                command.runId, observation.eventType, observation.timeUs, sequence
            ),
            eventType=observation.eventType,
            sessionTimeUs=observation.timeUs,
            confidence=observation.confidence,
            courtPoint=court_point,
            payload=payload,
        )
        events.append(event)
        if observation.eventType == "ball-contact":
            rally_contact_events.append(event)
        sequence += 1
        last_observation_us = observation.timeUs
        rally_last_observation_us = observation.timeUs
        if observation.eventType == "ball-landing":
            usable_coverage = (
                output.usableDurationUs / output.sampledDurationUs
                if output.sampledDurationUs
                else 0.0
            )
            close_rally(
                observation.timeUs,
                proven_complete=(
                    bool(rally_contact_events)
                    and observation.confidence >= RALLY_LANDING_CONFIDENCE
                    and usable_coverage >= RALLY_MIN_USABLE_COVERAGE
                    and not rally_has_continuity_gap
                    and rally_started_us >= RALLY_CLIP_EDGE_US
                    and observation.timeUs
                    <= output.sampledDurationUs - RALLY_CLIP_EDGE_US
                ),
            )

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
