"use server";

import type { VenueLayoutAsset, VenueLayoutGeometry } from "@duna/api";
import { normalizeClubColor } from "@duna/ui";
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
  readonly venueAssignmentPlan?: {
    readonly sessionId: string;
    readonly generatedAt: string;
    readonly assignments: readonly {
      readonly matchId: string;
      readonly divisionName: string;
      readonly courtName: string;
      readonly scheduledAt: string;
      readonly estimatedMinutes: number;
      readonly reason: string;
    }[];
    readonly unassignedMatchIds: readonly string[];
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

function optionalNumberField(
  formData: FormData,
  name: string,
): number | undefined {
  const value = field(formData, name);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number.`);
  return parsed;
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

function friendlyErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "The change could not be saved.";
  try {
    const issues = JSON.parse(message) as readonly {
      readonly path?: readonly (string | number)[];
    }[];
    if (Array.isArray(issues)) {
      const fields = new Set(
        issues.flatMap((issue) =>
          Array.isArray(issue.path) ? issue.path.map(String) : [],
        ),
      );
      if (
        ["addressLine1", "locality", "administrativeArea", "postalCode"].some(
          (fieldName) => fields.has(fieldName),
        )
      ) {
        return "Choose a complete Google address, or enter the city, state or region, and postal code manually.";
      }
      return "Some required information is missing or invalid. Review the form and try again.";
    }
  } catch {
    // Non-validation errors already carry a useful, user-facing message.
  }
  return message;
}

function errorState(error: unknown): OperatorActionState {
  return result("error", friendlyErrorMessage(error));
}

function revalidateOperator() {
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/programs");
  revalidatePath("/products");
  revalidatePath("/events");
  revalidatePath("/leagues");
  revalidatePath("/payments");
  revalidatePath("/messages");
  revalidatePath("/team");
  revalidatePath("/members");
  revalidatePath("/settings");
  revalidatePath("/locations");
  revalidatePath("/locations", "layout");
}

export async function createCatalogItemAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const type = field(formData, "type");
    if (
      type !== "event" &&
      type !== "service" &&
      type !== "good" &&
      type !== "plan"
    ) {
      throw new Error("Choose Event, Service, Good, or Plan.");
    }
    const visibility = field(formData, "visibility");
    if (
      visibility !== "public" &&
      visibility !== "members" &&
      visibility !== "private"
    ) {
      throw new Error("Choose who can see this product.");
    }
    const recurringInterval = optionalField(formData, "recurringInterval");
    if (
      recurringInterval !== undefined &&
      recurringInterval !== "week" &&
      recurringInterval !== "month" &&
      recurringInterval !== "year"
    ) {
      throw new Error("Choose a valid billing interval.");
    }
    const optionsValue = optionalField(formData, "options");
    const mediaValue = optionalField(formData, "media");
    const initialInventoryValue = optionalField(formData, "initialInventory");
    const configurationValue = optionalField(formData, "configuration");
    const caller = await getServerCaller();
    const created = await caller.operator.createCatalogItem({
      type,
      subtype: field(formData, "subtype"),
      title: field(formData, "title"),
      shortSummary: optionalField(formData, "shortSummary"),
      description: optionalField(formData, "description"),
      visibility,
      taxable: field(formData, "taxable") === "true",
      stripeTaxCode: optionalField(formData, "stripeTaxCode"),
      allowCard: field(formData, "allowCard") === "true",
      allowCash: field(formData, "allowCash") === "true",
      allowCredits: field(formData, "allowCredits") === "true",
      membershipRequired: field(formData, "membershipRequired") === "true",
      priceMinor: optionalMoneyMinor(formData, "price"),
      memberPriceMinor: optionalMoneyMinor(formData, "memberPrice"),
      nonMemberPriceMinor: optionalMoneyMinor(formData, "nonMemberPrice"),
      annualPriceMinor: optionalMoneyMinor(formData, "annualPrice"),
      annualMemberPriceMinor: optionalMoneyMinor(formData, "annualMemberPrice"),
      annualNonMemberPriceMinor: optionalMoneyMinor(
        formData,
        "annualNonMemberPrice",
      ),
      creditCost: optionalField(formData, "creditCost")
        ? numberField(formData, "creditCost")
        : undefined,
      recurringInterval,
      recurringIntervalCount: recurringInterval
        ? numberField(formData, "recurringIntervalCount")
        : undefined,
      options: optionsValue
        ? (JSON.parse(optionsValue) as {
            name: string;
            values: string[];
          }[])
        : [],
      media: mediaValue
        ? (JSON.parse(mediaValue) as {
            kind: "image" | "video";
            url: string;
            posterUrl?: string;
            alt?: string;
            variantIndex?: number;
          }[])
        : [],
      initialInventory: initialInventoryValue
        ? (JSON.parse(initialInventoryValue) as {
            variantIndex: number;
            inventoryLocationId?: string;
            locationName?: string;
            purpose: "sale" | "rental" | "coach-use" | "operations";
            trackingMode: "quantity" | "serialized";
            quantity: number;
            unitCostMinor?: number;
            totalCostMinor?: number;
            acquiredAt?: string;
            vendorName?: string;
            receiptUrl?: string;
          })
        : undefined,
      configuration: configurationValue
        ? (JSON.parse(configurationValue) as Record<string, unknown>)
        : {},
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Product draft created. It remains private until you publish it.",
      undefined,
      created.id,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function createInventoryStockAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const purpose = field(formData, "purpose");
    if (
      purpose !== "sale" &&
      purpose !== "rental" &&
      purpose !== "coach-use" &&
      purpose !== "operations"
    ) {
      throw new Error("Choose how this inventory will be used.");
    }
    const trackingMode =
      field(formData, "trackingMode") === "serialized"
        ? "serialized"
        : "quantity";
    const depreciationMethod = optionalField(formData, "depreciationMethod") as
      | "straight-line"
      | "declining-balance"
      | "section-179"
      | "bonus"
      | "none"
      | undefined;
    const caller = await getServerCaller();
    const created = await caller.operator.createInventoryStock({
      catalogVariantId: field(formData, "catalogVariantId"),
      inventoryLocationId: optionalField(formData, "inventoryLocationId"),
      locationName: optionalField(formData, "locationName"),
      venueId: optionalField(formData, "venueId"),
      purpose,
      trackingMode,
      quantity: numberField(formData, "quantity"),
      reorderPoint: numberField(formData, "reorderPoint"),
      serialNumber: optionalField(formData, "serialNumber"),
      assetTag: optionalField(formData, "assetTag"),
      condition: field(formData, "condition") || "new",
      unitCostMinor: optionalMoneyMinor(formData, "unitCost"),
      totalCostMinor: optionalMoneyMinor(formData, "totalCost"),
      acquiredAt: optionalField(formData, "acquiredAt"),
      vendorName: optionalField(formData, "vendorName"),
      vendorReference: optionalField(formData, "vendorReference"),
      receiptUrl: optionalField(formData, "receiptUrl"),
      placedInServiceAt: optionalField(formData, "placedInServiceAt"),
      depreciationMethod,
      usefulLifeMonths: optionalField(formData, "usefulLifeMonths")
        ? numberField(formData, "usefulLifeMonths")
        : undefined,
      salvageValueMinor: optionalMoneyMinor(formData, "salvageValue"),
      taxAssetClass: optionalField(formData, "taxAssetClass"),
      notes: optionalField(formData, "notes"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Inventory received with an immutable movement record.",
      undefined,
      created.id,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function setCatalogItemStatusAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const status = field(formData, "status");
    if (status !== "draft" && status !== "active" && status !== "archived") {
      throw new Error("Choose draft, active, or archived.");
    }
    const caller = await getServerCaller();
    await caller.operator.setCatalogItemStatus({
      catalogItemId: field(formData, "catalogItemId"),
      status,
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      status === "active"
        ? "Product published and now available on the organization profile."
        : status === "archived"
          ? "Product archived."
          : "Product returned to draft.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function updateCatalogItemAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const visibility = field(formData, "visibility");
    if (
      visibility !== "public" &&
      visibility !== "members" &&
      visibility !== "private"
    ) {
      throw new Error("Choose who can see this product.");
    }
    const configurationValue = optionalField(formData, "configuration");
    const caller = await getServerCaller();
    await caller.operator.updateCatalogItem({
      catalogItemId: field(formData, "catalogItemId"),
      title: field(formData, "title"),
      shortSummary: optionalField(formData, "shortSummary"),
      description: optionalField(formData, "description"),
      visibility,
      configuration: configurationValue
        ? (JSON.parse(configurationValue) as Record<string, unknown>)
        : {},
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    revalidatePath(`/products/${field(formData, "catalogItemId")}`);
    return result("success", "Product and coach availability settings saved.");
  } catch (error) {
    return errorState(error);
  }
}

export async function enableInventoryGoodSalesAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    const catalogItemId = field(formData, "catalogItemId");
    await caller.operator.enableInventoryGoodSales({
      catalogItemId,
      priceMinor: moneyMinor(formData, "price"),
      allowCard: field(formData, "allowCard") === "true",
      allowCash: field(formData, "allowCash") === "true",
      taxable: field(formData, "taxable") === "true",
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    revalidatePath(`/products/${catalogItemId}`);
    return result(
      "success",
      "Sales are ready for review. The inventory history and cost layers were preserved.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function updateCommerceSettingsAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const addressLine1 = field(formData, "addressLine1");
    const locality = field(formData, "locality");
    const administrativeArea = field(formData, "administrativeArea");
    const postalCode = field(formData, "postalCode");
    if (!addressLine1 || !locality || !administrativeArea || !postalCode) {
      throw new Error(
        "Choose a complete Google address, or enter the city, state or region, and postal code manually.",
      );
    }
    const caller = await getServerCaller();
    await caller.operator.updateCommerceSettings({
      legalName: optionalField(formData, "legalName"),
      addressLine1,
      addressLine2: optionalField(formData, "addressLine2"),
      locality,
      administrativeArea,
      postalCode,
      countryCode: field(formData, "countryCode") || "US",
      googlePlaceId: optionalField(formData, "googlePlaceId"),
      latitude: optionalNumberField(formData, "latitude"),
      longitude: optionalNumberField(formData, "longitude"),
      stripeTaxEnabled: field(formData, "stripeTaxEnabled") === "true",
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Business address and automatic-tax preference saved.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function updateOrganizationProfileAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.updateOrganizationProfile({
      name: field(formData, "name"),
      timezone: field(formData, "timezone"),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Business details saved across Duna HQ.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateThemeAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const heroMediaType = optionalField(formData, "heroMediaType");
    if (
      heroMediaType !== undefined &&
      heroMediaType !== "image" &&
      heroMediaType !== "video"
    ) {
      throw new Error("Choose image or video for the hero.");
    }
    const cardStyle = field(formData, "cardStyle");
    if (
      cardStyle !== "soft" &&
      cardStyle !== "crisp" &&
      cardStyle !== "borderless"
    ) {
      throw new Error("Choose a valid card style.");
    }
    const headingFont = field(formData, "headingFont");
    const bodyFont = field(formData, "bodyFont");
    if (headingFont !== "Fellix") {
      throw new Error("Duna club headings use Fellix.");
    }
    if (bodyFont !== "Fellix") {
      throw new Error("Duna club body text uses Fellix.");
    }
    const profileLayout = field(formData, "profileLayout");
    if (
      profileLayout !== "editorial" &&
      profileLayout !== "immersive" &&
      profileLayout !== "compact"
    ) {
      throw new Error("Choose a valid profile layout.");
    }
    const clubColor = normalizeClubColor(field(formData, "submittedClubColor"));
    if (clubColor.conflictsWithFlare) {
      throw new Error(
        "Choose a club color farther from Duna live coral so status remains unmistakable.",
      );
    }
    const caller = await getServerCaller();
    await caller.operator.updateTheme({
      brandDisplayName: optionalField(formData, "brandDisplayName"),
      membershipProgramName: optionalField(formData, "membershipProgramName"),
      logoUrl: optionalField(formData, "logoUrl"),
      markUrl: optionalField(formData, "markUrl"),
      logoLightUrl: optionalField(formData, "logoLightUrl"),
      logoDarkUrl: optionalField(formData, "logoDarkUrl"),
      heroMediaType,
      heroMediaUrl: optionalField(formData, "heroMediaUrl"),
      heroPosterUrl: optionalField(formData, "heroPosterUrl"),
      tagline: optionalField(formData, "tagline"),
      profileSummary: optionalField(formData, "profileSummary"),
      brandVoice: optionalField(formData, "brandVoice"),
      palette: {
        primary: clubColor.core,
        accent: clubColor.edge,
        sand: clubColor.tint,
        ink: "#1B1B19",
        canvas: "#F6F5F1",
        success: "#2F6B3A",
        clubHue: clubColor.hue,
        clubChroma: clubColor.chroma,
      },
      typography: {
        heading: "Fellix",
        body: "Fellix",
      },
      fontLicenseConfirmed: field(formData, "fontLicenseConfirmed") === "true",
      safeFallbackFont:
        field(formData, "safeFallbackFont") || "Arial, Helvetica, sans-serif",
      cardStyle,
      profileLayout,
      publish: field(formData, "publish") === "true",
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      field(formData, "publish") === "true"
        ? "Theme Kit published to the organization profile."
        : "Theme Kit draft saved.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function addBrandKnowledgeSourceAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const scope = field(formData, "scope");
    if (
      scope !== "brand" &&
      scope !== "organization" &&
      scope !== "venue" &&
      scope !== "service" &&
      scope !== "product"
    ) {
      throw new Error("Choose where this knowledge should apply.");
    }
    const kind = field(formData, "kind");
    if (kind !== "note" && kind !== "link" && kind !== "document") {
      throw new Error("Choose note, link, or document.");
    }
    const caller = await getServerCaller();
    const created = await caller.operator.addBrandKnowledgeSource({
      scope,
      kind,
      title: field(formData, "title"),
      sourceUrl: optionalField(formData, "sourceUrl"),
      storageUrl: optionalField(formData, "storageUrl"),
      mimeType: optionalField(formData, "mimeType"),
      originalFilename: optionalField(formData, "originalFilename"),
      contentText: field(formData, "contentText"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Brand Knowledge source approved and added to Duna AI context.",
      undefined,
      created.id,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function archiveBrandKnowledgeSourceAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.archiveBrandKnowledgeSource({
      sourceId: field(formData, "sourceId"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Source archived and removed from active Duna AI context.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function issueOrganizationCreditsAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    const created = await caller.operator.issueOrganizationCredits({
      personId: field(formData, "personId"),
      credits: numberField(formData, "credits"),
      expiresAt: optionalField(formData, "expiresAt")
        ? new Date(field(formData, "expiresAt")).toISOString()
        : undefined,
      reason: field(formData, "reason"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Organization credits posted as a balanced ledger entry.",
      undefined,
      created.id,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function refundOrganizationOrderAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const disposition = field(formData, "disposition");
    if (
      disposition !== "original-payment" &&
      disposition !== "organization-credit"
    ) {
      throw new Error("Choose the original payment or organization credits.");
    }
    const caller = await getServerCaller();
    const created = await caller.operator.refundOrganizationOrder({
      orderId: field(formData, "orderId"),
      amountMinor: moneyMinor(formData, "amount"),
      disposition,
      credits:
        disposition === "organization-credit"
          ? numberField(formData, "credits")
          : undefined,
      reason: field(formData, "reason"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      disposition === "organization-credit"
        ? "Refund recorded and organization credits issued."
        : "Refund submitted and the reversal journal posted.",
      undefined,
      created.id,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function createSessionNoteAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const visibility = field(formData, "visibility");
    if (visibility !== "private" && visibility !== "player") {
      throw new Error(
        "Choose whether this note is private or player-shareable.",
      );
    }
    const source = field(formData, "source");
    if (source !== "typed" && source !== "livekit-voice") {
      throw new Error("Choose a valid note source.");
    }
    const caller = await getServerCaller();
    const created = await caller.operator.createSessionNote({
      sessionId: field(formData, "sessionId"),
      subject: optionalField(formData, "subject"),
      visibility,
      source,
      transcript: optionalField(formData, "transcript"),
      summary: optionalField(formData, "summary"),
      recipientPersonIds: formData
        .getAll("recipientPersonIds")
        .map(String)
        .filter(Boolean),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      visibility === "private"
        ? "Private session note saved. Players cannot see it."
        : "Shareable note saved as a draft. Review it before publishing.",
      undefined,
      created.id,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function publishSessionNoteAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.publishSessionNote({
      noteId: field(formData, "noteId"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Reviewed note shared with the selected players.");
  } catch (error) {
    return errorState(error);
  }
}

export async function recordSessionAttendanceAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const status = field(formData, "status");
    if (
      status !== "scheduled" &&
      status !== "attended" &&
      status !== "no-show" &&
      status !== "cancelled"
    ) {
      throw new Error("Choose a valid attendance state.");
    }
    const caller = await getServerCaller();
    await caller.operator.recordSessionAttendance({
      registrationId: field(formData, "registrationId"),
      status,
      note: optionalField(formData, "note"),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      `Attendance marked ${status.replaceAll("-", " ")}.`,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function updateMemberProfileAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.updateMemberProfile({
      personId: field(formData, "personId"),
      displayName: field(formData, "displayName"),
      email: optionalField(formData, "email"),
      phoneE164: optionalField(formData, "phoneE164"),
      homeMarket: optionalField(formData, "homeMarket"),
      experienceSummary: optionalField(formData, "experienceSummary"),
      reason:
        field(formData, "reason") ||
        "Updated with the customer by an operator.",
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Profile details updated and added to the audit trail.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function proposeCalendarChangeAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    const created = await caller.operator.proposeCalendarChange({
      sessionId: field(formData, "sessionId"),
      startsAt: new Date(field(formData, "startsAt")).toISOString(),
      endsAt: new Date(field(formData, "endsAt")).toISOString(),
      courtId: optionalField(formData, "courtId"),
      coachPersonId: optionalField(formData, "coachPersonId"),
      idempotencyKey: crypto.randomUUID(),
    });
    return result(
      created.status === "conflict" ? "error" : "success",
      created.status === "conflict"
        ? "That move conflicts with a reserved resource."
        : "Move preview ready. Confirm it to update the schedule and notify affected players.",
      undefined,
      created.id,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function confirmCalendarChangeAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.confirmCalendarChange({
      proposalId: field(formData, "proposalId"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Schedule moved, resources re-reserved, and the change recorded.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function addCalendarParticipantAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.addCalendarParticipant({
      sessionId: field(formData, "sessionId"),
      personId: field(formData, "personId"),
      reason: field(formData, "reason") || "Added by an organization operator.",
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Player added. Their in-app and push updates are queued.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function removeCalendarParticipantAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.removeCalendarParticipant({
      registrationId: field(formData, "registrationId"),
      reason:
        field(formData, "reason") ||
        "Removed from the session by an organization operator.",
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Player removed. Their in-app and push updates are queued.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function cancelCalendarSessionAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.cancelCalendarSession({
      sessionId: field(formData, "sessionId"),
      reason: field(formData, "reason"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Session cancelled, reservations released, and player updates queued.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function createCalendarBlockAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const resourceType = field(formData, "resourceType");
    const mode = field(formData, "mode");
    if (resourceType !== "court" && resourceType !== "coach") {
      throw new Error("Choose a court or coach.");
    }
    if (mode !== "blocked" && mode !== "maintenance") {
      throw new Error("Choose blocked time or maintenance.");
    }
    const caller = await getServerCaller();
    await caller.operator.createCalendarBlock({
      resourceType,
      resourceId: field(formData, "resourceId"),
      startsAt: new Date(field(formData, "startsAt")).toISOString(),
      endsAt: new Date(field(formData, "endsAt")).toISOString(),
      mode,
      reason: field(formData, "reason"),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Time blocked on the live resource calendar.");
  } catch (error) {
    return errorState(error);
  }
}

export async function createRecurringCalendarBlocksAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const resourceType = field(formData, "resourceType");
    if (resourceType !== "court" && resourceType !== "coach") {
      throw new Error("Choose a court or coach.");
    }
    const parsed = JSON.parse(field(formData, "blocks")) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Build a schedule draft before saving it.");
    }
    const blocks = parsed.map((value) => {
      if (!value || typeof value !== "object") {
        throw new Error("The schedule draft contains an invalid block.");
      }
      const block = value as Record<string, unknown>;
      return {
        weekday: Number(block.weekday),
        startsAtMinute: Number(block.startsAtMinute),
        endsAtMinute: Number(block.endsAtMinute),
      };
    });
    const effectiveFrom = field(formData, "effectiveFrom");
    const effectiveTo = field(formData, "effectiveTo");
    const caller = await getServerCaller();
    await caller.operator.createRecurringCalendarBlocks({
      resourceType,
      resourceId: field(formData, "resourceId"),
      blocks,
      effectiveFrom: effectiveFrom || undefined,
      effectiveTo: effectiveTo || undefined,
      mode: "blocked",
      reason: field(formData, "reason"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      `${blocks.length} recurring schedule block${blocks.length === 1 ? "" : "s"} saved. Existing bookings were left intact.`,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function addCalendarEquipmentAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.addCalendarEquipment({
      sessionId: field(formData, "sessionId"),
      inventoryStockItemId: field(formData, "inventoryStockItemId"),
      quantity: numberField(formData, "quantity"),
      reason:
        field(formData, "reason") || "Reserved from the organization calendar.",
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Equipment reserved and visible on the session.");
  } catch (error) {
    return errorState(error);
  }
}

export async function removeCalendarEquipmentAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.removeCalendarEquipment({
      reservationId: field(formData, "reservationId"),
      reason:
        field(formData, "reason") || "Released from the organization calendar.",
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Equipment released from this session.");
  } catch (error) {
    return errorState(error);
  }
}

type ServerCaller = Awaited<ReturnType<typeof getServerCaller>>;
type CreateEventDraftPayload = Parameters<
  ServerCaller["operator"]["createEventDraft"]
>[0];
type UpdateEventDraftPayload = Parameters<
  ServerCaller["operator"]["updateEventDraft"]
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

export async function createStaffInvitationAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const role = field(formData, "role");
    if (
      role !== "coach" &&
      role !== "director" &&
      role !== "manager" &&
      role !== "front-desk" &&
      role !== "accountant"
    ) {
      throw new Error("Choose a valid team role.");
    }
    const workerClassification = field(formData, "workerClassification");
    if (
      workerClassification !== "1099-contractor" &&
      workerClassification !== "w2-employee"
    ) {
      throw new Error("Choose 1099 contractor or W-2 employee.");
    }
    const deliveryMode = field(formData, "deliveryMode") || "send";
    if (deliveryMode !== "send" && deliveryMode !== "link-only") {
      throw new Error("Choose how to share the team invitation.");
    }
    const preferredChannel = field(formData, "preferredChannel");
    if (
      deliveryMode === "send" &&
      preferredChannel !== "email" &&
      preferredChannel !== "sms"
    ) {
      throw new Error("Choose email or SMS.");
    }
    const caller = await getServerCaller();
    const created = await caller.operator.createStaffInvitation({
      invitedName: field(formData, "invitedName"),
      invitedEmail: optionalField(formData, "invitedEmail"),
      invitedPhoneE164: optionalField(formData, "invitedPhoneE164"),
      role,
      workerClassification,
      preferredChannel:
        preferredChannel === "email" || preferredChannel === "sms"
          ? preferredChannel
          : undefined,
      deliveryMode,
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      deliveryMode === "link-only"
        ? "Private claim link created. Copy it from pending team access."
        : created.status === "sent"
          ? "Team invitation sent."
          : "Team invitation created. Delivery will resume when the selected provider is ready.",
      undefined,
      created.id,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function updateStaffProfileAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const role = field(formData, "role");
    if (
      role !== "coach" &&
      role !== "director" &&
      role !== "manager" &&
      role !== "front-desk" &&
      role !== "accountant"
    ) {
      throw new Error("Choose a valid team role.");
    }
    const workerClassification = field(formData, "workerClassification");
    if (
      workerClassification !== "not-set" &&
      workerClassification !== "1099-contractor" &&
      workerClassification !== "w2-employee"
    ) {
      throw new Error("Choose a worker classification or leave it not set.");
    }
    const compensationModel = field(formData, "compensationModel");
    if (
      compensationModel !== "not-set" &&
      compensationModel !== "hourly" &&
      compensationModel !== "profit-share" &&
      compensationModel !== "hourly-plus-profit-share"
    ) {
      throw new Error("Choose a valid compensation model.");
    }
    const incomeGoalPeriodValue = optionalField(formData, "incomeGoalPeriod");
    const incomeGoalPeriod =
      incomeGoalPeriodValue === "week" ||
      incomeGoalPeriodValue === "month" ||
      incomeGoalPeriodValue === "quarter" ||
      incomeGoalPeriodValue === "year"
        ? incomeGoalPeriodValue
        : undefined;
    const availabilityValue = field(formData, "availability");
    const availability = availabilityValue
      ? (JSON.parse(availabilityValue) as {
          weekday: number;
          startsAt: string;
          endsAt: string;
        }[])
      : [];
    const caller = await getServerCaller();
    const updated = await caller.operator.updateStaffProfile({
      personId: field(formData, "personId"),
      displayName: field(formData, "displayName"),
      role,
      workerClassification,
      compensationModel,
      hourlyRateMinor: optionalMoneyMinor(formData, "hourlyRate"),
      profitShareBps:
        optionalNumberField(formData, "profitSharePercent") === undefined
          ? undefined
          : Math.round(
              optionalNumberField(formData, "profitSharePercent")! * 100,
            ),
      addressLine1: optionalField(formData, "addressLine1"),
      addressLine2: optionalField(formData, "addressLine2"),
      locality: optionalField(formData, "locality"),
      administrativeArea: optionalField(formData, "administrativeArea"),
      postalCode: optionalField(formData, "postalCode"),
      countryCode: field(formData, "countryCode") || "US",
      googlePlaceId: optionalField(formData, "googlePlaceId"),
      latitude: optionalNumberField(formData, "latitude"),
      longitude: optionalNumberField(formData, "longitude"),
      availability,
      incomeGoalMinor: optionalMoneyMinor(formData, "incomeGoal"),
      incomeGoalPeriod,
      active: field(formData, "active") === "true",
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Team profile updated.", undefined, updated.id);
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

export async function updateEventDraftAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const serialized = field(formData, "eventDraft");
    if (!serialized) throw new Error("The event draft is empty.");
    const parsed = JSON.parse(serialized) as Omit<
      UpdateEventDraftPayload,
      "sessionId" | "confirmedPrice" | "idempotencyKey"
    >;
    const caller = await getServerCaller();
    const updated = await caller.operator.updateEventDraft({
      ...parsed,
      sessionId: field(formData, "sessionId"),
      confirmedPrice: confirmed(formData, "confirmedPrice"),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Event changes saved. The draft is still private.",
      undefined,
      updated.id,
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

export async function createVenueLayoutAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const sourceType = field(formData, "sourceType");
    if (sourceType !== "satellite" && sourceType !== "floorplan") {
      throw new Error("Choose satellite or floorplan mode.");
    }
    const caller = await getServerCaller();
    const created = await caller.operator.createVenueLayout({
      venueId: field(formData, "venueId"),
      name: field(formData, "name"),
      sourceType,
      eventSessionId: optionalField(formData, "eventSessionId"),
      duplicateFromLayoutId: optionalField(formData, "duplicateFromLayoutId"),
      floorplanImageUrl: optionalField(formData, "floorplanImageUrl"),
      mapCenterLatitude: optionalNumberField(formData, "mapCenterLatitude"),
      mapCenterLongitude: optionalNumberField(formData, "mapCenterLongitude"),
      mapZoom: optionalNumberField(formData, "mapZoom"),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "A new editable layout version is ready.",
      undefined,
      created.id,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function saveVenueLayoutAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const payload = JSON.parse(field(formData, "layout")) as {
      readonly layoutId: string;
      readonly name: string;
      readonly floorplanImageUrl?: string;
      readonly floorplanAnalysis?: Record<string, unknown>;
      readonly mapCenterLatitude?: number;
      readonly mapCenterLongitude?: number;
      readonly mapZoom: number;
      readonly mapBearing: number;
      readonly mapPitch: number;
      readonly assets: readonly Omit<VenueLayoutAsset, "layoutId">[];
    };
    const caller = await getServerCaller();
    await caller.operator.saveVenueLayout({
      ...payload,
      assets: [...payload.assets],
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Layout geometry and linked resources saved.");
  } catch (error) {
    return errorState(error);
  }
}

export async function createCourtFromVenueLayoutAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const bookingPolicy = field(formData, "bookingPolicy");
    if (
      bookingPolicy !== "public" &&
      bookingPolicy !== "members" &&
      bookingPolicy !== "tiers" &&
      bookingPolicy !== "staff" &&
      bookingPolicy !== "none"
    ) {
      throw new Error("Choose who can book this court.");
    }
    const geometry = JSON.parse(
      field(formData, "geometry"),
    ) as VenueLayoutGeometry;
    const caller = await getServerCaller();
    await caller.operator.createCourtFromVenueLayout({
      layoutId: field(formData, "layoutId"),
      assetId: field(formData, "assetId"),
      name: field(formData, "name"),
      identifierCode: optionalField(formData, "identifierCode"),
      surface: field(formData, "surface"),
      capacity: numberField(formData, "capacity"),
      bookingPolicy,
      templateKey: field(formData, "templateKey"),
      geometry,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Court created and linked to this layout. Its full settings are ready in Courts.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function publishVenueLayoutAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.publishVenueLayout({
      layoutId: field(formData, "layoutId"),
      makePrimary: field(formData, "makePrimary") === "true",
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      field(formData, "makePrimary") === "true"
        ? "Layout published and set as the player-facing default."
        : "Layout version published.",
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function saveVenueLayoutEventSettingsAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.saveVenueLayoutEventSettings({
      sessionId: field(formData, "sessionId"),
      layoutId: field(formData, "layoutId"),
      aiCourtAssignmentEnabled:
        field(formData, "aiCourtAssignmentEnabled") === "true",
      averageMatchMinutes: numberField(formData, "averageMatchMinutes"),
      releaseCourtWhenFree: field(formData, "releaseCourtWhenFree") === "true",
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Tournament court assignment settings saved.");
  } catch (error) {
    return errorState(error);
  }
}

export async function previewVenueLayoutCourtAssignmentsAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    const plan = await caller.operator.venueLayoutCourtAssignmentPlan({
      sessionId: field(formData, "sessionId"),
    });
    return {
      status: "success",
      message: `${plan.assignments.length} court assignment${plan.assignments.length === 1 ? "" : "s"} planned.`,
      venueAssignmentPlan: plan,
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function applyVenueLayoutCourtAssignmentsAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const caller = await getServerCaller();
    await caller.operator.applyVenueLayoutCourtAssignments({
      sessionId: field(formData, "sessionId"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "AI court assignments applied to the tournament.");
  } catch (error) {
    return errorState(error);
  }
}

export async function createVenueAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const locationKind = field(formData, "locationKind");
    if (
      locationKind !== "public-location" &&
      locationKind !== "private-venue"
    ) {
      throw new Error("Choose a public location or private venue.");
    }
    const environment = field(formData, "environment");
    if (environment !== "indoor" && environment !== "outdoor") {
      throw new Error("Choose whether this venue is indoors or outdoors.");
    }
    const caller = await getServerCaller();
    const created = await caller.operator.createVenue({
      name: field(formData, "name"),
      locationKind,
      environment,
      description: optionalField(formData, "description"),
      capacity: numberField(formData, "capacity"),
      heroImageUrl: optionalField(formData, "heroImageUrl"),
      amenities: field(formData, "amenities")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      addressLine1: optionalField(formData, "addressLine1"),
      addressLine2: optionalField(formData, "addressLine2"),
      locality: optionalField(formData, "locality"),
      administrativeArea: optionalField(formData, "administrativeArea"),
      postalCode: optionalField(formData, "postalCode"),
      countryCode: field(formData, "countryCode") || "US",
      googlePlaceId: optionalField(formData, "googlePlaceId"),
      latitude: optionalNumberField(formData, "latitude"),
      longitude: optionalNumberField(formData, "longitude"),
      timezone: field(formData, "timezone"),
      temporary: field(formData, "temporary") === "true",
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Venue draft created. Add and activate a court before publishing it.",
      undefined,
      created.id,
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
    const created = await caller.operator.createCourt({
      venueId: field(formData, "venueId"),
      name: field(formData, "name"),
      surface: field(formData, "surface"),
      imageUrl: optionalField(formData, "imageUrl"),
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
      undefined,
      created.id,
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
    const locationKind = optionalField(formData, "locationKind");
    if (
      locationKind !== undefined &&
      locationKind !== "public-location" &&
      locationKind !== "private-venue"
    ) {
      throw new Error("Choose a public location or private venue.");
    }
    const environment = optionalField(formData, "environment");
    if (
      environment !== undefined &&
      environment !== "indoor" &&
      environment !== "outdoor"
    ) {
      throw new Error("Choose whether this venue is indoors or outdoors.");
    }
    const caller = await getServerCaller();
    await caller.operator.updateVenueProfile({
      venueId: field(formData, "venueId"),
      ...(formData.has("name") ? { name: field(formData, "name") } : {}),
      ...(locationKind ? { locationKind } : {}),
      ...(environment ? { environment } : {}),
      description: optionalField(formData, "description"),
      capacity: numberField(formData, "capacity"),
      heroImageUrl: optionalField(formData, "heroImageUrl"),
      amenities: field(formData, "amenities")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      ...(formData.has("addressLine1")
        ? { addressLine1: optionalField(formData, "addressLine1") }
        : {}),
      ...(formData.has("addressLine2")
        ? { addressLine2: optionalField(formData, "addressLine2") }
        : {}),
      ...(formData.has("locality")
        ? { locality: optionalField(formData, "locality") }
        : {}),
      ...(formData.has("administrativeArea")
        ? {
            administrativeArea: optionalField(formData, "administrativeArea"),
          }
        : {}),
      ...(formData.has("postalCode")
        ? { postalCode: optionalField(formData, "postalCode") }
        : {}),
      ...(formData.has("countryCode")
        ? { countryCode: optionalField(formData, "countryCode") }
        : {}),
      ...(formData.has("googlePlaceId")
        ? { googlePlaceId: optionalField(formData, "googlePlaceId") }
        : {}),
      ...(formData.has("latitude")
        ? { latitude: optionalNumberField(formData, "latitude") }
        : {}),
      ...(formData.has("longitude")
        ? { longitude: optionalNumberField(formData, "longitude") }
        : {}),
      ...(formData.has("timezone")
        ? { timezone: optionalField(formData, "timezone") }
        : {}),
      ...(formData.has("temporaryPresent")
        ? { temporary: field(formData, "temporary") === "true" }
        : {}),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result("success", "Venue details and exact location updated.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateCourtBookingConfigurationAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const bookingPolicy = optionalField(formData, "bookingPolicy");
    if (
      bookingPolicy !== undefined &&
      bookingPolicy !== "public" &&
      bookingPolicy !== "members" &&
      bookingPolicy !== "tiers" &&
      bookingPolicy !== "staff" &&
      bookingPolicy !== "none"
    ) {
      throw new Error("Choose a valid booking audience.");
    }
    const caller = await getServerCaller();
    await caller.operator.updateCourtBookingConfiguration({
      courtId: field(formData, "courtId"),
      ...(formData.has("name") ? { name: field(formData, "name") } : {}),
      ...(formData.has("surface")
        ? { surface: field(formData, "surface") }
        : {}),
      imageUrl: optionalField(formData, "imageUrl"),
      ...(formData.has("litPresent")
        ? { lit: field(formData, "lit") === "true" }
        : {}),
      ...(bookingPolicy ? { bookingPolicy } : {}),
      ratePlanId: optionalField(formData, "ratePlanId") ?? null,
      capacity: numberField(formData, "capacity"),
      ...(formData.has("minimumDurationMinutes")
        ? {
            minimumDurationMinutes: numberField(
              formData,
              "minimumDurationMinutes",
            ),
          }
        : {}),
      ...(formData.has("maximumDurationMinutes")
        ? {
            maximumDurationMinutes: numberField(
              formData,
              "maximumDurationMinutes",
            ),
          }
        : {}),
      durationOptionsMinutes: field(formData, "durationOptionsMinutes")
        .split(",")
        .map(Number)
        .filter((value) => Number.isFinite(value)),
      bookingIncrementMinutes: numberField(formData, "bookingIncrementMinutes"),
      ...(formData.has("bufferBeforeMinutes")
        ? {
            bufferBeforeMinutes: numberField(formData, "bufferBeforeMinutes"),
          }
        : {}),
      ...(formData.has("bufferAfterMinutes")
        ? {
            bufferAfterMinutes: numberField(formData, "bufferAfterMinutes"),
          }
        : {}),
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
    return result(
      "success",
      "Court details, pricing, and booking rules updated.",
    );
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

export async function createMarketingFlowAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const segment = field(formData, "segment");
    if (
      segment !== "all-active" &&
      segment !== "active-members" &&
      segment !== "inactive-30-days" &&
      segment !== "high-churn-risk" &&
      segment !== "upcoming-participants"
    ) {
      throw new Error("Choose a valid audience.");
    }
    const trigger = field(formData, "trigger");
    if (
      trigger !== "manual" &&
      trigger !== "no-booking" &&
      trigger !== "payment-failed" &&
      trigger !== "event-published" &&
      trigger !== "membership-renewal"
    ) {
      throw new Error("Choose a valid trigger.");
    }
    const channel = field(formData, "channel");
    if (channel !== "email" && channel !== "sms" && channel !== "push") {
      throw new Error("Choose email, SMS, or push.");
    }
    const caller = await getServerCaller();
    const created = await caller.operator.createMarketingFlow({
      name: field(formData, "name"),
      description: optionalField(formData, "description"),
      segment,
      trigger,
      triggerDays:
        trigger === "no-booking"
          ? numberField(formData, "triggerDays")
          : undefined,
      channel,
      subject: optionalField(formData, "subject"),
      body: field(formData, "body"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Marketing flow saved as a private draft. Nothing was sent.",
      undefined,
      created.id,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function createMarketingCampaignAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const segment = field(formData, "segment");
    if (
      segment !== "all-active" &&
      segment !== "active-members" &&
      segment !== "inactive-30-days" &&
      segment !== "high-churn-risk" &&
      segment !== "upcoming-participants"
    ) {
      throw new Error("Choose a valid audience.");
    }
    const channel = field(formData, "channel");
    if (channel !== "email" && channel !== "sms" && channel !== "push") {
      throw new Error("Choose email, SMS, or push.");
    }
    const caller = await getServerCaller();
    const created = await caller.operator.createMarketingCampaignDraft({
      name: field(formData, "name"),
      segment,
      channel,
      subject: optionalField(formData, "subject"),
      body: field(formData, "body"),
      confirmed: confirmed(formData),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      "Campaign saved as a consent-aware draft. Nothing was sent.",
      undefined,
      created.id,
    );
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

export async function startOrganizationPlanCheckoutAction(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  void _previous;
  const plan = field(formData, "plan");
  const interval = field(formData, "interval");
  if (
    !["small-club", "club", "multi-venue"].includes(plan) ||
    !["month", "year"].includes(interval)
  ) {
    return result("error", "Choose a valid organization plan and interval.");
  }
  try {
    const caller = await getServerCaller();
    const origin = await hqOrigin();
    const checkout = await caller.operator.startPlanCheckout({
      plan: plan as "small-club" | "club" | "multi-venue",
      interval: interval as "month" | "year",
      successUrl: `${origin}/settings?section=business&billing=success`,
      cancelUrl: `${origin}/settings?section=business&billing=cancelled`,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    if (!checkout.url) {
      return result("error", "Stripe did not return a secure checkout link.");
    }
    return result(
      "success",
      "Your secure organization-plan checkout is ready.",
      checkout.url,
    );
  } catch (error) {
    return errorState(error);
  }
}

export async function openOrganizationBillingPortalAction(
  _previous: OperatorActionState,
  _formData: FormData,
): Promise<OperatorActionState> {
  void _previous;
  void _formData;
  try {
    const caller = await getServerCaller();
    const origin = await hqOrigin();
    const portal = await caller.operator.openPlanBillingPortal({
      returnUrl: `${origin}/settings?section=business`,
    });
    return result("success", "Stripe billing management is ready.", portal.url);
  } catch (error) {
    return errorState(error);
  }
}

export async function refreshStripeOnboardingAction(
  _previous: OperatorActionState,
  _formData: FormData,
): Promise<OperatorActionState> {
  void _previous;
  void _formData;
  try {
    const caller = await getServerCaller();
    const readiness = await caller.operator.refreshStripeOnboarding({
      idempotencyKey: crypto.randomUUID(),
    });
    revalidateOperator();
    return result(
      "success",
      readiness.chargesEnabled
        ? "Stripe confirmed that sandbox payments are ready. Paid events can now be published."
        : "Stripe still needs more information before it can receive payments.",
    );
  } catch (error) {
    return errorState(error);
  }
}
