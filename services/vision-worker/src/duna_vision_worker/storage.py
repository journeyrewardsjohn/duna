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

    def download_object(self, object_key: str, destination: Path) -> dict[str, Any]:
        if (
            not object_key
            or object_key.startswith("/")
            or ".." in object_key.split("/")
        ):
            raise ValueError("R2_OBJECT_KEY_INVALID")
        return self.download(object_key, destination)

    def download_prefix(self, prefix: str, destination: Path) -> list[str]:
        if (
            not prefix.endswith("/")
            or prefix.startswith("/")
            or ".." in prefix.split("/")
        ):
            raise ValueError("R2_PREFIX_INVALID")
        paginator = self.client.get_paginator("list_objects_v2")
        downloaded: list[str] = []
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            for item in page.get("Contents", []):
                key = str(item["Key"])
                relative = key.removeprefix(prefix)
                if (
                    not relative
                    or relative.startswith("/")
                    or ".." in relative.split("/")
                ):
                    continue
                target = destination / relative
                self.download_object(key, target)
                downloaded.append(relative)
        if not downloaded:
            raise FileNotFoundError("R2_PREFIX_EMPTY")
        return downloaded

    def upload_json(self, key: str, document: dict[str, Any], artifact: str) -> None:
        if key.startswith("/") or ".." in key.split("/") or not key.endswith(".json"):
            raise ValueError("R2_JSON_KEY_INVALID")
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=json.dumps(document, sort_keys=True, separators=(",", ":")).encode(
                "utf-8"
            ),
            ContentType="application/json",
            Metadata={"duna-artifact": artifact},
        )

    def upload_file(
        self, key: str, source: Path, content_type: str, artifact: str
    ) -> None:
        if key.startswith("/") or ".." in key.split("/"):
            raise ValueError("R2_OBJECT_KEY_INVALID")
        with source.open("rb") as body:
            self.client.upload_fileobj(
                body,
                self.bucket,
                key,
                ExtraArgs={
                    "ContentType": content_type,
                    "Metadata": {"duna-artifact": artifact},
                },
            )
