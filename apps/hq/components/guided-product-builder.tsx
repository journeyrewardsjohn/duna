"use client";

import type { OperatorWorkspace } from "@duna/api";
import { Badge } from "@duna/ui";
import { upload } from "@vercel/blob/client";
import {
  ArrowRight,
  Boxes,
  CalendarClock,
  Check,
  ChevronLeft,
  CircleAlert,
  CreditCard,
  ImagePlus,
  Layers3,
  PackageCheck,
  Plus,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  Trash2,
  UploadCloud,
  UserRound,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useMemo, useState, type ReactNode } from "react";
import {
  createCatalogItemAction,
  type OperatorActionState,
} from "@/app/actions";
import {
  createProductMediaPath,
  optimizeImageUpload,
} from "@/lib/media-storage";

const initialActionState: OperatorActionState = {
  status: "idle",
  message: "",
};

type ProductType = "service" | "plan" | "good";
type ProductMedia = {
  readonly id: string;
  readonly kind: "image" | "video";
  readonly url: string;
  readonly alt: string;
  readonly variantIndex?: number;
};
type OptionDraft = {
  readonly id: string;
  readonly name: string;
  readonly values: string;
};

const productTypes = [
  {
    value: "service" as const,
    label: "Service",
    detail: "A bookable lesson, assessment, or coaching program.",
    icon: CalendarClock,
  },
  {
    value: "plan" as const,
    label: "Plan",
    detail: "A membership, credit pack, or early bundle.",
    icon: CreditCard,
  },
  {
    value: "good" as const,
    label: "Good",
    detail: "Inventory, merchandise, equipment, or consumables.",
    icon: ShoppingBag,
  },
];

const stepNames: Record<ProductType, readonly string[]> = {
  service: ["Shape", "Story", "Booking", "Price", "Review"],
  plan: ["Plan type", "Value", "Structure", "Price", "Review"],
  good: ["Purpose", "Variants", "Story + media", "Stock + price", "Review"],
};

const subtypeChoices = {
  service: [
    {
      value: "private-lesson",
      label: "Private lesson",
      detail: "One player or a private group books a coach.",
    },
    {
      value: "group-lesson",
      label: "Group lesson",
      detail: "A capacity-based session led by one or more coaches.",
    },
    {
      value: "program",
      label: "Program",
      detail: "A structured multi-session coaching journey.",
    },
    {
      value: "assessment",
      label: "Player assessment",
      detail: "A guided evaluation with notes or recommendations.",
    },
  ],
  plan: [
    {
      value: "membership",
      label: "Membership",
      detail: "Recurring access, benefits, credits, and member pricing.",
    },
    {
      value: "credit-pack",
      label: "Credit pack",
      detail: "A one-time purchase of organization-specific credits.",
    },
    {
      value: "bundle",
      label: "Bundle",
      detail: "Early access: package several existing offers together.",
      badge: "Early",
    },
  ],
  good: [
    {
      value: "swag",
      label: "Merchandise",
      detail: "Club-branded goods and everyday merchandise.",
    },
    {
      value: "apparel",
      label: "Apparel",
      detail: "Sized clothing with optional color or style variants.",
    },
    {
      value: "equipment",
      label: "Equipment",
      detail: "Durable gear that may be sold, rented, or used internally.",
    },
    {
      value: "consumable",
      label: "Consumable",
      detail: "Balls, tape, hydration, and other replenished stock.",
    },
    {
      value: "other",
      label: "Other good",
      detail: "Anything physical that does not fit the choices above.",
    },
  ],
} as const;

function moneyMinor(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return Math.round(amount * 100);
}

function moneyLabel(minor: number | undefined, currency: string): string {
  if (minor === undefined) return "Not set";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

function currencySymbol(currency: string): string {
  return (
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency
  );
}

function optionCode(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replaceAll(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "_")
      .replaceAll(/(^_|_$)/g, "") || "option"
  );
}

