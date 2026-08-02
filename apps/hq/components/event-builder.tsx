"use client";

import type { OperatorWorkspace } from "@duna/api";
import { formatMoney } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import { upload } from "@vercel/blob/client";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  FileText,
  ImagePlus,
  ListChecks,
  MapPin,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  Trash2,
  Trophy,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  createEventDraftAction,
  type OperatorActionState,
} from "@/app/actions";
import { createEventMediaPath, optimizeImageUpload } from "@/lib/media-storage";
import { PlaceSearch, type PlaceDetails } from "./place-search";

type EventKind = "tournament" | "league";
type LocationMode = "venue" | "address" | "online";
type TeamFormat =
  "solo" | "doubles" | "three-person" | "four-person" | "six-person";
type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

interface DivisionDraft {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly minimumTeams: number;
  readonly maximumTeams: number;
  readonly teamFormat: TeamFormat;
  readonly surface: "sand" | "grass" | "water" | "indoor-sand";
  readonly gender: "mens" | "womens" | "coed" | "open";
  readonly priceBasis: "per-person" | "per-team";
  readonly price: string;
  readonly ratingEnabled: boolean;
  readonly ratingMinimum: string;
  readonly ratingMaximum: string;
  readonly ageEnabled: boolean;
  readonly ageMinimum: string;
  readonly ageMaximum: string;
  readonly tournamentFormat:
    | "kob-qob"
    | "single-elimination"
    | "double-elimination-true"
    | "double-elimination-crossover";
  readonly poolPlay: {
    readonly enabled: boolean;
    readonly teamsPerPool: number;
    readonly format: "full" | "olympic-crossover";
    readonly teamsAdvancing: number;
  };
  readonly seeding:
    | "first-come"
    | "sand-rating-score"
    | "sand-rating-best-8"
    | "sand-rating-ttm"
    | "manual";
}

interface TicketDraft {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly price: string;
  readonly quantity: string;
  readonly waitlistEnabled: boolean;
  readonly approvalRequired: boolean;
  readonly availableOnline: boolean;
  readonly availableInPerson: boolean;
}

interface FeatureDraft {
  readonly id: string;
  readonly kind: "guest" | "activity" | "sponsor";
  readonly title: string;
  readonly description: string;
  readonly personId?: string;
}

interface PolicyDraft {
  readonly id: string;
  readonly kind: "policy" | "waiver";
  readonly title: string;
  readonly markdown: string;
  readonly required: boolean;
  readonly requireFullScroll: boolean;
}

interface RecurringDay {
  readonly day: Weekday;
  readonly startsAt: string;
  readonly endsAt: string;
}

const initialActionState: OperatorActionState = {
  status: "idle",
  message: "",
};

const stepDefinitions = [
  { key: "type", label: "Type", icon: Trophy },
  { key: "basics", label: "Basics", icon: FileText },
  { key: "schedule", label: "Schedule", icon: CalendarDays },
  { key: "divisions", label: "Divisions", icon: UsersRound },
  { key: "tickets", label: "Tickets", icon: Ticket },
  { key: "experience", label: "Experience", icon: Sparkles },
  { key: "rules", label: "Smart rules", icon: SlidersHorizontal },
  { key: "policies", label: "Policies", icon: ShieldCheck },
  { key: "review", label: "Review", icon: ListChecks },
] as const;

