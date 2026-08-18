from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from .schemas import QualityGate


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bundle(path: Path) -> str:
    """Hashes both file content and relative names for an immutable model identity."""
    digest = hashlib.sha256()
    files = (
        [path]
        if path.is_file()
        else sorted(item for item in path.rglob("*") if item.is_file())
    )
    for item in files:
        relative = item.name if path.is_file() else item.relative_to(path).as_posix()
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(bytes.fromhex(sha256_file(item)))
    return digest.hexdigest()


def load_verified_quality_gate(
    attestation_path: Path | None,
    public_key_path: Path | None,
    model_bundle_sha256: str,
) -> QualityGate:
    if not attestation_path or not public_key_path:
        return QualityGate(
            decision="unverified",
            productionEligible=False,
            modelBundleSha256=model_bundle_sha256,
            failedChecks=["promotion_attestation_missing"],
        )

    envelope = json.loads(attestation_path.read_text(encoding="utf-8"))
    signature_value = envelope.pop("signature", None)
    if not isinstance(signature_value, str):
        raise TypeError("Promotion attestation signature is missing")
    public_key = serialization.load_pem_public_key(public_key_path.read_bytes())
    if not isinstance(public_key, Ed25519PublicKey):
        raise TypeError("Promotion key must be Ed25519")
    payload_value = envelope.get("payloadBase64")
    if envelope.get("schemaVersion") == "duna-vision-promotion-attestation-v2":
        if not isinstance(payload_value, str):
            raise TypeError("Promotion attestation payload is missing")
        payload = base64.b64decode(payload_value, validate=True)
        gate_document = json.loads(payload)
    else:
        # Read legacy local attestations while every newly generated promotion
        # uses the byte-exact v2 envelope that the control plane also verifies.
        payload = canonical_json(envelope)
        gate_document = envelope
    try:
        public_key.verify(base64.b64decode(signature_value, validate=True), payload)
    except (InvalidSignature, ValueError) as error:
        raise ValueError("Promotion attestation signature is invalid") from error

    gate = QualityGate.model_validate(gate_document)
    if gate.modelBundleSha256 != model_bundle_sha256:
        raise ValueError(
            "Promotion attestation does not match the mounted model bundle"
        )
    if gate.decision != "passed" or not gate.productionEligible:
        raise ValueError("Promotion attestation is not production eligible")
    return gate
