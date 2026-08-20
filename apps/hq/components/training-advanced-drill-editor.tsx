"use client";

import {
  TRAINING_FOCUS_AREAS,
  type DrillEditorAction,
  type DrillEditorObject,
  type DrillEditorPhase,
  type DrillEditorState,
  type TrainingDrill,
  type TrainingFocusArea,
} from "@duna/api/training-contracts";
import {
  ArrowLeft,
  Box,
  Check,
  ChevronRight,
  Circle,
  CircleAlert,
  ClipboardPen,
  Cone,
  Goal,
  ImageIcon,
  MoveRight,
  PersonStanding,
  Play,
  Plus,
  Save,
  Sparkles,
  Square,
  Trash2,
  UserRoundCog,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  generateTrainingDrillStoryboardAction,
  generateTrainingDrillAction,
  saveTrainingDrillAction,
  trainingDrillStoryboardStatusAction,
} from "@/app/training/actions";
import { TrainingCourtAnimation } from "./training-court-animation";

type EditorTab = "draw" | "animate" | "notes" | "output";
type AddTool = DrillEditorObject["kind"] | undefined;
type ActionTool = DrillEditorAction["kind"] | undefined;
type Notice = {
  readonly status: "success" | "error";
  readonly message: string;
};

const actionTools: readonly {
  readonly kind: DrillEditorAction["kind"];
  readonly label: string;
}[] = [
  { kind: "move", label: "Move" },
  { kind: "toss", label: "Toss" },
  { kind: "pass", label: "Pass" },
  { kind: "set", label: "Set" },
  { kind: "attack", label: "Attack" },
  { kind: "serve", label: "Serve" },
  { kind: "block", label: "Block" },
  { kind: "dig", label: "Dig" },
  { kind: "freeball", label: "Freeball" },
  { kind: "rotate", label: "Rotate" },
];

const initialPhase: DrillEditorPhase = {
  id: "phase-1",
  title: "Phase 1 · Build the pattern",
  durationSeconds: 12,
  notes: "",
  objects: [
    {
      id: "coach-1",
      kind: "coach",
      label: "C",
      x: 14,
      y: 48,
      team: "neutral",
      role: "Initiating coach",
      color: "sand",
    },
    {
      id: "player-1",
      kind: "player",
      label: "1",
      x: 32,
      y: 68,
      team: "a",
      role: "Primary passer",
      color: "ink",
    },
    {
      id: "player-2",
      kind: "player",
      label: "2",
      x: 46,
      y: 42,
      team: "a",
      role: "Setter",
      color: "ink",
    },
    {
      id: "ball-1",
      kind: "ball",
      label: "B1",
      x: 18,
      y: 48,
      team: "neutral",
      role: "Entry ball",
      color: "signal",
      ballEntry: "toss",
      initiatedBy: "coach",
      ballOrder: 1,
    },
  ],
  actions: [],
};

const initialEditor: DrillEditorState = {
  court: "beach-full",
  orientation: "vertical",
  phases: [initialPhase],
  overallNotes:
    "Describe the purpose, scoring, rotation, and what a successful rep looks like.",
  outputMarkdown: "",
};

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function objectDefaults(kind: DrillEditorObject["kind"], index: number) {
  const shared = { id: newId(kind), x: 50, y: 50 };
  if (kind === "player") {
    return {
      ...shared,
      kind,
      label: String(index + 1),
      team: "a" as const,
      role: "Player role",
      color: "ink" as const,
    };
  }
  if (kind === "coach") {
    return {
      ...shared,
      kind,
      label: "C",
      team: "neutral" as const,
      role: "Coach",
      color: "sand" as const,
    };
  }
  if (kind === "ball") {
    return {
      ...shared,
      kind,
      label: `B${index + 1}`,
      team: "neutral" as const,
      role: "Entry ball",
      color: "signal" as const,
      ballEntry: "toss" as const,
      initiatedBy: "coach" as const,
      ballOrder: index + 1,
    };
  }
  return {
    ...shared,
    kind,
    label:
      kind === "box" ? "BOX" : kind === "target" ? "T" : kind[0]!.toUpperCase(),
    team: "neutral" as const,
    role: kind,
    color: kind === "cone" ? ("flare" as const) : ("marine" as const),
  };
}

function editorDescription(editor: DrillEditorState): string {
  const actionLines = editor.phases.flatMap((phase) =>
    phase.actions.map((action) => {
      const actor = phase.objects.find(
        (object) => object.id === action.actorId,
      );
      const target = action.targetObjectId
        ? phase.objects.find((object) => object.id === action.targetObjectId)
        : undefined;
      return `${phase.title}: ${actor?.label ?? "actor"} ${action.kind}${target ? ` to ${target.label}` : ""}${action.intent ? ` to ${action.intent}` : ""}.`;
    }),
  );
  return [
    editor.overallNotes,
    ...editor.phases.map((phase) => phase.notes),
    ...actionLines,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 6_000);
}

