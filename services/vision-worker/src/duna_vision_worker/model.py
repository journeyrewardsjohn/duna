from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import onnxruntime as ort
from pydantic import BaseModel, Field, model_validator

from .quality import sha256_bundle
from .schemas import AnalysisOutput, CourtMap, RawObservation


class TensorSpec(BaseModel):
    path: str
    inputName: str
    outputName: str


class DetectorSpec(TensorSpec):
    inputWidth: int = Field(ge=320, le=1920)
    inputHeight: int = Field(ge=320, le=1920)
    labels: dict[str, int]
    confidenceThreshold: float = Field(default=0.35, ge=0, le=1)
    batchSize: int = Field(default=16, ge=1, le=64)

    @model_validator(mode="after")
    def required_labels(self) -> DetectorSpec:
        required = {"ball", "court_tl", "court_tr", "court_br", "court_bl"}
        missing = required.difference(self.labels)
        if missing:
            raise ValueError(f"Detector labels are missing: {sorted(missing)}")
        return self


class TemporalSpec(TensorSpec):
    windowFrames: int = Field(ge=5, le=121)
    labels: list[str]
    confidenceThreshold: float = Field(default=0.55, ge=0, le=1)
    debounceMilliseconds: int = Field(default=350, ge=100, le=3000)

    @model_validator(mode="after")
    def supported_labels(self) -> TemporalSpec:
        supported = {
            "none",
            "serve",
            "reception",
            "set",
            "attack",
            "block",
            "dig",
            "free-ball",
            "landing",
        }
        if "none" not in self.labels or not set(self.labels).issubset(supported):
            raise ValueError("Temporal labels do not match the Duna event taxonomy")
        return self


class ModelManifest(BaseModel):
    contractVersion: str
    modelVersion: str = Field(min_length=1, max_length=80)
    detector: DetectorSpec
    temporal: TemporalSpec

    @model_validator(mode="after")
    def contract(self) -> ModelManifest:
        if self.contractVersion != "duna-volleyball-onnx-v1":
            raise ValueError("Unsupported model contract")
        return self


@dataclass(frozen=True)
class Detection:
    label: str
    confidence: float
    center_x: float
    center_y: float


@dataclass(frozen=True)
class Sample:
    time_us: int
    detections: tuple[Detection, ...]


def _providers() -> list[str]:
    available = set(ort.get_available_providers())
    if "CUDAExecutionProvider" not in available:
        raise RuntimeError("CUDA_EXECUTION_PROVIDER_UNAVAILABLE")
    return ["CUDAExecutionProvider", "CPUExecutionProvider"]


