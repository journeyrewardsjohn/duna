"use client";

import { AudioLines, Check, LoaderCircle, Mic, Square } from "lucide-react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type TranscriptionSegment,
} from "livekit-client";
import { useEffect, useRef, useState } from "react";

type GuideState = "ready" | "connecting" | "listening" | "complete";

export function VoiceExperienceGuide({
  configured,
  aiConfigured,
  subjectPersonId,
  subjectName,
  initialNarrative = "",
  onComplete,
}: {
  readonly configured: boolean;
  readonly aiConfigured: boolean;
  readonly subjectPersonId: string;
  readonly subjectName: string;
  readonly initialNarrative?: string;
  readonly onComplete: (narrative: string) => void;
}) {
  const [state, setState] = useState<GuideState>("ready");
  const [narrative, setNarrative] = useState(initialNarrative);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string>();
  const roomRef = useRef<Room | undefined>(undefined);
  const audioElementsRef = useRef<HTMLMediaElement[]>([]);
  const segmentTextRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (state !== "listening") return;
    const interval = window.setInterval(
      () => setElapsed((value) => value + 1),
      1_000,
    );
    return () => window.clearInterval(interval);
  }, [state]);

  useEffect(
    () => () => {
      roomRef.current?.disconnect();
      for (const element of audioElementsRef.current) element.remove();
    },
    [],
  );

  async function begin() {
    if (!configured) return;
    setState("connecting");
    setError(undefined);
    setElapsed(0);
    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectPersonId }),
      });
      const payload = (await response.json()) as {
        participantToken?: string;
        serverUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.participantToken || !payload.serverUrl) {
        throw new Error(payload.error ?? "Voice onboarding is unavailable.");
      }
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.dataset.dunaVoiceGuide = "true";
        document.body.append(element);
        audioElementsRef.current.push(element);
      });
      room.on(
        RoomEvent.TranscriptionReceived,
        (segments: TranscriptionSegment[], participant) => {
          if (participant?.identity !== room.localParticipant.identity) return;
          for (const segment of segments) {
            if (segment.final) {
              segmentTextRef.current.set(segment.id, segment.text.trim());
            }
          }
          const transcript = [...segmentTextRef.current.values()]
            .filter(Boolean)
            .join(" ");
          if (transcript) setNarrative(transcript);
        },
      );
      room.on(RoomEvent.Disconnected, () => {
        setState((current) => (current === "complete" ? "complete" : "ready"));
      });
      await room.connect(payload.serverUrl, payload.participantToken);
      await room.localParticipant.setMicrophoneEnabled(true);
      setState("listening");
    } catch (caught) {
      roomRef.current?.disconnect();
      roomRef.current = undefined;
      setState("ready");
      setError(
        caught instanceof Error
          ? caught.message
          : "Voice onboarding could not be started.",
      );
    }
  }

  async function finish() {
    const room = roomRef.current;
    if (room) {
      await room.localParticipant.setMicrophoneEnabled(false);
      await room.disconnect();
    }
    roomRef.current = undefined;
    setState("complete");
    onComplete(narrative.trim());
  }

  const minutes = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (elapsed % 60).toString().padStart(2, "0");

  return (
    <section className={`voice-guide voice-guide--${state}`}>
      <div className="voice-guide__topline">
        <span>{state === "listening" ? "Listening" : "Voice profile"}</span>
        {state === "listening" && (
          <time>
            {minutes}:{seconds}
          </time>
        )}
      </div>
      <div className="voice-guide__icon" aria-hidden="true">
        {state === "connecting" ? (
          <LoaderCircle className="spin" />
        ) : state === "complete" ? (
          <Check />
        ) : state === "listening" ? (
          <AudioLines />
        ) : (
          <Mic />
        )}
      </div>
      <h3>
        {state === "ready"
          ? "Tell us about the game."
          : state === "connecting"
            ? "Opening a private room…"
            : state === "listening"
              ? "Take your time. We’re listening."
              : "Your story is ready to review."}
      </h3>
      <p>
        Duna will ask a few curated questions about {subjectName}&apos;s playing
        background, then turn the conversation into editable answers.
      </p>

      {state === "listening" && (
        <div className="voice-guide__pulse" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      )}

      <label className="voice-guide__transcript">
        <span>Your editable recap</span>
        <textarea
          value={narrative}
          onChange={(event) => setNarrative(event.target.value)}
          placeholder={`Example: “${subjectName} played indoor in high school and has played beach for four years…”`}
          rows={4}
        />
      </label>

      {error && <p className="form-error">{error}</p>}
      {!configured && (
        <p className="voice-guide__notice">
          Voice is waiting for the LiveKit project keys. You can type the same
          answer now and Duna will still structure it
          {aiConfigured ? " with AI" : " with the guided extractor"}.
        </p>
      )}

      {state === "listening" ? (
        <button className="voice-guide__button" type="button" onClick={finish}>
          <Square aria-hidden="true" />
          I&apos;m finished
        </button>
      ) : (
        <button
          className="voice-guide__button"
          type="button"
          onClick={() =>
            configured ? void begin() : onComplete(narrative.trim())
          }
          disabled={
            state === "connecting" || (!configured && !narrative.trim())
          }
        >
          <Mic aria-hidden="true" />
          {configured ? "Start talking" : "Use my answer"}
        </button>
      )}
      <small>
        Voice is used only for this profile draft. Review every inferred field
        before saving.
      </small>
    </section>
  );
}
