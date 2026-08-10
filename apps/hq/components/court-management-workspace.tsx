"use client";

import type { OperatorWorkspace } from "@duna/api";
import { formatMoney } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import { upload } from "@vercel/blob/client";
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  CalendarOff,
  Check,
  CircleAlert,
  Clock3,
  Gauge,
  Image as ImageIcon,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  UploadCloud,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  activateCourtAction,
  blockCourtTimeAction,
  draftCourtScheduleAction,
  replaceCourtScheduleAction,
  updateCourtBookingConfigurationAction,
  type OperatorActionState,
} from "@/app/actions";
import { createCourtMediaPath, optimizeImageUpload } from "@/lib/media-storage";

type Venue = OperatorWorkspace["venues"][number];
type Court = Venue["courts"][number];
type Section = "space" | "availability" | "rules";
type ScheduleBlock = Court["schedule"][number];

const initialState: OperatorActionState = { status: "idle", message: "" };
const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const scheduleModes = [
  ["open", "Open play & booking"],
  ["rentals-only", "Court rentals only"],
  ["members-only", "Members only"],
  ["private-lessons-only", "Private lessons only"],
  ["group-only", "Group programs only"],
  ["league-reserved", "League reserved"],
  ["maintenance", "Maintenance"],
  ["blocked", "Blocked"],
] as const;

function ActionNotice({ state }: { readonly state: OperatorActionState }) {
  if (state.status === "idle") return null;
  return (
    <span className={`venue-action-notice is-${state.status}`} role="status">
      {state.status === "error" ? (
        <CircleAlert aria-hidden size={15} />
      ) : (
        <Check aria-hidden size={15} />
      )}
      {state.message}
    </span>
  );
}

