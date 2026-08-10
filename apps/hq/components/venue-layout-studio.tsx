"use client";

import type {
  VenueLayout,
  VenueLayoutAsset,
  VenueLayoutGeometry,
  VenueLayoutWorkspace,
} from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import { upload } from "@vercel/blob/client";
import {
  ArrowLeft,
  Bot,
  BoxSelect,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDot,
  Copy,
  Eye,
  EyeOff,
  Grid2X2,
  Layers3,
  Link2,
  Lock,
  Map,
  MapPin,
  Maximize2,
  Move3D,
  ParkingCircle,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  ScanLine,
  Shapes,
  Sparkles,
  Table2,
  Ticket,
  Toilet,
  Trash2,
  Unlock,
  UploadCloud,
  Users,
  Utensils,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  applyVenueLayoutCourtAssignmentsAction,
  createCourtFromVenueLayoutAction,
  createVenueLayoutAction,
  previewVenueLayoutCourtAssignmentsAction,
  publishVenueLayoutAction,
  saveVenueLayoutAction,
  saveVenueLayoutEventSettingsAction,
  type OperatorActionState,
} from "@/app/actions";
import type { FloorplanAnalysisProposal } from "@/lib/floorplan-analysis";
import { createVenueMediaPath, optimizeImageUpload } from "@/lib/media-storage";
import {
  VENUE_LAYOUT_TEMPLATES,
  type VenueLayoutTemplate,
} from "@/lib/venue-layout-geometry";
import { VenueFloorplanCanvas } from "./venue-floorplan-canvas";
import { VenueLayoutMap } from "./venue-layout-map";

const initialState: OperatorActionState = { status: "idle", message: "" };

type Palette = VenueLayoutAsset["appearance"]["palette"];

interface CourtDraft {
  readonly assetId: string;
  readonly template: VenueLayoutTemplate;
  readonly geometry: VenueLayoutGeometry;
  readonly suggestedName?: string;
}

function assetKindLabel(kind: VenueLayoutAsset["kind"]): string {
  return {
    court: "Court",
    shape: "Labeled shape",
    "ticketed-space": "Ticketed space",
    table: "Table",
    amenity: "Amenity",
    "bookable-block": "Bookable block",
  }[kind];
}

function paletteForKind(kind: VenueLayoutAsset["kind"]): Palette {
  if (kind === "court") return "sand";
  if (kind === "ticketed-space" || kind === "table") return "ticketed";
  if (kind === "amenity") return "amenity";
  if (kind === "bookable-block") return "service";
  return "neutral";
}

function defaultGeometry(
  layout: VenueLayout,
  workspace: VenueLayoutWorkspace,
  dimensions: {
    readonly shape?: "rectangle" | "circle";
    readonly widthMeters?: number;
    readonly heightMeters?: number;
    readonly radiusMeters?: number;
    readonly bufferMeters?: number;
    readonly width?: number;
    readonly height?: number;
    readonly radius?: number;
    readonly buffer?: number;
  } = {},
): VenueLayoutGeometry {
  if (layout.sourceType === "floorplan") {
    return {
      coordinateSpace: "floorplan",
      shape: dimensions.shape ?? "rectangle",
      center: { x: 0.5, y: 0.5 },
      width: dimensions.width ?? 0.18,
      height: dimensions.height ?? 0.14,
      ...(dimensions.radius ? { radius: dimensions.radius } : {}),
      rotationDegrees: 0,
      buffer: dimensions.buffer ?? 0.01,
    };
  }
  return {
    coordinateSpace: "geo",
    shape: dimensions.shape ?? "rectangle",
    center: {
      latitude: layout.mapCenterLatitude ?? workspace.venue.latitude ?? 33.8847,
      longitude:
        layout.mapCenterLongitude ?? workspace.venue.longitude ?? -118.4109,
    },
    widthMeters: dimensions.widthMeters ?? 10,
    heightMeters: dimensions.heightMeters ?? 7,
    ...(dimensions.radiusMeters
      ? { radiusMeters: dimensions.radiusMeters }
      : {}),
    rotationDegrees: 0,
    bufferMeters: dimensions.bufferMeters ?? 0,
  };
}

function geometryForTemplate(
  layout: VenueLayout,
  workspace: VenueLayoutWorkspace,
  template: VenueLayoutTemplate,
): VenueLayoutGeometry {
  if (layout.sourceType === "floorplan") {
    const aspect = template.heightMeters / template.widthMeters;
    const width = template.category === "table" ? 0.08 : 0.11;
    return defaultGeometry(layout, workspace, {
      shape: template.shape,
      width,
      height: Math.min(0.34, width * aspect),
      radius: template.shape === "circle" ? width / 2 : undefined,
      buffer:
        template.bufferMeters /
        Math.max(template.widthMeters, template.heightMeters) /
        10,
    });
  }
  return defaultGeometry(layout, workspace, {
    shape: template.shape,
    widthMeters: template.widthMeters,
    heightMeters: template.heightMeters,
    radiusMeters: template.radiusMeters,
    bufferMeters: template.bufferMeters,
  });
}

function ActionNotice({ state }: { readonly state: OperatorActionState }) {
  if (state.status === "idle") return null;
  return (
    <span className={`venue-layout-notice is-${state.status}`} role="status">
      {state.status === "error" ? (
        <CircleAlert aria-hidden size={15} />
      ) : (
        <Check aria-hidden size={15} />
      )}
      {state.message}
    </span>
  );
}

function LayoutEmptyState({
  workspace,
}: {
  readonly workspace: VenueLayoutWorkspace;
}) {
  const [state, action, pending] = useActionState(
    createVenueLayoutAction,
    initialState,
  );
  const sourceType =
    workspace.venue.environment === "indoor" ? "floorplan" : "satellite";
  return (
    <main className="hq-page venue-layout-page">
      <header className="venue-layout-header">
        <Link
          aria-label={`Back to ${workspace.venue.name}`}
          className="venue-workspace-back"
          href={`/locations/${workspace.venue.id}`}
        >
          <ArrowLeft aria-hidden size={19} />
        </Link>
        <div>
          <span className="hq-eyebrow">Venue layout</span>
          <h1>{workspace.venue.name}</h1>
          <p>Build a player-ready spatial model of this venue.</p>
        </div>
      </header>
      <section className="venue-layout-empty hq-card">
        <span>
          <Layers3 aria-hidden size={30} />
        </span>
        <div>
          <span className="hq-eyebrow">First version</span>
          <h2>Turn this venue into a living map.</h2>
          <p>
            {sourceType === "satellite"
              ? "Duna will use satellite imagery and meter-accurate geometry for courts, safety zones, and guest spaces."
              : "Upload a schematic, let AI propose the floorplan, and review every space before it becomes player-facing."}
          </p>
        </div>
        <form action={action}>
          <input name="venueId" type="hidden" value={workspace.venue.id} />
          <input name="sourceType" type="hidden" value={sourceType} />
          <input
            name="mapCenterLatitude"
            type="hidden"
            value={workspace.venue.latitude ?? ""}
          />
          <input
            name="mapCenterLongitude"
            type="hidden"
            value={workspace.venue.longitude ?? ""}
          />
          <input name="mapZoom" type="hidden" value="19" />
          <label>
            <span>Layout name</span>
            <input defaultValue="Primary venue layout" name="name" required />
          </label>
          <ActionNotice state={state} />
          <button
            className="hq-button hq-button--primary"
            disabled={pending}
            type="submit"
          >
            <Sparkles aria-hidden size={16} />
            {pending ? "Creating…" : "Create visual layout"}
          </button>
        </form>
      </section>
    </main>
  );
}

