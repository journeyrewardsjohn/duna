import hashlib
import json
from pathlib import Path

from duna_vision_worker.quality import sha256_bundle
from duna_vision_worker.validation import evaluate


def test_synthetic_accuracy_cannot_promote_a_model(tmp_path: Path, monkeypatch) -> None:
    model = tmp_path / "model"
    model.mkdir()
    (model / "manifest.json").write_text("{}")
    event = {
        "eventType": "ball-contact",
        "sessionTimeUs": 1_000_000,
        "payload": {"contactKind": "serve"},
    }
    landing = {
        "eventType": "ball-landing",
        "sessionTimeUs": 2_000_000,
        "courtPoint": {"xMeters": 2, "yMeters": 7, "observed": "visible"},
        "payload": {},
    }
    rally = {"eventType": "rally-started", "sessionTimeUs": 900_000, "payload": {}}
    truth = {"events": [rally, event, landing]}
    source_bytes = b"synthetic-video-placeholder"
    (tmp_path / "source.mp4").write_bytes(source_bytes)
    prediction = {
        "modelBundleSha256": sha256_bundle(model),
        "events": [rally, event, landing],
        "coverage": {"sampledDurationUs": 10_000_000, "usableDurationUs": 9_000_000},
        "diagnostics": {"courtCalibrationMedianErrorPixels": 2.0},
    }
    truth_bytes = json.dumps(truth).encode()
    prediction_bytes = json.dumps(prediction).encode()
    (tmp_path / "truth.json").write_bytes(truth_bytes)
    (tmp_path / "prediction.json").write_bytes(prediction_bytes)
    manifest = {
        "schemaVersion": "duna-vision-benchmark-v1",
        "benchmarkId": "synthetic-contract-check",
        "kind": "synthetic",
        "clips": [
            {
                "id": "clip-1",
                "sourcePath": "source.mp4",
                "truthPath": "truth.json",
                "predictionPath": "prediction.json",
                "durationUs": 10_000_000,
                "sourceSha256": hashlib.sha256(source_bytes).hexdigest(),
                "truthSha256": hashlib.sha256(truth_bytes).hexdigest(),
                "predictionSha256": hashlib.sha256(prediction_bytes).hexdigest(),
                "slices": ["sunny"],
                "annotationReviewerIds": ["reviewer-1", "reviewer-2"],
            }
        ],
        "thresholds": {
            "minimumClipCount": 1,
            "minimumContactCount": 1,
            "minimumRallyCount": 1,
            "minimumLandingCount": 1,
            "contactF1": 0.9,
            "rallyF1": 0.9,
            "landingF1": 0.9,
            "maximumLandingErrorP95Meters": 0.5,
            "maximumCourtErrorP95Pixels": 5,
            "maximumFalseEventsPerMinute": 1,
            "minimumUsableCoverageRatio": 0.8,
            "requiredSlices": {"sunny": 1},
            "minimumSliceContactF1": 0.8,
            "minimumSliceContactCount": 1,
        },
    }
    manifest_path = tmp_path / "benchmark.json"
    manifest_path.write_text(json.dumps(manifest))

    result = evaluate(manifest_path, model)

    assert result.metrics.contactF1 == 1
    assert result.productionEligible is False
    assert "dataset_is_not_private_real_match_held_out" in result.failedChecks
    assert "missing_validation_consent_record" in result.failedChecks

    manifest["kind"] = "private-real-match-held-out"
    manifest["clips"][0]["consentRecordId"] = "consent-record-1"
    manifest_path.write_text(json.dumps(manifest))
    monkeypatch.setattr(
        "duna_vision_worker.validation.probe_video_duration_us",
        lambda _: 10_000_000,
    )
    promoted = evaluate(manifest_path, model)

    assert promoted.productionEligible is True
    assert promoted.decision == "passed"
    assert promoted.failedChecks == []
