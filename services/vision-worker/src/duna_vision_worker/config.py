from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, HttpUrl, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DUNA_VISION_", extra="ignore")

    worker_token: str = Field(
        min_length=24,
        validation_alias=AliasChoices(
            "DUNA_ANALYSIS_WORKER_TOKEN", "DUNA_VISION_WORKER_TOKEN"
        ),
    )
    control_plane_url: HttpUrl = Field(
        validation_alias=AliasChoices(
            "DUNA_CONTROL_PLANE_URL", "DUNA_VISION_CONTROL_PLANE_URL"
        )
    )
    model_bundle: Path = Field(validation_alias="DUNA_VISION_MODEL_BUNDLE")
    promotion_attestation: Path | None = Field(
        default=None, validation_alias="DUNA_VISION_PROMOTION_ATTESTATION"
    )
    promotion_public_key: Path | None = Field(
        default=None, validation_alias="DUNA_VISION_PROMOTION_PUBLIC_KEY"
    )
    job_db_path: Path = Path("/var/lib/duna-vision/jobs.sqlite3")
    work_dir: Path = Path("/var/lib/duna-vision/work")
    callback_attempts: int = Field(default=6, ge=1, le=12)
    stale_job_seconds: int = Field(default=7_200, ge=300, le=86_400)
    target_fps: float = Field(default=12.0, ge=1, le=30)
    attestation_private_key: Path | None = Field(
        default=None,
        validation_alias="DUNA_VISION_ATTESTATION_PRIVATE_KEY",
    )
    attestation_private_key_pem: str | None = Field(
        default=None,
        validation_alias="DUNA_VISION_ATTESTATION_PRIVATE_KEY_PEM",
    )
    l4_cents_per_hour: int = Field(
        default=120,
        ge=1,
        le=10_000,
        validation_alias="DUNA_VISION_L4_CENTS_PER_HOUR",
    )

    r2_account_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID", "cloudflare_account_id"
        ),
    )
    r2_bucket: str | None = Field(default="duna", validation_alias="R2_BUCKET_NAME")
    r2_endpoint: HttpUrl | None = Field(
        default=None,
        validation_alias=AliasChoices("CF_R2_S3_ENDPOINT", "cf_rs_s3_endpoint"),
    )
    r2_access_key_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("CF_ACCESS_KEY_ID", "cf_r2_access_key_id"),
    )
    r2_secret_access_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "CE_SECRET_ACCESS_KEY", "CF_SECRET_ACCESS_KEY", "cf_r2_secret_access_key"
        ),
    )

    @model_validator(mode="after")
    def promotion_pair(self) -> Settings:
        if bool(self.promotion_attestation) != bool(self.promotion_public_key):
            raise ValueError(
                "Promotion attestation and public key must be configured together"
            )
        callback_host = self.control_plane_url.host or ""
        if self.control_plane_url.scheme != "https" and callback_host not in {
            "localhost",
            "127.0.0.1",
        }:
            raise ValueError("The control plane URL must use HTTPS")
        if self.control_plane_url.path not in {None, "", "/"}:
            raise ValueError("The control plane URL must be an origin without a path")
        if not self.r2_endpoint and self.r2_account_id:
            self.r2_endpoint = HttpUrl(
                f"https://{self.r2_account_id}.r2.cloudflarestorage.com"
            )
        if self.r2_endpoint and not (
            (self.r2_endpoint.host or "").endswith(".r2.cloudflarestorage.com")
        ):
            raise ValueError("The R2 endpoint must be a Cloudflare R2 S3 origin")
        return self

    @property
    def r2_configured(self) -> bool:
        return all(
            (
                self.r2_bucket,
                self.r2_endpoint,
                self.r2_access_key_id,
                self.r2_secret_access_key,
            )
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