function FloorplanSetup({
  layout,
  workspace,
  organizationId,
  readOnly,
  imageUrl,
  analysis,
  onImageUrl,
  onAnalysis,
  onApply,
}: {
  readonly layout: VenueLayout;
  readonly workspace: VenueLayoutWorkspace;
  readonly organizationId: string;
  readonly readOnly: boolean;
  readonly imageUrl?: string;
  readonly analysis?: FloorplanAnalysisProposal;
  readonly onImageUrl: (url: string) => void;
  readonly onAnalysis: (proposal: FloorplanAnalysisProposal) => void;
  readonly onApply: (proposal: FloorplanAnalysisProposal) => void;
}) {
  const [state, setState] = useState<
    "idle" | "uploading" | "analyzing" | "ready" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function uploadSchematic(file?: File) {
    if (!file) return;
    setState("uploading");
    setMessage("Optimizing schematic…");
    try {
      const prepared = await optimizeImageUpload(file);
      const stored = await upload(
        createVenueMediaPath(organizationId, prepared.type),
        prepared,
        {
          access: "public",
          clientPayload: JSON.stringify({
            organizationId,
            fileName: prepared.name,
            contentType: prepared.type,
            size: prepared.size,
            purpose: "venue",
          }),
          contentType: prepared.type,
          handleUploadUrl: "/api/media/upload",
          onUploadProgress: ({ percentage }) =>
            setMessage(`Uploading schematic… ${Math.round(percentage)}%`),
        },
      );
      if (!stored.url)
        throw new Error("Duna storage did not return an image URL.");
      onImageUrl(stored.url);
      setState("analyzing");
      setMessage("AI is tracing visible courts and spaces…");
      const response = await fetch("/api/venue-layout/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          venueId: workspace.venue.id,
          imageUrl: stored.url,
        }),
      });
      const result = (await response.json()) as FloorplanAnalysisProposal & {
        readonly error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Floorplan analysis failed.");
      onAnalysis(result);
      setState("ready");
      setMessage(
        result.status === "manual"
          ? "Schematic ready for manual drawing."
          : `${result.assets.length} visible space${result.assets.length === 1 ? "" : "s"} proposed for review.`,
      );
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "Schematic upload failed.",
      );
    }
  }

  if (readOnly && !imageUrl) return null;
  return (
    <section className="venue-floorplan-setup">
      {!readOnly && (
        <label className="venue-floorplan-upload">
          <input
            accept="image/jpeg,image/png,image/webp"
            disabled={state === "uploading" || state === "analyzing"}
            onChange={(event) => void uploadSchematic(event.target.files?.[0])}
            type="file"
          />
          <span>
            {state === "uploading" || state === "analyzing" ? (
              <RefreshCw aria-hidden className="is-spinning" size={18} />
            ) : (
              <UploadCloud aria-hidden size={18} />
            )}
            <strong>
              {imageUrl ? "Replace schematic" : "Upload schematic"}
            </strong>
            <small>PNG, JPG, or WebP · AI suggestions require review</small>
          </span>
        </label>
      )}
      {message && (
        <span
          className={`venue-floorplan-setup__status is-${state}`}
          role="status"
        >
          {message}
        </span>
      )}
      {analysis && analysis.assets.length > 0 && !readOnly && (
        <article className="venue-floorplan-proposal">
          <span>
            <ScanLine aria-hidden size={18} /> AI floorplan proposal
          </span>
          <p>{analysis.summary}</p>
          <div>
            {analysis.assets.slice(0, 6).map((asset, index) => (
              <span key={`${asset.label}-${index}`}>
                <strong>{asset.label}</strong>
                <small>{Math.round(asset.confidence * 100)}% confidence</small>
              </span>
            ))}
          </div>
          <button
            className="hq-button hq-button--secondary hq-button--compact"
            onClick={() => onApply(analysis)}
            type="button"
          >
            Review & add proposed spaces
          </button>
        </article>
      )}
      <input name="layoutId" type="hidden" value={layout.id} />
    </section>
  );
}

