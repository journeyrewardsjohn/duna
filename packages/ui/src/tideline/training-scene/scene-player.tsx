"use client";

/**
 * `ScenePlayer`: plays a drill. A 2D top-down animation by default (SVG,
 * people and balls moved by ref each frame, no React render per frame) and a
 * 3D view a coach can switch to, loaded only when it is opened. Controls:
 * play / pause, previous / next step, speed, a scrub bar with step marks,
 * loop, and the current step's words as a caption. Rotations replay the same
 * script with the people moved on. Keyboard: Space plays, arrows step,
 * Home / End jump. Reduced motion: no auto-play; stepping shows stills.
 */
import { log } from "@duna/observability";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useId,
} from "react";
import { IconButton } from "../button/button";
import { Segmented } from "../segmented/segmented";
import { threeDimensionalSupport } from "./capability";
import { ballScreenPoint, buildDrawing } from "./drawing";
import type { Orientation } from "./geometry";
import {
  prepareTrainingScene,
  type PreparedScene,
  type SceneCameraPreset,
} from "./prepare";
import type { Stage3D, ScenePalette3D } from "./scene-3d";
import { SceneProblem } from "./scene-problem";
import { SceneSvg, type SceneSvgRefs } from "./scene-svg";
import {
  buildTimeline,
  itemIndexAt,
  sampleTimeline,
  stillTime,
  type Timeline,
} from "./timeline";
import {
  LoopGlyph,
  NextGlyph,
  PauseGlyph,
  PlayGlyph,
  PreviousGlyph,
} from "./transport-icons";

export type ScenePlayerView = "2d" | "3d";

export interface ScenePlayerStep {
  readonly kind: "step" | "rotation";
  /** 1-based step number within its rep. */
  readonly number: number;
  /** 0 for the first rep, 1 after the rotation. */
  readonly rep: number;
}

export interface ScenePlayerProps {
  /** The drill scene document (`duna.drill/2`), as stored. Untrusted. */
  readonly scene: unknown;
  /** The player's accessible name, usually the drill's title. */
  readonly label: string;
  /** Open on this step (1 is the first), shown as a still. */
  readonly step?: number;
  /** Start in 2D (default) or 3D; 3D falls back to 2D where it cannot run. */
  readonly view?: ScenePlayerView;
  /** First camera in 3D; defaults to the scene's own view. */
  readonly camera?: SceneCameraPreset;
  /** Start playing on load. Ignored under reduced motion. */
  readonly autoPlay?: boolean;
  /** Start again at the end. Default true. */
  readonly loop?: boolean;
  /** Play the rotation and the next rep. Default true. */
  readonly rotation?: boolean;
  readonly onStepChange?: (step: ScenePlayerStep) => void;
  readonly className?: string;
}

const SPEEDS = ["0.5", "1", "2"] as const;
const STILL_SECONDS = 2.6;
const PORTRAIT_BELOW = 560;

const CAMERA_OPTIONS = [
  { value: "server", long: "Behind server", short: "Server" },
  { value: "sideline", long: "Sideline", short: "Side" },
  { value: "top", long: "Top", short: "Top" },
  { value: "follow", long: "Follow ball", short: "Ball" },
] as const;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    setReduced(query.matches);
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}

function readPalette(element: HTMLElement): ScenePalette3D {
  const style = getComputedStyle(element);
  const fallback = style.color;
  const read = (name: string) =>
    style.getPropertyValue(`--td-scene-${name}`).trim() || fallback;
  return {
    sky: read("sky"),
    frame: read("frame-3d"),
    courtSand: read("court-sand"),
    courtHard: read("court-hard"),
    line: read("line-3d"),
    net: read("net"),
    ink: read("ink"),
    a: read("a"),
    b: read("b"),
    coach: read("coach-3d"),
    neutral: read("neutral"),
    ball: read("ball"),
    kit: read("kit"),
    zone: read("zone"),
    skin: read("skin"),
  };
}

const formatSeconds = (seconds: number) => `${seconds.toFixed(1)} s`;

