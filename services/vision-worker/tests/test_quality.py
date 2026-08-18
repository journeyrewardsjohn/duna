import base64
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from duna_vision_worker.quality import canonical_json, load_verified_quality_gate


def test_attestation_is_bound_to_signature_and_exact_model_hash(tmp_path: Path) -> None:
    model_sha = "c" * 64
    private_key = Ed25519PrivateKey.generate()
    public_path = tmp_path / "public.pem"
    public_path.write_bytes(
        private_key.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
    payload = {
        "attestationVersion": 1,
        "decision": "passed",
        "productionEligible": True,
        "benchmarkId": "held-out-v1",
        "modelBundleSha256": model_sha,
        "datasetManifestSha256": "d" * 64,
        "evaluatedAt": datetime.now(UTC).isoformat(),
        "metrics": {
            "contactF1": 0.9,
            "rallyF1": 0.9,
            "landingF1": 0.9,
            "landingErrorP95Meters": 0.5,
            "courtErrorP95Pixels": 8,
            "falseEventsPerMinute": 0.5,
            "usableCoverageRatio": 0.9,
        },
        "failedChecks": [],
        "evaluatedSlices": ["backlit"],
    }
    envelope = {
        **payload,
        "signature": base64.b64encode(
            private_key.sign(canonical_json(payload))
        ).decode(),
    }
    attestation_path = tmp_path / "attestation.json"
    attestation_path.write_text(json.dumps(envelope))

    assert (
        load_verified_quality_gate(attestation_path, public_path, model_sha).decision
        == "passed"
    )
    with pytest.raises(ValueError, match="does not match"):
        load_verified_quality_gate(attestation_path, public_path, "e" * 64)