class OnnxVolleyballAnalyzer:
    """Runs a detector plus temporal event classifier using a fixed, versioned contract."""

    def __init__(self, bundle: Path, target_fps: float) -> None:
        manifest_path = bundle / "manifest.json"
        if not manifest_path.is_file():
            raise RuntimeError("MODEL_MANIFEST_UNAVAILABLE")
        self.bundle = bundle
        self.manifest = ModelManifest.model_validate_json(manifest_path.read_text())
        self.bundle_sha256 = sha256_bundle(bundle)
        self.target_fps = target_fps
        providers = _providers()
        self.detector = ort.InferenceSession(
            str(bundle / self.manifest.detector.path), providers=providers
        )
        self.temporal = ort.InferenceSession(
            str(bundle / self.manifest.temporal.path), providers=providers
        )

    def analyze(self, video_path: Path, court: CourtMap) -> AnalysisOutput:
        capture = cv2.VideoCapture(str(video_path))
        if not capture.isOpened():
            raise RuntimeError("VIDEO_DECODE_FAILED")
        source_fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if source_fps <= 0 or frame_count <= 0:
            capture.release()
            raise RuntimeError("VIDEO_METADATA_INVALID")
        duration_us = min(int(frame_count / source_fps * 1_000_000), 43_200_000_000)
        sample_every = max(1, round(source_fps / self.target_fps))
        samples: list[Sample] = []
        pending_frames: list[np.ndarray[Any, Any]] = []
        pending_times: list[int] = []

        def flush() -> None:
            if not pending_frames:
                return
            for time_us, detections in zip(
                pending_times, self._detect_batch(pending_frames), strict=True
            ):
                samples.append(Sample(time_us=time_us, detections=tuple(detections)))
            pending_frames.clear()
            pending_times.clear()

        frame_index = 0
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if frame_index % sample_every == 0:
                pending_frames.append(frame)
                pending_times.append(
                    min(int(frame_index / source_fps * 1_000_000), duration_us)
                )
                if len(pending_frames) >= self.manifest.detector.batchSize:
                    flush()
            frame_index += 1
        flush()
        capture.release()
        if not samples:
            raise RuntimeError("VIDEO_HAS_NO_DECODABLE_FRAMES")

        homography, calibrated_samples, calibration_error = self._court_homography(
            samples, court
        )
        usable_ratio = calibrated_samples / len(samples)
        observations = self._classify(samples, homography, court)
        return AnalysisOutput(
            modelVersion=self.manifest.modelVersion,
            modelBundleSha256=self.bundle_sha256,
            sampledDurationUs=duration_us,
            usableDurationUs=round(duration_us * usable_ratio),
            observations=observations,
            diagnostics={
                "sampledFrames": len(samples),
                "courtVisibleFrames": calibrated_samples,
                "courtCalibrationMedianErrorPixels": calibration_error,
                "executionProvider": "CUDAExecutionProvider",
                "contractVersion": self.manifest.contractVersion,
            },
        )

    def _detect_batch(
        self, frames: list[np.ndarray[Any, Any]]
    ) -> list[list[Detection]]:
        spec = self.manifest.detector
        tensors = []
        for frame in frames:
            image = cv2.resize(frame, (spec.inputWidth, spec.inputHeight))
            tensor = cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            tensors.append(np.transpose(tensor, (2, 0, 1)))
        batch = np.stack(tensors)
        raw = np.asarray(
            self.detector.run([spec.outputName], {spec.inputName: batch})[0]
        )
        if raw.ndim != 3 or raw.shape[0] != len(frames) or raw.shape[2] != 6:
            raise RuntimeError("DETECTOR_OUTPUT_CONTRACT_INVALID")
        label_by_id = {identifier: label for label, identifier in spec.labels.items()}
        results: list[list[Detection]] = []
        for rows in raw:
            detections: list[Detection] = []
            for x1, y1, x2, y2, confidence, class_id in rows:
                score = float(confidence)
                label = label_by_id.get(int(class_id))
                if label and score >= spec.confidenceThreshold:
                    detections.append(
                        Detection(
                            label,
                            score,
                            float((x1 + x2) / 2),
                            float((y1 + y2) / 2),
                        )
                    )
            results.append(detections)
        return results

    def _court_homography(
        self, samples: list[Sample], court: CourtMap
    ) -> tuple[np.ndarray[Any, Any], int, float]:
        order = ("court_tl", "court_tr", "court_br", "court_bl")
        quads: list[np.ndarray[Any, Any]] = []
        for sample in samples:
            best: dict[str, Detection] = {}
            for detection in sample.detections:
                if detection.label in order and (
                    detection.label not in best
                    or detection.confidence > best[detection.label].confidence
                ):
                    best[detection.label] = detection
            if len(best) == 4:
                quads.append(
                    np.asarray(
                        [
                            [best[label].center_x, best[label].center_y]
                            for label in order
                        ],
                        dtype=np.float32,
                    )
                )
        if len(quads) < max(3, math.ceil(len(samples) * 0.05)):
            raise RuntimeError("COURT_CALIBRATION_INSUFFICIENT")
        stacked = np.stack(quads)
        source = np.median(stacked, axis=0).astype(np.float32)
        destination = np.asarray(
            [
                [0, 0],
                [court.widthMeters, 0],
                [court.widthMeters, court.lengthMeters],
                [0, court.lengthMeters],
            ],
            dtype=np.float32,
        )
        error = float(np.percentile(np.linalg.norm(stacked - source, axis=2), 50))
        return cv2.getPerspectiveTransform(source, destination), len(quads), error

    def _classify(
        self,
        samples: list[Sample],
        homography: np.ndarray[Any, Any],
        court: CourtMap,
    ) -> list[RawObservation]:
        features: list[list[float]] = []
        court_points: list[tuple[float, float] | None] = []
        previous: tuple[float, float] | None = None
        for sample in samples:
            balls = [item for item in sample.detections if item.label == "ball"]
            ball = max(balls, key=lambda item: item.confidence) if balls else None
            point: tuple[float, float] | None = None
            if ball:
                transformed = cv2.perspectiveTransform(
                    np.asarray([[[ball.center_x, ball.center_y]]], dtype=np.float32),
                    homography,
                )[0][0]
                point = (float(transformed[0]), float(transformed[1]))
            velocity = (
                (point[0] - previous[0], point[1] - previous[1])
                if point and previous
                else (0.0, 0.0)
            )
            features.append(
                [
                    (point[0] / court.widthMeters) if point else 0.0,
                    (point[1] / court.lengthMeters) if point else 0.0,
                    velocity[0] / court.widthMeters,
                    velocity[1] / court.lengthMeters,
                    ball.confidence if ball else 0.0,
                    1.0 if point else 0.0,
                ]
            )
            court_points.append(point)
            if point:
                previous = point

        spec = self.manifest.temporal
        half = spec.windowFrames // 2
        last_event_us = -spec.debounceMilliseconds * 1000
        observations: list[RawObservation] = []
        indices = list(range(half, len(features) - half))
        for offset in range(0, len(indices), 256):
            batch_indices = indices[offset : offset + 256]
            windows = np.asarray(
                [
                    features[index - half : index - half + spec.windowFrames]
                    for index in batch_indices
                ],
                dtype=np.float32,
            )
            raw = np.asarray(
                self.temporal.run([spec.outputName], {spec.inputName: windows})[0]
            )
            if raw.shape != (len(batch_indices), len(spec.labels)):
                raise RuntimeError("TEMPORAL_OUTPUT_CONTRACT_INVALID")
            for index, probabilities in zip(batch_indices, raw, strict=True):
                label_index = int(np.argmax(probabilities))
                label = spec.labels[label_index]
                confidence = float(probabilities[label_index])
                time_us = samples[index].time_us
                if (
                    label == "none"
                    or confidence < spec.confidenceThreshold
                    or time_us - last_event_us < spec.debounceMilliseconds * 1000
                ):
                    continue
                point = court_points[index]
                if label == "landing":
                    if (
                        point
                        and 0 <= point[0] <= court.widthMeters
                        and 0 <= point[1] <= court.lengthMeters
                    ):
                        observations.append(
                            RawObservation(
                                eventType="ball-landing",
                                timeUs=time_us,
                                confidence=confidence,
                                xMeters=point[0],
                                yMeters=point[1],
                            )
                        )
                else:
                    observations.append(
                        RawObservation(
                            eventType="ball-contact",
                            timeUs=time_us,
                            confidence=confidence,
                            contactKind=label,
                        )
                    )
                last_event_us = time_us
        return observations