export function ScenePlayer(props: ScenePlayerProps): ReactNode {
  const prepared = useMemo(
    () => prepareTrainingScene(props.scene),
    [props.scene],
  );
  if (!prepared.ok) {
    return (
      <SceneProblem
        className={props.className}
        issues={prepared.issues}
        label={props.label}
      />
    );
  }
  return <Player {...props} prepared={prepared.scene} />;
}

function Player({
  prepared,
  label,
  step,
  view: initialView = "2d",
  camera,
  autoPlay = false,
  loop: initialLoop = true,
  rotation = true,
  onStepChange,
  className,
}: ScenePlayerProps & { prepared: PreparedScene }): ReactNode {
  const timeline: Timeline = useMemo(
    () => buildTimeline(prepared, { rotation }),
    [prepared, rotation],
  );
  const id = useId().replaceAll(":", "");
  const reduced = useReducedMotion();
  const initialItem = useMemo(() => {
    if (step === undefined || step < 1) return 0;
    const steps = timeline.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.kind === "step" && item.rep === 0);
    return steps[Math.min(Math.round(step), steps.length) - 1]?.index ?? 0;
  }, [step, timeline]);

  const rootRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const stageRef = useRef<Stage3D | null>(null);
  const timeRef = useRef(
    step !== undefined && step >= 1 ? stillTime(timeline, initialItem) : 0,
  );
  const itemRef = useRef(initialItem);
  const playUntil = useRef<number | null>(null);
  const personEls = useRef(new Map<string, SVGGElement>());
  const ballEls = useRef(new Map<string, SVGGElement>());

  const [itemIndex, setItemIndex] = useState(initialItem);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>("1");
  const [loop, setLoop] = useState(initialLoop);
  const [support, setSupport] = useState<boolean | null>(null);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [stage3d, setStage3d] = useState<"off" | "loading" | "ready">("off");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [preset, setPreset] = useState<SceneCameraPreset | "free">(
    camera ?? prepared.camera,
  );

  // ---- capability, size, and the requested first view ----
  useEffect(() => {
    const result = threeDimensionalSupport();
    setSupport(result.ok);
    if (!result.ok) {
      log.info("ui.scenePlayer.3d.unavailable", { reason: result.reason });
    } else if (initialView === "3d") {
      setView("3d");
    }
  }, [initialView]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? root.clientWidth;
      setOrientation(width < PORTRAIT_BELOW ? "portrait" : "landscape");
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // ---- the static layer for the current step ----
  const drawing = useMemo(() => {
    const item = timeline.items[itemIndex];
    return buildDrawing(timeline, {
      orientation,
      item: itemIndex,
      frame: sampleTimeline(timeline, item ? item.t : 0),
    });
  }, [timeline, orientation, itemIndex]);
  const projection = drawing.projection;
  const liftScale = drawing.sizes.dot * 1.1;

  const refs: SceneSvgRefs = useMemo(
    () => ({
      person: (key, element) => {
        if (element) personEls.current.set(key, element);
        else personEls.current.delete(key);
      },
      ball: (key, element) => {
        if (element) ballEls.current.set(key, element);
        else ballEls.current.delete(key);
      },
    }),
    [],
  );

  const applyFrame = useCallback(
    (time: number) => {
      const frame = sampleTimeline(timeline, time);
      if (frame.item !== itemRef.current) {
        itemRef.current = frame.item;
        setItemIndex(frame.item);
      }
      const spots: { x: number; y: number }[] = [];
      for (const person of frame.people) {
        const at = projection.at(person);
        spots.push({ x: at.x, y: at.y - person.z * liftScale });
        const element = personEls.current.get(person.person);
        if (!element) continue;
        element.setAttribute(
          "transform",
          `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`,
        );
        const lift = element.lastElementChild;
        lift?.setAttribute(
          "transform",
          `translate(0 ${(-person.z * liftScale).toFixed(1)})`,
        );
      }
      for (const ball of frame.balls) {
        const element = ballEls.current.get(ball.id);
        if (!element) continue;
        const at = ballScreenPoint(projection.at(ball), spots, drawing.sizes);
        element.setAttribute(
          "transform",
          `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`,
        );
        element.style.opacity = ball.visible ? String(ball.alpha) : "0";
        element.lastElementChild?.setAttribute(
          "transform",
          `translate(0 ${(-Math.max(ball.z - 0.1, 0) * 4).toFixed(1)})`,
        );
      }
      for (const [key, element] of ballEls.current) {
        if (!frame.balls.some((ball) => ball.id === key)) {
          element.style.opacity = "0";
        }
      }
      if (scrubRef.current) scrubRef.current.value = time.toFixed(2);
      if (clockRef.current) {
        clockRef.current.textContent = `${formatSeconds(time)} / ${formatSeconds(timeline.duration)}`;
      }
      stageRef.current?.render(frame);
    },
    [timeline, projection, liftScale, drawing.sizes],
  );

  // React re-renders the static layer at the step's start: put everyone
  // back where they are now before the browser paints.
  useLayoutEffect(() => {
    applyFrame(timeRef.current);
  }, [applyFrame, drawing, stage3d]);

  const seek = useCallback(
    (time: number) => {
      const clamped = Math.min(Math.max(time, 0), timeline.duration);
      timeRef.current = clamped;
      applyFrame(clamped);
    },
    [applyFrame, timeline],
  );

  // ---- the clock ----
  useEffect(() => {
    if (!playing && stage3d !== "ready") return;
    let frameId = 0;
    let last = performance.now();
    let held = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const rate = Number(speed);
      if (playing) {
        if (reduced) {
          held += dt * rate;
          if (held >= STILL_SECONDS) {
            held = 0;
            const next = itemRef.current + 1;
            if (next < timeline.items.length) seek(stillTime(timeline, next));
            else if (loop) seek(stillTime(timeline, 0));
            else setPlaying(false);
          }
        } else {
          let time = timeRef.current + dt * rate;
          if (playUntil.current !== null && time >= playUntil.current) {
            time = playUntil.current;
            playUntil.current = null;
            setPlaying(false);
          } else if (time >= timeline.duration) {
            if (loop) time = 0;
            else {
              time = timeline.duration;
              setPlaying(false);
            }
          }
          timeRef.current = time;
          applyFrame(time);
        }
      }
      if (stageRef.current?.update(dt) && !playing) {
        stageRef.current.render(sampleTimeline(timeline, timeRef.current));
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [playing, stage3d, speed, loop, reduced, timeline, applyFrame, seek]);

  // Auto-play once, only when motion is welcome.
  const autoPlayed = useRef(false);
  useEffect(() => {
    if (autoPlayed.current || !autoPlay) return;
    autoPlayed.current = true;
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query?.matches) setPlaying(true);
  }, [autoPlay]);

  useEffect(() => {
    const item = timeline.items[itemIndex];
    if (!item || !onStepChange) return;
    onStepChange({ kind: item.kind, number: item.number, rep: item.rep ?? 0 });
  }, [itemIndex, onStepChange, timeline]);

  // ---- 3D: loaded only when opened ----
  useEffect(() => {
    if (view !== "3d") return;
    let cancelled = false;
    const container = glRef.current;
    setStage3d("loading");
    const fallBack = (error: unknown) => {
      log.warn("ui.scenePlayer.3d.failed", { error });
      setSupport(false);
      setView("2d");
    };
    import("./scene-3d")
      .then(({ createStage3D }) => {
        if (cancelled || !container || !rootRef.current) return;
        try {
          const stage = createStage3D(container, timeline, {
            palette: readPalette(rootRef.current),
            reducedMotion: reduced,
            camera: preset === "free" ? prepared.camera : preset,
            onFreeCamera: () => setPreset("free"),
          });
          stageRef.current = stage;
          stage.render(sampleTimeline(timeline, timeRef.current));
          setStage3d("ready");
        } catch (error) {
          fallBack(error);
        }
      })
      .catch(fallBack);
    const observer =
      container && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => stageRef.current?.resize())
        : undefined;
    if (container) observer?.observe(container);
    return () => {
      cancelled = true;
      observer?.disconnect();
      stageRef.current?.dispose();
      stageRef.current = null;
      setStage3d("off");
    };
    // The camera is set by its own effect below; it is left out here so a
    // new camera never reloads the stage.
  }, [view, timeline, reduced]);

  useEffect(() => {
    if (preset !== "free") stageRef.current?.setCamera(preset);
  }, [preset, stage3d]);

  // ---- controls ----
  const goTo = useCallback(
    (target: number) => {
      const index = Math.min(Math.max(target, 0), timeline.items.length - 1);
      const item = timeline.items[index]!;
      if (reduced) {
        playUntil.current = null;
        setPlaying(false);
        seek(stillTime(timeline, index));
        return;
      }
      seek(item.t);
      playUntil.current = stillTime(timeline, index);
      setPlaying(true);
    },
    [reduced, seek, timeline],
  );
  const togglePlay = useCallback(() => {
    if (playing) {
      playUntil.current = null;
      setPlaying(false);
      return;
    }
    playUntil.current = null;
    if (timeRef.current >= timeline.duration - 0.02) {
      seek(reduced ? stillTime(timeline, 0) : 0);
    }
    setPlaying(true);
  }, [playing, reduced, seek, timeline]);
  const previous = useCallback(() => {
    const current = itemIndexAt(timeline, timeRef.current);
    const item = timeline.items[current]!;
    // Mid-step, Previous replays this step; at its start, the one before.
    const target =
      timeRef.current > item.t + 0.4 && !reduced ? current : current - 1;
    goTo(loop && target < 0 ? timeline.items.length - 1 : target);
  }, [goTo, loop, reduced, timeline]);
  const next = useCallback(() => {
    const current = itemIndexAt(timeline, timeRef.current);
    const target = current + 1;
    goTo(target >= timeline.items.length ? (loop ? 0 : current) : target);
  }, [goTo, loop, timeline]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    // The scrub bar and the option groups keep their own arrow keys.
    const ownKeys =
      target instanceof HTMLInputElement ||
      target.closest("[role=radio], [role=radiogroup], .td-scene__gl-host") !==
        null;
    const onButton = target.closest("button") !== null;
    if (event.key === " " && !onButton && !ownKeys) {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "k" && !(target instanceof HTMLInputElement)) {
      event.preventDefault();
      togglePlay();
    } else if (
      (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
      !ownKeys
    ) {
      event.preventDefault();
      if (event.key === "ArrowRight") next();
      else previous();
    } else if ((event.key === "Home" || event.key === "End") && !ownKeys) {
      event.preventDefault();
      goTo(event.key === "Home" ? 0 : timeline.items.length - 1);
    }
  };

  const onStageKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const turns: Record<string, [number, number, number]> = {
      ArrowLeft: [-0.12, 0, 1],
      ArrowRight: [0.12, 0, 1],
      ArrowUp: [0, -0.08, 1],
      ArrowDown: [0, 0.08, 1],
      "+": [0, 0, 0.9],
      "=": [0, 0, 0.9],
      "-": [0, 0, 1.1],
    };
    const turn = turns[event.key];
    if (!turn) return;
    event.preventDefault();
    event.stopPropagation();
    stage.nudge(...turn);
  };

  const item = timeline.items[itemIndex];
  const titleId = `${id}-title`;
  const sentenceId = `${id}-sentence`;
  const show3d = view === "3d";
  const items = timeline.items;

  return (
    <section
      aria-label={label}
      className={`td-scene td-scene--player${className ? ` ${className}` : ""}`}
      data-orientation={orientation}
      data-playing={playing ? "" : undefined}
      data-reduced={reduced ? "" : undefined}
      data-scene-state="ready"
      data-surface={prepared.resolved.court.surface}
      data-view={view}
      data-view3d={stage3d}
      onKeyDown={onKeyDown}
      ref={rootRef}
    >
      <span className="td-sr" id={titleId}>
        {label}
      </span>
      <div className="td-scene__stage">
        <div
          aria-describedby={sentenceId}
          aria-labelledby={titleId}
          className="td-scene__canvas"
          hidden={show3d && stage3d === "ready"}
          role="img"
        >
          <SceneSvg
            ballIds={prepared.resolved.balls.map((ball) => ball.id)}
            className={`td-scene__svg td-scene__svg--${orientation} td-scene__svg--live`}
            drawing={drawing}
            idPrefix={`${id}-${orientation}`}
            refs={refs}
          />
        </div>
        {show3d ? (
          <div
            aria-describedby={sentenceId}
            aria-label="3D view of the drill. Drag, or use the arrow keys, to turn the camera; plus and minus zoom."
            className="td-scene__gl-host"
            data-state={stage3d}
            onKeyDown={onStageKey}
            ref={glRef}
            role="img"
            tabIndex={0}
          />
        ) : null}
      </div>

      <div aria-live={playing ? "off" : "polite"} className="td-scene__now">
        {item ? (
          <>
            <p className="td-scene__now-step">
              {item.kind === "rotation"
                ? "Rotation"
                : `${item.rep === 1 ? "Next rep · " : ""}Step ${item.number} of ${item.of}`}
            </p>
            <p className="td-scene__now-caption">
              {item.caption || item.sentence}
            </p>
            {item.cue ? <p className="td-scene__now-cue">{item.cue}</p> : null}
            <p className="td-scene__now-sentence" id={sentenceId}>
              {item.sentence}
            </p>
          </>
        ) : null}
      </div>

      <div className="td-scene__transport">
        <div className="td-scene__buttons">
          <IconButton
            label="Previous step"
            onClick={previous}
            variant="outline"
          >
            <PreviousGlyph />
          </IconButton>
          <IconButton
            className="td-scene__play"
            label={playing ? "Pause" : reduced ? "Play steps" : "Play"}
            onClick={togglePlay}
            variant="tonal"
          >
            {playing ? <PauseGlyph /> : <PlayGlyph />}
          </IconButton>
          <IconButton label="Next step" onClick={next} variant="outline">
            <NextGlyph />
          </IconButton>
        </div>
        <div className="td-scene__scrub">
          <input
            aria-label="Timeline"
            aria-valuetext={
              item
                ? `${item.kind === "rotation" ? "Rotation" : `Step ${item.number} of ${item.of}`}`
                : undefined
            }
            className="td-scene__range"
            defaultValue={timeRef.current.toFixed(2)}
            max={timeline.duration.toFixed(2)}
            min={0}
            onInput={(event) => {
              playUntil.current = null;
              setPlaying(false);
              const value = Number((event.target as HTMLInputElement).value);
              seek(
                reduced
                  ? stillTime(timeline, itemIndexAt(timeline, value))
                  : value,
              );
            }}
            ref={scrubRef}
            step={0.01}
            type="range"
          />
          <div aria-hidden="true" className="td-scene__marks">
            {items.map((entry, index) => (
              <span
                className={`td-scene__mark td-scene__mark--${entry.kind}`}
                data-current={index === itemIndex ? "" : undefined}
                key={index}
                style={{ left: `${(entry.t / timeline.duration) * 100}%` }}
              />
            ))}
          </div>
        </div>
        <span aria-hidden="true" className="td-scene__clock" ref={clockRef}>
          {formatSeconds(timeRef.current)} / {formatSeconds(timeline.duration)}
        </span>
      </div>

      <div className="td-scene__options">
        <Segmented
          aria-label="Speed"
          onValueChange={(value) => setSpeed(value as (typeof SPEEDS)[number])}
          options={SPEEDS.map((value) => ({ value, label: `${value}×` }))}
          value={speed}
        />
        <button
          aria-pressed={loop}
          className="td-scene__toggle"
          onClick={() => setLoop((value) => !value)}
          type="button"
        >
          <LoopGlyph />
          <span>Loop</span>
        </button>
        {support ? (
          <Segmented
            aria-label="View"
            onValueChange={(value) => setView(value as "2d" | "3d")}
            options={[
              { value: "2d", label: "2D" },
              { value: "3d", label: "3D" },
            ]}
            value={view}
          />
        ) : null}
        {show3d && support ? (
          <Segmented
            aria-label="Camera"
            className="td-scene__cameras"
            onValueChange={(value) => setPreset(value as SceneCameraPreset)}
            options={CAMERA_OPTIONS.map((option) => ({
              value: option.value,
              label: (
                <>
                  <span className="td-scene__long">{option.long}</span>
                  <span className="td-scene__short">{option.short}</span>
                </>
              ),
            }))}
            value={preset}
          />
        ) : null}
      </div>
    </section>
  );
}