function normalizedOptions(options: readonly OptionDraft[]) {
  return options
    .map((option) => ({
      name: option.name.trim(),
      values: [
        ...new Set(
          option.values
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ],
    }))
    .filter((option) => option.name && option.values.length > 0);
}

function variantCoordinates(options: ReturnType<typeof normalizedOptions>) {
  if (options.length === 0) return [{}] as readonly Record<string, string>[];
  let rows: readonly Record<string, string>[] = [{}];
  for (const option of options) {
    rows = rows.flatMap((row) =>
      option.values.map((value) => ({
        ...row,
        [optionCode(option.name)]: value,
      })),
    );
  }
  return rows;
}

function ChoiceGrid({ children }: { readonly children: ReactNode }) {
  return <div className="guided-product-choice-grid">{children}</div>;
}

function ChoiceCard({
  active,
  badge,
  detail,
  icon,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly badge?: string;
  readonly detail: string;
  readonly icon?: ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={active ? "guided-choice active" : "guided-choice"}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>
        <strong>
          {label}
          {badge && <Badge>{badge}</Badge>}
        </strong>
        <small>{detail}</small>
      </span>
      <i aria-hidden />
    </button>
  );
}

function MoneyInput({
  currency,
  label,
  onChange,
  placeholder,
  value,
}: {
  readonly currency: string;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <span className="operator-money-input">
        <small>{currencySymbol(currency)}</small>
        <input
          inputMode="decimal"
          min="0"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          step="0.01"
          type="number"
          value={value}
        />
      </span>
    </label>
  );
}

function ActionNotice({ state }: { readonly state: OperatorActionState }) {
  if (state.status === "idle") return null;
  return (
    <p
      className={`operator-action-notice operator-action-notice--${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.status === "success" ? (
        <Check aria-hidden size={15} />
      ) : (
        <CircleAlert aria-hidden size={15} />
      )}
      {state.message}
    </p>
  );
}

export function GuidedProductBuilder({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const searchParams = useSearchParams();
  const requestedType = searchParams.get("type");
  const initialType: ProductType =
    requestedType === "good" ||
    requestedType === "plan" ||
    requestedType === "service"
      ? requestedType
      : "service";
  const [state, action, pending] = useActionState(
    createCatalogItemAction,
    initialActionState,
  );
  const [type, setType] = useState<ProductType>(initialType);
  const [step, setStep] = useState(0);
  const [subtype, setSubtype] = useState(
    initialType === "good"
      ? "equipment"
      : initialType === "plan"
        ? "membership"
        : "private-lesson",
  );
  const [title, setTitle] = useState("");
  const [shortSummary, setShortSummary] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<
    "public" | "members" | "private"
  >("public");
  const [allowCard, setAllowCard] = useState(true);
  const [allowCash, setAllowCash] = useState(false);
  const [allowCredits, setAllowCredits] = useState(false);
  const [price, setPrice] = useState("");
  const [creditCost, setCreditCost] = useState(1);
  const [taxable, setTaxable] = useState(false);
  const [membershipRequired, setMembershipRequired] = useState(false);
  const [allowInstallments, setAllowInstallments] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(3);

  const [durationMinutes, setDurationMinutes] = useState(60);
  const [capacity, setCapacity] = useState(1);
  const [deliveryMode, setDeliveryMode] = useState<"venue" | "online">("venue");
  const [venueId, setVenueId] = useState(workspace.venues[0]?.id ?? "");
  const [bookingLeadHours, setBookingLeadHours] = useState(12);
  const [bookingBufferMinutes, setBookingBufferMinutes] = useState(15);
  const [schedulingStyle, setSchedulingStyle] = useState<
    "coach-availability" | "request-to-book"
  >("coach-availability");
  const [coachMode, setCoachMode] = useState<"all" | "selected">("all");
  const [selectedCoachIds, setSelectedCoachIds] = useState<readonly string[]>(
    [],
  );
  const [customerCoachSelection, setCustomerCoachSelection] = useState(true);

  const [billingMode, setBillingMode] = useState<"month" | "year">("month");
  const [creditsGranted, setCreditsGranted] = useState(10);
  const [membershipCredits, setMembershipCredits] = useState(0);
  const [membershipBookingLimit, setMembershipBookingLimit] = useState(0);
  const [benefits, setBenefits] = useState("");
  const [includedCatalogItemIds, setIncludedCatalogItemIds] = useState<
    readonly string[]
  >([]);

  const [trackInventory, setTrackInventory] = useState(true);
  const [sellEnabled, setSellEnabled] = useState(true);
  const [internalPurpose, setInternalPurpose] = useState<
    "operations" | "coach-use" | "rental"
  >("operations");
  const [costingMethod, setCostingMethod] = useState<"fifo" | "lifo">("fifo");
  const [receiveNow, setReceiveNow] = useState(true);
  const [receiptVariantIndex, setReceiptVariantIndex] = useState(0);
  const [receiptQuantity, setReceiptQuantity] = useState(1);
  const [receiptTotalCost, setReceiptTotalCost] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [receiptVendor, setReceiptVendor] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [locationId, setLocationId] = useState("");
  const [newLocationName, setNewLocationName] = useState("");
  const [options, setOptions] = useState<readonly OptionDraft[]>([]);
  const [media, setMedia] = useState<readonly ProductMedia[]>([]);
  const [hostedMediaUrl, setHostedMediaUrl] = useState("");
  const [hostedMediaKind, setHostedMediaKind] = useState<"image" | "video">(
    "image",
  );
  const [mediaUploadState, setMediaUploadState] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");
  const [mediaUploadMessage, setMediaUploadMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const normalized = useMemo(() => normalizedOptions(options), [options]);
  const coordinates = useMemo(
    () => variantCoordinates(normalized),
    [normalized],
  );
  const variantLabels = useMemo(
    () =>
      coordinates.map((coordinate, index) => {
        const values = Object.values(coordinate);
        return values.length > 0
          ? `${title || "Good"} · ${values.join(" / ")}`
          : title || `Default variant ${index + 1}`;
      }),
    [coordinates, title],
  );
  const eligibleCoaches = workspace.staff.filter(
    (person) => person.active && person.role === "coach",
  );
  const assignedCoachIds =
    coachMode === "all"
      ? eligibleCoaches.map((coach) => coach.personId)
      : selectedCoachIds;
  const currentSteps = stepNames[type];
  const isMembership = type === "plan" && subtype === "membership";
  const isCreditPack = type === "plan" && subtype === "credit-pack";
  const isBundle = type === "plan" && subtype === "bundle";
  const parsedBenefits = benefits
    .split("\n")
    .map((benefit) => benefit.trim())
    .filter(Boolean);
  const receiptTotalMinor = moneyMinor(receiptTotalCost);
  const receiptUnitCostMinor =
    receiptTotalMinor === undefined
      ? undefined
      : Math.round(receiptTotalMinor / Math.max(1, receiptQuantity));
  const salePriceMinor = moneyMinor(price);
  const unitProfitMinor =
    salePriceMinor !== undefined && receiptUnitCostMinor !== undefined
      ? salePriceMinor - receiptUnitCostMinor
      : undefined;
  const grossMarginPercent =
    unitProfitMinor !== undefined && salePriceMinor && salePriceMinor > 0
      ? Math.round((unitProfitMinor / salePriceMinor) * 1000) / 10
      : undefined;

  const chooseType = (nextType: ProductType) => {
    setType(nextType);
    setStep(0);
    setSubtype(
      nextType === "good"
        ? "equipment"
        : nextType === "plan"
          ? "membership"
          : "private-lesson",
    );
    if (nextType === "plan") setAllowCredits(false);
  };

  const addHostedMedia = () => {
    const url = hostedMediaUrl.trim();
    if (!url) return;
    setMedia((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        kind: hostedMediaKind,
        url,
        alt: title || "Product media",
      },
    ]);
    setHostedMediaUrl("");
  };

  const uploadMedia = async (files?: FileList | null) => {
    if (!files?.length) return;
    setMediaUploadState("uploading");
    try {
      for (const file of Array.from(files)) {
        setMediaUploadMessage(`Preparing ${file.name}…`);
        const prepared = file.type.startsWith("image/")
          ? await optimizeImageUpload(file)
          : file;
        const kind = prepared.type.startsWith("image/") ? "image" : "video";
        const stored = await upload(
          createProductMediaPath(workspace.organization.id, prepared.type),
          prepared,
          {
            access: "public",
            clientPayload: JSON.stringify({
              organizationId: workspace.organization.id,
              fileName: prepared.name,
              contentType: prepared.type,
              size: prepared.size,
              purpose: "product",
            }),
            contentType: prepared.type,
            handleUploadUrl: "/api/media/upload",
            multipart: prepared.size > 100_000_000,
            onUploadProgress: ({ percentage }) =>
              setMediaUploadMessage(
                `Uploading ${prepared.name}… ${Math.round(percentage)}%`,
              ),
          },
        );
        if (!stored.url) throw new Error("Duna storage did not return a URL.");
        setMedia((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            kind,
            url: stored.url,
            alt: title || prepared.name,
          },
        ]);
      }
      setMediaUploadState("ready");
      setMediaUploadMessage("Media is stored and ready.");
    } catch (error) {
      setMediaUploadState("error");
      setMediaUploadMessage(
        error instanceof Error ? error.message : "Media upload failed.",
      );
    }
  };

  const canContinue = (() => {
    if (step === 0) {
      return type !== "good" || trackInventory || sellEnabled;
    }
    if (step === 1) {
      if (type === "good") return coordinates.length <= 500;
      return title.trim().length >= 2;
    }
    if (step === 2) {
      if (type === "good") {
        return (
          title.trim().length >= 2 &&
          media.some((item) => item.kind === "image")
        );
      }
      if (type === "service") {
        return (
          (deliveryMode !== "venue" || Boolean(venueId)) &&
          (coachMode !== "selected" || selectedCoachIds.length > 0)
        );
      }
      if (isCreditPack) return creditsGranted > 0;
      if (isBundle) return includedCatalogItemIds.length >= 2;
      return true;
    }
    if (step === 3) {
      if (type === "good" && !sellEnabled) return true;
      return (
        salePriceMinor !== undefined &&
        (allowCard || allowCash || allowCredits) &&
        (!allowCredits || creditCost > 0)
      );
    }
    return confirmed;
  })();

  const configuration = {
    source: "hq-guided-product-builder",
    flowVersion: 2,
    ...(type === "service"
      ? {
          service: {
            durationMinutes,
            capacity,
            bookingLeadHours,
            bookingBufferMinutes,
            schedulingStyle,
          },
          deliveryMode,
          venueId: deliveryMode === "venue" ? venueId : undefined,
          coachAssignmentMode: coachMode,
          coachPersonIds: assignedCoachIds,
          requiredCoachCount: 1,
          customerCoachSelection,
        }
      : {}),
    ...(type === "plan"
      ? {
          ...(isCreditPack ? { creditsGranted } : {}),
          ...(isMembership
            ? {
                membership: {
                  billingMode: billingMode === "month" ? "monthly" : "annual",
                  annualDiscountPercent: 0,
                  includedCreditsPerCycle: membershipCredits,
                  bookingLimitPerCycle:
                    membershipBookingLimit > 0
                      ? membershipBookingLimit
                      : undefined,
                  includedCatalogItemIds,
                },
                benefits: parsedBenefits,
              }
            : {}),
          ...(isBundle
            ? {
                bundle: {
                  status: "early-access",
                  includedCatalogItemIds,
                },
              }
            : {}),
        }
      : {}),
    ...(type === "good"
      ? {
          saleEnabled: sellEnabled,
          inventoryTracked: trackInventory,
          inventoryCostingMethod: costingMethod,
          inventoryPurpose: sellEnabled ? "sale" : internalPurpose,
          variantCount: coordinates.length,
        }
      : {}),
    ...(allowInstallments && type !== "good"
      ? {
          paymentPlan: {
            enabled: true,
            installmentCount,
            interval: "month",
            customerAcknowledgementRequired: true,
            collectionMethod: "automatic",
          },
        }
      : {}),
  };

  const initialInventory =
    type === "good" && trackInventory && receiveNow
      ? {
          variantIndex: Math.min(
            Math.max(0, receiptVariantIndex),
            Math.max(0, coordinates.length - 1),
          ),
          inventoryLocationId: locationId || undefined,
          locationName: locationId ? undefined : newLocationName || undefined,
          purpose: sellEnabled ? "sale" : internalPurpose,
          trackingMode: "quantity",
          quantity: Math.max(1, receiptQuantity),
          unitCostMinor: receiptUnitCostMinor,
          totalCostMinor: receiptTotalMinor,
          acquiredAt: receiptDate || undefined,
          vendorName: receiptVendor || undefined,
          receiptUrl: receiptUrl || undefined,
        }
      : undefined;

  return (
    <section className="hq-card guided-product-builder">
      <header className="guided-product-builder__header">
        <div>
          <span className="hq-eyebrow">Guided product setup</span>
          <h2>Choose the flow that matches the offer.</h2>
          <p>
            Each path asks only for the story, delivery, pricing, and controls
            that belong to that product.
          </p>
        </div>
        <Link className="guided-event-link" href="/events/create">
          <CalendarClock aria-hidden size={18} />
          <span>
            <strong>Building an event?</strong>
            <small>Use the full event builder</small>
          </span>
          <ArrowRight aria-hidden size={16} />
        </Link>
      </header>

      <div className="guided-product-type-row">
        {productTypes.map((productType) => {
          const Icon = productType.icon;
          return (
            <button
              aria-pressed={type === productType.value}
              className={type === productType.value ? "active" : undefined}
              key={productType.value}
              onClick={() => chooseType(productType.value)}
              type="button"
            >
              <Icon aria-hidden size={20} />
              <span>
                <strong>{productType.label}</strong>
                <small>{productType.detail}</small>
              </span>
            </button>
          );
        })}
      </div>

      <form action={action} className="guided-product-form">
        <input name="type" type="hidden" value={type} />
        <input name="subtype" type="hidden" value={subtype} />
        <input name="title" type="hidden" value={title} />
        <input name="shortSummary" type="hidden" value={shortSummary} />
        <input name="description" type="hidden" value={description} />
        <input name="visibility" type="hidden" value={visibility} />
        <input
          name="taxable"
          type="hidden"
          value={taxable ? "true" : "false"}
        />
        <input
          name="membershipRequired"
          type="hidden"
          value={membershipRequired ? "true" : "false"}
        />
        <input
          name="allowCard"
          type="hidden"
          value={type === "good" && !sellEnabled ? "false" : String(allowCard)}
        />
        <input
          name="allowCash"
          type="hidden"
          value={type === "good" && !sellEnabled ? "false" : String(allowCash)}
        />
        <input
          name="allowCredits"
          type="hidden"
          value={
            type === "plan" || (type === "good" && !sellEnabled)
              ? "false"
              : String(allowCredits)
          }
        />
        <input
          name="price"
          type="hidden"
          value={type === "good" && !sellEnabled ? "" : price}
        />
        <input
          name="creditCost"
          type="hidden"
          value={allowCredits ? String(creditCost) : ""}
        />
        <input
          name="recurringInterval"
          type="hidden"
          value={isMembership ? billingMode : ""}
        />
        <input
          name="recurringIntervalCount"
          type="hidden"
          value={isMembership ? "1" : ""}
        />
        <input
          name="options"
          type="hidden"
          value={JSON.stringify(normalized)}
        />
        <input
          name="media"
          type="hidden"
          value={JSON.stringify(
            media.map((item) => ({
              kind: item.kind,
              url: item.url,
              alt: item.alt,
              variantIndex: item.variantIndex,
            })),
          )}
        />
        <input
          name="initialInventory"
          type="hidden"
          value={initialInventory ? JSON.stringify(initialInventory) : ""}
        />
        <input
          name="configuration"
          type="hidden"
          value={JSON.stringify(configuration)}
        />
        <input
          name="confirmed"
          type="hidden"
          value={confirmed ? "true" : "false"}
        />

        <nav
          aria-label={`${type} setup progress`}
          className="guided-product-steps"
        >
          {currentSteps.map((name, index) => (
            <button
              aria-current={step === index ? "step" : undefined}
              className={
                step === index
                  ? "active"
                  : index < step
                    ? "complete"
                    : undefined
              }
              key={name}
              onClick={() => index <= step && setStep(index)}
              type="button"
            >
              <i>{index < step ? <Check size={13} /> : index + 1}</i>
              <span>{name}</span>
            </button>
          ))}
        </nav>

        <div className="guided-product-stage">
          {step === 0 && (
            <section>
              <span className="hq-eyebrow">Step 1 · {currentSteps[0]}</span>
              <h3>
                {type === "service"
                  ? "What kind of service is this?"
                  : type === "plan"
                    ? "What should this plan unlock?"
                    : "How will this good be used?"}
              </h3>
              <p>
                {type === "good"
                  ? "Inventory tracking and selling are separate choices. Turn on one or both."
                  : "Start with the outcome instead of configuring a generic product type."}
              </p>
              {type !== "good" ? (
                <ChoiceGrid>
                  {subtypeChoices[type].map((choice) => (
                    <ChoiceCard
                      active={subtype === choice.value}
                      badge={"badge" in choice ? choice.badge : undefined}
                      detail={choice.detail}
                      key={choice.value}
                      label={choice.label}
                      onClick={() => {
                        setSubtype(choice.value);
                        if (type === "service") {
                          setCapacity(
                            choice.value === "private-lesson" ? 1 : 8,
                          );
                        }
                      }}
                    />
                  ))}
                </ChoiceGrid>
              ) : (
                <>
                  <ChoiceGrid>
                    <ChoiceCard
                      active={trackInventory}
                      detail="Receive stock in cost layers, reserve quantities, and keep an append-only movement history."
                      icon={<Boxes aria-hidden size={22} />}
                      label="Track inventory"
                      onClick={() => setTrackInventory((current) => !current)}
                    />
                    <ChoiceCard
                      active={sellEnabled}
                      detail="Set a customer price and make the good eligible for checkout after review."
                      icon={<ShoppingBag aria-hidden size={22} />}
                      label="Offer for sale"
                      onClick={() => setSellEnabled((current) => !current)}
                    />
                  </ChoiceGrid>
                  {!trackInventory && !sellEnabled && (
                    <p className="guided-product-warning" role="alert">
                      Choose inventory tracking, selling, or both.
                    </p>
                  )}
                  <div className="guided-product-subsection">
                    <strong>What kind of good is it?</strong>
                    <ChoiceGrid>
                      {subtypeChoices.good.map((choice) => (
                        <ChoiceCard
                          active={subtype === choice.value}
                          detail={choice.detail}
                          key={choice.value}
                          label={choice.label}
                          onClick={() => setSubtype(choice.value)}
                        />
                      ))}
                    </ChoiceGrid>
                  </div>
                </>
              )}
            </section>
          )}

          {((step === 1 && type !== "good") ||
            (step === 2 && type === "good")) && (
            <section>
              <span className="hq-eyebrow">
                Step {step + 1} · {currentSteps[step]}
              </span>
              <h3>Give people a clear reason to choose it.</h3>
              <p>
                Name the outcome first. The longer description can explain what
                is included and what to expect.
              </p>
              <div className="operator-form-grid operator-form-grid--two">
                <label className="operator-field--wide">
                  <span>Name</span>
                  <input
                    autoFocus
                    maxLength={140}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={
                      type === "service"
                        ? "Private beach volleyball lesson"
                        : type === "plan"
                          ? isMembership
                            ? "Beach Elite membership"
                            : isCreditPack
                              ? "10-session credit pack"
                              : "Summer training bundle"
                          : "Wilson OPTX volleyball"
                    }
                    value={title}
                  />
                </label>
                <label className="operator-field--wide">
                  <span>Short summary</span>
                  <input
                    maxLength={240}
                    onChange={(event) => setShortSummary(event.target.value)}
                    placeholder="One sentence a player or parent understands immediately."
                    value={shortSummary}
                  />
                </label>
                <label className="operator-field--wide">
                  <span>Description · Markdown supported</span>
                  <textarea
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What is included, who it is for, and what to expect."
                    rows={6}
                    value={description}
                  />
                </label>
              </div>

              {type === "good" && (
                <div className="guided-product-media">
                  <header>
                    <div>
                      <strong>Product gallery</strong>
                      <small>
                        At least one image is required. Add multiple images or
                        videos and optionally connect them to a variant.
                      </small>
                    </div>
                    <Badge
                      tone={
                        media.some((item) => item.kind === "image")
                          ? "positive"
                          : "warning"
                      }
                    >
                      {media.length} media
                    </Badge>
                  </header>
                  <label className="guided-product-media__upload">
                    <input
                      accept="image/avif,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                      disabled={mediaUploadState === "uploading"}
                      multiple
                      onChange={(event) => void uploadMedia(event.target.files)}
                      type="file"
                    />
                    <UploadCloud aria-hidden size={22} />
                    <span>
                      <strong>
                        {mediaUploadState === "uploading"
                          ? "Uploading…"
                          : "Upload images or video"}
                      </strong>
                      <small>Images are optimized before storage.</small>
                    </span>
                  </label>
                  {mediaUploadState !== "idle" && (
                    <p
                      className={`event-media-status event-media-status--${mediaUploadState}`}
                      role={mediaUploadState === "error" ? "alert" : "status"}
                    >
                      {mediaUploadMessage}
                    </p>
                  )}
                  <div className="guided-product-hosted-media">
                    <select
                      aria-label="Hosted media type"
                      onChange={(event) =>
                        setHostedMediaKind(
                          event.target.value === "video" ? "video" : "image",
                        )
                      }
                      value={hostedMediaKind}
                    >
                      <option value="image">Image URL</option>
                      <option value="video">Video URL</option>
                    </select>
                    <input
                      aria-label="Hosted media URL"
                      onChange={(event) =>
                        setHostedMediaUrl(event.target.value)
                      }
                      placeholder="https://…"
                      type="url"
                      value={hostedMediaUrl}
                    />
                    <button
                      className="hq-button hq-button--secondary"
                      disabled={!hostedMediaUrl.trim()}
                      onClick={addHostedMedia}
                      type="button"
                    >
                      <Plus aria-hidden size={15} /> Add
                    </button>
                  </div>
                  {media.length > 0 && (
                    <div className="guided-product-media__grid">
                      {media.map((item, index) => (
                        <article key={item.id}>
                          <div>
                            {item.kind === "image" ? (
                              <img alt={item.alt} src={item.url} />
                            ) : (
                              <video
                                muted
                                playsInline
                                preload="metadata"
                                src={item.url}
                              />
                            )}
                            <span>
                              {item.kind === "image" ? (
                                <ImagePlus size={15} />
                              ) : (
                                <Video size={15} />
                              )}
                              {index === 0 ? "Cover" : item.kind}
                            </span>
                          </div>
                          <label>
                            <span>Shown for</span>
                            <select
                              onChange={(event) =>
                                setMedia((current) =>
                                  current.map((candidate) =>
                                    candidate.id === item.id
                                      ? {
                                          ...candidate,
                                          variantIndex:
                                            event.target.value === ""
                                              ? undefined
                                              : Number(event.target.value),
                                        }
                                      : candidate,
                                  ),
                                )
                              }
                              value={item.variantIndex ?? ""}
                            >
                              <option value="">All variants</option>
                              {variantLabels.map((label, variantIndex) => (
                                <option
                                  key={`${label}-${variantIndex}`}
                                  value={variantIndex}
                                >
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            aria-label={`Remove ${item.kind}`}
                            onClick={() =>
                              setMedia((current) =>
                                current.filter(
                                  (candidate) => candidate.id !== item.id,
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
                  )}
                  {!media.some((item) => item.kind === "image") && (
                    <p className="guided-product-warning" role="alert">
                      Add at least one product image to continue.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {step === 2 && type === "service" && (
            <section>
              <span className="hq-eyebrow">Step 3 · Booking</span>
              <h3>Turn coach availability into bookable time.</h3>
              <p>
                These settings guide the customer experience without making you
                build a schedule from generic rules.
              </p>
              <ChoiceGrid>
                <ChoiceCard
                  active={schedulingStyle === "coach-availability"}
                  detail="Show times only when the assigned coaching team is actually free."
                  label="Live coach availability"
                  onClick={() => setSchedulingStyle("coach-availability")}
                />
                <ChoiceCard
                  active={schedulingStyle === "request-to-book"}
                  detail="Collect a preferred time, then let staff confirm the booking."
                  label="Request to book"
                  onClick={() => setSchedulingStyle("request-to-book")}
                />
              </ChoiceGrid>
              <div className="operator-form-grid operator-form-grid--two">
                <label>
                  <span>Duration</span>
                  <select
                    onChange={(event) =>
                      setDurationMinutes(Number(event.target.value))
                    }
                    value={durationMinutes}
                  >
                    {[30, 45, 60, 75, 90, 120].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} minutes
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Players per booking</span>
                  <input
                    max="100"
                    min="1"
                    onChange={(event) =>
                      setCapacity(Math.max(1, Number(event.target.value)))
                    }
                    type="number"
                    value={capacity}
                  />
                </label>
                <label>
                  <span>Where is it delivered?</span>
                  <select
                    onChange={(event) =>
                      setDeliveryMode(
                        event.target.value === "online" ? "online" : "venue",
                      )
                    }
                    value={deliveryMode}
                  >
                    <option value="venue">At a connected venue</option>
                    <option value="online">Online</option>
                  </select>
                </label>
                {deliveryMode === "venue" && (
                  <label>
                    <span>Venue</span>
                    <select
                      disabled={workspace.venues.length === 0}
                      onChange={(event) => setVenueId(event.target.value)}
                      value={venueId}
                    >
                      {workspace.venues.length === 0 ? (
                        <option value="">Add a venue first</option>
                      ) : (
                        workspace.venues.map((venue) => (
                          <option key={venue.id} value={venue.id}>
                            {venue.name}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                )}
                <label>
                  <span>Minimum booking notice</span>
                  <select
                    onChange={(event) =>
                      setBookingLeadHours(Number(event.target.value))
                    }
                    value={bookingLeadHours}
                  >
                    {[0, 2, 6, 12, 24, 48].map((hours) => (
                      <option key={hours} value={hours}>
                        {hours === 0 ? "No minimum" : `${hours} hours`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Coach buffer</span>
                  <select
                    onChange={(event) =>
                      setBookingBufferMinutes(Number(event.target.value))
                    }
                    value={bookingBufferMinutes}
                  >
                    {[0, 10, 15, 20, 30, 45, 60].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === 0 ? "No buffer" : `${minutes} minutes`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <fieldset className="product-coach-assignment">
                <legend>
                  <UserRound aria-hidden size={18} /> Coaching team
                </legend>
                {eligibleCoaches.length === 0 ? (
                  <div className="product-coach-empty">
                    <span>
                      <strong>Add or invite a coach first.</strong>
                      The draft can be saved, but it will not expose live coach
                      availability.
                    </span>
                    <Link href="/team/invite">Open team setup</Link>
                  </div>
                ) : (
                  <>
                    <ChoiceGrid>
                      <ChoiceCard
                        active={coachMode === "all"}
                        detail="All active coaches can deliver this service."
                        label="All active coaches"
                        onClick={() => setCoachMode("all")}
                      />
                      <ChoiceCard
                        active={coachMode === "selected"}
                        detail="Keep the service limited to a specific team."
                        label="Selected coaches"
                        onClick={() => setCoachMode("selected")}
                      />
                    </ChoiceGrid>
                    {coachMode === "selected" && (
                      <div className="guided-coach-grid">
                        {eligibleCoaches.map((coach) => {
                          const checked = selectedCoachIds.includes(
                            coach.personId,
                          );
                          return (
                            <label
                              className={checked ? "active" : undefined}
                              key={coach.personId}
                            >
                              <input
                                checked={checked}
                                onChange={(event) =>
                                  setSelectedCoachIds((current) =>
                                    event.target.checked
                                      ? [...current, coach.personId]
                                      : current.filter(
                                          (id) => id !== coach.personId,
                                        ),
                                  )
                                }
                                type="checkbox"
                              />
                              <span>
                                <strong>{coach.displayName}</strong>
                                <small>@{coach.handle}</small>
                              </span>
                              <Check aria-hidden size={15} />
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <label className="operator-switch">
                      <input
                        checked={customerCoachSelection}
                        onChange={(event) =>
                          setCustomerCoachSelection(event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>
                        <strong>Let the customer choose a coach</strong>
                        Show the eligible team with photos and available times.
                      </span>
                    </label>
                  </>
                )}
              </fieldset>
            </section>
          )}

          {step === 2 && type === "plan" && (
            <section>
              <span className="hq-eyebrow">Step 3 · Structure</span>
              <h3>
                {isMembership
                  ? "Build the recurring value."
                  : isCreditPack
                    ? "Define the credit promise."
                    : "Choose what the bundle includes."}
              </h3>
              {isMembership && (
                <>
                  <ChoiceGrid>
                    <ChoiceCard
                      active={billingMode === "month"}
                      detail="A lower-commitment recurring monthly plan."
                      label="Monthly membership"
                      onClick={() => setBillingMode("month")}
                    />
                    <ChoiceCard
                      active={billingMode === "year"}
                      detail="One annual renewal with a full-year commitment."
                      label="Annual membership"
                      onClick={() => setBillingMode("year")}
                    />
                  </ChoiceGrid>
                  <div className="operator-form-grid operator-form-grid--two">
                    <label>
                      <span>Credits each billing cycle</span>
                      <input
                        min="0"
                        onChange={(event) =>
                          setMembershipCredits(
                            Math.max(0, Number(event.target.value)),
                          )
                        }
                        type="number"
                        value={membershipCredits}
                      />
                    </label>
                    <label>
                      <span>Included booking limit · optional</span>
                      <input
                        min="0"
                        onChange={(event) =>
                          setMembershipBookingLimit(
                            Math.max(0, Number(event.target.value)),
                          )
                        }
                        placeholder="Unlimited"
                        type="number"
                        value={membershipBookingLimit || ""}
                      />
                    </label>
                    <label className="operator-field--wide">
                      <span>Benefits · one per line</span>
                      <textarea
                        onChange={(event) => setBenefits(event.target.value)}
                        placeholder={
                          "Priority booking\n10% member pricing\nMonthly community meetup"
                        }
                        rows={5}
                        value={benefits}
                      />
                    </label>
                  </div>
                </>
              )}
              {isCreditPack && (
                <div className="guided-credit-promise">
                  <CreditCard aria-hidden size={28} />
                  <label>
                    <span>Organization credits granted</span>
                    <input
                      min="1"
                      onChange={(event) =>
                        setCreditsGranted(
                          Math.max(1, Number(event.target.value)),
                        )
                      }
                      type="number"
                      value={creditsGranted}
                    />
                  </label>
                  <p>
                    Credits stay with this organization and are granted only
                    after a successful paid order.
                  </p>
                </div>
              )}
              {(isMembership || isBundle) && (
                <div className="membership-inclusion-picker">
                  <span>
                    {isBundle
                      ? "Bundle contents"
                      : "Included services and events"}
                  </span>
                  <small>
                    {isBundle
                      ? "Choose at least two existing offers. Bundle redemption is an early-access workflow and the purchase remains reviewable by staff."
                      : "Choose the offers included by this membership. Member pricing can still apply to everything else."}
                  </small>
                  <div>
                    {workspace.catalog
                      .filter((item) =>
                        isBundle
                          ? item.type !== "plan" && item.status !== "archived"
                          : (item.type === "event" ||
                              item.type === "service") &&
                            item.status !== "archived",
                      )
                      .map((item) => {
                        const checked = includedCatalogItemIds.includes(
                          item.id,
                        );
                        return (
                          <label
                            className={checked ? "active" : undefined}
                            key={item.id}
                          >
                            <input
                              checked={checked}
                              onChange={(event) =>
                                setIncludedCatalogItemIds((current) =>
                                  event.target.checked
                                    ? [...current, item.id]
                                    : current.filter((id) => id !== item.id),
                                )
                              }
                              type="checkbox"
                            />
                            <span>
                              <strong>{item.title}</strong>
                              <small>{item.subtype.replaceAll("-", " ")}</small>
                            </span>
                            <Check aria-hidden size={15} />
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
            </section>
          )}

          {step === 1 && type === "good" && (
            <section>
              <span className="hq-eyebrow">Step 2 · Variants</span>
              <h3>Only add options customers or staff truly need.</h3>
              <p>
                A good without size, color, or style choices gets one default
                variant. Gallery media can be assigned after the variants are
                defined.
              </p>
              <fieldset className="product-option-builder">
                <legend>
                  Options + variants
                  <Badge
                    tone={coordinates.length > 500 ? "warning" : "neutral"}
                  >
                    {coordinates.length} variants
                  </Badge>
                </legend>
                {options.map((option) => (
                  <div className="product-option-row" key={option.id}>
                    <label>
                      <span>Option</span>
                      <input
                        onChange={(event) =>
                          setOptions((current) =>
                            current.map((candidate) =>
                              candidate.id === option.id
                                ? { ...candidate, name: event.target.value }
                                : candidate,
                            ),
                          )
                        }
                        placeholder="Size"
                        value={option.name}
                      />
                    </label>
                    <label>
                      <span>Values · comma separated</span>
                      <input
                        onChange={(event) =>
                          setOptions((current) =>
                            current.map((candidate) =>
                              candidate.id === option.id
                                ? { ...candidate, values: event.target.value }
                                : candidate,
                            ),
                          )
                        }
                        placeholder="S, M, L, XL"
                        value={option.values}
                      />
                    </label>
                    <button
                      aria-label="Remove option"
                      onClick={() =>
                        setOptions((current) =>
                          current.filter(
                            (candidate) => candidate.id !== option.id,
                          ),
                        )
                      }
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  className="hq-button hq-button--secondary"
                  onClick={() =>
                    setOptions((current) => [
                      ...current,
                      { id: crypto.randomUUID(), name: "", values: "" },
                    ])
                  }
                  type="button"
                >
                  <Plus size={15} /> Add an option
                </button>
              </fieldset>
              {coordinates.length > 500 && (
                <p className="guided-product-warning" role="alert">
                  Reduce the option values to stay below 500 generated variants.
                </p>
              )}
            </section>
          )}

          {step === 3 && type !== "good" && (
            <section>
              <span className="hq-eyebrow">Step 4 · Price</span>
              <h3>Make checkout expectations explicit.</h3>
              <p>
                Payment choices stay tailored to this {type}; the draft remains
                private until publication review.
              </p>
              <ChoiceGrid>
                <ChoiceCard
                  active={allowCard}
                  detail={
                    isMembership
                      ? "Secure recurring online billing."
                      : "Secure online checkout."
                  }
                  label="Card"
                  onClick={() => setAllowCard((current) => !current)}
                />
                <ChoiceCard
                  active={allowCash}
                  detail="Let staff record a payment collected in person."
                  label="Cash"
                  onClick={() => setAllowCash((current) => !current)}
                />
                {type === "service" && (
                  <ChoiceCard
                    active={allowCredits}
                    detail="Accept credits issued by this organization."
                    label="Organization credits"
                    onClick={() => setAllowCredits((current) => !current)}
                  />
                )}
              </ChoiceGrid>
              <div className="operator-form-grid operator-form-grid--two">
                <MoneyInput
                  currency={workspace.organization.currency}
                  label={
                    isMembership
                      ? `${billingMode === "month" ? "Monthly" : "Annual"} price`
                      : "Price"
                  }
                  onChange={setPrice}
                  placeholder={isCreditPack ? "250.00" : "80.00"}
                  value={price}
                />
                {allowCredits && (
                  <label>
                    <span>Credit cost</span>
                    <input
                      min="1"
                      onChange={(event) =>
                        setCreditCost(Math.max(1, Number(event.target.value)))
                      }
                      type="number"
                      value={creditCost}
                    />
                  </label>
                )}
              </div>
              {!isMembership && allowCard && (
                <label className="operator-switch">
                  <input
                    checked={allowInstallments}
                    onChange={(event) =>
                      setAllowInstallments(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    <strong>Offer monthly installments</strong>
                    The customer acknowledges that future automatic payments may
                    fail.
                  </span>
                </label>
              )}
              {allowInstallments && (
                <label className="guided-inline-field">
                  <span>Number of installments</span>
                  <select
                    onChange={(event) =>
                      setInstallmentCount(Number(event.target.value))
                    }
                    value={installmentCount}
                  >
                    {[2, 3, 4, 6].map((count) => (
                      <option key={count} value={count}>
                        {count} payments
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="guided-product-policy-grid">
                <label className="operator-switch">
                  <input
                    checked={membershipRequired}
                    onChange={(event) =>
                      setMembershipRequired(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    <strong>Membership required</strong>
                    Only active members may purchase or book.
                  </span>
                </label>
                <label className="operator-switch">
                  <input
                    checked={taxable}
                    onChange={(event) => setTaxable(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    <strong>Taxable</strong>
                    Use the organization or venue tax location.
                  </span>
                </label>
              </div>
              <div className="guided-audience">
                <strong>Who can see it?</strong>
                <ChoiceGrid>
                  <ChoiceCard
                    active={visibility === "public"}
                    detail="Visible to everyone."
                    label="Public"
                    onClick={() => setVisibility("public")}
                  />
                  <ChoiceCard
                    active={visibility === "members"}
                    detail="Visible to active members."
                    label="Members"
                    onClick={() => setVisibility("members")}
                  />
                  <ChoiceCard
                    active={visibility === "private"}
                    detail="Staff or private-link access only."
                    label="Private"
                    onClick={() => setVisibility("private")}
                  />
                </ChoiceGrid>
              </div>
            </section>
          )}

          {step === 3 && type === "good" && (
            <section>
              <span className="hq-eyebrow">Step 4 · Stock + price</span>
              <h3>Connect every receipt to the economics of the good.</h3>
              <p>
                Each receipt becomes its own cost layer, so later purchases at a
                different price remain historically accurate.
              </p>
              {trackInventory && (
                <div className="guided-costing-method">
                  <header>
                    <div>
                      <strong>Inventory costing method</strong>
                      <small>
                        FIFO is the operational default. LIFO is an advanced
                        U.S.-specific election that should be confirmed with an
                        accountant.
                      </small>
                    </div>
                    <Sparkles aria-hidden size={20} />
                  </header>
                  <ChoiceGrid>
                    <ChoiceCard
                      active={costingMethod === "fifo"}
                      badge="Recommended"
                      detail="Oldest receipt layers are reserved first. Intuitive for most physical stock and broadly compatible."
                      label="FIFO · first in, first out"
                      onClick={() => setCostingMethod("fifo")}
                    />
                    <ChoiceCard
                      active={costingMethod === "lifo"}
                      badge="Advanced"
                      detail="Newest receipt layers are reserved first. Requires U.S. tax/accounting review and may not fit every reporting framework."
                      label="LIFO · last in, first out"
                      onClick={() => setCostingMethod("lifo")}
                    />
                  </ChoiceGrid>
                  <p className="operator-legal-boundary">
                    Duna is suggesting an inventory workflow, not giving tax
                    advice. Confirm the method and any change with your
                    accountant.
                  </p>
                </div>
              )}

              {trackInventory && !sellEnabled && (
                <div className="guided-product-subsection">
                  <strong>Internal purpose</strong>
                  <ChoiceGrid>
                    <ChoiceCard
                      active={internalPurpose === "operations"}
                      detail="Facility or event operating stock."
                      label="Club operations"
                      onClick={() => setInternalPurpose("operations")}
                    />
                    <ChoiceCard
                      active={internalPurpose === "coach-use"}
                      detail="Equipment assigned to the coaching team."
                      label="Coach use"
                      onClick={() => setInternalPurpose("coach-use")}
                    />
                    <ChoiceCard
                      active={internalPurpose === "rental"}
                      detail="Track availability for customer rentals."
                      label="Rental inventory"
                      onClick={() => setInternalPurpose("rental")}
                    />
                  </ChoiceGrid>
                </div>
              )}

              {trackInventory && (
                <div className="guided-initial-receipt">
                  <label className="operator-switch">
                    <input
                      checked={receiveNow}
                      onChange={(event) => setReceiveNow(event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <strong>Receive the first stock now</strong>
                      You can also save the good first and record every receipt
                      later.
                    </span>
                  </label>
                  {receiveNow && (
                    <div className="operator-form-grid operator-form-grid--two">
                      <label className="operator-field--wide">
                        <span>Variant received</span>
                        <select
                          onChange={(event) =>
                            setReceiptVariantIndex(Number(event.target.value))
                          }
                          value={receiptVariantIndex}
                        >
                          {variantLabels.map((label, index) => (
                            <option key={`${label}-${index}`} value={index}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Quantity received</span>
                        <input
                          min="1"
                          onChange={(event) =>
                            setReceiptQuantity(
                              Math.max(1, Number(event.target.value)),
                            )
                          }
                          type="number"
                          value={receiptQuantity}
                        />
                      </label>
                      <MoneyInput
                        currency={workspace.organization.currency}
                        label="Total receipt cost · all units"
                        onChange={setReceiptTotalCost}
                        placeholder="250.00"
                        value={receiptTotalCost}
                      />
                      <label>
                        <span>Received or purchased</span>
                        <input
                          onChange={(event) =>
                            setReceiptDate(event.target.value)
                          }
                          type="date"
                          value={receiptDate}
                        />
                      </label>
                      <label>
                        <span>Vendor or source</span>
                        <input
                          onChange={(event) =>
                            setReceiptVendor(event.target.value)
                          }
                          placeholder="Wilson, donor, or retailer"
                          value={receiptVendor}
                        />
                      </label>
                      <label>
                        <span>Receipt or invoice URL</span>
                        <input
                          onChange={(event) =>
                            setReceiptUrl(event.target.value)
                          }
                          type="url"
                          value={receiptUrl}
                        />
                      </label>
                      <label>
                        <span>Inventory location</span>
                        <select
                          onChange={(event) =>
                            setLocationId(event.target.value)
                          }
                          value={locationId}
                        >
                          <option value="">
                            Main inventory or new location
                          </option>
                          {workspace.inventoryLocations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!locationId && (
                        <label>
                          <span>New location name · optional</span>
                          <input
                            onChange={(event) =>
                              setNewLocationName(event.target.value)
                            }
                            placeholder="Main inventory"
                            value={newLocationName}
                          />
                        </label>
                      )}
                    </div>
                  )}
                  {receiveNow && receiptUnitCostMinor !== undefined && (
                    <div className="guided-receipt-math">
                      <ReceiptText aria-hidden size={18} />
                      <span>
                        <small>Cost layer</small>
                        <strong>
                          {receiptQuantity} ×{" "}
                          {moneyLabel(
                            receiptUnitCostMinor,
                            workspace.organization.currency,
                          )}{" "}
                          each ={" "}
                          {moneyLabel(
                            receiptTotalMinor,
                            workspace.organization.currency,
                          )}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {sellEnabled ? (
                <div className="guided-sale-economics">
                  <header>
                    <div>
                      <strong>Sale economics</strong>
                      <small>
                        Margin uses the selected receipt layer as the current
                        estimate.
                      </small>
                    </div>
                    <PackageCheck aria-hidden size={20} />
                  </header>
                  <div className="operator-form-grid operator-form-grid--two">
                    <MoneyInput
                      currency={workspace.organization.currency}
                      label="Sale price"
                      onChange={setPrice}
                      placeholder="79.00"
                      value={price}
                    />
                    <label>
                      <span>Checkout</span>
                      <div className="guided-checkout-toggles">
                        <button
                          className={allowCard ? "active" : undefined}
                          onClick={() => setAllowCard((current) => !current)}
                          type="button"
                        >
                          Card
                        </button>
                        <button
                          className={allowCash ? "active" : undefined}
                          onClick={() => setAllowCash((current) => !current)}
                          type="button"
                        >
                          Cash
                        </button>
                      </div>
                    </label>
                  </div>
                  {unitProfitMinor !== undefined &&
                    grossMarginPercent !== undefined && (
                      <div
                        className={
                          unitProfitMinor >= 0
                            ? "guided-margin positive"
                            : "guided-margin negative"
                        }
                      >
                        <span>
                          <small>Sale price</small>
                          <strong>
                            {moneyLabel(
                              salePriceMinor,
                              workspace.organization.currency,
                            )}
                          </strong>
                        </span>
                        <span>
                          <small>Estimated COGS</small>
                          <strong>
                            {moneyLabel(
                              receiptUnitCostMinor,
                              workspace.organization.currency,
                            )}
                          </strong>
                        </span>
                        <span>
                          <small>Gross profit</small>
                          <strong>
                            {moneyLabel(
                              unitProfitMinor,
                              workspace.organization.currency,
                            )}
                          </strong>
                        </span>
                        <span>
                          <small>Gross margin</small>
                          <strong>{grossMarginPercent}%</strong>
                        </span>
                      </div>
                    )}
                  <label className="operator-switch">
                    <input
                      checked={taxable}
                      onChange={(event) => setTaxable(event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <strong>Taxable good</strong>Use the organization or
                      shipping tax location at checkout.
                    </span>
                  </label>
                </div>
              ) : (
                <div className="guided-inventory-only-note">
                  <Layers3 aria-hidden size={22} />
                  <span>
                    <strong>Inventory-only draft</strong>
                    This starts private with no customer checkout. Cost layers
                    and movement history still work normally.
                  </span>
                </div>
              )}
            </section>
          )}

          {step === 4 && (
            <section>
              <span className="hq-eyebrow">Step 5 · Review</span>
              <h3>Review the draft before Duna creates anything.</h3>
              <p>
                Publishing remains a separate confirmed action after payment,
                fulfillment, inventory, and tax readiness checks.
              </p>
              <div className="guided-product-review">
                <article>
                  <small>{type}</small>
                  <strong>{title || "Untitled draft"}</strong>
                  <span>
                    {subtype.replaceAll("-", " ")} · {visibility}
                  </span>
                </article>
                <article>
                  <small>Customer price</small>
                  <strong>
                    {type === "good" && !sellEnabled
                      ? "Inventory only"
                      : moneyLabel(
                          salePriceMinor,
                          workspace.organization.currency,
                        )}
                  </strong>
                  <span>
                    {allowCard ? "Card" : ""}
                    {allowCard && allowCash ? " + " : ""}
                    {allowCash ? "Cash" : ""}
                    {allowCredits ? " + credits" : ""}
                  </span>
                </article>
                {type === "service" && (
                  <article>
                    <small>Booking</small>
                    <strong>
                      {durationMinutes} minutes · up to {capacity}
                    </strong>
                    <span>
                      {assignedCoachIds.length || "No"} eligible coach
                      {assignedCoachIds.length === 1 ? "" : "es"}
                    </span>
                  </article>
                )}
                {type === "plan" && (
                  <article>
                    <small>Plan value</small>
                    <strong>
                      {isCreditPack
                        ? `${creditsGranted} credits`
                        : isBundle
                          ? `${includedCatalogItemIds.length} bundled offers`
                          : `${membershipCredits} credits per cycle`}
                    </strong>
                    <span>
                      {isMembership
                        ? `${billingMode === "month" ? "Monthly" : "Annual"} renewal`
                        : "One-time purchase"}
                    </span>
                  </article>
                )}
                {type === "good" && (
                  <article>
                    <small>Inventory</small>
                    <strong>
                      {trackInventory
                        ? `${costingMethod.toUpperCase()} · ${receiveNow ? `${receiptQuantity} received` : "receive later"}`
                        : "Not tracked"}
                    </strong>
                    <span>
                      {media.length} gallery item{media.length === 1 ? "" : "s"}{" "}
                      · {coordinates.length} variant
                      {coordinates.length === 1 ? "" : "s"}
                    </span>
                  </article>
                )}
              </div>
              {type === "good" && costingMethod === "lifo" && (
                <div className="operator-legal-boundary">
                  <CircleAlert aria-hidden size={18} />
                  <p>
                    LIFO is saved as an operational cost-layer choice. Confirm
                    eligibility, consistency, elections, and financial-reporting
                    treatment with a qualified accountant before relying on it
                    for tax reporting.
                  </p>
                </div>
              )}
              {isBundle && (
                <div className="operator-legal-boundary">
                  <CircleAlert aria-hidden size={18} />
                  <p>
                    Bundles are an early-access plan type. The paid order and
                    included-offer definition are connected; staff review
                    remains part of fulfillment.
                  </p>
                </div>
              )}
              <label className="operator-confirmation">
                <input
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>I reviewed this setup.</strong>
                  Create a private draft and, when included, an append-only
                  first inventory receipt.
                </span>
              </label>
            </section>
          )}
        </div>

        <footer className="guided-product-footer">
          <button
            className="hq-button hq-button--secondary"
            disabled={step === 0 || pending}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            type="button"
          >
            <ChevronLeft aria-hidden size={16} /> Back
          </button>
          <span>
            <ActionNotice state={state} />
            {step < currentSteps.length - 1 ? (
              <button
                className="hq-button hq-button--primary"
                disabled={!canContinue}
                onClick={() =>
                  setStep((current) =>
                    Math.min(currentSteps.length - 1, current + 1),
                  )
                }
                type="button"
              >
                Continue <ArrowRight aria-hidden size={16} />
              </button>
            ) : (
              <button
                className="hq-button hq-button--primary"
                disabled={!canContinue || pending}
                type="submit"
              >
                {pending ? "Creating…" : "Create private draft"}
              </button>
            )}
          </span>
        </footer>
      </form>
    </section>
  );
}
