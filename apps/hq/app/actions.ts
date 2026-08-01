"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

export interface OperatorActionState {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
  readonly onboardingUrl?: string;
  readonly entityId?: string;
  readonly scheduleProposal?: {
    readonly summary: string;
    readonly blocks: readonly {
      readonly weekday: number;
      readonly startsAtMinute: number;
      readonly endsAtMinute: number;
      readonly mode:
        | "open"
        | "rentals-only"
        | "members-only"
        | "private-lessons-only"
        | "group-only"
        | "league-reserved"
        | "maintenance"
        | "blocked";
    }[];
    readonly assumptions: readonly string[];
  };
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalField(formData: FormData, name: string): string | undefined {
  return field(formData, name) || undefined;
}

function numberField(formData: FormData, name: string): number {
  const value = Number(field(formData, name));
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number.`);
  return value;
}

function optionalMoneyMinor(
  formData: FormData,
  name: string,
): number | undefined {
  const value = field(formData, name);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative amount.`);
  }
  return Math.round(parsed * 100);
}

function moneyMinor(formData: FormData, name: string): number {
  const value = optionalMoneyMinor(formData, name);
  if (value === undefined) throw new Error(`${name} is required.`);
  return value;
}

function confirmed(formData: FormData, name = "confirmed"): true {
  if (field(formData, name) !== "true") {
    throw new Error("Review and confirm this change before continuing.");
  }
  return true;
}

function result(
  status: OperatorActionState["status"],
  message: string,
  onboardingUrl?: string,
  entityId?: string,
): OperatorActionState {
  return { status, message, onboardingUrl, entityId };
}

function errorState(error: unknown): OperatorActionState {
  return result(
    "error",
    error instanceof Error ? error.message : "The change could not be saved.",
  );
}

function revalidateOperator() {
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/programs");
  revalidatePath("/events");
  revalidatePath("/leagues");
  revalidatePath("/payments");
  revalidatePath("/messages");
  revalidatePath("/members");
  revalidatePath("/settings");
  revalidatePath("/locations");
}

type ServerCaller = Awaited<ReturnType<typeof getServerCaller>>;
type CreateEventDraftPayload = Parameters<
  ServerCaller["operator"]["createEventDraft"]
>[0];