function CourtDiagram({
  actionTool,
  activePhase,
  addTool,
  court,
  draggingId,
  pendingActorId,
  playing,
  selectedObjectId,
  onCourtPointer,
  onObjectPointerDown,
  onObjectSelect,
  onPointerMove,
  onPointerUp,
}: {
  readonly actionTool: ActionTool;
  readonly activePhase: DrillEditorPhase;
  readonly addTool: AddTool;
  readonly court: DrillEditorState["court"];
  readonly draggingId?: string;
  readonly pendingActorId?: string;
  readonly playing: boolean;
  readonly selectedObjectId?: string;
  readonly onCourtPointer: (x: number, y: number) => void;
  readonly onObjectPointerDown: (id: string) => void;
  readonly onObjectSelect: (id: string) => void;
  readonly onPointerMove: (x: number, y: number) => void;
  readonly onPointerUp: () => void;
}) {
  const courtRef = useRef<HTMLDivElement>(null);
  const halfCourt = court.endsWith("-half");
  const indoorCourt = court.startsWith("indoor-");
  const coordinates = (event: {
    readonly clientX: number;
    readonly clientY: number;
  }) => {
    const rect = courtRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return {
      x: Math.max(
        2,
        Math.min(98, ((event.clientX - rect.left) / rect.width) * 100),
      ),
      y: Math.max(
        2,
        Math.min(98, ((event.clientY - rect.top) / rect.height) * 100),
      ),
    };
  };
  return (
    <div
      className={`training-advanced-court${playing ? " is-playing" : ""}${addTool || actionTool ? " has-active-tool" : ""}`}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const point = coordinates(event);
        onCourtPointer(point.x, point.y);
      }}
      onPointerMove={(event) => {
        if (!draggingId) return;
        const point = coordinates(event);
        onPointerMove(point.x, point.y);
      }}
      onPointerUp={onPointerUp}
      ref={courtRef}
      role="application"
      aria-label="Volleyball drill court editor"
    >
      <svg
        aria-hidden
        className="training-advanced-court__surface"
        viewBox="0 0 100 100"
      >
        <defs>
          <marker
            id="advanced-arrow"
            markerHeight="4"
            markerWidth="4"
            orient="auto"
            refX="3"
            refY="2"
          >
            <path d="M0,0 L4,2 L0,4 Z" />
          </marker>
          <pattern
            id="advanced-sand"
            height="4"
            patternUnits="userSpaceOnUse"
            width="4"
          >
            <circle cx="1" cy="1" r=".18" />
            <circle cx="3" cy="2.8" r=".12" />
          </pattern>
        </defs>
        <rect className="court-fill" height="100" rx="3" width="100" />
        <rect
          className="court-grain"
          fill="url(#advanced-sand)"
          height="100"
          rx="3"
          width="100"
        />
        <rect
          className="court-line"
          height={halfCourt ? 72 : 90}
          width={halfCourt ? 72 : 46}
          x={halfCourt ? 14 : 27}
          y={halfCourt ? 10 : 5}
        />
        <line
          className="court-line court-line--net"
          x1="10"
          x2="90"
          y1={halfCourt ? 10 : 50}
          y2={halfCourt ? 10 : 50}
        />
        {indoorCourt ? (
          <>
            <line
              className="court-line court-line--attack"
              x1={halfCourt ? 14 : 27}
              x2={halfCourt ? 86 : 73}
              y1={halfCourt ? 34 : 35}
              y2={halfCourt ? 34 : 35}
            />
            {!halfCourt ? (
              <line
                className="court-line court-line--attack"
                x1="27"
                x2="73"
                y1="65"
                y2="65"
              />
            ) : null}
          </>
        ) : null}
        {activePhase.actions.map((action) => {
          const actor = activePhase.objects.find(
            (object) => object.id === action.actorId,
          );
          if (!actor) return null;
          const target = action.targetObjectId
            ? activePhase.objects.find(
                (object) => object.id === action.targetObjectId,
              )
            : undefined;
          const x2 = target?.x ?? action.toX;
          const y2 = target?.y ?? action.toY;
          return (
            <g
              className={`court-action court-action--${action.kind}`}
              key={action.id}
            >
              <path
                d={`M ${actor.x} ${actor.y} Q ${(actor.x + x2) / 2 + (action.withBall ? 3 : 0)} ${Math.min(actor.y, y2) - (action.withBall ? 6 : 1)} ${x2} ${y2}`}
                markerEnd="url(#advanced-arrow)"
                pathLength="1"
                style={{ animationDelay: `${(action.order - 1) * 320}ms` }}
              />
              <text
                fontSize="2.5"
                x={(actor.x + x2) / 2}
                y={(actor.y + y2) / 2 - 1}
              >
                {action.order}
              </text>
            </g>
          );
        })}
      </svg>
      {activePhase.objects.map((object) => (
        <button
          aria-label={`${object.kind} ${object.label}`}
          className={`training-advanced-object training-advanced-object--${object.kind} training-advanced-object--${object.color}${selectedObjectId === object.id ? " is-selected" : ""}${pendingActorId === object.id ? " is-action-source" : ""}`}
          key={object.id}
          onClick={(event) => {
            event.stopPropagation();
            onObjectSelect(object.id);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            onObjectPointerDown(object.id);
          }}
          style={{ left: `${object.x}%`, top: `${object.y}%` }}
          type="button"
        >
          {object.kind === "cone" ? <Cone aria-hidden size={18} /> : null}
          {object.kind === "box" ? <Box aria-hidden size={18} /> : null}
          {object.kind === "target" ? <Goal aria-hidden size={18} /> : null}
          {object.kind === "shape" ? <Square aria-hidden size={18} /> : null}
          {object.kind === "coach" ? (
            <UserRoundCog aria-hidden size={18} />
          ) : null}
          {object.kind === "player" ? <span>{object.label}</span> : null}
          {object.kind === "ball" ? <span>{object.label}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function TrainingAdvancedDrillEditor() {
  const router = useRouter();
  const [tab, setTab] = useState<EditorTab>("draw");
  const [title, setTitle] = useState("Untitled volleyball drill");
  const [editor, setEditor] = useState<DrillEditorState>(initialEditor);
  const [activePhaseId, setActivePhaseId] = useState(initialPhase.id);
  const [selectedObjectId, setSelectedObjectId] = useState<string>();
  const [addTool, setAddTool] = useState<AddTool>();
  const [actionTool, setActionTool] = useState<ActionTool>();
  const [pendingActorId, setPendingActorId] = useState<string>();
  const [draggingId, setDraggingId] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [focusArea, setFocusArea] = useState<TrainingFocusArea>("Ball Control");
  const [mode, setMode] = useState<
    "cooperative" | "competitive" | "hybrid" | "individual"
  >("hybrid");
  const [durationMinutes, setDurationMinutes] = useState(12);
  const [intensity, setIntensity] = useState(6);
  const [publication, setPublication] = useState<"private" | "free" | "paid">(
    "private",
  );
  const [price, setPrice] = useState("9.00");
  const [draft, setDraft] = useState<TrainingDrill>();
  const [notice, setNotice] = useState<Notice>();
  const [interpreting, startInterpreting] = useTransition();
  const [rendering, startRendering] = useTransition();
  const [saving, startSaving] = useTransition();

  const activePhase =
    editor.phases.find((phase) => phase.id === activePhaseId) ??
    editor.phases[0]!;
  const selectedObject = activePhase.objects.find(
    (object) => object.id === selectedObjectId,
  );

  const replacePhase = (next: DrillEditorPhase) => {
    setDraft(undefined);
    setEditor((current) => ({
      ...current,
      phases: current.phases.map((phase) =>
        phase.id === next.id ? next : phase,
      ),
    }));
  };

  const updateObject = (id: string, patch: Partial<DrillEditorObject>) => {
    replacePhase({
      ...activePhase,
      objects: activePhase.objects.map((object) =>
        object.id === id ? { ...object, ...patch } : object,
      ),
    });
  };

  const addAction = (
    actorId: string,
    x: number,
    y: number,
    targetObjectId?: string,
  ) => {
    if (!actionTool) return;
    const ballAction = [
      "toss",
      "pass",
      "set",
      "attack",
      "serve",
      "dig",
      "freeball",
      "hold",
    ].includes(actionTool);
    replacePhase({
      ...activePhase,
      actions: [
        ...activePhase.actions,
        {
          id: newId("action"),
          order: activePhase.actions.length + 1,
          kind: actionTool,
          actorId,
          ...(targetObjectId ? { targetObjectId } : {}),
          toX: x,
          toY: y,
          withBall: ballAction,
          simultaneous: false,
          intent:
            actionTool === "move"
              ? "arrive balanced and ready"
              : `${actionTool} with purpose`,
        },
      ],
    });
    setPendingActorId(undefined);
  };

  const handleCourtPointer = (x: number, y: number) => {
    if (addTool) {
      const sameKindCount = activePhase.objects.filter(
        (object) => object.kind === addTool,
      ).length;
      const object = { ...objectDefaults(addTool, sameKindCount), x, y };
      replacePhase({
        ...activePhase,
        objects: [...activePhase.objects, object],
      });
      setSelectedObjectId(object.id);
      setAddTool(undefined);
      return;
    }
    if (actionTool && pendingActorId) addAction(pendingActorId, x, y);
  };

  const selectObject = (id: string) => {
    if (actionTool) {
      if (!pendingActorId) {
        setPendingActorId(id);
        return;
      }
      if (pendingActorId !== id) {
        const target = activePhase.objects.find((object) => object.id === id);
        if (target) addAction(pendingActorId, target.x, target.y, id);
        return;
      }
    }
    setSelectedObjectId(id);
  };

  const addPhase = () => {
    const phaseId = newId("phase");
    const next: DrillEditorPhase = {
      id: phaseId,
      title: `Phase ${editor.phases.length + 1} · Add the next read`,
      durationSeconds: 12,
      notes: "",
      objects: activePhase.objects.map((object) => ({
        ...object,
        id: newId(object.kind),
      })),
      actions: [],
    };
    setDraft(undefined);
    setEditor((current) => ({ ...current, phases: [...current.phases, next] }));
    setActivePhaseId(phaseId);
    setSelectedObjectId(undefined);
  };

  const interpret = () => {
    setNotice(undefined);
    startInterpreting(async () => {
      const description = editorDescription(editor);
      const result = await generateTrainingDrillAction({
        description:
          description.length >= 20
            ? description
            : "Interpret the structured volleyball drill phases and preserve every ordered action.",
        titleHint: title,
        discipline: editor.court.startsWith("indoor") ? "indoor" : "beach-2s",
        skillLevel: "Intermediate–Advanced",
        mode,
        playerCount: Math.max(
          1,
          activePhase.objects.filter((object) => object.kind === "player")
            .length,
        ),
        minPlayers: Math.max(
          1,
          activePhase.objects.filter((object) => object.kind === "player")
            .length,
        ),
        maxPlayers: Math.max(
          2,
          activePhase.objects.filter((object) => object.kind === "player")
            .length * 2,
        ),
        durationMinutes,
        ballCount: Math.max(
          1,
          activePhase.objects.filter((object) => object.kind === "ball").length,
        ),
        intensity,
        focusArea,
        editor,
      });
      setNotice(result);
      if (result.status === "success") {
        setDraft(result.value);
        setTitle(result.value.title);
        setEditor((current) => ({
          ...current,
          outputMarkdown:
            current.outputMarkdown || result.value.descriptionMarkdown,
        }));
        setTab("output");
      }
    });
  };

  const save = () => {
    if (!draft) {
      setNotice({
        status: "error",
        message:
          "Interpret the drill with Sol before saving so the coaching output and animation brief are complete.",
      });
      return;
    }
    setNotice(undefined);
    startSaving(async () => {
      const priceMinor = Math.round(Number(price) * 100);
      const result = await saveTrainingDrillAction({
        ...draft,
        title,
        editor,
        visibility: publication === "private" ? "organization" : "public",
        ...(publication === "private"
          ? { marketplace: undefined }
          : {
              marketplace: {
                offer: publication,
                ...(publication === "paid" && Number.isFinite(priceMinor)
                  ? { priceMinor }
                  : {}),
                currency: "USD",
              },
            }),
      });
      setNotice(result);
      if (result.status === "success") {
        router.push(`/training?view=drills&saved=${result.value.id}`);
        router.refresh();
      }
    });
  };

  const pollStoryboard = (jobId: string, attempt = 0) => {
    window.setTimeout(
      async () => {
        const result = await trainingDrillStoryboardStatusAction(jobId);
        if (result.status === "error") {
          setNotice(result);
          return;
        }
        if (result.value.resultUrl) {
          setNotice({ status: "success", message: result.message });
          setDraft((current) =>
            current
              ? {
                  ...current,
                  animation: {
                    ...current.animation,
                    status: "review",
                    kind: "generated-image",
                    reviewed: false,
                    url: result.value.resultUrl,
                  },
                }
              : current,
          );
          return;
        }
        if (
          ["failed", "cancelled", "canceled"].includes(
            result.value.status.toLowerCase(),
          )
        ) {
          setNotice({
            status: "error",
            message:
              result.value.failureReason ??
              "The storyboard could not be rendered. Your structured drill is still safe.",
          });
          return;
        }
        if (attempt >= 40) {
          setNotice({
            status: "success",
            message:
              "The storyboard is still rendering. You can keep editing and return to Output shortly.",
          });
          return;
        }
        pollStoryboard(jobId, attempt + 1);
      },
      attempt === 0 ? 1_000 : 2_000,
    );
  };

  const renderStoryboard = () => {
    if (!draft) return;
    setNotice(undefined);
    startRendering(async () => {
      const result = await generateTrainingDrillStoryboardAction(draft);
      setNotice(result);
      if (result.status === "success") pollStoryboard(result.value.id);
    });
  };

  const phaseActionSummary = useMemo(
    () =>
      activePhase.actions
        .map((action) => `${action.order}. ${action.kind}`)
        .join(" · "),
    [activePhase.actions],
  );

  return (
    <main className="training-advanced-editor" data-zone="editorial">
      <header className="training-advanced-editor__topbar">
        <Link
          className="training-advanced-editor__close"
          href="/training?view=drills"
        >
          <ArrowLeft aria-hidden size={18} /> Close
        </Link>
        <nav aria-label="Drill editor sections">
          {(
            [
              ["draw", ClipboardPen, "Draw"],
              ["animate", Play, "Animate"],
              ["notes", Sparkles, "Notes"],
              ["output", ImageIcon, "Output"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              className={tab === id ? "active" : undefined}
              key={id}
              onClick={() => setTab(id)}
              type="button"
            >
              <Icon aria-hidden size={16} /> {label}
            </button>
          ))}
        </nav>
        <input
          aria-label="Drill title"
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
        <button
          className="training-advanced-editor__interpret"
          disabled={interpreting}
          onClick={interpret}
          type="button"
        >
          <WandSparkles aria-hidden size={17} />{" "}
          {interpreting ? "Sol is interpreting…" : "Interpret with Sol"}
        </button>
        <button
          className="training-advanced-editor__save"
          disabled={saving || !draft}
          onClick={save}
          type="button"
        >
          <Save aria-hidden size={17} /> {saving ? "Saving…" : "Save drill"}
        </button>
      </header>

      <aside className="training-advanced-editor__phases">
        <header>
          <span>Phases</span>
          <button onClick={addPhase} title="Add phase" type="button">
            <Plus aria-hidden size={16} />
          </button>
        </header>
        <div>
          {editor.phases.map((phase, index) => (
            <button
              className={phase.id === activePhase.id ? "active" : undefined}
              key={phase.id}
              onClick={() => setActivePhaseId(phase.id)}
              type="button"
            >
              <span>{index + 1}</span>
              <strong>{phase.title}</strong>
              <small>
                {phase.actions.length} action
                {phase.actions.length === 1 ? "" : "s"} ·{" "}
                {phase.durationSeconds}s
              </small>
            </button>
          ))}
        </div>
        <button
          className="training-advanced-editor__next-phase"
          onClick={addPhase}
          type="button"
        >
          Next phase <ChevronRight aria-hidden size={16} />
        </button>
      </aside>

      <section className="training-advanced-editor__workspace">
        {notice ? (
          <p
            className={`training-studio-notice training-studio-notice--${notice.status}`}
            role={notice.status === "error" ? "alert" : "status"}
          >
            {notice.status === "success" ? (
              <Check aria-hidden size={15} />
            ) : (
              <CircleAlert aria-hidden size={15} />
            )}
            {notice.message}
          </p>
        ) : null}
        {tab === "draw" || tab === "animate" ? (
          <>
            <div className="training-advanced-editor__phase-heading">
              <input
                aria-label="Phase title"
                onChange={(event) =>
                  replacePhase({ ...activePhase, title: event.target.value })
                }
                value={activePhase.title}
              />
              <span>
                {phaseActionSummary ||
                  "Add an action, then choose its source and destination."}
              </span>
            </div>
            <CourtDiagram
              actionTool={actionTool}
              activePhase={activePhase}
              addTool={addTool}
              court={editor.court}
              draggingId={draggingId}
              pendingActorId={pendingActorId}
              playing={playing}
              selectedObjectId={selectedObjectId}
              onCourtPointer={handleCourtPointer}
              onObjectPointerDown={(id) =>
                setDraggingId(actionTool ? undefined : id)
              }
              onObjectSelect={selectObject}
              onPointerMove={(x, y) =>
                draggingId && updateObject(draggingId, { x, y })
              }
              onPointerUp={() => setDraggingId(undefined)}
            />
            {tab === "animate" ? (
              <div className="training-advanced-timeline">
                <header>
                  <div>
                    <span>Action timeline</span>
                    <strong>{activePhase.actions.length} ordered beats</strong>
                  </div>
                  <button
                    onClick={() => setPlaying((value) => !value)}
                    type="button"
                  >
                    <Play aria-hidden size={16} />{" "}
                    {playing ? "Restart" : "Play phase"}
                  </button>
                </header>
                {activePhase.actions.map((action) => (
                  <article key={action.id}>
                    <span>{action.order}</span>
                    <div>
                      <strong>{action.kind}</strong>
                      <input
                        aria-label={`Intent for action ${action.order}`}
                        onChange={(event) =>
                          replacePhase({
                            ...activePhase,
                            actions: activePhase.actions.map((candidate) =>
                              candidate.id === action.id
                                ? { ...candidate, intent: event.target.value }
                                : candidate,
                            ),
                          })
                        }
                        value={action.intent ?? ""}
                      />
                    </div>
                    <label>
                      <input
                        checked={action.simultaneous}
                        onChange={(event) =>
                          replacePhase({
                            ...activePhase,
                            actions: activePhase.actions.map((candidate) =>
                              candidate.id === action.id
                                ? {
                                    ...candidate,
                                    simultaneous: event.target.checked,
                                  }
                                : candidate,
                            ),
                          })
                        }
                        type="checkbox"
                      />{" "}
                      simultaneous
                    </label>
                    <button
                      aria-label={`Delete action ${action.order}`}
                      onClick={() =>
                        replacePhase({
                          ...activePhase,
                          actions: activePhase.actions
                            .filter((candidate) => candidate.id !== action.id)
                            .map((candidate, index) => ({
                              ...candidate,
                              order: index + 1,
                            })),
                        })
                      }
                      type="button"
                    >
                      <Trash2 aria-hidden size={15} />
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "notes" ? (
          <div className="training-advanced-notes">
            <span className="hq-eyebrow">Coach context</span>
            <h2>Give Sol the decisions behind the drawing.</h2>
            <p>
              The canvas describes where and when. Notes explain why, how to
              score it, and what quality looks like.
            </p>
            <label>
              <span>Overall drill notes</span>
              <textarea
                onChange={(event) => {
                  setDraft(undefined);
                  setEditor((current) => ({
                    ...current,
                    overallNotes: event.target.value,
                  }));
                }}
                rows={9}
                value={editor.overallNotes}
              />
            </label>
            <label>
              <span>{activePhase.title}</span>
              <textarea
                onChange={(event) =>
                  replacePhase({ ...activePhase, notes: event.target.value })
                }
                placeholder="What changes in this phase? What should the coach watch?"
                rows={7}
                value={activePhase.notes}
              />
            </label>
          </div>
        ) : null}

        {tab === "output" ? (
          <div className="training-advanced-output">
            {!draft ? (
              <div className="training-advanced-output__empty">
                <Sparkles aria-hidden size={28} />
                <span className="hq-eyebrow">Sol coaching interpretation</span>
                <h2>Your drawing becomes a teachable drill here.</h2>
                <p>
                  Interpret the drill when the phases, contacts, and notes are
                  ready. Duna will explain how to run it, coach it, progress it,
                  and direct the animation model.
                </p>
                <button onClick={interpret} type="button">
                  <WandSparkles aria-hidden size={17} /> Interpret with Sol
                </button>
              </div>
            ) : (
              <>
                <header>
                  <div>
                    <span>{draft.focusArea}</span>
                    <h2>{draft.title}</h2>
                    <p>{draft.summary}</p>
                  </div>
                  <aside>
                    <small>Animation director</small>
                    <strong>
                      Sol 5.6 →{" "}
                      {draft.animation.renderModel === "gpt_image_2"
                        ? "GPT Image 2"
                        : draft.animation.renderModel}
                    </strong>
                    <span>Structured court + coaching context</span>
                    <button
                      disabled={rendering}
                      onClick={renderStoryboard}
                      type="button"
                    >
                      <ImageIcon aria-hidden size={15} />
                      {rendering ? "Starting render…" : "Render storyboard"}
                    </button>
                  </aside>
                </header>
                {draft.animation.kind === "generated-image" &&
                draft.animation.url ? (
                  <TrainingCourtAnimation drill={draft} />
                ) : null}
                <div className="training-advanced-output__columns">
                  <section>
                    <span className="hq-eyebrow">Run it</span>
                    <ol>
                      {draft.steps.map((step, index) => (
                        <li key={`${step}-${index}`}>
                          <span>{index + 1}</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </section>
                  <section>
                    <span className="hq-eyebrow">Coach it</span>
                    <ul>
                      {draft.coachingCues.map((cue) => (
                        <li key={cue}>{cue}</li>
                      ))}
                    </ul>
                    <strong>Scoring</strong>
                    <p>{draft.scoring}</p>
                  </section>
                </div>
                {draft.interpretation ? (
                  <section className="training-advanced-output__progression">
                    <span className="hq-eyebrow">Progression</span>
                    <div>
                      <article>
                        <small>Simplify</small>
                        <p>{draft.interpretation.progression.simplify}</p>
                      </article>
                      <article>
                        <small>Place in a program</small>
                        <p>{draft.interpretation.progression.programFit}</p>
                      </article>
                      <article>
                        <small>Progress next</small>
                        <p>{draft.interpretation.progression.nextDrill}</p>
                      </article>
                    </div>
                  </section>
                ) : null}
                <section className="training-advanced-output__director">
                  <span className="hq-eyebrow">Animation brief</span>
                  <p>{draft.animation.directorBrief}</p>
                  <details>
                    <summary>Storyboard prompt</summary>
                    <p>{draft.animation.storyboardPrompt}</p>
                  </details>
                </section>
                <label className="training-advanced-output__markdown">
                  <span className="hq-eyebrow">Advanced output editor</span>
                  <textarea
                    aria-label="Drill output markdown"
                    onChange={(event) => {
                      const outputMarkdown = event.target.value;
                      setEditor((current) => ({
                        ...current,
                        outputMarkdown,
                      }));
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              descriptionMarkdown: outputMarkdown,
                            }
                          : current,
                      );
                    }}
                    rows={14}
                    value={editor.outputMarkdown}
                  />
                  <small>
                    Markdown stays with this version of the drill and can be
                    refined after Sol structures the first draft.
                  </small>
                </label>
              </>
            )}
          </div>
        ) : null}
      </section>

      <aside className="training-advanced-editor__inspector">
        {tab === "draw" ? (
          <>
            <section>
              <span>Add actions</span>
              <div className="training-advanced-tools training-advanced-tools--actions">
                {actionTools.map((tool) => (
                  <button
                    className={actionTool === tool.kind ? "active" : undefined}
                    key={tool.kind}
                    onClick={() => {
                      setActionTool(
                        actionTool === tool.kind ? undefined : tool.kind,
                      );
                      setAddTool(undefined);
                      setPendingActorId(undefined);
                    }}
                    type="button"
                  >
                    <MoveRight aria-hidden size={15} /> {tool.label}
                  </button>
                ))}
              </div>
              {actionTool ? (
                <small>
                  Choose the actor, then a player or court destination.
                </small>
              ) : null}
            </section>
            <section>
              <span>Add people + ball</span>
              <div className="training-advanced-tools">
                {(
                  [
                    ["player", PersonStanding, "Player"],
                    ["coach", UserRoundCog, "Coach"],
                    ["ball", Circle, "Ball"],
                  ] as const
                ).map(([kind, Icon, label]) => (
                  <button
                    className={addTool === kind ? "active" : undefined}
                    key={kind}
                    onClick={() => {
                      setAddTool(kind);
                      setActionTool(undefined);
                    }}
                    type="button"
                  >
                    <Icon aria-hidden size={16} /> {label}
                  </button>
                ))}
              </div>
            </section>
            <section>
              <span>Add equipment</span>
              <div className="training-advanced-tools">
                {(
                  [
                    ["cone", Cone, "Cone"],
                    ["box", Box, "Box"],
                    ["target", Goal, "Target"],
                    ["shape", Square, "Shape"],
                  ] as const
                ).map(([kind, Icon, label]) => (
                  <button
                    className={addTool === kind ? "active" : undefined}
                    key={kind}
                    onClick={() => {
                      setAddTool(kind);
                      setActionTool(undefined);
                    }}
                    type="button"
                  >
                    <Icon aria-hidden size={16} /> {label}
                  </button>
                ))}
              </div>
            </section>
            {selectedObject ? (
              <section className="training-advanced-object-editor">
                <header>
                  <span>{selectedObject.kind}</span>
                  <button
                    aria-label="Delete selected object"
                    onClick={() => {
                      replacePhase({
                        ...activePhase,
                        objects: activePhase.objects.filter(
                          (object) => object.id !== selectedObject.id,
                        ),
                        actions: activePhase.actions.filter(
                          (action) =>
                            action.actorId !== selectedObject.id &&
                            action.targetObjectId !== selectedObject.id,
                        ),
                      });
                      setSelectedObjectId(undefined);
                    }}
                    type="button"
                  >
                    <Trash2 aria-hidden size={15} />
                  </button>
                </header>
                <label>
                  <span>Label</span>
                  <input
                    onChange={(event) =>
                      updateObject(selectedObject.id, {
                        label: event.target.value,
                      })
                    }
                    value={selectedObject.label}
                  />
                </label>
                <label>
                  <span>Role</span>
                  <input
                    onChange={(event) =>
                      updateObject(selectedObject.id, {
                        role: event.target.value,
                      })
                    }
                    value={selectedObject.role ?? ""}
                  />
                </label>
                {selectedObject.kind === "player" ? (
                  <label>
                    <span>Side</span>
                    <select
                      onChange={(event) =>
                        updateObject(selectedObject.id, {
                          team: event.target.value as DrillEditorObject["team"],
                        })
                      }
                      value={selectedObject.team}
                    >
                      <option value="a">Working side</option>
                      <option value="b">Defending side</option>
                      <option value="neutral">Queue / neutral</option>
                    </select>
                  </label>
                ) : null}
                {selectedObject.kind === "ball" ? (
                  <>
                    <label>
                      <span>Entry</span>
                      <select
                        onChange={(event) =>
                          updateObject(selectedObject.id, {
                            ballEntry: event.target.value as
                              "toss" | "held" | "freeball" | "serve",
                          })
                        }
                        value={selectedObject.ballEntry}
                      >
                        <option value="toss">Toss</option>
                        <option value="held">Held</option>
                        <option value="freeball">Freeball</option>
                        <option value="serve">Serve</option>
                      </select>
                    </label>
                    <label>
                      <span>Initiated by</span>
                      <select
                        onChange={(event) =>
                          updateObject(selectedObject.id, {
                            initiatedBy: event.target.value as
                              "player" | "coach",
                          })
                        }
                        value={selectedObject.initiatedBy}
                      >
                        <option value="coach">Coach</option>
                        <option value="player">Player</option>
                      </select>
                    </label>
                    <label>
                      <span>Ball order</span>
                      <input
                        min="1"
                        onChange={(event) =>
                          updateObject(selectedObject.id, {
                            ballOrder: Number(event.target.value),
                          })
                        }
                        type="number"
                        value={selectedObject.ballOrder}
                      />
                    </label>
                  </>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
        {tab === "animate" ? (
          <section>
            <span>Phase timing</span>
            <label>
              <span>Seconds</span>
              <input
                min="2"
                max="60"
                onChange={(event) =>
                  replacePhase({
                    ...activePhase,
                    durationSeconds: Number(event.target.value),
                  })
                }
                type="number"
                value={activePhase.durationSeconds}
              />
            </label>
            <p>
              Action order tells Sol who moves and contacts the ball first.
              “Simultaneous” keeps coordinated reads together.
            </p>
          </section>
        ) : null}
        {tab === "notes" || tab === "output" ? (
          <>
            <section>
              <span>Drill settings</span>
              <label>
                <span>Court</span>
                <select
                  onChange={(event) => {
                    setDraft(undefined);
                    setEditor((current) => ({
                      ...current,
                      court: event.target.value as DrillEditorState["court"],
                    }));
                  }}
                  value={editor.court}
                >
                  <option value="beach-full">Beach · full court</option>
                  <option value="beach-half">Beach · half court</option>
                  <option value="indoor-full">Indoor · full court</option>
                  <option value="indoor-half">Indoor · half court</option>
                </select>
              </label>
              <label>
                <span>Focus</span>
                <select
                  onChange={(event) => {
                    setDraft(undefined);
                    setFocusArea(event.target.value as TrainingFocusArea);
                  }}
                  value={focusArea}
                >
                  {TRAINING_FOCUS_AREAS.map((focus) => (
                    <option key={focus}>{focus}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Format</span>
                <select
                  onChange={(event) => {
                    setDraft(undefined);
                    setMode(event.target.value as typeof mode);
                  }}
                  value={mode}
                >
                  <option value="cooperative">Cooperative</option>
                  <option value="competitive">Competitive</option>
                  <option value="hybrid">Build, then compete</option>
                  <option value="individual">Individual</option>
                </select>
              </label>
              <label>
                <span>Minutes</span>
                <input
                  min="1"
                  onChange={(event) => {
                    setDraft(undefined);
                    setDurationMinutes(Number(event.target.value));
                  }}
                  type="number"
                  value={durationMinutes}
                />
              </label>
              <label>
                <span>Intensity · {intensity}/10</span>
                <input
                  max="10"
                  min="1"
                  onChange={(event) => {
                    setDraft(undefined);
                    setIntensity(Number(event.target.value));
                  }}
                  type="range"
                  value={intensity}
                />
              </label>
            </section>
            <section className="training-advanced-publish">
              <span>Publish</span>
              <label>
                <input
                  checked={publication === "private"}
                  onChange={() => setPublication("private")}
                  type="radio"
                />{" "}
                Private to organization
              </label>
              <label>
                <input
                  checked={publication === "free"}
                  onChange={() => setPublication("free")}
                  type="radio"
                />{" "}
                Free in Drill Marketplace
              </label>
              <label>
                <input
                  checked={publication === "paid"}
                  onChange={() => setPublication("paid")}
                  type="radio"
                />{" "}
                Paid in Drill Marketplace
              </label>
              {publication === "paid" ? (
                <label>
                  <span>Price · USD</span>
                  <input
                    inputMode="decimal"
                    onChange={(event) => setPrice(event.target.value)}
                    value={price}
                  />
                </label>
              ) : null}
              <small>
                Your organization always has full access. Shared drills enter
                the Drill Marketplace as soon as you save them.
              </small>
            </section>
          </>
        ) : null}
      </aside>
    </main>
  );
}
