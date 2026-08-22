from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import cv2
import numpy as np
import onnxruntime as ort
from pydantic import BaseModel, Field, model_validator

from .quality import sha256_bundle
from .schemas import (
    AnalysisOutput,
    ContactQuality,
    CourtMap,
    CourtPoint,
    RawObservation,
    TrajectorySummary,
)


class TensorSpec(BaseModel):
    path: str
    inputName: str
    outputName: str


class DetectorSpec(TensorSpec):
    format: Literal["duna-nms-v1", "yolox-v1", "yolox-coco-v1"] = "duna-nms-v1"
    inputWidth: int = Field(ge=320, le=1920)
    inputHeight: int = Field(ge=320, le=1920)
    labels: dict[str, int]
    confidenceThreshold: float = Field(default=0.35, ge=0, le=1)
    batchSize: int = Field(default=16, ge=1, le=64)
    nmsThreshold: float = Field(default=0.45, ge=0, le=1)
    strides: list[int] = Field(default_factory=lambda: [8, 16, 32])

    @model_validator(mode="after")
    def required_labels(self) -> DetectorSpec:
        required = {"ball"}
        missing = required.difference(self.labels)
        if missing:
            raise ValueError(f"Detector labels are missing: {sorted(missing)}")
        return self


class TemporalSpec(TensorSpec):
    mode: Literal["onnx", "trajectory-heuristic-v1"] = "onnx"
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
        self.temporal = (
            ort.InferenceSession(
                str(bundle / self.manifest.temporal.path), providers=providers
            )
            if self.manifest.temporal.mode == "onnx"
            else None
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
        source_size = (
            float(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0),
            float(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0),
        )
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
            samples, court, source_size
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
                "detectorFormat": self.manifest.detector.format,
                "temporalMode": self.manifest.temporal.mode,
            },
        )

    def _detect_batch(
        self, frames: list[np.ndarray[Any, Any]]
    ) -> list[list[Detection]]:
        spec = self.manifest.detector
        tensors: list[np.ndarray[Any, Any]] = []
        for frame in frames:
            height, width = frame.shape[:2]
            ratio = min(spec.inputHeight / height, spec.inputWidth / width)
            resized = cv2.resize(frame, (round(width * ratio), round(height * ratio)))
            image = np.full((spec.inputHeight, spec.inputWidth, 3), 114, dtype=np.uint8)
            image[: resized.shape[0], : resized.shape[1]] = resized
            tensor = (
                image.astype(np.float32)
                if spec.format in {"yolox-v1", "yolox-coco-v1"}
                else cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            )
            tensors.append(np.transpose(tensor, (2, 0, 1)))
        batch = np.stack(tensors)
        if spec.format in {"yolox-v1", "yolox-coco-v1"} and batch.shape[0] > 1:
            raw = np.concatenate(
                [
                    np.asarray(
                        self.detector.run(
                            [spec.outputName], {spec.inputName: item[None, ...]}
                        )[0]
                    )
                    for item in batch
                ],
                axis=0,
            )
        else:
            raw = np.asarray(
                self.detector.run([spec.outputName], {spec.inputName: batch})[0]
            )
        if spec.format in {"yolox-v1", "yolox-coco-v1"}:
            return self._decode_yolox(raw)
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

    def _decode_yolox(self, raw: np.ndarray[Any, Any]) -> list[list[Detection]]:
        spec = self.manifest.detector
        if raw.ndim != 3 or raw.shape[0] < 1 or raw.shape[2] < 6:
            raise RuntimeError("DETECTOR_OUTPUT_CONTRACT_INVALID")
        grids: list[np.ndarray[Any, Any]] = []
        expanded_strides: list[np.ndarray[Any, Any]] = []
        for stride in spec.strides:
            height = spec.inputHeight // stride
            width = spec.inputWidth // stride
            yv, xv = np.meshgrid(np.arange(height), np.arange(width), indexing="ij")
            grids.append(np.stack((xv, yv), axis=2).reshape(1, -1, 2))
            expanded_strides.append(
                np.full((1, height * width, 1), stride, dtype=np.float32)
            )
        grid = np.concatenate(grids, axis=1)
        strides = np.concatenate(expanded_strides, axis=1)
        if raw.shape[1] != grid.shape[1]:
            raise RuntimeError("DETECTOR_OUTPUT_CONTRACT_INVALID")
        predictions = raw.copy()
        predictions[..., :2] = (predictions[..., :2] + grid) * strides
        predictions[..., 2:4] = np.exp(predictions[..., 2:4]) * strides
        results: list[list[Detection]] = []
        for rows in predictions:
            detections: list[Detection] = []
            for label, class_id in spec.labels.items():
                class_index = 5 + class_id
                if class_index >= rows.shape[1]:
                    continue
                scores = rows[:, 4] * rows[:, class_index]
                candidate_indices = np.flatnonzero(scores >= spec.confidenceThreshold)
                if candidate_indices.size == 0:
                    continue
                boxes = rows[candidate_indices, :4]
                xywh = [
                    [
                        float(box[0] - box[2] / 2),
                        float(box[1] - box[3] / 2),
                        float(box[2]),
                        float(box[3]),
                    ]
                    for box in boxes
                ]
                kept = cv2.dnn.NMSBoxes(
                    xywh,
                    [float(scores[index]) for index in candidate_indices],
                    spec.confidenceThreshold,
                    spec.nmsThreshold,
                )
                for kept_index in np.asarray(kept).reshape(-1)[:20]:
                    source_index = int(candidate_indices[int(kept_index)])
                    detections.append(
                        Detection(
                            label=label,
                            confidence=float(scores[source_index]),
                            center_x=float(rows[source_index, 0]),
                            center_y=float(rows[source_index, 1]),
                        )
                    )
            results.append(detections)
        return results

    def _court_homography(
        self,
        samples: list[Sample],
        court: CourtMap,
        source_size: tuple[float, float],
    ) -> tuple[np.ndarray[Any, Any], int, float]:
        if court.imageCorners and source_size[0] > 0 and source_size[1] > 0:
            ratio = min(
                self.manifest.detector.inputHeight / source_size[1],
                self.manifest.detector.inputWidth / source_size[0],
            )
            source = np.asarray(
                [
                    [
                        point.x * source_size[0] * ratio,
                        point.y * source_size[1] * ratio,
                    ]
                    for point in court.imageCorners
                ],
                dtype=np.float32,
            )
            destination = np.asarray(
                [
                    [0, 0],
                    [court.widthMeters, 0],
                    [court.widthMeters, court.lengthMeters],
                    [0, court.lengthMeters],
                ],
                dtype=np.float32,
            )
            return cv2.getPerspectiveTransform(source, destination), len(samples), 0.0
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
        if self.temporal is None:
            return self._trajectory_events(samples, court_points, court)
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
                    contact_point = (
                        CourtPoint(xMeters=point[0], yMeters=point[1], observed="visible")
                        if point
                        and 0 <= point[0] <= court.widthMeters
                        and 0 <= point[1] <= court.lengthMeters
                        else None
                    )
                    observations.append(
                        RawObservation(
                            eventType="ball-contact",
                            timeUs=time_us,
                            confidence=confidence,
                            contactKind=label,
                            contactPoint=contact_point,
                            contactQuality=ContactQuality(
                                temporalConfidence=confidence,
                                visibleFrames=1 if contact_point else 0,
                                evidence="visible-2d" if contact_point else "unavailable",
                            ),
                        )
                    )
                last_event_us = time_us
        return observations

    def _trajectory_events(
        self,
        samples: list[Sample],
        court_points: list[tuple[float, float] | None],
        court: CourtMap,
    ) -> list[RawObservation]:
        """Emit conservative review proposals from abrupt visible trajectory changes."""
        observations: list[RawObservation] = []
        last_event_us = -750_000
        for index in range(2, len(court_points) - 1):
            previous = court_points[index - 1]
            current = court_points[index]
            following = court_points[index + 1]
            if not previous or not current or not following:
                continue
            incoming = np.asarray(current) - np.asarray(previous)
            outgoing = np.asarray(following) - np.asarray(current)
            incoming_speed = float(np.linalg.norm(incoming))
            outgoing_speed = float(np.linalg.norm(outgoing))
            direction_change = float(
                np.linalg.norm(
                    incoming / max(incoming_speed, 1e-6)
                    - outgoing / max(outgoing_speed, 1e-6)
                )
            )
            time_us = samples[index].time_us
            if (
                min(incoming_speed, outgoing_speed) < 0.01
                or direction_change < 0.85
                or time_us - last_event_us < 750_000
            ):
                continue
            normalized_change = min(
                1.0,
                direction_change
                * max(incoming_speed, outgoing_speed)
                / max(court.widthMeters, court.lengthMeters),
            )
            observations.append(
                RawObservation(
                    eventType="ball-contact",
                    timeUs=time_us,
                    confidence=min(0.69, 0.5 + normalized_change),
                    contactKind="free-ball",
                    contactPoint=CourtPoint(
                        xMeters=current[0], yMeters=current[1], observed="visible"
                    ),
                    contactQuality=ContactQuality(
                        temporalConfidence=min(0.69, 0.5 + normalized_change),
                        visibleFrames=3,
                        evidence="visible-2d",
                    ),
                    trajectory=TrajectorySummary(
                        # Three adjacent 2D samples establish a direction
                        # change only, not a flight endpoint/time or 3D height.
                        observedPoints=3,
                        evidence="partial-2d",
                    ),
                )
            )
            last_event_us = time_us
        return observations