function minuteToTime(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
    minute % 60,
  ).padStart(2, "0")}`;
}

function timeToMinute(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function policyHiddenFields(court: Court) {
  return (
    <>
      <input
        name="policyTitle"
        type="hidden"
        value={court.cancellationPolicy.title}
      />
      <input
        name="policyMarkdown"
        type="hidden"
        value={court.cancellationPolicy.markdown}
      />
      <input
        name="refundBeforeHours"
        type="hidden"
        value={court.cancellationPolicy.refundBeforeHours ?? 24}
      />
      <input
        name="creditBeforeHours"
        type="hidden"
        value={court.cancellationPolicy.creditBeforeHours ?? 2}
      />
      <input
        name="lateCancellation"
        type="hidden"
        value={court.cancellationPolicy.lateCancellation ?? ""}
      />
      {court.cancellationPolicy.requireFullScroll && (
        <input name="requireFullScroll" type="hidden" value="true" />
      )}
    </>
  );
}

function CourtSpaceEditor({
  court,
  organizationId,
}: {
  readonly court: Court;
  readonly organizationId: string;
}) {
  const [state, action, pending] = useActionState(
    updateCourtBookingConfigurationAction,
    initialState,
  );
  const [imageUrl, setImageUrl] = useState(court.imageUrl ?? "");
  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");
  const [uploadMessage, setUploadMessage] = useState("");

  async function uploadCourtImage(file?: File) {
    if (!file) return;
    setUploadState("uploading");
    setUploadMessage("Optimizing your court image…");
    try {
      const prepared = await optimizeImageUpload(file);
      const stored = await upload(
        createCourtMediaPath(organizationId, prepared.type),
        prepared,
        {
          access: "public",
          clientPayload: JSON.stringify({
            organizationId,
            fileName: prepared.name,
            contentType: prepared.type,
            size: prepared.size,
            purpose: "court",
          }),
          contentType: prepared.type,
          handleUploadUrl: "/api/media/upload",
          onUploadProgress: ({ percentage }) => {
            setUploadMessage(`Uploading… ${Math.round(percentage)}%`);
          },
        },
      );
      if (!stored.url)
        throw new Error("Duna storage did not return an image URL.");
      setImageUrl(stored.url);
      setUploadState("ready");
      setUploadMessage("Court image ready to save.");
    } catch (error) {
      setUploadState("error");
      setUploadMessage(
        error instanceof Error ? error.message : "Court image upload failed.",
      );
    }
  }

  return (
    <form action={action} className="court-editor-card hq-card">
      <input name="courtId" type="hidden" value={court.id} />
      <input name="imageUrl" type="hidden" value={imageUrl} />
      <input name="litPresent" type="hidden" value="true" />
      <input name="ratePlanId" type="hidden" value={court.ratePlanId ?? ""} />
      <input
        name="minimumDurationMinutes"
        type="hidden"
        value={court.minimumDurationMinutes}
      />
      <input
        name="maximumDurationMinutes"
        type="hidden"
        value={court.maximumDurationMinutes}
      />
      <input
        name="durationOptionsMinutes"
        type="hidden"
        value={court.durationOptionsMinutes.join(",")}
      />
      <input
        name="bookingIncrementMinutes"
        type="hidden"
        value={court.bookingIncrementMinutes}
      />
      <input
        name="bufferBeforeMinutes"
        type="hidden"
        value={court.bufferBeforeMinutes}
      />
      <input
        name="bufferAfterMinutes"
        type="hidden"
        value={court.bufferAfterMinutes}
      />
      <input
        name="minimumNoticeMinutes"
        type="hidden"
        value={court.minimumNoticeMinutes}
      />
      <input
        name="maximumAdvanceDays"
        type="hidden"
        value={court.maximumAdvanceDays}
      />
      <input name="confirmed" type="hidden" value="true" />
      {policyHiddenFields(court)}

      <header>
        <div>
          <span className="hq-eyebrow">Court identity</span>
          <h2>Edit the playable space.</h2>
          <p>
            Name, surface, lighting, capacity, imagery, and booking audience are
            specific to this court.
          </p>
        </div>
        <Waves aria-hidden size={24} />
      </header>

      <div className="court-editor-space-grid">
        <div className="court-image-editor">
          <div
            className={`court-image-editor__preview ${imageUrl ? "has-image" : ""}`}
            style={
              imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined
            }
          >
            {!imageUrl && <ImageIcon aria-hidden size={30} />}
            <Badge tone={court.status === "active" ? "live" : "warning"}>
              {court.status}
            </Badge>
          </div>
          <label className="venue-image-editor__upload">
            <UploadCloud aria-hidden size={18} />
            <span>
              <strong>
                {imageUrl ? "Replace court image" : "Add court image"}
              </strong>
              <small>A wide, recognizable photo works best.</small>
            </span>
            <input
              accept="image/avif,image/jpeg,image/png,image/webp"
              disabled={uploadState === "uploading"}
              onChange={(event) =>
                void uploadCourtImage(event.target.files?.[0])
              }
              type="file"
            />
          </label>
          {uploadMessage && (
            <small className={`venue-upload-message is-${uploadState}`}>
              {uploadMessage}
            </small>
          )}
        </div>

        <div className="court-editor-fields">
          <label className="court-editor-fields__wide">
            <span>Court name</span>
            <input
              defaultValue={court.name}
              maxLength={100}
              name="name"
              required
            />
          </label>
          <label>
            <span>Surface</span>
            <select defaultValue={court.surface} name="surface">
              <option value="sand">Sand</option>
              <option value="indoor-sand">Indoor sand</option>
              <option value="grass">Grass</option>
              <option value="hardcourt">Hardcourt</option>
            </select>
          </label>
          <label>
            <span>Comfortable capacity</span>
            <input
              defaultValue={court.capacity}
              min="1"
              name="capacity"
              required
              type="number"
            />
          </label>
          <label className="court-editor-fields__wide">
            <span>Booking audience</span>
            <select defaultValue={court.bookingPolicy} name="bookingPolicy">
              <option value="public">Public</option>
              <option value="members">Members</option>
              <option value="tiers">Selected membership tiers</option>
              <option value="staff">Staff only</option>
              <option value="none">Not independently bookable</option>
            </select>
          </label>
          <label className="court-lighting-toggle court-editor-fields__wide">
            <input
              defaultChecked={court.lit}
              name="lit"
              type="checkbox"
              value="true"
            />
            <span>
              <strong>Lit after dark</strong>
              <small>Keep evening availability after local sunset.</small>
            </span>
          </label>
        </div>
      </div>

      <footer>
        <ActionNotice state={state} />
        <button
          className="hq-button hq-button--primary"
          disabled={pending || uploadState === "uploading"}
          type="submit"
        >
          {pending ? "Saving court…" : "Save court identity"}
        </button>
      </footer>
    </form>
  );
}

function CourtRulesEditor({
  court,
  workspace,
}: {
  readonly court: Court;
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    updateCourtBookingConfigurationAction,
    initialState,
  );
  return (
    <form action={action} className="court-editor-card hq-card">
      <input name="courtId" type="hidden" value={court.id} />
      <input name="capacity" type="hidden" value={court.capacity} />
      <header>
        <div>
          <span className="hq-eyebrow">Pricing & rules</span>
          <h2>Control how this court is booked.</h2>
          <p>
            These settings affect new reservations. Duna keeps the change
            auditable and never delegates price changes to AI.
          </p>
        </div>
        <Banknote aria-hidden size={24} />
      </header>

      <section className="court-rules-section">
        <header>
          <strong>Pricing and duration</strong>
          <Link
            href={`/locations/${court.venueId}?section=courts#court-pricing`}
          >
            Manage rate plans
          </Link>
        </header>
        <div className="court-editor-fields">
          <label className="court-editor-fields__wide">
            <span>Rate plan</span>
            <select defaultValue={court.ratePlanId ?? ""} name="ratePlanId">
              <option value="">Not available for paid checkout</option>
              {workspace.ratePlans.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.name} ·{" "}
                  {formatMoney(
                    rate.nonMemberAmountMinor ?? rate.baseAmountMinor,
                    rate.currency,
                  )}{" "}
                  / {rate.rateUnitMinutes} min
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Minimum duration</span>
            <select
              defaultValue={court.minimumDurationMinutes}
              name="minimumDurationMinutes"
            >
              {[30, 45, 60, 90].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Maximum duration</span>
            <select
              defaultValue={court.maximumDurationMinutes}
              name="maximumDurationMinutes"
            >
              {[60, 90, 120, 180, 240].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes < 120
                    ? `${minutes} minutes`
                    : `${minutes / 60} hours`}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Bookable lengths</span>
            <input
              defaultValue={court.durationOptionsMinutes.join(",")}
              name="durationOptionsMinutes"
              required
            />
            <small>Minutes, separated by commas.</small>
          </label>
          <label>
            <span>Start-time increment</span>
            <select
              defaultValue={court.bookingIncrementMinutes}
              name="bookingIncrementMinutes"
            >
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
              <option value="60">Every hour</option>
            </select>
          </label>
        </div>
      </section>

      <section className="court-rules-section">
        <header>
          <strong>Buffers and booking window</strong>
        </header>
        <div className="court-editor-fields">
          <label>
            <span>Setup buffer</span>
            <select
              defaultValue={court.bufferBeforeMinutes}
              name="bufferBeforeMinutes"
            >
              {[0, 10, 15, 30, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? "None" : `${minutes} minutes`}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Reset buffer</span>
            <select
              defaultValue={court.bufferAfterMinutes}
              name="bufferAfterMinutes"
            >
              {[0, 10, 15, 30, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? "None" : `${minutes} minutes`}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Minimum notice · minutes</span>
            <input
              defaultValue={court.minimumNoticeMinutes}
              min="0"
              name="minimumNoticeMinutes"
              required
              type="number"
            />
          </label>
          <label>
            <span>Book ahead · days</span>
            <input
              defaultValue={court.maximumAdvanceDays}
              min="1"
              name="maximumAdvanceDays"
              required
              type="number"
            />
          </label>
        </div>
      </section>

      <section className="court-rules-section">
        <header>
          <strong>Cancellation policy</strong>
        </header>
        <div className="court-editor-fields">
          <label className="court-editor-fields__wide">
            <span>Policy title</span>
            <input
              defaultValue={court.cancellationPolicy.title}
              name="policyTitle"
              required
            />
          </label>
          <label className="court-editor-fields__wide">
            <span>Policy text</span>
            <textarea
              defaultValue={court.cancellationPolicy.markdown}
              name="policyMarkdown"
              required
              rows={6}
            />
          </label>
          <label>
            <span>Refund until · hours before</span>
            <input
              defaultValue={court.cancellationPolicy.refundBeforeHours ?? 24}
              min="0"
              name="refundBeforeHours"
              required
              type="number"
            />
          </label>
          <label>
            <span>Credit until · hours before</span>
            <input
              defaultValue={court.cancellationPolicy.creditBeforeHours ?? 2}
              min="0"
              name="creditBeforeHours"
              required
              type="number"
            />
          </label>
          <label className="court-editor-fields__wide">
            <span>Late cancellation result</span>
            <input
              defaultValue={court.cancellationPolicy.lateCancellation}
              name="lateCancellation"
              placeholder="Non-refundable inside the cancellation window."
            />
          </label>
        </div>
        <label className="court-lighting-toggle">
          <input
            defaultChecked={court.cancellationPolicy.requireFullScroll}
            name="requireFullScroll"
            type="checkbox"
            value="true"
          />
          <span>
            <strong>Require players to read the full policy</strong>
            <small>
              Checkout remains locked until the player reaches the end.
            </small>
          </span>
        </label>
      </section>

      <label className="court-rules-confirmation">
        <input name="confirmed" required type="checkbox" value="true" />
        <span>
          <strong>I reviewed these booking and pricing rules.</strong>
          <small>
            The change is audit-logged and applies to new reservations.
          </small>
        </span>
      </label>
      <footer>
        <ActionNotice state={state} />
        <button
          className="hq-button hq-button--primary"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving rules…" : "Save pricing & rules"}
        </button>
      </footer>
    </form>
  );
}

function CourtAvailabilityEditor({
  court,
  timezone,
}: {
  readonly court: Court;
  readonly timezone: string;
}) {
  const [blocks, setBlocks] = useState<readonly ScheduleBlock[]>(
    court.schedule,
  );
  const [draftState, draftAction, draftPending] = useActionState(
    draftCourtScheduleAction,
    initialState,
  );
  const [saveState, saveAction, savePending] = useActionState(
    replaceCourtScheduleAction,
    initialState,
  );
  const [blockState, blockAction, blockPending] = useActionState(
    blockCourtTimeAction,
    initialState,
  );

  function updateBlock(index: number, update: Partial<ScheduleBlock>) {
    setBlocks((current) =>
      current.map((block, blockIndex) =>
        blockIndex === index ? { ...block, ...update } : block,
      ),
    );
  }

  return (
    <div className="court-availability-workspace">
      <section className="court-schedule-editor hq-card">
        <header>
          <div>
            <span className="hq-eyebrow">Weekly availability</span>
            <h2>Set recurring court hours.</h2>
            <p>
              Add one or more windows per day. Times are stored in {timezone}{" "}
              and existing bookings remain protected.
            </p>
          </div>
          <CalendarClock aria-hidden size={24} />
        </header>

        <div className="court-schedule-days">
          {dayNames.map((day, weekday) => {
            const indexed = blocks
              .map((block, index) => ({ block, index }))
              .filter(({ block }) => block.weekday === weekday);
            return (
              <section key={day}>
                <header>
                  <strong>{day}</strong>
                  <button
                    onClick={() =>
                      setBlocks((current) => [
                        ...current,
                        {
                          id: `draft-${crypto.randomUUID()}`,
                          weekday,
                          startsAtMinute: 8 * 60,
                          endsAtMinute: 22 * 60,
                          mode: "open",
                        },
                      ])
                    }
                    type="button"
                  >
                    <Plus aria-hidden size={14} /> Add hours
                  </button>
                </header>
                {indexed.length > 0 ? (
                  <div>
                    {indexed.map(({ block, index }) => (
                      <article key={block.id}>
                        <input
                          aria-label={`${day} start time`}
                          onChange={(event) =>
                            updateBlock(index, {
                              startsAtMinute: timeToMinute(event.target.value),
                            })
                          }
                          type="time"
                          value={minuteToTime(block.startsAtMinute)}
                        />
                        <span>to</span>
                        <input
                          aria-label={`${day} end time`}
                          onChange={(event) =>
                            updateBlock(index, {
                              endsAtMinute: timeToMinute(event.target.value),
                            })
                          }
                          type="time"
                          value={minuteToTime(block.endsAtMinute)}
                        />
                        <select
                          aria-label={`${day} availability type`}
                          onChange={(event) =>
                            updateBlock(index, {
                              mode: event.target.value as ScheduleBlock["mode"],
                            })
                          }
                          value={block.mode}
                        >
                          {scheduleModes.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <button
                          aria-label={`Remove ${day} time window`}
                          onClick={() =>
                            setBlocks((current) =>
                              current.filter(
                                (_, blockIndex) => blockIndex !== index,
                              ),
                            )
                          }
                          type="button"
                        >
                          <Trash2 aria-hidden size={15} />
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>Closed</p>
                )}
              </section>
            );
          })}
        </div>

        <form action={saveAction} className="court-schedule-save">
          <input name="courtId" type="hidden" value={court.id} />
          <input
            name="blocks"
            type="hidden"
            value={JSON.stringify(
              blocks.map(({ weekday, startsAtMinute, endsAtMinute, mode }) => ({
                weekday,
                startsAtMinute,
                endsAtMinute,
                mode,
              })),
            )}
          />
          <input name="confirmed" type="hidden" value="true" />
          <ActionNotice state={saveState} />
          <button
            className="hq-button hq-button--primary"
            disabled={savePending || blocks.length === 0}
            type="submit"
          >
            {savePending ? "Saving schedule…" : "Save weekly availability"}
          </button>
        </form>
      </section>

      <section className="court-schedule-copilot hq-card">
        <header>
          <span>
            <Sparkles aria-hidden size={18} />
            <strong>Draft hours with Duna AI</strong>
          </span>
          <small>Proposal only</small>
        </header>
        <form action={draftAction}>
          <textarea
            defaultValue="Open weekdays from 8am to 10pm and weekends from 7am to 8pm for court rentals."
            name="prompt"
            required
            rows={4}
          />
          <button
            className="hq-button hq-button--secondary"
            disabled={draftPending}
            type="submit"
          >
            <Sparkles aria-hidden size={15} />
            {draftPending ? "Drafting…" : "Draft schedule"}
          </button>
        </form>
        <ActionNotice state={draftState} />
        {draftState.scheduleProposal && (
          <div className="court-schedule-proposal">
            <strong>{draftState.scheduleProposal.summary}</strong>
            <p>{draftState.scheduleProposal.assumptions[0]}</p>
            <button
              className="hq-button hq-button--secondary"
              onClick={() =>
                setBlocks(
                  draftState.scheduleProposal!.blocks.map((block, index) => ({
                    id: `proposal-${index}`,
                    ...block,
                  })),
                )
              }
              type="button"
            >
              Load proposal for review
            </button>
          </div>
        )}
      </section>

      <section className="court-blackout-editor hq-card">
        <header>
          <span>
            <CalendarOff aria-hidden size={19} />
            <strong>Block a date or maintenance window</strong>
          </span>
          <Badge>{timezone}</Badge>
        </header>
        <form action={blockAction}>
          <input name="courtId" type="hidden" value={court.id} />
          <label>
            <span>Starts</span>
            <input name="localStartsAt" required type="datetime-local" />
          </label>
          <label>
            <span>Ends</span>
            <input name="localEndsAt" required type="datetime-local" />
          </label>
          <label className="court-blackout-editor__wide">
            <span>Reason</span>
            <input name="reason" placeholder="Net maintenance" required />
          </label>
          <label className="court-rules-confirmation court-blackout-editor__wide">
            <input name="confirmed" required type="checkbox" value="true" />
            <span>
              <strong>Block this time from new reservations.</strong>
              <small>Existing bookings remain visible for staff review.</small>
            </span>
          </label>
          <footer className="court-blackout-editor__wide">
            <ActionNotice state={blockState} />
            <button
              className="hq-button hq-button--secondary"
              disabled={blockPending}
              type="submit"
            >
              {blockPending ? "Blocking time…" : "Block court time"}
            </button>
          </footer>
        </form>
        {court.overrides.length > 0 && (
          <div className="court-blackout-list">
            {court.overrides.map((override) => (
              <article key={override.id}>
                <CalendarOff aria-hidden size={16} />
                <span>
                  <strong>{override.reason}</strong>
                  <small>
                    {new Intl.DateTimeFormat("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: timezone,
                    }).format(new Date(override.startsAt))}
                  </small>
                </span>
                <Badge>{override.mode}</Badge>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function CourtManagementWorkspace({
  court,
  venue,
  workspace,
  created = false,
}: {
  readonly court: Court;
  readonly venue: Venue;
  readonly workspace: OperatorWorkspace;
  readonly created?: boolean;
}) {
  const [section, setSection] = useState<Section>("space");
  const [activateState, activateAction, activatePending] = useActionState(
    activateCourtAction,
    initialState,
  );
  const rate = workspace.ratePlans.find((item) => item.id === court.ratePlanId);
  return (
    <main className="hq-page court-management-page">
      <header className="court-management-header">
        <Link
          aria-label={`Back to ${venue.name}`}
          className="venue-workspace-back"
          href={`/locations/${venue.id}?section=courts`}
        >
          <ArrowLeft aria-hidden size={19} />
        </Link>
        <div>
          <span className="hq-eyebrow">{venue.name} · court</span>
          <h1>{court.name}</h1>
          <p>
            {court.surface.replaceAll("-", " ")} · up to {court.capacity}{" "}
            players · {court.lit ? "lit after dark" : "daylight only"}
          </p>
        </div>
        <Badge tone={court.status === "active" ? "live" : "warning"}>
          {court.status}
        </Badge>
      </header>

      {created && (
        <div className="venue-created-banner">
          <Check aria-hidden size={18} />
          <span>
            <strong>Court draft created.</strong>
            Review its identity, availability, and pricing before activation.
          </span>
        </div>
      )}

      <section className="court-management-summary">
        <article>
          <Gauge aria-hidden size={18} />
          <span>
            <small>Utilization · 30d</small>
            <Numeric>{court.utilization.percent.toFixed(1)}%</Numeric>
          </span>
        </article>
        <article>
          <CalendarClock aria-hidden size={18} />
          <span>
            <small>Bookings · 30d</small>
            <Numeric>{court.utilization.bookingCount30d}</Numeric>
          </span>
        </article>
        <article>
          <Clock3 aria-hidden size={18} />
          <span>
            <small>Bookable lengths</small>
            <strong>{court.durationOptionsMinutes.join(" / ")} min</strong>
          </span>
        </article>
        <article>
          <Banknote aria-hidden size={18} />
          <span>
            <small>Public rate</small>
            <strong>
              {rate
                ? formatMoney(
                    rate.nonMemberAmountMinor ?? rate.baseAmountMinor,
                    rate.currency,
                  )
                : "Not attached"}
            </strong>
          </span>
        </article>
      </section>

      {court.status === "draft" && (
        <form action={activateAction} className="court-activation-bar">
          <span>
            <strong>Ready to make this court bookable?</strong>
            <small>A rate plan and valid weekly schedule are required.</small>
          </span>
          <input name="courtId" type="hidden" value={court.id} />
          <input name="confirmed" type="hidden" value="true" />
          <ActionNotice state={activateState} />
          <button
            className="hq-button hq-button--primary"
            disabled={activatePending || !court.ratePlanId}
            type="submit"
          >
            {activatePending ? "Activating…" : "Activate court"}
          </button>
        </form>
      )}

      <nav aria-label="Court workspace" className="venue-management-tabs">
        {(
          [
            ["space", "Court details", Settings2],
            ["availability", "Availability", CalendarClock],
            ["rules", "Pricing & rules", Banknote],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            aria-current={section === value ? "page" : undefined}
            className={section === value ? "is-active" : ""}
            key={value}
            onClick={() => setSection(value)}
            type="button"
          >
            <Icon aria-hidden size={16} /> {label}
          </button>
        ))}
      </nav>

      {section === "space" ? (
        <CourtSpaceEditor
          court={court}
          organizationId={workspace.organization.id}
        />
      ) : section === "availability" ? (
        <CourtAvailabilityEditor court={court} timezone={venue.timezone} />
      ) : (
        <CourtRulesEditor court={court} workspace={workspace} />
      )}
    </main>
  );
}