function uid(prefix: string) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function localDateTime(daysAhead: number, hour: number) {
  const value = new Date();
  value.setDate(value.getDate() + daysAhead);
  value.setHours(hour, 0, 0, 0);
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function initialDivision(id = uid("division")): DivisionDraft {
  return {
    id,
    name: "Open",
    description: "",
    minimumTeams: 4,
    maximumTeams: 16,
    teamFormat: "doubles",
    surface: "sand",
    gender: "open",
    priceBasis: "per-team",
    price: "96.00",
    ratingEnabled: false,
    ratingMinimum: "3.00",
    ratingMaximum: "6.00",
    ageEnabled: false,
    ageMinimum: "18",
    ageMaximum: "99",
    tournamentFormat: "double-elimination-true",
    poolPlay: {
      enabled: true,
      teamsPerPool: 4,
      format: "full",
      teamsAdvancing: 2,
    },
    seeding: "sand-rating-best-8",
  };
}

function initialTicket(): TicketDraft {
  return {
    id: uid("ticket"),
    name: "General admission",
    description: "",
    price: "12.00",
    quantity: "250",
    waitlistEnabled: false,
    approvalRequired: false,
    availableOnline: true,
    availableInPerson: true,
  };
}

function teamSize(format: TeamFormat) {
  return {
    solo: 1,
    doubles: 2,
    "three-person": 3,
    "four-person": 4,
    "six-person": 6,
  }[format];
}

function moneyMinor(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0;
}

function Toggle({
  checked,
  label,
  detail,
  onChange,
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly detail?: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="event-toggle">
      <span>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <i aria-hidden />
    </label>
  );
}

function DivisionEditor({
  division,
  eventKind,
  index,
  onChange,
  onRemove,
}: {
  readonly division: DivisionDraft;
  readonly eventKind: EventKind;
  readonly index: number;
  readonly onChange: (next: DivisionDraft) => void;
  readonly onRemove: () => void;
}) {
  const set = <Key extends keyof DivisionDraft>(
    key: Key,
    value: DivisionDraft[Key],
  ) => onChange({ ...division, [key]: value });
  return (
    <article className="division-editor">
      <header>
        <span className="division-editor__number">
          <Numeric>{String(index + 1).padStart(2, "0")}</Numeric>
        </span>
        <span>
          <strong>{division.name || "Untitled division"}</strong>
          <small>
            {division.teamFormat.replace("-", " ")} · {division.surface} ·{" "}
            {division.gender}
          </small>
        </span>
        {index > 0 && (
          <button aria-label="Remove division" onClick={onRemove} type="button">
            <Trash2 aria-hidden size={16} />
          </button>
        )}
      </header>
      <div className="event-form-grid event-form-grid--three">
        <label className="event-field--span-two">
          <span>Division name</span>
          <input
            onChange={(event) => set("name", event.target.value)}
            placeholder="Open"
            value={division.name}
          />
        </label>
        <label>
          <span>Gender</span>
          <select
            onChange={(event) =>
              set("gender", event.target.value as DivisionDraft["gender"])
            }
            value={division.gender}
          >
            <option value="open">Open</option>
            <option value="mens">Men&apos;s</option>
            <option value="womens">Women&apos;s</option>
            <option value="coed">CoEd</option>
          </select>
        </label>
        <label className="event-field--full">
          <span>Description</span>
          <textarea
            onChange={(event) => set("description", event.target.value)}
            placeholder="Who this division is for and what makes it distinct."
            rows={2}
            value={division.description}
          />
        </label>
        <label>
          <span>Team format</span>
          <select
            onChange={(event) =>
              set(
                "teamFormat",
                event.target.value as DivisionDraft["teamFormat"],
              )
            }
            value={division.teamFormat}
          >
            <option value="solo">Solo</option>
            <option value="doubles">Doubles</option>
            <option value="three-person">3 person</option>
            <option value="four-person">4 person</option>
            <option value="six-person">6 person</option>
          </select>
        </label>
        <label>
          <span>Venue type</span>
          <select
            onChange={(event) =>
              set("surface", event.target.value as DivisionDraft["surface"])
            }
            value={division.surface}
          >
            <option value="sand">Sand</option>
            <option value="grass">Grass</option>
            <option value="water">Water</option>
            <option value="indoor-sand">Indoor sand</option>
          </select>
        </label>
        <label>
          <span>Seeding</span>
          <select
            onChange={(event) =>
              set("seeding", event.target.value as DivisionDraft["seeding"])
            }
            value={division.seeding}
          >
            <option value="first-come">First come</option>
            <option value="sand-rating-score">SandRating Score</option>
            <option value="sand-rating-best-8">SandRating Best 8</option>
            <option value="sand-rating-ttm">SandRating TTM</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <label>
          <span>Minimum teams</span>
          <input
            min="1"
            onChange={(event) =>
              set("minimumTeams", Number(event.target.value))
            }
            type="number"
            value={division.minimumTeams}
          />
        </label>
        <label>
          <span>Maximum teams</span>
          <input
            min={division.minimumTeams}
            onChange={(event) =>
              set("maximumTeams", Number(event.target.value))
            }
            type="number"
            value={division.maximumTeams}
          />
        </label>
        <label>
          <span>Price basis</span>
          <select
            onChange={(event) =>
              set(
                "priceBasis",
                event.target.value as DivisionDraft["priceBasis"],
              )
            }
            value={division.priceBasis}
          >
            <option value="per-team">Per team</option>
            <option value="per-person">Per person</option>
          </select>
        </label>
        <label>
          <span>Gross price</span>
          <span className="event-money-input">
            <small>$</small>
            <input
              inputMode="decimal"
              min="0"
              onChange={(event) => set("price", event.target.value)}
              step="0.01"
              type="number"
              value={division.price}
            />
          </span>
        </label>
        <label className="event-field--span-two">
          <span>
            {eventKind === "league"
              ? "Playoff / finals format"
              : "Tournament format"}
          </span>
          <select
            onChange={(event) =>
              set(
                "tournamentFormat",
                event.target.value as DivisionDraft["tournamentFormat"],
              )
            }
            value={division.tournamentFormat}
          >
            <option value="kob-qob">KOB / QOB</option>
            <option value="single-elimination">Single elimination</option>
            <option value="double-elimination-true">
              Double elimination (true)
            </option>
            <option value="double-elimination-crossover">
              Double elimination (cross-over)
            </option>
          </select>
        </label>
      </div>

      <div className="division-eligibility">
        <Toggle
          checked={division.ratingEnabled}
          detail="Optional minimum and maximum SandRating."
          label="Rating range"
          onChange={(checked) => set("ratingEnabled", checked)}
        />
        {division.ratingEnabled && (
          <div>
            <label>
              <span>Minimum</span>
              <input
                max="10"
                min="0"
                onChange={(event) => set("ratingMinimum", event.target.value)}
                step="0.01"
                type="number"
                value={division.ratingMinimum}
              />
            </label>
            <label>
              <span>Maximum</span>
              <input
                max="10"
                min="0"
                onChange={(event) => set("ratingMaximum", event.target.value)}
                step="0.01"
                type="number"
                value={division.ratingMaximum}
              />
            </label>
          </div>
        )}
        <Toggle
          checked={division.ageEnabled}
          detail="Optional minimum and maximum player age."
          label="Age range"
          onChange={(checked) => set("ageEnabled", checked)}
        />
        {division.ageEnabled && (
          <div>
            <label>
              <span>Minimum</span>
              <input
                min="0"
                onChange={(event) => set("ageMinimum", event.target.value)}
                type="number"
                value={division.ageMinimum}
              />
            </label>
            <label>
              <span>Maximum</span>
              <input
                min="1"
                onChange={(event) => set("ageMaximum", event.target.value)}
                type="number"
                value={division.ageMaximum}
              />
            </label>
          </div>
        )}
      </div>

      <section className="pool-config">
        <Toggle
          checked={division.poolPlay.enabled}
          detail="Build pools from registrations and seed the next stage."
          label="Pool play"
          onChange={(checked) =>
            set("poolPlay", { ...division.poolPlay, enabled: checked })
          }
        />
        {division.poolPlay.enabled && (
          <div className="event-form-grid event-form-grid--three">
            <label>
              <span>Teams per pool</span>
              <input
                min="2"
                onChange={(event) =>
                  set("poolPlay", {
                    ...division.poolPlay,
                    teamsPerPool: Number(event.target.value),
                  })
                }
                type="number"
                value={division.poolPlay.teamsPerPool}
              />
            </label>
            <label>
              <span>Pool format</span>
              <select
                onChange={(event) =>
                  set("poolPlay", {
                    ...division.poolPlay,
                    format: event.target
                      .value as DivisionDraft["poolPlay"]["format"],
                  })
                }
                value={division.poolPlay.format}
              >
                <option value="full">Full pool</option>
                <option value="olympic-crossover">Olympic cross-over</option>
              </select>
            </label>
            <label>
              <span>Teams advancing</span>
              <input
                max={division.poolPlay.teamsPerPool}
                min="1"
                onChange={(event) =>
                  set("poolPlay", {
                    ...division.poolPlay,
                    teamsAdvancing: Number(event.target.value),
                  })
                }
                type="number"
                value={division.poolPlay.teamsAdvancing}
              />
            </label>
          </div>
        )}
      </section>
    </article>
  );
}

export function EventBuilder({
  initialKind = "tournament",
  initialTitle = "",
  initialSummary = "",
  initialVenueName,
  initialStartsAt,
  workspace,
}: {
  readonly initialKind?: EventKind;
  readonly initialTitle?: string;
  readonly initialSummary?: string;
  readonly initialVenueName?: string;
  readonly initialStartsAt?: string;
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    createEventDraftAction,
    initialActionState,
  );
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<EventKind>(initialKind);
  const [title, setTitle] = useState(initialTitle);
  const [shortSummary, setShortSummary] = useState(initialSummary);
  const [description, setDescription] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaKind, setMediaKind] = useState<"image" | "video">("image");
  const [mediaUploadState, setMediaUploadState] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");
  const [mediaUploadMessage, setMediaUploadMessage] = useState("");
  const activeVenues = workspace.venues.filter(
    (venue) => venue.status === "active",
  );
  const initialVenue = activeVenues[0];
  const [locationMode, setLocationMode] = useState<LocationMode>(
    initialVenueName ? "address" : initialVenue ? "venue" : "address",
  );
  const [venueId, setVenueId] = useState(initialVenue?.id ?? "");
  const [venueName, setVenueName] = useState(
    initialVenueName ?? initialVenue?.name ?? "Event venue",
  );
  const [address, setAddress] = useState("");
  const [addressPlace, setAddressPlace] = useState<PlaceDetails>({});
  const [onlineUrl, setOnlineUrl] = useState("");
  const [courtIds, setCourtIds] = useState<readonly string[]>([]);
  const [customCourts, setCustomCourts] = useState("");
  const [timezone, setTimezone] = useState(
    initialVenue?.timezone ?? workspace.organization.timezone,
  );
  const [startsAt, setStartsAt] = useState(
    initialStartsAt ?? localDateTime(14, 9),
  );
  const [endsAt, setEndsAt] = useState(localDateTime(14, 17));
  const [divisions, setDivisions] = useState<readonly DivisionDraft[]>([
    initialDivision("division-open"),
  ]);
  const [tickets, setTickets] = useState<readonly TicketDraft[]>([]);
  const [features, setFeatures] = useState<readonly FeatureDraft[]>([]);
  const [policies, setPolicies] = useState<readonly PolicyDraft[]>([]);
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);
  const [allowLateCancellation, setAllowLateCancellation] = useState(false);
  const [freeCancellationHours, setFreeCancellationHours] = useState(24);
  const [bookingOpensDays, setBookingOpensDays] = useState(90);
  const [bookingClosesMinutes, setBookingClosesMinutes] = useState(60);
  const [autoCancelLowAttendance, setAutoCancelLowAttendance] = useState(false);
  const [minimumAttendance, setMinimumAttendance] = useState(4);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<
    "weekly" | "biweekly"
  >("weekly");
  const [recurringDays, setRecurringDays] = useState<readonly RecurringDay[]>([
    { day: "monday", startsAt: "18:00", endsAt: "21:00" },
  ]);
  const [substitutesAllowed, setSubstitutesAllowed] = useState(true);
  const [substituteApproval, setSubstituteApproval] = useState(true);
  const [teamAssignment, setTeamAssignment] = useState<
    "signup" | "rating-balanced" | "manual"
  >("signup");

  const uploadMedia = async (file?: File) => {
    if (!file) return;
    setMediaUploadState("uploading");
    setMediaUploadMessage("Preparing the original…");
    try {
      const prepared = file.type.startsWith("image/")
        ? await optimizeImageUpload(file)
        : file;
      setMediaUploadMessage(
        prepared !== file
          ? "Image optimized. Uploading to Duna storage…"
          : "Uploading to Duna storage…",
      );
      const kind = prepared.type.startsWith("image/") ? "image" : "video";
      const stored = await upload(
        createEventMediaPath(workspace.organization.id, prepared.type),
        prepared,
        {
          access: "public",
          clientPayload: JSON.stringify({
            organizationId: workspace.organization.id,
            fileName: prepared.name,
            contentType: prepared.type,
            size: prepared.size,
          }),
          contentType: prepared.type,
          handleUploadUrl: "/api/media/upload",
          multipart: prepared.size > 100_000_000,
          onUploadProgress: ({ percentage }) => {
            setMediaUploadMessage(
              `Uploading to Duna storage… ${Math.round(percentage)}%`,
            );
          },
        },
      );
      if (!stored.url) {
        throw new Error("Duna storage did not return a delivery URL.");
      }
      setMediaKind(kind);
      setMediaUrl(stored.url);
      setMediaUploadState("ready");
      setMediaUploadMessage(
        kind === "image"
          ? "Optimized image stored and ready."
          : "Video stored and ready for Duna delivery.",
      );
    } catch (error) {
      setMediaUploadState("error");
      setMediaUploadMessage(
        error instanceof Error ? error.message : "Media upload failed.",
      );
    }
  };

  const selectedVenue = activeVenues.find((venue) => venue.id === venueId);
  const current = stepDefinitions[step]!;
  const paid = [
    ...divisions.map((division) => division.price),
    ...tickets.map((ticket) => ticket.price),
  ].some((price) => moneyMinor(price) > 0);
  const playerCapacity = divisions.reduce(
    (total, division) =>
      total + division.maximumTeams * teamSize(division.teamFormat),
    0,
  );
  const startingPrice = Math.min(
    ...[
      ...divisions.map((division) => moneyMinor(division.price)),
      ...tickets.map((ticket) => moneyMinor(ticket.price)),
    ],
  );

  const payload = useMemo(
    () => ({
      title,
      shortSummary: shortSummary || undefined,
      description: description || undefined,
      kind,
      media: mediaUrl
        ? [
            {
              id: "cover-media",
              kind: mediaKind,
              url: mediaUrl,
              alt: shortSummary || title,
            },
          ]
        : [],
      location: {
        mode: locationMode,
        venueId: locationMode === "venue" ? venueId || undefined : undefined,
        venueName,
        address: locationMode === "address" ? address || undefined : undefined,
        googlePlaceId:
          locationMode === "address"
            ? addressPlace.placeId || undefined
            : undefined,
        latitude:
          locationMode === "address" ? addressPlace.latitude : undefined,
        longitude:
          locationMode === "address" ? addressPlace.longitude : undefined,
        onlineUrl:
          locationMode === "online" ? onlineUrl || undefined : undefined,
        courtIds: locationMode === "venue" ? courtIds : [],
        courtNames:
          locationMode === "venue"
            ? (selectedVenue?.courts
                .filter((court) => courtIds.includes(court.id))
                .map((court) => court.name) ?? [])
            : customCourts
                .split(",")
                .map((court) => court.trim())
                .filter(Boolean),
      },
      timezone,
      localStartsAt: startsAt,
      localEndsAt: endsAt,
      divisions: divisions.map((division) => ({
        name: division.name,
        description: division.description || undefined,
        minimumTeams: division.minimumTeams,
        maximumTeams: division.maximumTeams,
        teamFormat: division.teamFormat,
        surface: division.surface,
        gender: division.gender,
        priceBasis: division.priceBasis,
        priceMinor: moneyMinor(division.price),
        ratingEnabled: division.ratingEnabled,
        ratingMinimum: division.ratingEnabled
          ? Number(division.ratingMinimum)
          : undefined,
        ratingMaximum: division.ratingEnabled
          ? Number(division.ratingMaximum)
          : undefined,
        ageEnabled: division.ageEnabled,
        ageMinimum: division.ageEnabled
          ? Number(division.ageMinimum)
          : undefined,
        ageMaximum: division.ageEnabled
          ? Number(division.ageMaximum)
          : undefined,
        tournamentFormat: division.tournamentFormat,
        poolPlay: division.poolPlay,
        seeding: division.seeding,
      })),
      tickets: tickets.map((ticket) => ({
        name: ticket.name,
        description: ticket.description || undefined,
        priceMinor: moneyMinor(ticket.price),
        quantity: ticket.quantity ? Number(ticket.quantity) : undefined,
        waitlistEnabled: ticket.waitlistEnabled,
        approvalRequired: ticket.approvalRequired,
        availableOnline: ticket.availableOnline,
        availableInPerson: ticket.availableInPerson,
      })),
      features: features.map((feature) => {
        const person = workspace.messageRecipients.find(
          (candidate) => candidate.id === feature.personId,
        );
        return {
          id: feature.id,
          kind: feature.kind,
          title: feature.title,
          description: feature.description || undefined,
          personId: feature.kind === "guest" ? feature.personId : undefined,
          personInitials: person
            ? person.displayName
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase()
            : undefined,
        };
      }),
      policies: policies.map((policy) => ({
        id: policy.id,
        kind: policy.kind,
        title: policy.title,
        markdown: policy.markdown,
        required: policy.required,
        requireFullScroll:
          policy.kind === "waiver" ? true : policy.requireFullScroll,
      })),
      smartRules: {
        waitlistEnabled,
        allowLateCancellation,
        freeCancellationHours,
        bookingOpensDays,
        bookingClosesMinutes,
        autoCancelLowAttendance,
        minimumAttendance,
        approvalRequired,
      },
      recurrence:
        kind === "league"
          ? {
              interval: recurrenceInterval,
              days: recurringDays,
              substitutesAllowed,
              substituteApprovalRequired: substituteApproval,
              teamAssignment,
            }
          : undefined,
    }),
    [
      address,
      addressPlace,
      allowLateCancellation,
      approvalRequired,
      autoCancelLowAttendance,
      bookingClosesMinutes,
      bookingOpensDays,
      courtIds,
      customCourts,
      description,
      divisions,
      endsAt,
      freeCancellationHours,
      features,
      kind,
      locationMode,
      mediaKind,
      mediaUrl,
      minimumAttendance,
      onlineUrl,
      policies,
      recurrenceInterval,
      recurringDays,
      selectedVenue?.courts,
      shortSummary,
      startsAt,
      substituteApproval,
      substitutesAllowed,
      teamAssignment,
      tickets,
      timezone,
      title,
      venueId,
      venueName,
      waitlistEnabled,
      workspace.messageRecipients,
    ],
  );

  const canMoveForward =
    current.key === "type" ||
    (current.key === "basics" &&
      title.trim().length >= 3 &&
      shortSummary.trim().length > 0 &&
      venueName.trim().length > 0) ||
    (current.key === "schedule" &&
      Boolean(startsAt) &&
      Boolean(endsAt) &&
      (kind !== "league" || recurringDays.length > 0)) ||
    (current.key === "divisions" &&
      divisions.length > 0 &&
      divisions.every(
        (division) =>
          division.name.trim() &&
          division.maximumTeams >= division.minimumTeams,
      )) ||
    current.key === "tickets" ||
    current.key === "experience" ||
    current.key === "rules" ||
    (current.key === "policies" &&
      policies.every(
        (policy) => policy.title.trim() && policy.markdown.trim(),
      ));

  const addFeature = (kindValue: FeatureDraft["kind"]) => {
    setFeatures((currentFeatures) => [
      ...currentFeatures,
      {
        id: uid("feature"),
        kind: kindValue,
        title:
          kindValue === "guest"
            ? "Guest hosted by"
            : kindValue === "sponsor"
              ? "Event partner"
              : "Special activity",
        description: "",
        personId: workspace.messageRecipients[0]?.id,
      },
    ]);
  };

  const toggleRecurringDay = (day: Weekday) => {
    setRecurringDays((currentDays) =>
      currentDays.some((entry) => entry.day === day)
        ? currentDays.filter((entry) => entry.day !== day)
        : [...currentDays, { day, startsAt: "18:00", endsAt: "21:00" }],
    );
  };

  return (
    <main className="event-builder">
      <header className="event-builder__header">
        <div>
          <Link href={kind === "league" ? "/leagues" : "/events"}>
            <ArrowLeft aria-hidden size={16} /> Back to{" "}
            {kind === "league" ? "leagues" : "events"}
          </Link>
          <span className="hq-eyebrow">Private draft · guided create</span>
          <h1>Create something players remember.</h1>
          <p>
            One clear flow. Duna changes the setup when you choose the event
            type.
          </p>
        </div>
        <div className="event-builder__status">
          <Badge tone="warning">Draft</Badge>
          <span>
            <strong>Money</strong>
            <small>
              {workspace.organization.stripeChargesEnabled
                ? "Payments ready"
                : "Setup required before launch"}
            </small>
          </span>
        </div>
      </header>

      <div className="event-builder__shell">
        <aside className="event-builder__steps">
          {stepDefinitions.map((definition, index) => {
            const Icon = definition.icon;
            return (
              <button
                className={
                  index === step
                    ? "active"
                    : index < step
                      ? "complete"
                      : undefined
                }
                key={definition.key}
                onClick={() => setStep(index)}
                type="button"
              >
                <span>
                  {index < step ? (
                    <Check aria-hidden size={15} />
                  ) : (
                    <Icon aria-hidden size={15} />
                  )}
                </span>
                <small>{String(index + 1).padStart(2, "0")}</small>
                <strong>{definition.label}</strong>
              </button>
            );
          })}
        </aside>

        <form action={action} className="event-builder__canvas">
          <input
            name="eventDraft"
            type="hidden"
            value={JSON.stringify(payload)}
          />
          <section className="event-builder__step-heading">
            <span>
              Step {step + 1} of {stepDefinitions.length}
            </span>
            <h2>{current.label}</h2>
          </section>

          {current.key === "type" && (
            <section className="event-type-grid">
              <button
                className={kind === "tournament" ? "selected" : undefined}
                onClick={() => setKind("tournament")}
                type="button"
              >
                <span>
                  <Trophy aria-hidden size={24} />
                </span>
                <Badge>Competition</Badge>
                <h3>Tournament</h3>
                <p>
                  Divisions, entries, pools, brackets, tickets, live play, and
                  seeding.
                </p>
                <small>
                  Best for one-day or weekend competition{" "}
                  <ArrowRight aria-hidden size={14} />
                </small>
              </button>
              <button
                className={kind === "league" ? "selected" : undefined}
                onClick={() => setKind("league")}
                type="button"
              >
                <span>
                  <CalendarDays aria-hidden size={24} />
                </span>
                <Badge>Recurring</Badge>
                <h3>League</h3>
                <p>
                  Season dates, recurring nights, teams, divisions, substitutes,
                  and standings.
                </p>
                <small>
                  Best for multi-week structured play{" "}
                  <ArrowRight aria-hidden size={14} />
                </small>
              </button>
              <article>
                <Badge>Coming next</Badge>
                <h3>Clinic, camp, open play + more</h3>
                <p>
                  These use the same clean foundation with lighter type-specific
                  setup.
                </p>
              </article>
            </section>
          )}

          {current.key === "basics" && (
            <section className="event-builder-panel">
              <header>
                <span>
                  <FileText aria-hidden size={20} />
                </span>
                <div>
                  <h3>Tell people what this is.</h3>
                  <p>Start with the pieces every public event page needs.</p>
                </div>
              </header>
              <div className="event-form-grid event-form-grid--two">
                <label className="event-field--full">
                  <span>Event name</span>
                  <input
                    autoFocus
                    maxLength={140}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={
                      kind === "tournament"
                        ? "Sunset Open"
                        : "South Bay Summer League"
                    }
                    value={title}
                  />
                </label>
                <label className="event-field--full">
                  <span>Short summary</span>
                  <input
                    maxLength={180}
                    onChange={(event) => setShortSummary(event.target.value)}
                    placeholder="The one sentence players see first."
                    value={shortSummary}
                  />
                  <small>{shortSummary.length}/180</small>
                </label>
                <label className="event-field--full">
                  <span>Description</span>
                  <textarea
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="The fuller story, schedule expectations, what to bring, and why it matters."
                    rows={6}
                    value={description}
                  />
                </label>
              </div>

              <div className="event-media-row">
                <span>
                  <ImagePlus aria-hidden size={20} />
                </span>
                <div>
                  <strong>Cover image or video</strong>
                  <small>
                    Upload to Duna-owned storage or paste an existing hosted
                    URL. Images are resized and compressed before upload.
                  </small>
                </div>
                <label className="event-media-upload">
                  <input
                    accept="image/avif,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                    disabled={mediaUploadState === "uploading"}
                    onChange={(event) =>
                      void uploadMedia(event.target.files?.[0])
                    }
                    type="file"
                  />
                  <span>
                    <UploadCloud aria-hidden size={16} />
                    {mediaUploadState === "uploading"
                      ? "Uploading…"
                      : "Upload file"}
                  </span>
                </label>
                <select
                  aria-label="Media type"
                  onChange={(event) =>
                    setMediaKind(event.target.value as "image" | "video")
                  }
                  value={mediaKind}
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
                <input
                  aria-label="Media URL"
                  onChange={(event) => setMediaUrl(event.target.value)}
                  placeholder="https://…"
                  type="url"
                  value={mediaUrl}
                />
                {mediaUploadState !== "idle" && (
                  <p
                    className={`event-media-status event-media-status--${mediaUploadState}`}
                    role={mediaUploadState === "error" ? "alert" : "status"}
                  >
                    {mediaUploadMessage}
                  </p>
                )}
              </div>

              <fieldset className="event-location">
                <legend>Location</legend>
                <div className="event-segmented">
                  {(["venue", "address", "online"] as const).map((mode) => (
                    <button
                      className={locationMode === mode ? "active" : undefined}
                      key={mode}
                      onClick={() => setLocationMode(mode)}
                      type="button"
                    >
                      {mode === "venue"
                        ? "Connected venue"
                        : mode === "address"
                          ? "New address"
                          : "Online"}
                    </button>
                  ))}
                </div>
                <div className="event-form-grid event-form-grid--two">
                  {locationMode === "venue" && (
                    <>
                      <label>
                        <span>Venue</span>
                        <select
                          disabled={activeVenues.length === 0}
                          onChange={(event) => {
                            const next = activeVenues.find(
                              (venue) => venue.id === event.target.value,
                            );
                            setVenueId(event.target.value);
                            setVenueName(next?.name ?? "");
                            setTimezone(
                              next?.timezone ?? workspace.organization.timezone,
                            );
                            setCourtIds([]);
                          }}
                          value={venueId}
                        >
                          {activeVenues.map((venue) => (
                            <option key={venue.id} value={venue.id}>
                              {venue.name}
                            </option>
                          ))}
                        </select>
                        {activeVenues.length === 0 && (
                          <small>
                            No active venue yet. Choose “New address.”
                          </small>
                        )}
                      </label>
                      <label>
                        <span>Public venue name</span>
                        <input
                          onChange={(event) => setVenueName(event.target.value)}
                          value={venueName}
                        />
                      </label>
                      {selectedVenue && selectedVenue.courts.length > 0 && (
                        <div className="event-court-picker event-field--full">
                          <span>Courts</span>
                          <div>
                            {selectedVenue.courts.map((court) => (
                              <label key={court.id}>
                                <input
                                  checked={courtIds.includes(court.id)}
                                  onChange={(event) =>
                                    setCourtIds((selected) =>
                                      event.target.checked
                                        ? [...selected, court.id]
                                        : selected.filter(
                                            (id) => id !== court.id,
                                          ),
                                    )
                                  }
                                  type="checkbox"
                                />
                                {court.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {locationMode === "address" && (
                    <>
                      <label>
                        <span>Venue name</span>
                        <input
                          onChange={(event) => setVenueName(event.target.value)}
                          placeholder="Pier courts"
                          value={venueName}
                        />
                      </label>
                      <label>
                        <span>Court(s)</span>
                        <input
                          onChange={(event) =>
                            setCustomCourts(event.target.value)
                          }
                          placeholder="Court 1, Stadium, Court 3"
                          value={customCourts}
                        />
                      </label>
                      <PlaceSearch
                        onAddress={(value) => {
                          setAddress(value);
                          setAddressPlace({});
                        }}
                        onPlace={setAddressPlace}
                        onVenueName={setVenueName}
                        value={address}
                      />
                    </>
                  )}
                  {locationMode === "online" && (
                    <>
                      <label>
                        <span>Venue name</span>
                        <input
                          onChange={(event) => setVenueName(event.target.value)}
                          placeholder="Duna Live"
                          value={venueName}
                        />
                      </label>
                      <label>
                        <span>Secure event URL</span>
                        <input
                          onChange={(event) => setOnlineUrl(event.target.value)}
                          placeholder="https://…"
                          type="url"
                          value={onlineUrl}
                        />
                      </label>
                    </>
                  )}
                </div>
              </fieldset>
            </section>
          )}

          {current.key === "schedule" && (
            <section className="event-builder-panel">
              <header>
                <span>
                  <Clock3 aria-hidden size={20} />
                </span>
                <div>
                  <h3>
                    {kind === "league"
                      ? "Set the season rhythm."
                      : "Set the event window."}
                  </h3>
                  <p>Times are interpreted in the venue timezone.</p>
                </div>
              </header>
              <div className="event-form-grid event-form-grid--three">
                <label>
                  <span>Start</span>
                  <input
                    onChange={(event) => setStartsAt(event.target.value)}
                    type="datetime-local"
                    value={startsAt}
                  />
                </label>
                <label>
                  <span>End</span>
                  <input
                    onChange={(event) => setEndsAt(event.target.value)}
                    type="datetime-local"
                    value={endsAt}
                  />
                </label>
                <label>
                  <span>Timezone</span>
                  <input
                    onChange={(event) => setTimezone(event.target.value)}
                    value={timezone}
                  />
                </label>
              </div>
              {kind === "league" && (
                <div className="league-recurrence">
                  <div className="league-recurrence__heading">
                    <div>
                      <strong>Recurring details</strong>
                      <small>
                        Each selected day can have its own start and end time.
                      </small>
                    </div>
                    <select
                      aria-label="League recurrence interval"
                      onChange={(event) =>
                        setRecurrenceInterval(
                          event.target.value as "weekly" | "biweekly",
                        )
                      }
                      value={recurrenceInterval}
                    >
                      <option value="weekly">Every week</option>
                      <option value="biweekly">Every other week</option>
                    </select>
                  </div>
                  <div className="weekday-picker">
                    {(
                      [
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday",
                        "saturday",
                        "sunday",
                      ] as const
                    ).map((day) => (
                      <button
                        className={
                          recurringDays.some((entry) => entry.day === day)
                            ? "active"
                            : undefined
                        }
                        key={day}
                        onClick={() => toggleRecurringDay(day)}
                        type="button"
                      >
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  <div className="recurring-day-list">
                    {recurringDays.map((entry) => (
                      <article key={entry.day}>
                        <strong>{entry.day}</strong>
                        <label>
                          <span>Starts</span>
                          <input
                            onChange={(event) =>
                              setRecurringDays((days) =>
                                days.map((day) =>
                                  day.day === entry.day
                                    ? {
                                        ...day,
                                        startsAt: event.target.value,
                                      }
                                    : day,
                                ),
                              )
                            }
                            type="time"
                            value={entry.startsAt}
                          />
                        </label>
                        <label>
                          <span>Ends</span>
                          <input
                            onChange={(event) =>
                              setRecurringDays((days) =>
                                days.map((day) =>
                                  day.day === entry.day
                                    ? { ...day, endsAt: event.target.value }
                                    : day,
                                ),
                              )
                            }
                            type="time"
                            value={entry.endsAt}
                          />
                        </label>
                      </article>
                    ))}
                  </div>
                  <div className="league-rule-grid">
                    <Toggle
                      checked={substitutesAllowed}
                      label="Substitute players"
                      onChange={setSubstitutesAllowed}
                    />
                    <Toggle
                      checked={substituteApproval}
                      label="Require sub approval"
                      onChange={setSubstituteApproval}
                    />
                    <label>
                      <span>Assign players to teams</span>
                      <select
                        onChange={(event) =>
                          setTeamAssignment(
                            event.target.value as typeof teamAssignment,
                          )
                        }
                        value={teamAssignment}
                      >
                        <option value="signup">During signup</option>
                        <option value="rating-balanced">
                          Balance by SandRating
                        </option>
                        <option value="manual">Manually</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </section>
          )}

          {current.key === "divisions" && (
            <section className="event-builder-panel event-builder-panel--flush">
              <header>
                <span>
                  <UsersRound aria-hidden size={20} />
                </span>
                <div>
                  <h3>Build the field.</h3>
                  <p>
                    Each division controls who can join, how they pay, and how
                    play runs.
                  </p>
                </div>
                <Badge>
                  {divisions.length} division
                  {divisions.length === 1 ? "" : "s"}
                </Badge>
              </header>
              <div className="division-list">
                {divisions.map((division, index) => (
                  <DivisionEditor
                    division={division}
                    eventKind={kind}
                    index={index}
                    key={division.id}
                    onChange={(next) =>
                      setDivisions((currentDivisions) =>
                        currentDivisions.map((candidate) =>
                          candidate.id === division.id ? next : candidate,
                        ),
                      )
                    }
                    onRemove={() =>
                      setDivisions((currentDivisions) =>
                        currentDivisions.filter(
                          (candidate) => candidate.id !== division.id,
                        ),
                      )
                    }
                  />
                ))}
              </div>
              <button
                className="event-add-button"
                onClick={() =>
                  setDivisions((currentDivisions) => [
                    ...currentDivisions,
                    {
                      ...initialDivision(),
                      name: `Division ${currentDivisions.length + 1}`,
                    },
                  ])
                }
                type="button"
              >
                <Plus aria-hidden size={17} /> Add division
              </button>
            </section>
          )}

          {current.key === "tickets" && (
            <section className="event-builder-panel event-builder-panel--flush">
              <header>
                <span>
                  <Ticket aria-hidden size={20} />
                </span>
                <div>
                  <h3>Sell access beyond entries.</h3>
                  <p>Spectator, VIP, hospitality, or any other event ticket.</p>
                </div>
                <Badge>{tickets.length} ticket types</Badge>
              </header>
              {tickets.length === 0 && (
                <div className="event-empty-state">
                  <Ticket aria-hidden size={25} />
                  <strong>Tickets are optional.</strong>
                  <p>
                    Division entries already handle players. Add tickets if
                    people can attend, watch, or upgrade.
                  </p>
                </div>
              )}
              <div className="ticket-editor-list">
                {tickets.map((ticketItem, index) => (
                  <article className="ticket-editor" key={ticketItem.id}>
                    <header>
                      <span>
                        <Numeric>{String(index + 1).padStart(2, "0")}</Numeric>
                      </span>
                      <strong>{ticketItem.name}</strong>
                      <button
                        aria-label="Remove ticket"
                        onClick={() =>
                          setTickets((currentTickets) =>
                            currentTickets.filter(
                              (candidate) => candidate.id !== ticketItem.id,
                            ),
                          )
                        }
                        type="button"
                      >
                        <Trash2 aria-hidden size={16} />
                      </button>
                    </header>
                    <div className="event-form-grid event-form-grid--three">
                      <label className="event-field--span-two">
                        <span>Name</span>
                        <input
                          onChange={(event) =>
                            setTickets((currentTickets) =>
                              currentTickets.map((candidate) =>
                                candidate.id === ticketItem.id
                                  ? { ...candidate, name: event.target.value }
                                  : candidate,
                              ),
                            )
                          }
                          value={ticketItem.name}
                        />
                      </label>
                      <label>
                        <span>Quantity</span>
                        <input
                          min="1"
                          onChange={(event) =>
                            setTickets((currentTickets) =>
                              currentTickets.map((candidate) =>
                                candidate.id === ticketItem.id
                                  ? {
                                      ...candidate,
                                      quantity: event.target.value,
                                    }
                                  : candidate,
                              ),
                            )
                          }
                          placeholder="Unlimited"
                          type="number"
                          value={ticketItem.quantity}
                        />
                      </label>
                      <label className="event-field--span-two">
                        <span>Description</span>
                        <input
                          onChange={(event) =>
                            setTickets((currentTickets) =>
                              currentTickets.map((candidate) =>
                                candidate.id === ticketItem.id
                                  ? {
                                      ...candidate,
                                      description: event.target.value,
                                    }
                                  : candidate,
                              ),
                            )
                          }
                          placeholder="What this ticket includes."
                          value={ticketItem.description}
                        />
                      </label>
                      <label>
                        <span>Gross price</span>
                        <span className="event-money-input">
                          <small>$</small>
                          <input
                            min="0"
                            onChange={(event) =>
                              setTickets((currentTickets) =>
                                currentTickets.map((candidate) =>
                                  candidate.id === ticketItem.id
                                    ? {
                                        ...candidate,
                                        price: event.target.value,
                                      }
                                    : candidate,
                                ),
                              )
                            }
                            step="0.01"
                            type="number"
                            value={ticketItem.price}
                          />
                        </span>
                      </label>
                    </div>
                    <div className="ticket-toggle-grid">
                      {(
                        [
                          ["availableOnline", "Available online"],
                          ["availableInPerson", "Available in person"],
                          ["waitlistEnabled", "Enable waitlist"],
                          ["approvalRequired", "Require approval"],
                        ] as const
                      ).map(([key, label]) => (
                        <Toggle
                          checked={ticketItem[key]}
                          key={key}
                          label={label}
                          onChange={(checked) =>
                            setTickets((currentTickets) =>
                              currentTickets.map((candidate) =>
                                candidate.id === ticketItem.id
                                  ? { ...candidate, [key]: checked }
                                  : candidate,
                              ),
                            )
                          }
                        />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              <button
                className="event-add-button"
                onClick={() =>
                  setTickets((currentTickets) => [
                    ...currentTickets,
                    initialTicket(),
                  ])
                }
                type="button"
              >
                <Plus aria-hidden size={17} /> Add ticket
              </button>
            </section>
          )}

          {current.key === "experience" && (
            <section className="event-builder-panel event-builder-panel--flush">
              <header>
                <span>
                  <Sparkles aria-hidden size={20} />
                </span>
                <div>
                  <h3>Show what makes it special.</h3>
                  <p>
                    Link a Duna guest, name an activity, or recognize a partner.
                  </p>
                </div>
              </header>
              <div className="feature-actions">
                <button onClick={() => addFeature("guest")} type="button">
                  <UsersRound aria-hidden size={17} /> Guest hosted by
                </button>
                <button onClick={() => addFeature("activity")} type="button">
                  <Sparkles aria-hidden size={17} /> Activity
                </button>
                <button onClick={() => addFeature("sponsor")} type="button">
                  <ShieldCheck aria-hidden size={17} /> Sponsor / partner
                </button>
              </div>
              <div className="feature-editor-list">
                {features.map((feature) => (
                  <article key={feature.id}>
                    <span
                      className={`feature-kind feature-kind--${feature.kind}`}
                    >
                      {feature.kind === "guest"
                        ? "G"
                        : feature.kind === "activity"
                          ? "A"
                          : "S"}
                    </span>
                    <div className="event-form-grid event-form-grid--two">
                      <label>
                        <span>Title</span>
                        <input
                          onChange={(event) =>
                            setFeatures((currentFeatures) =>
                              currentFeatures.map((candidate) =>
                                candidate.id === feature.id
                                  ? { ...candidate, title: event.target.value }
                                  : candidate,
                              ),
                            )
                          }
                          value={feature.title}
                        />
                      </label>
                      {feature.kind === "guest" && (
                        <label>
                          <span>Search Duna player</span>
                          <select
                            onChange={(event) => {
                              const person = workspace.messageRecipients.find(
                                (candidate) =>
                                  candidate.id === event.target.value,
                              );
                              setFeatures((currentFeatures) =>
                                currentFeatures.map((candidate) =>
                                  candidate.id === feature.id
                                    ? {
                                        ...candidate,
                                        personId: event.target.value,
                                        title: person
                                          ? `Guest hosted by ${person.displayName}`
                                          : candidate.title,
                                      }
                                    : candidate,
                                ),
                              );
                            }}
                            value={feature.personId}
                          >
                            {workspace.messageRecipients.map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label
                        className={
                          feature.kind === "guest"
                            ? "event-field--full"
                            : undefined
                        }
                      >
                        <span>Description</span>
                        <input
                          onChange={(event) =>
                            setFeatures((currentFeatures) =>
                              currentFeatures.map((candidate) =>
                                candidate.id === feature.id
                                  ? {
                                      ...candidate,
                                      description: event.target.value,
                                    }
                                  : candidate,
                              ),
                            )
                          }
                          placeholder="What players and guests should know."
                          value={feature.description}
                        />
                      </label>
                    </div>
                    <button
                      aria-label="Remove feature"
                      onClick={() =>
                        setFeatures((currentFeatures) =>
                          currentFeatures.filter(
                            (candidate) => candidate.id !== feature.id,
                          ),
                        )
                      }
                      type="button"
                    >
                      <Trash2 aria-hidden size={16} />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {current.key === "rules" && (
            <section className="event-builder-panel event-builder-panel--flush">
              <header>
                <span>
                  <SlidersHorizontal aria-hidden size={20} />
                </span>
                <div>
                  <h3>Set the guardrails once.</h3>
                  <p>
                    Duna applies these rules consistently at discovery,
                    checkout, cancellation, and event operations.
                  </p>
                </div>
                <Badge tone="positive">Recommended defaults</Badge>
              </header>

              <div className="smart-rule-grid">
                <article className={waitlistEnabled ? "enabled" : undefined}>
                  <Toggle
                    checked={waitlistEnabled}
                    detail="Keep demand when entries or tickets sell out."
                    label="Automatic waitlist"
                    onChange={setWaitlistEnabled}
                  />
                </article>
                <article className={approvalRequired ? "enabled" : undefined}>
                  <Toggle
                    checked={approvalRequired}
                    detail="Review requests before a player is admitted and charged."
                    label="Require approval"
                    onChange={setApprovalRequired}
                  />
                </article>
                <article
                  className={allowLateCancellation ? "enabled" : undefined}
                >
                  <Toggle
                    checked={allowLateCancellation}
                    detail="Let players cancel after the free-cancellation window."
                    label="Allow late cancellations"
                    onChange={setAllowLateCancellation}
                  />
                  <label>
                    <span>Free cancellation until</span>
                    <div>
                      <input
                        disabled={!allowLateCancellation}
                        min={0}
                        onChange={(event) =>
                          setFreeCancellationHours(
                            Math.max(0, Number(event.target.value)),
                          )
                        }
                        type="number"
                        value={freeCancellationHours}
                      />
                      <small>hours before start</small>
                    </div>
                  </label>
                </article>
                <article>
                  <div className="smart-rule-copy">
                    <strong>Booking window</strong>
                    <small>
                      Open early enough to plan, then close before operations
                      begin.
                    </small>
                  </div>
                  <div className="smart-rule-inputs">
                    <label>
                      <span>Opens</span>
                      <div>
                        <input
                          min={0}
                          onChange={(event) =>
                            setBookingOpensDays(
                              Math.max(0, Number(event.target.value)),
                            )
                          }
                          type="number"
                          value={bookingOpensDays}
                        />
                        <small>days ahead</small>
                      </div>
                    </label>
                    <label>
                      <span>Closes</span>
                      <div>
                        <input
                          min={0}
                          onChange={(event) =>
                            setBookingClosesMinutes(
                              Math.max(0, Number(event.target.value)),
                            )
                          }
                          type="number"
                          value={bookingClosesMinutes}
                        />
                        <small>minutes before</small>
                      </div>
                    </label>
                  </div>
                </article>
                <article
                  className={autoCancelLowAttendance ? "enabled" : undefined}
                >
                  <Toggle
                    checked={autoCancelLowAttendance}
                    detail="Protect staff and venue time when demand is too low."
                    label="Auto-cancel low attendance"
                    onChange={setAutoCancelLowAttendance}
                  />
                  <label>
                    <span>Minimum attendance</span>
                    <div>
                      <input
                        disabled={!autoCancelLowAttendance}
                        min={1}
                        onChange={(event) =>
                          setMinimumAttendance(
                            Math.max(1, Number(event.target.value)),
                          )
                        }
                        type="number"
                        value={minimumAttendance}
                      />
                      <small>confirmed players</small>
                    </div>
                  </label>
                </article>
              </div>

              <aside className="smart-rule-summary">
                <ShieldCheck aria-hidden size={21} />
                <span>
                  <strong>
                    Players see the important parts before booking.
                  </strong>
                  <small>
                    Booking, cancellation, approval, and waitlist terms stay
                    attached to this event version for a clear audit trail.
                  </small>
                </span>
              </aside>
            </section>
          )}

          {current.key === "policies" && (
            <section className="event-builder-panel event-builder-panel--flush">
              <header>
                <span>
                  <ShieldCheck aria-hidden size={20} />
                </span>
                <div>
                  <h3>Make expectations clear.</h3>
                  <p>
                    Markdown is supported. Waivers require a full scroll during
                    checkout.
                  </p>
                </div>
              </header>
              <div className="feature-actions">
                <button
                  onClick={() =>
                    setPolicies((currentPolicies) => [
                      ...currentPolicies,
                      {
                        id: uid("policy"),
                        kind: "policy",
                        title: "Event policy",
                        markdown: "",
                        required: true,
                        requireFullScroll: false,
                      },
                    ])
                  }
                  type="button"
                >
                  <FileText aria-hidden size={17} /> Add policy
                </button>
                <button
                  onClick={() =>
                    setPolicies((currentPolicies) => [
                      ...currentPolicies,
                      {
                        id: uid("waiver"),
                        kind: "waiver",
                        title: "Participation waiver",
                        markdown: "",
                        required: true,
                        requireFullScroll: true,
                      },
                    ])
                  }
                  type="button"
                >
                  <ShieldCheck aria-hidden size={17} /> Add waiver
                </button>
              </div>
              <div className="policy-editor-list">
                {policies.map((policy) => (
                  <article key={policy.id}>
                    <header>
                      <Badge
                        tone={policy.kind === "waiver" ? "warning" : "neutral"}
                      >
                        {policy.kind}
                      </Badge>
                      <input
                        aria-label={`${policy.kind} title`}
                        onChange={(event) =>
                          setPolicies((currentPolicies) =>
                            currentPolicies.map((candidate) =>
                              candidate.id === policy.id
                                ? { ...candidate, title: event.target.value }
                                : candidate,
                            ),
                          )
                        }
                        value={policy.title}
                      />
                      <button
                        aria-label={`Remove ${policy.kind}`}
                        onClick={() =>
                          setPolicies((currentPolicies) =>
                            currentPolicies.filter(
                              (candidate) => candidate.id !== policy.id,
                            ),
                          )
                        }
                        type="button"
                      >
                        <Trash2 aria-hidden size={16} />
                      </button>
                    </header>
                    <textarea
                      aria-label={`${policy.title} markdown`}
                      onChange={(event) =>
                        setPolicies((currentPolicies) =>
                          currentPolicies.map((candidate) =>
                            candidate.id === policy.id
                              ? {
                                  ...candidate,
                                  markdown: event.target.value,
                                }
                              : candidate,
                          ),
                        )
                      }
                      placeholder="Write or paste policy terms in Markdown…"
                      rows={8}
                      value={policy.markdown}
                    />
                    <div>
                      <Toggle
                        checked={policy.required}
                        label="Required at checkout"
                        onChange={(checked) =>
                          setPolicies((currentPolicies) =>
                            currentPolicies.map((candidate) =>
                              candidate.id === policy.id
                                ? { ...candidate, required: checked }
                                : candidate,
                            ),
                          )
                        }
                      />
                      <span>
                        {policy.kind === "waiver"
                          ? "Players must scroll through the full waiver."
                          : "Policies appear beside checkout confirmation."}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {current.key === "review" && (
            <section className="event-review">
              <div className="event-review__hero">
                <Badge>{kind}</Badge>
                <h3>{title || "Untitled event"}</h3>
                <p>
                  {shortSummary ||
                    "Add a short summary before saving this draft."}
                </p>
                <div>
                  <span>
                    <CalendarDays aria-hidden size={17} />
                    <strong>
                      {new Date(startsAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </strong>
                  </span>
                  <span>
                    <MapPin aria-hidden size={17} />
                    <strong>{venueName}</strong>
                  </span>
                  <span>
                    <UsersRound aria-hidden size={17} />
                    <strong>{playerCapacity} player capacity</strong>
                  </span>
                </div>
              </div>
              <div className="event-review__grid">
                <article>
                  <UsersRound aria-hidden size={20} />
                  <span>
                    <strong>{divisions.length} divisions</strong>
                    <small>
                      {divisions.map((division) => division.name).join(", ")}
                    </small>
                  </span>
                </article>
                <article>
                  <Ticket aria-hidden size={20} />
                  <span>
                    <strong>{tickets.length} ticket types</strong>
                    <small>
                      {tickets.length
                        ? tickets.map((ticket) => ticket.name).join(", ")
                        : "Player entries only"}
                    </small>
                  </span>
                </article>
                <article>
                  <Sparkles aria-hidden size={20} />
                  <span>
                    <strong>{features.length} event features</strong>
                    <small>Guests, activities, and partners</small>
                  </span>
                </article>
                <article>
                  <ShieldCheck aria-hidden size={20} />
                  <span>
                    <strong>{policies.length} policies + waivers</strong>
                    <small>
                      {policies.filter((policy) => policy.required).length}{" "}
                      required at checkout
                    </small>
                  </span>
                </article>
                <article>
                  <SlidersHorizontal aria-hidden size={20} />
                  <span>
                    <strong>
                      {
                        [
                          waitlistEnabled,
                          approvalRequired,
                          allowLateCancellation,
                          autoCancelLowAttendance,
                        ].filter(Boolean).length
                      }{" "}
                      active smart rules
                    </strong>
                    <small>
                      Booking opens {bookingOpensDays} days ahead and closes{" "}
                      {bookingClosesMinutes} minutes before start
                    </small>
                  </span>
                </article>
              </div>
              <article
                className={`event-money-gate ${
                  paid && !workspace.organization.stripeChargesEnabled
                    ? "attention"
                    : "ready"
                }`}
              >
                <span>
                  <CircleDollarSign aria-hidden size={23} />
                </span>
                <div>
                  <Badge
                    tone={
                      paid && !workspace.organization.stripeChargesEnabled
                        ? "warning"
                        : "positive"
                    }
                  >
                    Money gate
                  </Badge>
                  <h3>
                    {paid
                      ? workspace.organization.stripeChargesEnabled
                        ? "Payments are ready when you publish."
                        : "Save the draft now. Finish payment setup before launch."
                      : "This event can launch without payments."}
                  </h3>
                  <p>
                    {paid
                      ? `Public prices start at ${formatMoney(startingPrice, workspace.organization.currency)}.`
                      : "All configured entries and tickets are free."}{" "}
                    Duna never publishes from this step.
                  </p>
                </div>
                {!workspace.organization.stripeChargesEnabled && paid && (
                  <Link href="/payments">Configure Money</Link>
                )}
              </article>
              <label className="event-final-confirmation">
                <input
                  name="confirmedPrice"
                  required
                  type="checkbox"
                  value="true"
                />
                <span>
                  <strong>I reviewed every division and ticket price.</strong>
                  This saves a private draft. Going live is a separate, explicit
                  action after Money is ready.
                </span>
              </label>
              {state.status !== "idle" && (
                <div
                  className={`event-builder-notice event-builder-notice--${state.status}`}
                  role={state.status === "error" ? "alert" : "status"}
                >
                  {state.status === "success" ? (
                    <Check aria-hidden size={17} />
                  ) : (
                    <ShieldCheck aria-hidden size={17} />
                  )}
                  <span>
                    <strong>
                      {state.status === "success"
                        ? "Draft created"
                        : "Check the draft"}
                    </strong>
                    <small>{state.message}</small>
                  </span>
                  {state.status === "success" && (
                    <Link href={kind === "league" ? "/leagues" : "/events"}>
                      View inventory
                    </Link>
                  )}
                </div>
              )}
            </section>
          )}

          <footer className="event-builder__footer">
            <button
              className="hq-button hq-button--secondary"
              disabled={step === 0 || pending}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              type="button"
            >
              <ArrowLeft aria-hidden size={16} /> Back
            </button>
            <span>Changes stay local until you save the private draft.</span>
            {current.key === "review" ? (
              <button
                className="hq-button hq-button--primary"
                disabled={pending}
                type="submit"
              >
                {pending ? "Saving draft…" : "Save event draft"}
                <Check aria-hidden size={16} />
              </button>
            ) : (
              <button
                className="hq-button hq-button--primary"
                disabled={!canMoveForward || pending}
                onClick={() =>
                  setStep((value) =>
                    Math.min(stepDefinitions.length - 1, value + 1),
                  )
                }
                type="button"
              >
                Continue <ArrowRight aria-hidden size={16} />
              </button>
            )}
          </footer>
        </form>
      </div>
    </main>
  );
}
