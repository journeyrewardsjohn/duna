from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config

from .config import Settings


class PrivateVideoStorage:
    def __init__(self, settings: Settings) -> None:
        if not settings.r2_configured:
            raise RuntimeError("R2_NOT_CONFIGURED")
        self.bucket = settings.r2_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=str(settings.r2_endpoint),
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            region_name="auto",
            config=Config(signature_version="s3v4", retries={"max_attempts": 5}),
        )

    def download(self, object_key: str, destination: Path) -> dict[str, Any]:
        destination.parent.mkdir(parents=True, exist_ok=True)
        response = self.client.get_object(Bucket=self.bucket, Key=object_key)
        with destination.open("wb") as target:
            for chunk in iter(lambda: response["Body"].read(1024 * 1024), b""):
                target.write(chunk)
        return {
            "sourceObjectKey": object_key,
            "sourceETag": str(response.get("ETag", "")).strip('"') or None,
            "sourceVersionId": response.get("VersionId"),
            "sourceBytes": destination.stat().st_size,
        }

    def upload_manifest(self, key: str, manifest: dict[str, Any]) -> None:
        if not key.startswith("video-analysis/") or not key.endswith("/manifest.json"):
            raise ValueError("Analysis manifests must use the private analysis prefix")
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode(
                "utf-8"
            ),
            ContentType="application/json",
            Metadata={"duna-artifact": "vision-analysis-manifest-v1"},
        )
