"use client";

import type { VisionSession, VisionSessionSettings } from "@duna/api";
import {
  Camera,
  Check,
  CircleStop,
  Focus,
  Radio,
  Ruler,
  Save,
  Settings2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  refreshVisionRemoteAction,
  updateVisionRemoteAction,
} from "@/app/vision/remote/[token]/actions";

const defaultCorners = [
  { x: 0.33, y: 0.26 },
  { x: 0.67, y: 0.26 },
  { x: 0.92, y: 0.77 },
  { x: 0.08, y: 0.77 },
] as const;

type VisionPoint = { readonly x: number; readonly y: number };
type DragTarget = {
  readonly kind: "corner" | "net" | "antenna";
  readonly index: number;
};

function visible(point: VisionPoint): boolean {
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function deriveNetLine(corners: readonly VisionPoint[]) {
  return [
    {
      x: (corners[0]!.x + corners[3]!.x) / 2,
      y: (corners[0]!.y + corners[3]!.y) / 2,
    },
    {
      x: (corners[1]!.x + corners[2]!.x) / 2,
      y: (corners[1]!.y + corners[2]!.y) / 2,
    },
  ] as const;
}

function visibility(corners: readonly VisionPoint[], netVisible: boolean) {
  return {
    far: visible(corners[0]!) && visible(corners[1]!),
    right: visible(corners[1]!) && visible(corners[2]!),
    near: visible(corners[2]!) && visible(corners[3]!),
    left: visible(corners[3]!) && visible(corners[0]!),
    net: netVisible,
  };
}

function screenPercent(value: number): number {
  return Math.max(3, Math.min(97, value * 100));
}

function statusLabel(session: VisionSession) {
  if (session.status === "recording") return "Recording now";
  if (session.status === "ended") return "Recording ended";
  if (session.status === "expired") return "Remote expired";
  return session.remoteConnected ? "Camera connected" : "Waiting for camera";
}

export function VisionRemoteControl({
  initialSession,
  token,
}: {
  readonly initialSession: VisionSession;
  readonly token: string;
}) {
  const [session, setSession] = useState(initialSession);
  const [settings, setSettings] = useState(initialSession.settings);
  const [dragging, setDragging] = useState<DragTarget>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshVisionRemoteAction(token).then((result) => {
        if (!result.ok) return;
        setSession(result.session);
        if (
          !dragging &&
          result.session.controlVersion > session.controlVersion
        ) {
          setSettings(result.session.settings);
        }
      });
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [dragging, session.controlVersion, token]);

  const commit = (
    nextSettings: VisionSessionSettings,
    status?: "setup" | "ready" | "recording" | "ended",
  ) => {
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const result = await updateVisionRemoteAction({
        token,
        expectedVersion: session.controlVersion,
        settings: nextSettings,
        status,
      });
      if (!result.ok) {
        setError(result.error);
        const refreshed = await refreshVisionRemoteAction(token);
        if (refreshed.ok) {
          setSession(refreshed.session);
          setSettings(refreshed.session.settings);
        }
        return;
      }
      setSession(result.session);
      setSettings(result.session.settings);
      setNotice(status ? "Camera command sent." : "Alignment saved.");
    });
  };

  const moveLandmark = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging === undefined || !stage.current) return;
    const bounds = stage.current.getBoundingClientRect();
    const x = Math.max(
      -1.5,
      Math.min(2.5, (event.clientX - bounds.left) / bounds.width),
    );
    const y = Math.max(
      -1.5,
      Math.min(2.5, (event.clientY - bounds.top) / bounds.height),
    );
    if (dragging.kind === "corner") {
      const corners = [...(settings.corners ?? defaultCorners)];
      corners[dragging.index] = { x, y };
      const netLine = deriveNetLine(corners);
      setSettings({
        ...settings,
        corners,
        netLine,
        nearLineVisible: visible(corners[2]!) && visible(corners[3]!),
        edgeVisibility: visibility(
          corners,
          Boolean(settings.netTopLine?.every(visible)),
        ),
        calibrationMode: "manual",
      });
      return;
    }
    if (dragging.kind === "antenna") {
      if (!settings.antennaPoints) return;
      const antennaPoints: [VisionPoint, VisionPoint] = [
        settings.antennaPoints[0]!,
        settings.antennaPoints[1]!,
      ];
      antennaPoints[dragging.index] = { x, y };
      setSettings({
        ...settings,
        antennaPoints,
        calibrationMode: "manual",
      });
      return;
    }
    const currentNet = settings.netTopLine ?? deriveNetLine(corners);
    const netTopLine = [...currentNet] as [VisionPoint, VisionPoint];
    const previous = netTopLine[dragging.index]!;
    netTopLine[dragging.index] = { x, y };
    const antennaPoints = settings.antennaPoints
      ? ([...settings.antennaPoints] as [VisionPoint, VisionPoint])
      : undefined;
    if (antennaPoints) {
      antennaPoints[dragging.index] = {
        x: antennaPoints[dragging.index]!.x + x - previous.x,
        y: antennaPoints[dragging.index]!.y + y - previous.y,
      };
    }
    setSettings({
      ...settings,
      netTopLine,
      antennaPoints,
      edgeVisibility: visibility(corners, netTopLine.every(visible)),
      calibrationMode: "manual",
    });
  };

  const updateSetting = <Key extends keyof VisionSessionSettings>(
    key: Key,
    value: VisionSessionSettings[Key],
  ) => setSettings((current) => ({ ...current, [key]: value }));

  const recording = session.status === "recording";
  const closed = session.status === "ended" || session.status === "expired";
  const corners = settings.corners ?? defaultCorners;
  const netLine = settings.netLine ?? deriveNetLine(corners);
  const netTopLine =
    settings.netTopLine?.length === 2
      ? ([settings.netTopLine[0]!, settings.netTopLine[1]!] as const)
      : undefined;
  const antennaPoints =
    settings.antennaPoints?.length === 2
      ? ([settings.antennaPoints[0]!, settings.antennaPoints[1]!] as const)
      : undefined;
  const suggestedAntennaPoints = netTopLine
    ? ([
        { x: netTopLine[0].x, y: netTopLine[0].y - 0.08 },
        { x: netTopLine[1].x, y: netTopLine[1].y - 0.08 },
      ] as const)
    : undefined;
  const captureNoun = settings.captureMode === "live" ? "stream" : "recording";

  const applyCorners = (
    nextCorners: readonly VisionPoint[],
    calibrationMode: "assisted" | "manual",
  ) => {
    const nextNetLine = deriveNetLine(nextCorners);
    setSettings((current) => ({
      ...current,
      corners: nextCorners,
      netLine: nextNetLine,
      nearLineVisible: visible(nextCorners[2]!) && visible(nextCorners[3]!),
      edgeVisibility: visibility(
        nextCorners,
        Boolean(current.netTopLine?.every(visible)),
      ),
      calibrationMode,
    }));
  };

  const markNetTop = () => {
    if (netTopLine) {
      setSettings((current) => ({
        ...current,
        netTopLine: undefined,
        antennaPoints: undefined,
        edgeVisibility: visibility(corners, false),
        calibrationMode: "manual",
      }));
      return;
    }
    const next = [
      { x: netLine[0].x, y: netLine[0].y - 0.15 },
      { x: netLine[1].x, y: netLine[1].y - 0.15 },
    ] as const;
    setSettings((current) => ({
      ...current,
      netTopLine: next,
      edgeVisibility: visibility(corners, next.every(visible)),
      calibrationMode: "manual",
    }));
  };

  return (
    <main className="vision-remote">
      <header className="vision-remote__header">
        <div className="vision-remote__brand">
          <span>D</span>
          <div>
            <strong>DUNA VISION</strong>
            <small>REMOTE CAMERA CONTROL</small>
          </div>
        </div>
        <span
          className={`vision-remote__status vision-remote__status--${session.status}`}
        >
          <Radio aria-hidden size={14} /> {statusLabel(session)}
        </span>
      </header>

      <section className="vision-remote__hero">
        <div>
          <span>ACTIVE SESSION</span>
          <h1>{session.title}</h1>
          <p>
            Match every visible line and the top of the net. Court boundaries
            may extend beyond the preview; that lowers analytics confidence but
            never blocks capture.
          </p>
        </div>
        <button
          className={recording ? "is-ending" : undefined}
          disabled={closed || isPending}
          onClick={() => commit(settings, recording ? "ended" : "recording")}
          type="button"
        >
          {recording ? <CircleStop aria-hidden /> : <Camera aria-hidden />}
          {recording ? `End ${captureNoun}` : `Start ${captureNoun}`}
        </button>
      </section>

      <div className="vision-remote__layout">
        <section className="vision-remote__preview-card">
          <div className="vision-remote__section-heading">
            <div>
              <span>LIVE CAMERA</span>
              <h2>Align the court</h2>
            </div>
            <Focus aria-hidden />
          </div>
          <div
            className="vision-remote__stage"
            onPointerMove={moveLandmark}
            onPointerUp={() => setDragging(undefined)}
            onPointerCancel={() => setDragging(undefined)}
            ref={stage}
          >
            {session.previewDataUrl ? (
              // The image is a short-lived, low-resolution frame from the paired camera.
              <img
                alt="Live Duna Vision camera preview"
                src={session.previewDataUrl}
              />
            ) : (
              <div className="vision-remote__waiting">
                <Camera aria-hidden />
                <strong>Waiting for camera preview</strong>
                <span>Keep Duna Vision open on the recording phone.</span>
              </div>
            )}
            <svg
              aria-hidden
              className="vision-remote__court"
              viewBox="0 0 100 100"
            >
              <polygon
                points={corners
                  .map((corner) => `${corner.x * 100},${corner.y * 100}`)
                  .join(" ")}
              />
              <line
                className="is-ground-net"
                x1={netLine[0].x * 100}
                x2={netLine[1].x * 100}
                y1={netLine[0].y * 100}
                y2={netLine[1].y * 100}
              />
              {netTopLine && (
                <line
                  className="is-net-top"
                  x1={netTopLine[0].x * 100}
                  x2={netTopLine[1].x * 100}
                  y1={netTopLine[0].y * 100}
                  y2={netTopLine[1].y * 100}
                />
              )}
              {netTopLine && antennaPoints && (
                <>
                  <line
                    className="is-antenna"
                    x1={netTopLine[0].x * 100}
                    x2={antennaPoints[0].x * 100}
                    y1={netTopLine[0].y * 100}
                    y2={antennaPoints[0].y * 100}
                  />
                  <line
                    className="is-antenna"
                    x1={netTopLine[1].x * 100}
                    x2={antennaPoints[1].x * 100}
                    y1={netTopLine[1].y * 100}
                    y2={antennaPoints[1].y * 100}
                  />
                </>
              )}
            </svg>
            {corners.map((corner, index) => (
              <button
                aria-label={`Court corner ${index + 1}`}
                className={`vision-remote__corner${visible(corner) ? "" : " is-offscreen"}`}
                key={index}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragging({ kind: "corner", index });
                }}
                style={{
                  left: `${screenPercent(corner.x)}%`,
                  top: `${screenPercent(corner.y)}%`,
                }}
                type="button"
              >
                {index + 1}
              </button>
            ))}
            {netTopLine?.map((point, index) => (
              <button
                aria-label={`Net top ${index === 0 ? "left" : "right"}`}
                className="vision-remote__corner vision-remote__corner--net"
                key={`net-${index}`}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragging({ kind: "net", index });
                }}
                style={{
                  left: `${screenPercent(point.x)}%`,
                  top: `${screenPercent(point.y)}%`,
                }}
                type="button"
              >
                N{index + 1}
              </button>
            ))}
            {antennaPoints?.map((point, index) => (
              <button
                aria-label={`Antenna tip ${index === 0 ? "left" : "right"}`}
                className="vision-remote__corner vision-remote__corner--antenna"
                key={`antenna-${index}`}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragging({ kind: "antenna", index });
                }}
                style={{
                  left: `${screenPercent(point.x)}%`,
                  top: `${screenPercent(point.y)}%`,
                }}
                type="button"
              >
                A{index + 1}
              </button>
            ))}
          </div>
          <p className="vision-remote__preview-meta">
            {session.previewCapturedAt
              ? `Preview refreshed ${new Date(session.previewCapturedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
              : "Preview will appear when the camera is ready."}
          </p>
        </section>

        <section className="vision-remote__controls">
          <div className="vision-remote__section-heading">
            <div>
              <span>MATCH + CAMERA</span>
              <h2>Recording setup</h2>
            </div>
            <Settings2 aria-hidden />
          </div>

          <label>
            <span>Team on the left</span>
            <input
              maxLength={80}
              onChange={(event) => updateSetting("teamA", event.target.value)}
              value={settings.teamA}
            />
          </label>
          <label>
            <span>Team on the right</span>
            <input
              maxLength={80}
              onChange={(event) => updateSetting("teamB", event.target.value)}
              value={settings.teamB}
            />
          </label>

          <fieldset>
            <legend>Court size</legend>
            <div className="vision-remote__choices">
              {[
                { label: "Full 16 × 8m", length: 16, width: 8 },
                { label: "Short 12 × 6m", length: 12, width: 6 },
              ].map((option) => (
                <button
                  className={
                    settings.courtLengthMeters === option.length
                      ? "is-active"
                      : undefined
                  }
                  key={option.label}
                  onClick={() =>
                    setSettings((current) => ({
                      ...current,
                      courtLengthMeters: option.length,
                      courtWidthMeters: option.width,
                    }))
                  }
                  type="button"
                >
                  <Ruler aria-hidden size={16} /> {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Net height</legend>
            <div className="vision-remote__choices vision-remote__choices--three">
              {[
                { label: "Men", value: 2.43 },
                { label: "Women", value: 2.24 },
                { label: "Junior", value: 2.12 },
              ].map((option) => (
                <button
                  className={
                    settings.netHeightMeters === option.value
                      ? "is-active"
                      : undefined
                  }
                  key={option.label}
                  onClick={() => updateSetting("netHeightMeters", option.value)}
                  type="button"
                >
                  {option.label}
                  <small>{option.value.toFixed(2)}m</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Court landmarks</legend>
            <p className="vision-remote__field-help">
              Use a tight-space preset when fencing prevents the near line from
              appearing. Then drag the visible anchors, net tape, and antenna
              tips.
            </p>
            <div className="vision-remote__choices vision-remote__choices--three">
              <button
                className={
                  settings.calibrationMode === "automatic"
                    ? "is-active"
                    : undefined
                }
                onClick={() =>
                  setSettings((current) => ({
                    ...current,
                    corners: undefined,
                    netLine: undefined,
                    netTopLine: undefined,
                    antennaPoints: undefined,
                    nearLineVisible: undefined,
                    edgeVisibility: undefined,
                    calibrationMode: "automatic",
                  }))
                }
                type="button"
              >
                Camera estimate
              </button>
              <button
                className={
                  settings.nearLineVisible === false ? "is-active" : undefined
                }
                onClick={() =>
                  applyCorners(
                    [
                      corners[0]!,
                      corners[1]!,
                      { x: corners[2]!.x, y: 1.14 },
                      { x: corners[3]!.x, y: 1.14 },
                    ],
                    "assisted",
                  )
                }
                type="button"
              >
                Near line off-screen
              </button>
              <button
                className={
                  settings.nearLineVisible === true ? "is-active" : undefined
                }
                onClick={() =>
                  applyCorners(
                    corners.map((point) => ({
                      x: Math.max(0.05, Math.min(0.95, point.x)),
                      y: Math.max(0.08, Math.min(0.9, point.y)),
                    })),
                    "assisted",
                  )
                }
                type="button"
              >
                All lines visible
              </button>
            </div>
            <div className="vision-remote__choices">
              <button
                className={netTopLine ? "is-active" : undefined}
                onClick={markNetTop}
                type="button"
              >
                {netTopLine ? "Clear net top" : "Mark net top"}
              </button>
              <button
                className={settings.antennaPoints ? "is-active" : undefined}
                disabled={!netTopLine}
                onClick={() =>
                  setSettings((current) => ({
                    ...current,
                    antennaPoints: current.antennaPoints
                      ? undefined
                      : suggestedAntennaPoints,
                    calibrationMode: "manual",
                  }))
                }
                type="button"
              >
                Antennas {settings.antennaPoints ? "marked" : "optional"}
              </button>
            </div>
          </fieldset>

          <label className="vision-remote__range">
            <span>
              Camera height
              <strong>
                {(settings.cameraHeightMeters ?? 2.5).toFixed(1)}m
              </strong>
            </span>
            <input
              max={6}
              min={1}
              onChange={(event) =>
                updateSetting("cameraHeightMeters", Number(event.target.value))
              }
              step={0.1}
              type="range"
              value={settings.cameraHeightMeters ?? 2.5}
            />
          </label>

          <label className="vision-remote__toggle">
            <span>
              <strong>Show live score</strong>
              <small>Overlay the linked match in the lower-right corner.</small>
            </span>
            <input
              checked={settings.overlayScoreboard}
              onChange={(event) =>
                updateSetting("overlayScoreboard", event.target.checked)
              }
              type="checkbox"
            />
          </label>

          {error && <p className="vision-remote__error">{error}</p>}
          {notice && (
            <p className="vision-remote__notice">
              <Check aria-hidden size={16} /> {notice}
            </p>
          )}
          <button
            className="vision-remote__save"
            disabled={closed || isPending}
            onClick={() => commit(settings, "ready")}
            type="button"
          >
            <Save aria-hidden />
            {isPending ? "Saving…" : "Save alignment"}
          </button>
        </section>
      </div>
    </main>
  );
}