export async function createPlayerInvitationAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    const created = await caller.operator.createPlayerInvitation({
      invitedName: field(formData, "invitedName"),
      invitedEmail: optionalField(formData, "invitedEmail"),
      invitedPhoneE164: optionalField(formData, "invitedPhoneE164"),
      relationship:
        field(formData, "relationship") === "member" ? "member" : "player",
      isMinor: field(formData, "isMinor") === "true",
      guardianName: optionalField(formData, "guardianName"),
      guardianEmail: optionalField(formData, "guardianEmail"),
      guardianPhoneE164: optionalField(formData, "guardianPhoneE164"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      created.status === "sent"
        ? "Invitation sent by SMS."
        : "Invitation created. SMS will send after Sent.dm has a non-empty API key and approved template.",
      undefined,
      created.id,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function createEventDraftAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const serialized = field(formData, "eventDraft");
    if (!serialized) throw new Error("The event draft is empty.");
    const parsed = JSON.parse(serialized) as Omit<
      CreateEventDraftPayload,
      "confirmedPrice" | "idempotencyKey"
    >;
    const caller = await getServerCaller();
    const created = await caller.operator.createEventDraft({
      ...parsed,
      confirmedPrice: confirmed(formData, "confirmedPrice"),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Event draft saved. Money and publication remain gated.",
      undefined,
      created.id,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function approveTicketOrderAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    const approved = await caller.operator.approveTicketOrder({
      orderId: field(formData, "orderId"),
      ticketTypeId: field(formData, "ticketTypeId"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      `${approved.quantity} ticket${approved.quantity === 1 ? "" : "s"} approved and ready to scan.`,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function createRatePlanAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.createRatePlan({
      name: field(formData, "name"),
      baseAmountMinor: moneyMinor(formData, "baseAmount"),
      memberAmountMinor: optionalMoneyMinor(formData, "memberAmount"),
      nonMemberAmountMinor: optionalMoneyMinor(formData, "nonMemberAmount"),
      rateUnitMinutes: numberField(formData, "rateUnitMinutes"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Rate plan created and recorded in the audit log.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function createVenueAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.createVenue({
      name: field(formData, "name"),
      description: optionalField(formData, "description"),
      capacity: numberField(formData, "capacity"),
      heroImageUrl: optionalField(formData, "heroImageUrl"),
      amenities: field(formData, "amenities")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      addressLine1: optionalField(formData, "addressLine1"),
      locality: optionalField(formData, "locality"),
      administrativeArea: optionalField(formData, "administrativeArea"),
      postalCode: optionalField(formData, "postalCode"),
      countryCode: field(formData, "countryCode") || "US",
      timezone: field(formData, "timezone"),
      temporary: field(formData, "temporary") === "true",
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Venue draft created. Add and activate a court before publishing it.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function createCourtAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    const bookingPolicy = field(formData, "bookingPolicy");
    if (
      bookingPolicy !== "public" &&
      bookingPolicy !== "members" &&
      bookingPolicy !== "tiers" &&
      bookingPolicy !== "staff" &&
      bookingPolicy !== "none"
    ) {
      throw new Error("Choose a valid booking policy.");
    }
    await caller.operator.createCourt({
      venueId: field(formData, "venueId"),
      name: field(formData, "name"),
      surface: field(formData, "surface"),
      lit: field(formData, "lit") === "true",
      capacity: numberField(formData, "capacity"),
      bookingPolicy,
      ratePlanId: optionalField(formData, "ratePlanId"),
      minimumDurationMinutes: numberField(formData, "minimumDurationMinutes"),
      maximumDurationMinutes: numberField(formData, "maximumDurationMinutes"),
      durationOptionsMinutes: field(formData, "durationOptionsMinutes")
        .split(",")
        .map(Number)
        .filter((value) => Number.isFinite(value)),
      bookingIncrementMinutes: numberField(formData, "bookingIncrementMinutes"),
      bufferBeforeMinutes: numberField(formData, "bufferBeforeMinutes"),
      bufferAfterMinutes: numberField(formData, "bufferAfterMinutes"),
      minimumNoticeMinutes: numberField(formData, "minimumNoticeMinutes"),
      maximumAdvanceDays: numberField(formData, "maximumAdvanceDays"),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Court draft created. Review its policy before activation.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function updateVenueProfileAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.updateVenueProfile({
      venueId: field(formData, "venueId"),
      description: optionalField(formData, "description"),
      capacity: numberField(formData, "capacity"),
      heroImageUrl: optionalField(formData, "heroImageUrl"),
      amenities: field(formData, "amenities")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Venue story and capacity updated.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateCourtBookingConfigurationAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.updateCourtBookingConfiguration({
      courtId: field(formData, "courtId"),
      ratePlanId: optionalField(formData, "ratePlanId") ?? null,
      capacity: numberField(formData, "capacity"),
      durationOptionsMinutes: field(formData, "durationOptionsMinutes")
        .split(",")
        .map(Number)
        .filter((value) => Number.isFinite(value)),
      bookingIncrementMinutes: numberField(formData, "bookingIncrementMinutes"),
      minimumNoticeMinutes: numberField(formData, "minimumNoticeMinutes"),
      maximumAdvanceDays: numberField(formData, "maximumAdvanceDays"),
      cancellationPolicy: {
        title: field(formData, "policyTitle"),
        markdown: field(formData, "policyMarkdown"),
        refundBeforeHours: numberField(formData, "refundBeforeHours"),
        creditBeforeHours: numberField(formData, "creditBeforeHours"),
        lateCancellation: optionalField(formData, "lateCancellation"),
        requireFullScroll: field(formData, "requireFullScroll") === "true",
      },
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Court booking and cancellation rules updated.");
  } catch (error) {
    return errorState(error);
  }
}

export async function draftCourtScheduleAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    const scheduleProposal = await caller.operator.draftCourtSchedule({
      prompt: field(formData, "prompt"),
    });
    return {
      status: "success",
      message: "Duna drafted a weekly schedule. Review it before applying.",
      scheduleProposal,
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function replaceCourtScheduleAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    const blocks = JSON.parse(field(formData, "blocks")) as {
      weekday: number;
      startsAtMinute: number;
      endsAtMinute: number;
      mode:
        | "open"
        | "rentals-only"
        | "members-only"
        | "private-lessons-only"
        | "group-only"
        | "league-reserved"
        | "maintenance"
        | "blocked";
    }[];
    await caller.operator.replaceCourtSchedule({
      courtId: field(formData, "courtId"),
      blocks,
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Weekly availability replaced and published.");
  } catch (error) {
    return errorState(error);
  }
}

export async function blockCourtTimeAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.blockCourtTime({
      courtId: field(formData, "courtId"),
      localStartsAt: field(formData, "localStartsAt"),
      localEndsAt: field(formData, "localEndsAt"),
      reason: field(formData, "reason"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Court time blocked from new bookings.");
  } catch (error) {
    return errorState(error);
  }
}

export async function activateCourtAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.activateCourt({
      courtId: field(formData, "courtId"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Court activated for its configured audience.");
  } catch (error) {
    return errorState(error);
  }
}

export async function publishVenueAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.publishVenue({
      venueId: field(formData, "venueId"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Venue published to the player experience.");
  } catch (error) {
    return errorState(error);
  }
}

export async function createProgramSessionAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    const kind = field(formData, "kind");
    if (
      kind !== "tournament" &&
      kind !== "league" &&
      kind !== "clinic" &&
      kind !== "open-play" &&
      kind !== "private-lesson" &&
      kind !== "court-rental" &&
      kind !== "pickup"
    ) {
      throw new Error("Choose a valid session type.");
    }
    await caller.operator.createProgramSession({
      title: field(formData, "title"),
      description: optionalField(formData, "description"),
      kind,
      venueId: field(formData, "venueId"),
      courtId: optionalField(formData, "courtId"),
      localStartsAt: field(formData, "localStartsAt"),
      localEndsAt: field(formData, "localEndsAt"),
      capacity: numberField(formData, "capacity"),
      minimumCapacity: numberField(formData, "minimumCapacity"),
      priceMinor: moneyMinor(formData, "price"),
      confirmedPrice: confirmed(formData, "confirmedPrice"),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Session draft created. Publishing remains a separate confirmation.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function publishSessionAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.publishSession({
      sessionId: field(formData, "sessionId"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Registration opened and the session is now player-facing.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function saveMessageDraftAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    const channel = field(formData, "channel");
    const classification = field(formData, "classification");
    if (channel !== "email" && channel !== "sms" && channel !== "push") {
      throw new Error("Choose a valid delivery channel.");
    }
    if (classification !== "transactional" && classification !== "marketing") {
      throw new Error("Choose transactional or marketing.");
    }
    await caller.operator.saveMessageDraft({
      recipientPersonId: field(formData, "recipientPersonId"),
      channel,
      classification,
      subject: optionalField(formData, "subject"),
      body: field(formData, "body"),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Consent-safe draft saved. Nothing was sent.");
  } catch (error) {
    return errorState(error);
  }
}

async function hqOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_HQ_URL?.trim();
  if (configured) return new URL(configured).origin;
  const incoming = await headers();
  const protocol = incoming.get("x-forwarded-proto") ?? "https";
  const host =
    incoming.get("x-forwarded-host") ??
    incoming.get("host") ??
    "localhost:3001";
  return `${protocol}://${host}`;
}

export async function startStripeOnboardingAction(
  _previous: OperatorActionState,
  _formData: FormData,
): Promise<OperatorActionState> {
  void _previous;
  void _formData;
  try {
    const caller = await getServerCaller();
    const origin = await hqOrigin();
    const onboarding = await caller.operator.startStripeOnboarding({
      refreshUrl: `${origin}/payments?stripe=refresh`,
      returnUrl: `${origin}/payments?stripe=return`,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Stripe’s secure onboarding link is ready. You must personally complete its identity and legal steps.",
      onboarding.onboardingUrl,
    );
  } catch (error) {
    return errorState(error);
  }
}