function AssetInspector({
  asset,
  layout,
  workspace,
  readOnly,
  onChange,
  onRemove,
}: {
  readonly asset: VenueLayoutAsset;
  readonly layout: VenueLayout;
  readonly workspace: VenueLayoutWorkspace;
  readonly readOnly: boolean;
  readonly onChange: (asset: VenueLayoutAsset) => void;
  readonly onRemove: () => void;
}) {
  const event = workspace.events.find(
    (item) => item.id === layout.eventSessionId,
  );
  const liveMatch = asset.courtId
    ? workspace.liveMatches.find((match) => match.courtId === asset.courtId)
    : undefined;
  const geometry = asset.geometry;
  const updateGeometry = (updates: Partial<typeof geometry>) =>
    onChange({
      ...asset,
      geometry: { ...geometry, ...updates } as typeof geometry,
    });
  return (
    <aside className="venue-layout-inspector">
      <header>
        <span
          className={`venue-layout-inspector__icon is-${asset.appearance.palette}`}
        >
          {asset.kind === "court" ? (
            <Waves size={18} />
          ) : asset.kind === "ticketed-space" ? (
            <Ticket size={18} />
          ) : (
            <Shapes size={18} />
          )}
        </span>
        <div>
          <small>{assetKindLabel(asset.kind)}</small>
          <strong>{asset.label}</strong>
        </div>
        <button
          aria-label={asset.locked ? "Unlock element" : "Lock element"}
          disabled={readOnly}
          onClick={() => onChange({ ...asset, locked: !asset.locked })}
          type="button"
        >
          {asset.locked ? <Lock size={16} /> : <Unlock size={16} />}
        </button>
      </header>

      {liveMatch && (
        <section className="venue-layout-inspector__live">
          <span>
            <i /> {liveMatch.status === "live" ? "Live now" : "On this court"}
          </span>
          <strong>
            {liveMatch.teamAName} <em>vs</em> {liveMatch.teamBName}
          </strong>
          {liveMatch.score && (
            <Numeric>
              {liveMatch.score.setsA}–{liveMatch.score.setsB}
              <small>
                {liveMatch.score.pointsA}–{liveMatch.score.pointsB}
              </small>
            </Numeric>
          )}
          {liveMatch.divisionName && <small>{liveMatch.divisionName}</small>}
        </section>
      )}

      <fieldset disabled={readOnly || asset.locked}>
        <legend>Identity</legend>
        <label>
          <span>Label</span>
          <input
            maxLength={120}
            onChange={(event) =>
              onChange({ ...asset, label: event.target.value })
            }
            value={asset.label}
          />
        </label>
        <div className="venue-layout-inspector__pair">
          <label>
            <span>Identifier</span>
            <input
              maxLength={48}
              onChange={(event) =>
                onChange({
                  ...asset,
                  identifierCode: event.target.value || undefined,
                })
              }
              placeholder="VIP1"
              value={asset.identifierCode ?? ""}
            />
          </label>
          <label>
            <span>Capacity</span>
            <input
              min="1"
              onChange={(event) =>
                onChange({
                  ...asset,
                  capacity: Number(event.target.value) || undefined,
                })
              }
              type="number"
              value={asset.capacity ?? ""}
            />
          </label>
        </div>
        {asset.kind !== "court" && (
          <label className="venue-layout-toggle">
            <input
              checked={
                asset.kind === "ticketed-space" || asset.kind === "table"
              }
              onChange={(event) =>
                onChange({
                  ...asset,
                  kind: event.target.checked ? "ticketed-space" : "shape",
                  appearance: {
                    ...asset.appearance,
                    palette: event.target.checked ? "ticketed" : "neutral",
                  },
                })
              }
              type="checkbox"
            />
            <span>
              <strong>Ticketed space</strong>
              <small>Use capacity as the recommended ticket limit.</small>
            </span>
          </label>
        )}
        {(asset.kind === "ticketed-space" || asset.kind === "table") &&
        event?.ticketTypes.length ? (
          <label>
            <span>Linked ticket type</span>
            <select
              onChange={(event) =>
                onChange({
                  ...asset,
                  ticketTypeId: event.target.value || undefined,
                })
              }
              value={asset.ticketTypeId ?? ""}
            >
              <option value="">Capacity recommendation only</option>
              {event.ticketTypes.map((ticketType) => (
                <option key={ticketType.id} value={ticketType.id}>
                  {ticketType.name}
                  {ticketType.quantity
                    ? ` · ${ticketType.quantity} on sale`
                    : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </fieldset>

      <fieldset disabled={readOnly || asset.locked}>
        <legend>Position & size</legend>
        <label>
          <span>Rotation</span>
          <div className="venue-layout-rotation-control">
            <RotateCw aria-hidden size={16} />
            <input
              max="180"
              min="-180"
              onChange={(event) =>
                updateGeometry({ rotationDegrees: Number(event.target.value) })
              }
              type="range"
              value={geometry.rotationDegrees}
            />
            <Numeric>{Math.round(geometry.rotationDegrees)}°</Numeric>
          </div>
        </label>
        {geometry.coordinateSpace === "geo" ? (
          <div className="venue-layout-inspector__pair">
            <label>
              <span>Width · meters</span>
              <input
                min="0.5"
                onChange={(event) =>
                  updateGeometry({ widthMeters: Number(event.target.value) })
                }
                step="0.1"
                type="number"
                value={geometry.widthMeters}
              />
            </label>
            <label>
              <span>Length · meters</span>
              <input
                min="0.5"
                onChange={(event) =>
                  updateGeometry({ heightMeters: Number(event.target.value) })
                }
                step="0.1"
                type="number"
                value={geometry.heightMeters}
              />
            </label>
            <label>
              <span>Safety buffer</span>
              <input
                min="0"
                onChange={(event) =>
                  updateGeometry({ bufferMeters: Number(event.target.value) })
                }
                step="0.1"
                type="number"
                value={geometry.bufferMeters}
              />
            </label>
          </div>
        ) : (
          <div className="venue-layout-inspector__pair">
            <label>
              <span>Width · %</span>
              <input
                max="100"
                min="1"
                onChange={(event) =>
                  updateGeometry({ width: Number(event.target.value) / 100 })
                }
                type="number"
                value={Math.round(geometry.width * 100)}
              />
            </label>
            <label>
              <span>Length · %</span>
              <input
                max="100"
                min="1"
                onChange={(event) =>
                  updateGeometry({ height: Number(event.target.value) / 100 })
                }
                type="number"
                value={Math.round(geometry.height * 100)}
              />
            </label>
          </div>
        )}
        <small className="venue-layout-inspector__hint">
          Drag to move. Use the round handle on the satellite map to rotate.
          Arrow keys nudge indoor elements; hold Shift for larger steps.
        </small>
      </fieldset>

      {asset.kind === "court" && event && (
        <fieldset disabled={readOnly || asset.locked}>
          <legend>Division priority</legend>
          <p className="venue-layout-inspector__hint">
            Lower numbers get this court first. Allow when free releases it to
            another division after priority play.
          </p>
          <div className="venue-layout-priorities">
            {event.divisions.map((division) => {
              const priority = asset.divisionPriorities.find(
                (item) => item.divisionId === division.id,
              );
              return (
                <article key={division.id}>
                  <span>
                    <strong>{division.name}</strong>
                    <small>
                      {division.maximumTeams
                        ? `${division.maximumTeams} teams max`
                        : "Division"}
                    </small>
                  </span>
                  <label>
                    <span>Priority</span>
                    <input
                      min="1"
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        const others = asset.divisionPriorities.filter(
                          (item) => item.divisionId !== division.id,
                        );
                        onChange({
                          ...asset,
                          divisionPriorities: value
                            ? [
                                ...others,
                                {
                                  divisionId: division.id,
                                  priority: value,
                                  startsHere: priority?.startsHere ?? false,
                                  allowWhenFree:
                                    priority?.allowWhenFree ?? true,
                                },
                              ]
                            : others,
                        });
                      }}
                      placeholder="—"
                      type="number"
                      value={priority?.priority ?? ""}
                    />
                  </label>
                  <label className="is-checkbox">
                    <input
                      checked={priority?.startsHere ?? false}
                      disabled={!priority}
                      onChange={(event) =>
                        priority &&
                        onChange({
                          ...asset,
                          divisionPriorities: asset.divisionPriorities.map(
                            (item) =>
                              item.divisionId === division.id
                                ? { ...item, startsHere: event.target.checked }
                                : item,
                          ),
                        })
                      }
                      type="checkbox"
                    />
                    Starts here
                  </label>
                  <label className="is-checkbox">
                    <input
                      checked={priority?.allowWhenFree ?? false}
                      disabled={!priority}
                      onChange={(event) =>
                        priority &&
                        onChange({
                          ...asset,
                          divisionPriorities: asset.divisionPriorities.map(
                            (item) =>
                              item.divisionId === division.id
                                ? {
                                    ...item,
                                    allowWhenFree: event.target.checked,
                                  }
                                : item,
                          ),
                        })
                      }
                      type="checkbox"
                    />
                    Allow when free
                  </label>
                </article>
              );
            })}
          </div>
        </fieldset>
      )}

      {asset.courtId && (
        <Link
          className="venue-layout-inspector__court-link"
          href={`/locations/${workspace.venue.id}/courts/${asset.courtId}`}
        >
          <Link2 aria-hidden size={15} /> Open full court settings
        </Link>
      )}
      <button
        className="venue-layout-inspector__remove"
        disabled={readOnly}
        onClick={onRemove}
        type="button"
      >
        <Trash2 aria-hidden size={15} /> Remove from this version
      </button>
      {asset.courtId && (
        <small className="venue-layout-inspector__hint">
          Removing this placement never deletes the linked court.
        </small>
      )}
    </aside>
  );
}

function CourtCreator({
  draft,
  layout,
  onClose,
}: {
  readonly draft: CourtDraft;
  readonly layout: VenueLayout;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    createCourtFromVenueLayoutAction,
    initialState,
  );
  useEffect(() => {
    if (state.status === "success") {
      onClose();
      router.refresh();
    }
  }, [onClose, router, state.status]);
  return (
    <div className="venue-layout-dialog-backdrop" role="presentation">
      <section
        aria-labelledby="create-layout-court-title"
        aria-modal="true"
        className="venue-layout-dialog"
        role="dialog"
      >
        <header>
          <span>
            <Waves aria-hidden size={20} />
          </span>
          <div>
            <small>Visual court → real court</small>
            <h2 id="create-layout-court-title">Add {draft.template.label}</h2>
          </div>
          <button aria-label="Close" onClick={onClose} type="button">
            ×
          </button>
        </header>
        <p>
          This creates a true court in venue management and places it in layout
          version {layout.version}. You can refine pricing and availability
          next.
        </p>
        <form action={action}>
          <input name="layoutId" type="hidden" value={layout.id} />
          <input name="assetId" type="hidden" value={draft.assetId} />
          <input name="templateKey" type="hidden" value={draft.template.key} />
          <input
            name="geometry"
            type="hidden"
            value={JSON.stringify(draft.geometry)}
          />
          <div className="venue-layout-dialog__grid">
            <label>
              <span>Court name</span>
              <input
                defaultValue={
                  draft.suggestedName ??
                  `Court ${Date.now().toString().slice(-2)}`
                }
                name="name"
                required
              />
            </label>
            <label>
              <span>Identifier</span>
              <input name="identifierCode" placeholder="C3" />
            </label>
            <label>
              <span>Surface</span>
              <select defaultValue="sand" name="surface">
                <option value="sand">Sand</option>
                <option value="indoor-sand">Indoor sand</option>
                <option value="hard-court">Hard court</option>
                <option value="grass">Grass</option>
              </select>
            </label>
            <label>
              <span>Player capacity</span>
              <input defaultValue="12" min="1" name="capacity" type="number" />
            </label>
            <label className="venue-layout-dialog__wide">
              <span>Who can book it?</span>
              <select defaultValue="public" name="bookingPolicy">
                <option value="public">Anyone</option>
                <option value="members">Members</option>
                <option value="tiers">Selected membership tiers</option>
                <option value="staff">Staff only</option>
                <option value="none">Not bookable</option>
              </select>
            </label>
          </div>
          <ActionNotice state={state} />
          <footer>
            <button
              className="hq-button hq-button--secondary"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="hq-button hq-button--primary"
              disabled={pending}
              type="submit"
            >
              <Plus aria-hidden size={16} />{" "}
              {pending ? "Creating…" : "Create & place court"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function EventAssignmentPanel({
  layout,
  workspace,
  readOnly,
}: {
  readonly layout: VenueLayout;
  readonly workspace: VenueLayoutWorkspace;
  readonly readOnly: boolean;
}) {
  const event = workspace.events.find(
    (item) => item.id === layout.eventSessionId,
  );
  const [settingsState, settingsAction, settingsPending] = useActionState(
    saveVenueLayoutEventSettingsAction,
    initialState,
  );
  const [planState, planAction, planPending] = useActionState(
    previewVenueLayoutCourtAssignmentsAction,
    initialState,
  );
  const [applyState, applyAction, applyPending] = useActionState(
    applyVenueLayoutCourtAssignmentsAction,
    initialState,
  );
  const [enabled, setEnabled] = useState(
    event?.settings?.aiCourtAssignmentEnabled ?? false,
  );
  if (!event) {
    return (
      <section className="venue-layout-ai hq-card is-empty">
        <span>
          <Bot aria-hidden size={22} />
        </span>
        <div>
          <strong>Event court intelligence</strong>
          <p>
            Create an event-specific version to set division priorities and AI
            court assignment.
          </p>
        </div>
      </section>
    );
  }
  const settings = event.settings;
  return (
    <section className="venue-layout-ai hq-card">
      <header>
        <span>
          <Bot aria-hidden size={21} />
        </span>
        <div>
          <small>Event operations</small>
          <h2>AI Court Assignment</h2>
          <p>
            {event.title} · {event.divisions.length} divisions
          </p>
        </div>
        <Badge tone={enabled ? "live" : "neutral"}>
          {enabled ? "On" : "Off"}
        </Badge>
      </header>
      <form action={settingsAction} className="venue-layout-ai__settings">
        <input name="sessionId" type="hidden" value={event.id} />
        <input name="layoutId" type="hidden" value={layout.id} />
        <label className="venue-layout-toggle">
          <input
            checked={enabled}
            disabled={readOnly}
            name="aiCourtAssignmentEnabled"
            onChange={(event) => setEnabled(event.target.checked)}
            type="checkbox"
            value="true"
          />
          <span>
            <strong>Assign scheduled matches intelligently</strong>
            <small>
              Uses division priority, format, expected duration, and live court
              release.
            </small>
          </span>
        </label>
        <div>
          <label>
            <span>Average match length</span>
            <span className="venue-layout-ai__number">
              <input
                defaultValue={settings?.averageMatchMinutes ?? 45}
                disabled={readOnly}
                max="240"
                min="10"
                name="averageMatchMinutes"
                type="number"
              />{" "}
              minutes
            </span>
          </label>
          <label className="venue-layout-toggle is-compact">
            <input
              defaultChecked={settings?.releaseCourtWhenFree ?? true}
              disabled={readOnly}
              name="releaseCourtWhenFree"
              type="checkbox"
              value="true"
            />
            <span>
              <strong>Release courts when free</strong>
              <small>Let the next priority division use open capacity.</small>
            </span>
          </label>
        </div>
        <ActionNotice state={settingsState} />
        {!readOnly && (
          <button
            className="hq-button hq-button--secondary hq-button--compact"
            disabled={settingsPending}
            type="submit"
          >
            <Save aria-hidden size={15} />{" "}
            {settingsPending ? "Saving…" : "Save assignment settings"}
          </button>
        )}
      </form>
      <div className="venue-layout-ai__plan">
        <form action={planAction}>
          <input name="sessionId" type="hidden" value={event.id} />
          <button
            className="hq-button hq-button--secondary"
            disabled={planPending}
            type="submit"
          >
            <Sparkles aria-hidden size={16} />{" "}
            {planPending ? "Planning…" : "Preview assignments"}
          </button>
        </form>
        <ActionNotice state={planState} />
        {planState.venueAssignmentPlan && (
          <div className="venue-layout-ai__results">
            {planState.venueAssignmentPlan.assignments.length ? (
              planState.venueAssignmentPlan.assignments
                .slice(0, 8)
                .map((assignment) => (
                  <article key={assignment.matchId}>
                    <span>
                      <strong>{assignment.divisionName}</strong>
                      <small>
                        {new Intl.DateTimeFormat("en", {
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(new Date(assignment.scheduledAt))}{" "}
                        · {assignment.estimatedMinutes} min
                      </small>
                    </span>
                    <span>
                      <strong>{assignment.courtName}</strong>
                      <small>{assignment.reason}</small>
                    </span>
                  </article>
                ))
            ) : (
              <p>No unassigned scheduled matches need a court right now.</p>
            )}
            <ul>
              {planState.venueAssignmentPlan.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
            {planState.venueAssignmentPlan.assignments.length > 0 &&
              !readOnly && (
                <form action={applyAction}>
                  <input name="sessionId" type="hidden" value={event.id} />
                  <input name="confirmed" type="hidden" value="true" />
                  <button
                    className="hq-button hq-button--primary"
                    disabled={applyPending || !enabled}
                    type="submit"
                  >
                    <Check aria-hidden size={16} />{" "}
                    {applyPending ? "Applying…" : "Confirm & apply plan"}
                  </button>
                  {!enabled && (
                    <small>Turn on AI Court Assignment and save first.</small>
                  )}
                </form>
              )}
          </div>
        )}
        <ActionNotice state={applyState} />
      </div>
    </section>
  );
}

export function VenueLayoutStudio({
  workspace,
  organizationId,
  initialLayoutId,
}: {
  readonly workspace: VenueLayoutWorkspace;
  readonly organizationId: string;
  readonly initialLayoutId?: string;
}) {
  const router = useRouter();
  const initialLayout =
    workspace.layouts.find((layout) => layout.id === initialLayoutId) ??
    workspace.layouts.find((layout) => layout.status === "draft") ??
    workspace.layouts.find((layout) => layout.isPrimary) ??
    workspace.layouts[0];
  const [layoutId, setLayoutId] = useState(initialLayout?.id);
  const layout =
    workspace.layouts.find((item) => item.id === layoutId) ?? initialLayout;
  const [assets, setAssets] = useState<readonly VenueLayoutAsset[]>(
    layout?.assets ?? [],
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [toolboxOpen, setToolboxOpen] = useState(true);
  const [courtDraft, setCourtDraft] = useState<CourtDraft>();
  const [pendingCourtDraft, setPendingCourtDraft] = useState<CourtDraft>();
  const [floorplanImageUrl, setFloorplanImageUrl] = useState(
    layout?.floorplanImageUrl,
  );
  const [floorplanAnalysis, setFloorplanAnalysis] =
    useState<FloorplanAnalysisProposal>();
  const [layoutName, setLayoutName] = useState(layout?.name ?? "");
  const [view, setView] = useState({
    latitude: layout?.mapCenterLatitude ?? workspace.venue.latitude ?? 33.8847,
    longitude:
      layout?.mapCenterLongitude ?? workspace.venue.longitude ?? -118.4109,
    zoom: layout?.mapZoom ?? 19,
    bearing: layout?.mapBearing ?? 0,
    pitch: layout?.mapPitch ?? 0,
  });
  const [saveState, saveAction, savePending] = useActionState(
    saveVenueLayoutAction,
    initialState,
  );
  const [versionState, versionAction, versionPending] = useActionState(
    createVenueLayoutAction,
    initialState,
  );
  const [publishState, publishAction, publishPending] = useActionState(
    publishVenueLayoutAction,
    initialState,
  );

  useEffect(() => {
    if (!layout) return;
    setAssets(layout.assets);
    setLayoutName(layout.name);
    setFloorplanImageUrl(layout.floorplanImageUrl);
    setFloorplanAnalysis(
      layout.floorplanAnalysis as FloorplanAnalysisProposal | undefined,
    );
    setView({
      latitude: layout.mapCenterLatitude ?? workspace.venue.latitude ?? 33.8847,
      longitude:
        layout.mapCenterLongitude ?? workspace.venue.longitude ?? -118.4109,
      zoom: layout.mapZoom,
      bearing: layout.mapBearing,
      pitch: layout.mapPitch,
    });
    setSelectedAssetId(undefined);
    setDirty(false);
  }, [
    layout?.id,
    layout?.updatedAt,
    workspace.venue.latitude,
    workspace.venue.longitude,
  ]);

  useEffect(() => {
    if (saveState.status === "success" || publishState.status === "success") {
      setDirty(false);
      if (saveState.status === "success" && pendingCourtDraft) {
        setCourtDraft(pendingCourtDraft);
        setPendingCourtDraft(undefined);
      }
      router.refresh();
    }
  }, [pendingCourtDraft, publishState.status, router, saveState.status]);

  useEffect(() => {
    if (versionState.status === "success" && versionState.entityId) {
      setLayoutId(versionState.entityId);
      router.replace(
        `/locations/${workspace.venue.id}/layout?layout=${versionState.entityId}`,
      );
      router.refresh();
    }
  }, [router, versionState.entityId, versionState.status, workspace.venue.id]);

  if (!layout) return <LayoutEmptyState workspace={workspace} />;
  const activeLayout = layout;
  const readOnly = layout.status !== "draft" || preview;
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);
  const placedCourtIds = new Set(
    assets.flatMap((asset) => (asset.courtId ? [asset.courtId] : [])),
  );
  const unplacedCourts = workspace.venue.courts.filter(
    (court) => !placedCourtIds.has(court.id),
  );
  const layoutEvent = workspace.events.find(
    (event) => event.id === layout.eventSessionId,
  );
  const courtActivity = Object.fromEntries(
    workspace.liveMatches.map((match) => {
      const score = match.score
        ? ` · ${match.score.setsA}–${match.score.setsB} (${match.score.pointsA}–${match.score.pointsB})`
        : "";
      return [
        match.courtId,
        `${match.teamAName} vs ${match.teamBName}${score}`,
      ];
    }),
  );

  function updateAsset(asset: VenueLayoutAsset) {
    setAssets((current) =>
      current.map((item) => (item.id === asset.id ? asset : item)),
    );
    setDirty(true);
  }

  function addAsset(input: {
    readonly kind: VenueLayoutAsset["kind"];
    readonly label: string;
    readonly identifierCode?: string;
    readonly capacity?: number;
    readonly geometry?: VenueLayoutGeometry;
    readonly icon?: string;
  }) {
    const asset: VenueLayoutAsset = {
      id: crypto.randomUUID(),
      layoutId: activeLayout.id,
      kind: input.kind,
      label: input.label,
      identifierCode: input.identifierCode,
      capacity: input.capacity,
      geometry: input.geometry ?? defaultGeometry(activeLayout, workspace),
      appearance: { palette: paletteForKind(input.kind), icon: input.icon },
      sortOrder: assets.length,
      locked: false,
      divisionPriorities: [],
    };
    setAssets((current) => [...current, asset]);
    setSelectedAssetId(asset.id);
    setDirty(true);
  }

  function addExistingCourt(
    court: VenueLayoutWorkspace["venue"]["courts"][number],
  ) {
    const template = VENUE_LAYOUT_TEMPLATES[1];
    const asset: VenueLayoutAsset = {
      id: crypto.randomUUID(),
      layoutId: activeLayout.id,
      kind: "court",
      templateKey: template.key,
      courtId: court.id,
      label: court.name,
      capacity: court.capacity,
      geometry: geometryForTemplate(activeLayout, workspace, template),
      appearance: { palette: "sand" },
      sortOrder: assets.length,
      locked: false,
      divisionPriorities: [],
    };
    setAssets((current) => [...current, asset]);
    setSelectedAssetId(asset.id);
    setDirty(true);
  }

  function beginCourt(template: VenueLayoutTemplate, suggestedName?: string) {
    if (dirty) {
      window.alert(
        "Save this layout before creating a court so no unsaved placements are lost.",
      );
      return;
    }
    setCourtDraft({
      assetId: crypto.randomUUID(),
      template,
      geometry: geometryForTemplate(activeLayout, workspace, template),
      suggestedName,
    });
  }

  function applyFloorplanProposal(proposal: FloorplanAnalysisProposal) {
    const proposals = proposal.assets.filter((item) => item.kind !== "court");
    const additions = proposals.map((item, index): VenueLayoutAsset => ({
      id: crypto.randomUUID(),
      layoutId: activeLayout.id,
      kind: item.kind,
      label: item.label,
      capacity: item.capacity,
      geometry: {
        coordinateSpace: "floorplan",
        shape: item.shape,
        center: item.center,
        width: item.width,
        height: item.height,
        ...(item.shape === "circle" ? { radius: item.width / 2 } : {}),
        rotationDegrees: item.rotationDegrees,
        buffer: 0.005,
      },
      appearance: { palette: paletteForKind(item.kind) },
      sortOrder: assets.length + index,
      locked: false,
      divisionPriorities: [],
    }));
    setAssets((current) => [...current, ...additions]);
    const detectedCourt = proposal.assets.find((item) => item.kind === "court");
    if (detectedCourt) {
      const template = VENUE_LAYOUT_TEMPLATES[1];
      const draft: CourtDraft = {
        assetId: crypto.randomUUID(),
        template,
        suggestedName: detectedCourt.label,
        geometry: {
          coordinateSpace: "floorplan",
          shape: detectedCourt.shape,
          center: detectedCourt.center,
          width: detectedCourt.width,
          height: detectedCourt.height,
          rotationDegrees: detectedCourt.rotationDegrees,
          buffer: 0.01,
        },
      };
      if (additions.length > 0) setPendingCourtDraft(draft);
      else setCourtDraft(draft);
    }
    setDirty(true);
  }

  const serializedLayout = JSON.stringify({
    layoutId: layout.id,
    name: layoutName,
    floorplanImageUrl,
    floorplanAnalysis,
    mapCenterLatitude: view.latitude,
    mapCenterLongitude: view.longitude,
    mapZoom: view.zoom,
    mapBearing: view.bearing,
    mapPitch: view.pitch,
    assets: assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      templateKey: asset.templateKey,
      courtId: asset.courtId,
      ticketTypeId: asset.ticketTypeId,
      label: asset.label,
      identifierCode: asset.identifierCode,
      capacity: asset.capacity,
      geometry: asset.geometry,
      appearance: asset.appearance,
      sortOrder: asset.sortOrder,
      locked: asset.locked,
      divisionPriorities: asset.divisionPriorities,
    })),
  });

  return (
    <main
      className={`hq-page venue-layout-page ${preview ? "is-preview" : ""}`}
    >
      <header className="venue-layout-header">
        <Link
          aria-label={`Back to ${workspace.venue.name}`}
          className="venue-workspace-back"
          href={`/locations/${workspace.venue.id}`}
        >
          <ArrowLeft aria-hidden size={19} />
        </Link>
        <div>
          <span className="hq-eyebrow">Venue layout studio</span>
          <h1>{workspace.venue.name}</h1>
          <p>
            {workspace.venue.environment === "outdoor"
              ? "Satellite venue model"
              : "Indoor schematic model"}
            {layoutEvent
              ? ` · ${layoutEvent.title}`
              : " · Default venue layout"}
          </p>
        </div>
        <div className="venue-layout-header__actions">
          <button
            aria-pressed={preview}
            className="hq-button hq-button--secondary"
            onClick={() => setPreview((current) => !current)}
            type="button"
          >
            {preview ? (
              <EyeOff aria-hidden size={16} />
            ) : (
              <Eye aria-hidden size={16} />
            )}
            {preview ? "Exit preview" : "Player preview"}
          </button>
          {layout.status === "draft" && !preview && (
            <form action={saveAction}>
              <input name="layout" type="hidden" value={serializedLayout} />
              <button
                className="hq-button hq-button--primary"
                disabled={savePending || !dirty}
                type="submit"
              >
                <Save aria-hidden size={16} />{" "}
                {savePending ? "Saving…" : dirty ? "Save layout" : "Saved"}
              </button>
            </form>
          )}
        </div>
      </header>

      {preview && (
        <div className="venue-layout-preview-banner">
          <MapPin aria-hidden size={18} />
          <span>
            <strong>Player wayfinding preview</strong>
            Courts, spaces, identifiers, and live play appear without editing
            controls.
          </span>
        </div>
      )}

      <section className="venue-layout-workspace">
        {!preview && (
          <aside className="venue-layout-versions">
            <header>
              <span>
                <Layers3 aria-hidden size={17} /> Layout versions
              </span>
              <small>{workspace.layouts.length}</small>
            </header>
            <div>
              {workspace.layouts.map((version) => (
                <button
                  className={version.id === layout.id ? "is-active" : ""}
                  key={version.id}
                  onClick={() => {
                    if (
                      dirty &&
                      !window.confirm(
                        "Switch layouts and discard unsaved changes?",
                      )
                    )
                      return;
                    setLayoutId(version.id);
                    router.replace(
                      `/locations/${workspace.venue.id}/layout?layout=${version.id}`,
                    );
                  }}
                  type="button"
                >
                  <span>
                    <strong>
                      v{version.version} · {version.name}
                    </strong>
                    <small>
                      {version.eventSessionId
                        ? (workspace.events.find(
                            (event) => event.id === version.eventSessionId,
                          )?.title ?? "Event layout")
                        : "Venue default"}
                    </small>
                  </span>
                  <span>
                    {version.isPrimary && <i>Primary</i>}
                    <Badge
                      tone={
                        version.status === "published"
                          ? "live"
                          : version.status === "draft"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {version.status}
                    </Badge>
                  </span>
                </button>
              ))}
            </div>
            <details className="venue-layout-new-version">
              <summary>
                <Copy aria-hidden size={15} /> New version{" "}
                <ChevronDown aria-hidden size={14} />
              </summary>
              <form action={versionAction}>
                <input
                  name="venueId"
                  type="hidden"
                  value={workspace.venue.id}
                />
                <input
                  name="sourceType"
                  type="hidden"
                  value={layout.sourceType}
                />
                <input
                  name="duplicateFromLayoutId"
                  type="hidden"
                  value={layout.id}
                />
                <input
                  name="mapCenterLatitude"
                  type="hidden"
                  value={view.latitude}
                />
                <input
                  name="mapCenterLongitude"
                  type="hidden"
                  value={view.longitude}
                />
                <input name="mapZoom" type="hidden" value={view.zoom} />
                <label>
                  <span>Version name</span>
                  <input
                    defaultValue={`${layout.name} · revision`}
                    name="name"
                    required
                  />
                </label>
                <label>
                  <span>Use for event</span>
                  <select
                    defaultValue={layout.eventSessionId ?? ""}
                    name="eventSessionId"
                  >
                    <option value="">Default venue layout</option>
                    {workspace.events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title}
                      </option>
                    ))}
                  </select>
                </label>
                <ActionNotice state={versionState} />
                <button
                  className="hq-button hq-button--secondary hq-button--compact"
                  disabled={versionPending}
                  type="submit"
                >
                  <Plus aria-hidden size={15} />{" "}
                  {versionPending ? "Creating…" : "Create editable version"}
                </button>
              </form>
            </details>
          </aside>
        )}

        <section className="venue-layout-stage">
          {!preview && (
            <header className="venue-layout-toolbar">
              <button
                aria-expanded={toolboxOpen}
                className={toolboxOpen ? "is-active" : ""}
                onClick={() => setToolboxOpen((current) => !current)}
                type="button"
              >
                <Plus aria-hidden size={17} /> Add element
              </button>
              <span>
                <Move3D aria-hidden size={15} /> Drag to move · handle to rotate
              </span>
              <label>
                <span className="sr-only">Layout name</span>
                <input
                  disabled={readOnly}
                  onChange={(event) => {
                    setLayoutName(event.target.value);
                    setDirty(true);
                  }}
                  value={layoutName}
                />
              </label>
              <Badge tone={dirty ? "warning" : "neutral"}>
                {dirty ? "Unsaved" : "Saved"}
              </Badge>
            </header>
          )}

          {toolboxOpen && !readOnly && (
            <section className="venue-layout-toolbox">
              <div>
                <span className="venue-layout-toolbox__title">
                  <Waves aria-hidden size={16} /> Courts
                </span>
                <div className="venue-layout-toolbox__items">
                  {VENUE_LAYOUT_TEMPLATES.filter(
                    (template) => template.category === "court",
                  ).map((template) => (
                    <button
                      key={template.key}
                      onClick={() => beginCourt(template)}
                      type="button"
                    >
                      <span>
                        <Grid2X2 aria-hidden size={18} />
                      </span>
                      <strong>{template.label}</strong>
                      <small>{template.detail}</small>
                    </button>
                  ))}
                </div>
                {unplacedCourts.length > 0 && (
                  <div className="venue-layout-toolbox__existing">
                    <small>Place an existing court</small>
                    {unplacedCourts.map((court) => (
                      <button
                        key={court.id}
                        onClick={() => addExistingCourt(court)}
                        type="button"
                      >
                        <Link2 aria-hidden size={14} /> {court.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <span className="venue-layout-toolbox__title">
                  <Shapes aria-hidden size={16} /> Spaces & amenities
                </span>
                <div className="venue-layout-toolbox__items is-compact">
                  <button
                    onClick={() =>
                      addAsset({
                        kind: "ticketed-space",
                        label: "VIP Seating",
                        identifierCode: "VIP1",
                        capacity: 32,
                      })
                    }
                    type="button"
                  >
                    <span>
                      <Ticket aria-hidden size={18} />
                    </span>
                    <strong>VIP seating</strong>
                    <small>Ticketed rectangle with capacity</small>
                  </button>
                  <button
                    onClick={() =>
                      addAsset({
                        kind: "amenity",
                        label: "Restrooms",
                        icon: "restrooms",
                      })
                    }
                    type="button"
                  >
                    <span>
                      <Toilet aria-hidden size={18} />
                    </span>
                    <strong>Restrooms</strong>
                    <small>Player and guest amenity</small>
                  </button>
                  <button
                    onClick={() =>
                      addAsset({
                        kind: "shape",
                        label: "Spectator Seating",
                        capacity: 50,
                      })
                    }
                    type="button"
                  >
                    <span>
                      <Users aria-hidden size={18} />
                    </span>
                    <strong>Spectator seating</strong>
                    <small>Labeled guest zone</small>
                  </button>
                  <button
                    onClick={() =>
                      addAsset({
                        kind: "amenity",
                        label: "Restaurant / Cafe",
                        icon: "restaurant",
                      })
                    }
                    type="button"
                  >
                    <span>
                      <Utensils aria-hidden size={18} />
                    </span>
                    <strong>Restaurant / cafe</strong>
                    <small>Food and beverage point</small>
                  </button>
                  <button
                    onClick={() =>
                      addAsset({
                        kind: "amenity",
                        label: "Parking",
                        icon: "parking",
                      })
                    }
                    type="button"
                  >
                    <span>
                      <ParkingCircle aria-hidden size={18} />
                    </span>
                    <strong>Parking</strong>
                    <small>Arrival and access zone</small>
                  </button>
                  <button
                    onClick={() =>
                      addAsset({
                        kind: "bookable-block",
                        label: "Bookable Space",
                        capacity: 20,
                      })
                    }
                    type="button"
                  >
                    <span>
                      <BoxSelect aria-hidden size={18} />
                    </span>
                    <strong>Bookable block</strong>
                    <small>Reservable non-court space</small>
                  </button>
                  {VENUE_LAYOUT_TEMPLATES.filter(
                    (template) => template.category === "table",
                  ).map((template) => (
                    <button
                      key={template.key}
                      onClick={() =>
                        addAsset({
                          kind: "table",
                          label: template.label,
                          identifierCode: "VIPTable2",
                          capacity: template.key.includes("4ft") ? 6 : 8,
                          geometry: geometryForTemplate(
                            layout,
                            workspace,
                            template,
                          ),
                          icon: "table",
                        })
                      }
                      type="button"
                    >
                      <span>
                        <Table2 aria-hidden size={18} />
                      </span>
                      <strong>{template.label}</strong>
                      <small>{template.detail}</small>
                    </button>
                  ))}
                  <button
                    onClick={() =>
                      addAsset({ kind: "shape", label: "Custom area" })
                    }
                    type="button"
                  >
                    <span>
                      <CircleDot aria-hidden size={18} />
                    </span>
                    <strong>Custom shape</strong>
                    <small>Draw, size, rotate, and label</small>
                  </button>
                </div>
              </div>
            </section>
          )}

          {layout.sourceType === "floorplan" && !preview && (
            <FloorplanSetup
              analysis={floorplanAnalysis}
              imageUrl={floorplanImageUrl}
              layout={layout}
              organizationId={organizationId}
              onAnalysis={(proposal) => {
                setFloorplanAnalysis(proposal);
                setDirty(true);
              }}
              onApply={applyFloorplanProposal}
              onImageUrl={(url) => {
                setFloorplanImageUrl(url);
                setDirty(true);
              }}
              readOnly={readOnly}
              workspace={workspace}
            />
          )}

          <div className="venue-layout-canvas-wrap">
            {layout.sourceType === "satellite" ? (
              <VenueLayoutMap
                assets={assets}
                courtActivity={courtActivity}
                onAssetChange={updateAsset}
                onSelect={setSelectedAssetId}
                onViewChange={(nextView) => {
                  setView(nextView);
                  if (!readOnly) setDirty(true);
                }}
                readOnly={readOnly}
                selectedAssetId={selectedAssetId}
                view={view}
              />
            ) : (
              <VenueFloorplanCanvas
                assets={assets}
                courtActivity={courtActivity}
                imageUrl={floorplanImageUrl}
                onAssetChange={updateAsset}
                onSelect={setSelectedAssetId}
                readOnly={readOnly}
                selectedAssetId={selectedAssetId}
              />
            )}
            <div className="venue-layout-canvas-stats">
              <span>
                <Waves aria-hidden size={15} />{" "}
                <Numeric>
                  {assets.filter((asset) => asset.kind === "court").length}
                </Numeric>{" "}
                courts
              </span>
              <span>
                <Ticket aria-hidden size={15} />{" "}
                <Numeric>
                  {assets
                    .filter(
                      (asset) =>
                        asset.kind === "ticketed-space" ||
                        asset.kind === "table",
                    )
                    .reduce((total, asset) => total + (asset.capacity ?? 0), 0)}
                </Numeric>{" "}
                ticketed capacity
              </span>
              <span>
                <Maximize2 aria-hidden size={15} />{" "}
                {layout.sourceType === "satellite"
                  ? "Real-world scale"
                  : "Schematic scale"}
              </span>
            </div>
          </div>

          {workspace.liveMatches.length > 0 && (
            <section className="venue-layout-live-strip">
              <header>
                <span>
                  <i /> Live venue
                </span>
                <small>{workspace.liveMatches.length} court assignments</small>
              </header>
              <div>
                {workspace.liveMatches.map((match) => {
                  const court = workspace.venue.courts.find(
                    (item) => item.id === match.courtId,
                  );
                  return (
                    <button
                      key={match.id}
                      onClick={() =>
                        setSelectedAssetId(
                          assets.find(
                            (asset) => asset.courtId === match.courtId,
                          )?.id,
                        )
                      }
                      type="button"
                    >
                      <span>
                        <strong>{court?.name ?? "Court"}</strong>
                        <small>{match.divisionName ?? match.status}</small>
                      </span>
                      <span>
                        <strong>
                          {match.teamAName} <em>vs</em> {match.teamBName}
                        </strong>
                        {match.score && (
                          <Numeric>
                            {match.score.setsA}–{match.score.setsB}{" "}
                            <small>
                              {match.score.pointsA}–{match.score.pointsB}
                            </small>
                          </Numeric>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </section>

        {selectedAsset && !preview ? (
          <AssetInspector
            asset={selectedAsset}
            layout={layout}
            onChange={updateAsset}
            onRemove={() => {
              setAssets((current) =>
                current.filter((asset) => asset.id !== selectedAsset.id),
              );
              setSelectedAssetId(undefined);
              setDirty(true);
            }}
            readOnly={readOnly}
            workspace={workspace}
          />
        ) : !preview ? (
          <aside className="venue-layout-inspector is-summary">
            <span>
              <Map aria-hidden size={24} />
            </span>
            <small>Layout version {layout.version}</small>
            <h2>{layout.name}</h2>
            <p>
              Select any court or space to edit its identity, size, rotation,
              capacity, ticketing, and tournament priority.
            </p>
            <dl>
              <div>
                <dt>Source</dt>
                <dd>
                  {layout.sourceType === "satellite"
                    ? "Mapbox satellite"
                    : "Indoor schematic"}
                </dd>
              </div>
              <div>
                <dt>Elements</dt>
                <dd>{assets.length}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{layout.status}</dd>
              </div>
            </dl>
            {layout.status !== "draft" && (
              <p className="venue-layout-inspector__immutable">
                <Lock aria-hidden size={15} /> Published versions are immutable.
                Create a new version to make changes safely.
              </p>
            )}
          </aside>
        ) : null}
      </section>

      {!preview && (
        <>
          <EventAssignmentPanel
            layout={layout}
            readOnly={layout.status !== "draft"}
            workspace={workspace}
          />
          <section className="venue-layout-publish hq-card">
            <div>
              <span className="hq-eyebrow">Player-facing version</span>
              <h2>
                {layout.isPrimary
                  ? "Primary layout"
                  : "Publish this version when ready"}
              </h2>
              <p>
                The primary published layout becomes the default map players use
                to find courts and ticketed spaces. Event-specific versions
                remain available without replacing it.
              </p>
            </div>
            {layout.status === "draft" ? (
              <form action={publishAction}>
                <input name="layoutId" type="hidden" value={layout.id} />
                <input name="makePrimary" type="hidden" value="true" />
                <ActionNotice state={publishState} />
                <button
                  className="hq-button hq-button--primary"
                  disabled={publishPending || dirty || assets.length === 0}
                  type="submit"
                >
                  <Eye aria-hidden size={16} />{" "}
                  {publishPending ? "Publishing…" : "Publish & set primary"}
                </button>
                {dirty && <small>Save this version before publishing.</small>}
              </form>
            ) : (
              <Badge tone={layout.isPrimary ? "live" : "neutral"}>
                {layout.isPrimary ? "Player default" : "Published version"}
              </Badge>
            )}
          </section>
        </>
      )}

      {courtDraft && (
        <CourtCreator
          draft={courtDraft}
          layout={layout}
          onClose={() => setCourtDraft(undefined)}
        />
      )}
    </main>
  );
}
