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
  { x: 0.18, y: 0.78 },
  { x: 0.82, y: 0.78 },
  { x: 0.93, y: 0.1 },
  { x: 0.07, y: 0.1 },
] as const;

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
  const [dragging, setDragging] = useState<number>();
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

  const moveCorner = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging === undefined || !stage.current) return;
    const bounds = stage.current.getBoundingClientRect();
    const x = Math.max(
      0.02,
      Math.min(0.98, (event.clientX - bounds.left) / bounds.width),
    );
    const y = Math.max(
      0.02,
      Math.min(0.98, 1 - (event.clientY - bounds.top) / bounds.height),
    );
    const corners = [...(settings.corners ?? defaultCorners)];
    corners[dragging] = { x, y };
    setSettings({ ...settings, corners });
  };

  const updateSetting = <Key extends keyof VisionSessionSettings>(
    key: Key,
    value: VisionSessionSettings[Key],
  ) => setSettings((current) => ({ ...current, [key]: value }));

  const recording = session.status === "recording";
  const closed = session.status === "ended" || session.status === "expired";
  const corners = settings.corners ?? defaultCorners;

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
            Frame the full court, drag each corner into place, then control the
            recording without touching the camera phone.
          </p>
        </div>
        <button
          className={recording ? "is-ending" : undefined}
          disabled={closed || isPending}
          onClick={() => commit(settings, recording ? "ended" : "recording")}
          type="button"
        >
          {recording ? <CircleStop aria-hidden /> : <Camera aria-hidden />}
          {recording ? "End recording" : "Start recording"}
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
            onPointerMove={moveCorner}
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
                  .map((corner) => `${corner.x * 100},${(1 - corner.y) * 100}`)
                  .join(" ")}
              />
              <line
                x1={((corners[0]!.x + corners[3]!.x) / 2) * 100}
                x2={((corners[1]!.x + corners[2]!.x) / 2) * 100}
                y1={((2 - corners[0]!.y - corners[3]!.y) / 2) * 100}
                y2={((2 - corners[1]!.y - corners[2]!.y) / 2) * 100}
              />
            </svg>
            {corners.map((corner, index) => (
              <button
                aria-label={`Court corner ${index + 1}`}
                className="vision-remote__corner"
                key={index}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDragging(index);
                }}
                style={{
                  left: `${corner.x * 100}%`,
                  top: `${(1 - corner.y) * 100}%`,
                }}
                type="button"
              >
                {index + 1}
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
