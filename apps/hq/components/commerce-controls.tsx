"use client";

import type { OperatorWorkspace, WaiverWorkspace } from "@duna/api";
import { Badge, normalizeClubColor } from "@duna/ui";
import { upload } from "@vercel/blob/client";
import {
  Archive,
  BookOpen,
  Boxes,
  CalendarDays,
  Check,
  CircleAlert,
  CreditCard,
  FileText,
  Globe2,
  ImageIcon,
  Link2,
  Palette,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trophy,
  Type,
  UploadCloud,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  useActionState,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  addBrandKnowledgeSourceAction,
  archiveBrandKnowledgeSourceAction,
  createCatalogItemAction,
  createInventoryStockAction,
  issueOrganizationCreditsAction,
  refundOrganizationOrderAction,
  setCatalogItemStatusAction,
  updateCommerceSettingsAction,
  updateThemeAction,
  type OperatorActionState,
} from "@/app/actions";
import {
  createBrandMediaPath,
  inferMediaKindFromUrl,
  optimizeImageUpload,
} from "@/lib/media-storage";
import { AddressEntry } from "./place-address-fields";
import { GuidedProductBuilder } from "./guided-product-builder";

const initialState: OperatorActionState = { status: "idle", message: "" };

type BrandMediaTarget =
  | "logoUrl"
  | "markUrl"
  | "logoLightUrl"
  | "logoDarkUrl"
  | "heroMediaUrl"
  | "heroPosterUrl";

type BrandMediaUpload = {
  readonly status: "idle" | "uploading" | "ready" | "error";
  readonly message: string;
};

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

function SubmitButton({
  pending,
  children,
  secondary,
  disabled,
}: {
  readonly pending: boolean;
  readonly children: ReactNode;
  readonly secondary?: boolean;
  readonly disabled?: boolean;
}) {
  return (
    <button
      className={`hq-button ${
        secondary ? "hq-button--secondary" : "hq-button--primary"
      }`}
      disabled={pending || disabled}
      type="submit"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function MoneyField({
  label,
  name,
  placeholder,
  value,
  onChange,
  helper,
  required,
}: {
  readonly label: string;
  readonly name: string;
  readonly placeholder?: string;
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  readonly helper?: string;
  readonly required?: boolean;
}) {
  return (
    <label>
      <span>{label}</span>
      <span className="operator-money-input">
        <small>$</small>
        <input
          inputMode="decimal"
          min="0"
          name={name}
          onChange={
            onChange ? (event) => onChange(event.target.value) : undefined
          }
          placeholder={placeholder}
          required={required}
          step="0.01"
          type="number"
          value={value}
        />
      </span>
      {helper && <small className="operator-field-helper">{helper}</small>}
    </label>
  );
}

const productTypes = [
  {
    value: "event" as const,
    label: "Event",
    detail: "League, tournament, clinic, camp, pickup, or open play.",
    icon: Trophy,
  },
  {
    value: "service" as const,
    label: "Service",
    detail: "Private lesson, group lesson, program, or assessment.",
    icon: CalendarDays,
  },
  {
    value: "plan" as const,
    label: "Plan",
    detail: "Membership or an organization-specific credit pack.",
    icon: CreditCard,
  },
  {
    value: "good" as const,
    label: "Good",
    detail: "Merchandise or equipment to sell, rent, or reserve.",
    icon: ShoppingBag,
  },
];

const subtypes = {
  event: [
    ["clinic", "Clinic"],
    ["league", "League"],
    ["tournament", "Tournament"],
    ["open-play", "Open play"],
    ["pickup", "Pickup"],
  ],
  service: [
    ["private-lesson", "Private lesson"],
    ["group-lesson", "Group lesson"],
    ["program", "Program"],
    ["assessment", "Player assessment"],
  ],
  plan: [
    ["membership", "Membership"],
    ["credit-pack", "Credit pack"],
  ],
  good: [
    ["swag", "Swag + merchandise"],
    ["apparel", "Apparel"],
    ["equipment", "Equipment"],
    ["rental", "Rental equipment"],
    ["consumable", "Consumable"],
    ["other", "Other"],
  ],
} as const;

/** @deprecated The tailored guided builders replace the shared dropdown form. */
export function ProductComposer({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [type, setType] =
    useState<(typeof productTypes)[number]["value"]>("service");
  const [subtype, setSubtype] = useState<string>("private-lesson");
  const [allowCard, setAllowCard] = useState(true);
  const [allowCash, setAllowCash] = useState(false);
  const [allowCredits, setAllowCredits] = useState(false);
  const [memberPricing, setMemberPricing] = useState(false);
  const [basePrice, setBasePrice] = useState("");
  const [memberPrice, setMemberPrice] = useState("");
  const [nonMemberPrice, setNonMemberPrice] = useState("");
  const [creditsGranted, setCreditsGranted] = useState(10);
  const [membershipBillingMode, setMembershipBillingMode] = useState<
    "monthly" | "annual" | "monthly-and-annual"
  >("monthly");
  const [annualDiscountPercent, setAnnualDiscountPercent] = useState(10);
  const [membershipCredits, setMembershipCredits] = useState(0);
  const [membershipBookingLimit, setMembershipBookingLimit] = useState(0);
  const [membershipBenefits, setMembershipBenefits] = useState("");
  const [includedCatalogItemIds, setIncludedCatalogItemIds] = useState<
    readonly string[]
  >([]);
  const [allowInstallments, setAllowInstallments] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(3);
  const [deliveryMode, setDeliveryMode] = useState<"venue" | "online">("venue");
  const [venueId, setVenueId] = useState(workspace.venues[0]?.id ?? "");
  const [coachAssignmentMode, setCoachAssignmentMode] = useState<
    "all" | "selected"
  >("all");
  const [selectedCoachIds, setSelectedCoachIds] = useState<readonly string[]>(
    [],
  );
  const [requiredCoachCount, setRequiredCoachCount] = useState(1);
  const [customerCoachSelection, setCustomerCoachSelection] = useState(true);
  const [coachSearch, setCoachSearch] = useState("");
  const [options, setOptions] = useState<
    { readonly id: string; readonly name: string; readonly values: string }[]
  >([]);
  const [state, action, pending] = useActionState(
    createCatalogItemAction,
    initialState,
  );
  const selectedSubtype = subtypes[type].some(([value]) => value === subtype)
    ? subtype
    : subtypes[type][0][0];
  const variantCount = useMemo(
    () =>
      options.reduce(
        (count, option) =>
          count *
          Math.max(
            1,
            option.values
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean).length,
          ),
        1,
      ),
    [options],
  );
  const normalizedOptions = options
    .map((option) => ({
      name: option.name.trim(),
      values: option.values
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    }))
    .filter((option) => option.name && option.values.length > 0);
  const memberPriceDifference = useMemo(() => {
    const member = Number(memberPrice);
    const nonMember = Number(nonMemberPrice);
    if (
      !Number.isFinite(member) ||
      !Number.isFinite(nonMember) ||
      nonMember <= 0
    ) {
      return undefined;
    }
    const percent = Math.round(((member - nonMember) / nonMember) * 100);
    if (percent === 0) return "Same as the public price.";
    return `${Math.abs(percent)}% ${percent < 0 ? "lower" : "higher"} than the non-member price.`;
  }, [memberPrice, nonMemberPrice]);
  const parsedMembershipBenefits = membershipBenefits
    .split("\n")
    .map((benefit) => benefit.trim())
    .filter(Boolean);
  const isMembership = type === "plan" && selectedSubtype === "membership";
  const annualPrice = (monthlyValue: string) => {
    const monthly = Number(monthlyValue);
    if (!Number.isFinite(monthly) || monthly < 0) return undefined;
    return (
      Math.round(monthly * 12 * (1 - annualDiscountPercent / 100) * 100) / 100
    );
  };
  const annualMemberPrice = annualPrice(memberPrice);
  const annualNonMemberPrice = annualPrice(nonMemberPrice);
  const eligibleCoaches = workspace.staff.filter(
    (person) => person.active && person.role === "coach",
  );
  const filteredCoaches = eligibleCoaches.filter((person) => {
    const query = coachSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      person.displayName.toLowerCase().includes(query) ||
      person.handle.toLowerCase().includes(query) ||
      person.homeMarket?.toLowerCase().includes(query)
    );
  });
  const assignedCoachCount =
    coachAssignmentMode === "all"
      ? eligibleCoaches.length
      : selectedCoachIds.length;

  const chooseType = (next: typeof type) => {
    setType(next);
    setSubtype(subtypes[next][0][0]);
    if (next === "plan") setAllowCredits(false);
    if (next !== "plan") setMembershipBillingMode("monthly");
  };

  return (
    <section className="hq-card operator-control-card product-composer">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Guided product setup</span>
          <h2>What do you want to offer?</h2>
          <p>
            Duna starts with four clear types, then shows only the settings that
            matter.
          </p>
        </div>
        <Plus aria-hidden size={24} />
      </header>
      <div className="product-type-selector">
        {productTypes.map((productType) => {
          const Icon = productType.icon;
          return (
            <button
              className={type === productType.value ? "active" : ""}
              key={productType.value}
              onClick={() => chooseType(productType.value)}
              type="button"
            >
              <Icon aria-hidden size={21} />
              <span>
                <strong>{productType.label}</strong>
                <small>{productType.detail}</small>
              </span>
              <i aria-hidden />
            </button>
          );
        })}
      </div>
      <form
        action={action}
        className="operator-form product-configuration-form"
        id={`create-${type}`}
      >
        <input name="type" type="hidden" value={type} />
        <input
          name="options"
          type="hidden"
          value={JSON.stringify(normalizedOptions)}
        />
        <input
          name="configuration"
          type="hidden"
          value={JSON.stringify({
            source: "hq-guided-product-composer",
            variantCount,
            ...(type === "plan" && selectedSubtype === "credit-pack"
              ? { creditsGranted }
              : {}),
            ...(isMembership
              ? {
                  membership: {
                    billingMode: membershipBillingMode,
                    annualDiscountPercent:
                      membershipBillingMode === "monthly"
                        ? 0
                        : annualDiscountPercent,
                    includedCreditsPerCycle: membershipCredits,
                    bookingLimitPerCycle:
                      membershipBookingLimit > 0
                        ? membershipBookingLimit
                        : undefined,
                    includedCatalogItemIds,
                  },
                  benefits: parsedMembershipBenefits,
                }
              : {}),
            ...(!isMembership && allowInstallments
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
            ...((type === "event" || type === "service") && {
              deliveryMode,
              venueId: deliveryMode === "venue" ? venueId : undefined,
              coachAssignmentMode,
              coachPersonIds:
                coachAssignmentMode === "selected"
                  ? selectedCoachIds
                  : eligibleCoaches.map((coach) => coach.personId),
              requiredCoachCount,
              customerCoachSelection,
            }),
          })}
        />
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>
              {productTypes.find((item) => item.value === type)?.label} type
            </span>
            <select
              name="subtype"
              onChange={(event) => setSubtype(event.target.value)}
              value={selectedSubtype}
            >
              {subtypes[type].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Who can see it?</span>
            <select defaultValue="public" name="visibility">
              <option value="public">Everyone</option>
              <option value="members">Members</option>
              <option value="private">Private link or staff only</option>
            </select>
          </label>
          <label className="operator-field--wide">
            <span>Name</span>
            <input
              name="title"
              placeholder={
                type === "service"
                  ? "Private beach volleyball lesson"
                  : type === "plan"
                    ? "10-session training pack"
                    : type === "good"
                      ? "Duna club hoodie"
                      : "Sunday skills clinic"
              }
              required
            />
          </label>
          <label className="operator-field--wide">
            <span>Short summary</span>
            <input
              maxLength={240}
              name="shortSummary"
              placeholder="One sentence players will understand immediately."
            />
          </label>
          <label className="operator-field--wide">
            <span>Description · Markdown supported</span>
            <textarea
              name="description"
              placeholder={
                "What is included, who it is for, and what to expect.\n\n**Tip:** Use headings, lists, and links to make this easy to scan."
              }
              rows={4}
            />
            <small className="operator-field-helper">
              Headings, bold text, lists, and links are formatted on the public
              page.
            </small>
          </label>
          {(type === "event" || type === "service") && (
            <>
              <label>
                <span>Delivery</span>
                <select
                  onChange={(event) =>
                    setDeliveryMode(event.target.value as "venue" | "online")
                  }
                  value={deliveryMode}
                >
                  <option value="venue">At a venue</option>
                  <option value="online">Online</option>
                </select>
              </label>
              {deliveryMode === "venue" && (
                <label>
                  <span>Taxable venue</span>
                  <select
                    disabled={workspace.venues.length === 0}
                    onChange={(event) => setVenueId(event.target.value)}
                    required
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
            </>
          )}
        </div>

        {(type === "event" || type === "service") && (
          <fieldset className="product-coach-assignment">
            <legend>
              <UserRound aria-hidden size={18} />
              Who can lead this?
            </legend>
            <p>
              Duna combines the offer with each assigned coach&apos;s
              availability. Customers can see only times that the required
              coaching team can actually cover.
            </p>
            {eligibleCoaches.length === 0 ? (
              <div className="product-coach-empty">
                <span>
                  <strong>Add or invite a coach first.</strong>
                  You can still save this draft, but it will not expose bookable
                  coach availability until a coach is connected.
                </span>
                <a href="/team/invite">Open team setup</a>
              </div>
            ) : (
              <>
                <div className="product-coach-mode">
                  <button
                    className={
                      coachAssignmentMode === "all" ? "active" : undefined
                    }
                    onClick={() => setCoachAssignmentMode("all")}
                    type="button"
                  >
                    <span className="product-coach-stack" aria-hidden>
                      {eligibleCoaches
                        .slice(0, 3)
                        .map((coach) =>
                          coach.avatarUrl ? (
                            <img
                              alt=""
                              key={coach.personId}
                              src={coach.avatarUrl}
                            />
                          ) : (
                            <i key={coach.personId}>
                              {coach.displayName.slice(0, 1).toUpperCase()}
                            </i>
                          ),
                        )}
                    </span>
                    <span>
                      <strong>All active coaches</strong>
                      <small>
                        New active coaches become eligible automatically.
                      </small>
                    </span>
                  </button>
                  <button
                    className={
                      coachAssignmentMode === "selected" ? "active" : undefined
                    }
                    onClick={() => setCoachAssignmentMode("selected")}
                    type="button"
                  >
                    <span className="product-coach-stack" aria-hidden>
                      {(selectedCoachIds.length > 0
                        ? eligibleCoaches.filter((coach) =>
                            selectedCoachIds.includes(coach.personId),
                          )
                        : eligibleCoaches
                      )
                        .slice(0, 3)
                        .map((coach) =>
                          coach.avatarUrl ? (
                            <img
                              alt=""
                              key={coach.personId}
                              src={coach.avatarUrl}
                            />
                          ) : (
                            <i key={coach.personId}>
                              {coach.displayName.slice(0, 1).toUpperCase()}
                            </i>
                          ),
                        )}
                    </span>
                    <span>
                      <strong>Only selected coaches</strong>
                      <small>
                        Keep this offer limited to a specific coaching team.
                      </small>
                    </span>
                  </button>
                </div>
                {coachAssignmentMode === "selected" && (
                  <div className="product-coach-picker">
                    <label className="product-coach-search">
                      <Search aria-hidden size={17} />
                      <input
                        onChange={(event) => setCoachSearch(event.target.value)}
                        placeholder="Search coaches by name, handle, or market"
                        type="search"
                        value={coachSearch}
                      />
                    </label>
                    <div className="product-coach-grid">
                      {filteredCoaches.map((coach) => {
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
                              onChange={(event) => {
                                setSelectedCoachIds((current) =>
                                  event.target.checked
                                    ? [...current, coach.personId]
                                    : current.filter(
                                        (id) => id !== coach.personId,
                                      ),
                                );
                              }}
                              type="checkbox"
                            />
                            {coach.avatarUrl ? (
                              <img alt="" src={coach.avatarUrl} />
                            ) : (
                              <span className="product-coach-fallback">
                                {coach.displayName.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <span>
                              <strong>{coach.displayName}</strong>
                              <small>
                                @{coach.handle}
                                {coach.homeMarket
                                  ? ` · ${coach.homeMarket}`
                                  : ""}
                              </small>
                            </span>
                            <i aria-hidden />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="product-coach-rules">
                  <label>
                    <span>Coaches required at the same time</span>
                    <input
                      max={Math.max(1, assignedCoachCount)}
                      min="1"
                      onChange={(event) =>
                        setRequiredCoachCount(
                          Math.max(
                            1,
                            Math.min(
                              Math.max(1, assignedCoachCount),
                              Number(event.target.value),
                            ),
                          ),
                        )
                      }
                      type="number"
                      value={requiredCoachCount}
                    />
                    <small>
                      Use more than one for multi-coach clinics or programs.
                    </small>
                  </label>
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
                      The booking flow shows a visual coach filter with photo,
                      display name, and available times.
                    </span>
                  </label>
                </div>
                {coachAssignmentMode === "selected" &&
                  selectedCoachIds.length === 0 && (
                    <p className="product-coach-warning" role="alert">
                      Select at least one coach before saving this offer.
                    </p>
                  )}
              </>
            )}
          </fieldset>
        )}

        <fieldset className="product-payment-settings">
          <legend>How can players pay?</legend>
          <div className="product-toggle-grid">
            {[
              {
                name: "allowCard",
                label: "Card",
                detail: "Secure online checkout.",
                checked: allowCard,
                set: setAllowCard,
              },
              {
                name: "allowCash",
                label: "Cash",
                detail: "Record staff-collected payment.",
                checked: allowCash,
                set: setAllowCash,
              },
              {
                name: "allowCredits",
                label: "Credits",
                detail: "Only credits from this organization.",
                checked: allowCredits,
                set: setAllowCredits,
                disabled: type === "plan" && selectedSubtype === "credit-pack",
              },
            ].map((option) => (
              <label
                className={
                  option.checked
                    ? "operator-choice-card active"
                    : "operator-choice-card"
                }
                key={option.name}
              >
                <input
                  checked={option.checked}
                  disabled={option.disabled}
                  name={option.name}
                  onChange={(event) => option.set(event.target.checked)}
                  type="checkbox"
                  value="true"
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </span>
                <i aria-hidden />
              </label>
            ))}
          </div>
          <label className="operator-switch">
            <input
              checked={memberPricing}
              onChange={(event) => setMemberPricing(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>Different member and non-member prices</strong>
              Reward active members without duplicating the product.
            </span>
          </label>
          <div className="operator-form-grid operator-form-grid--three">
            {!memberPricing ? (
              <MoneyField
                label={
                  isMembership
                    ? membershipBillingMode === "annual"
                      ? "Annual price"
                      : "Monthly price"
                    : "Price"
                }
                name="price"
                onChange={setBasePrice}
                placeholder="80.00"
                required={allowCard || allowCash}
                value={basePrice}
              />
            ) : (
              <>
                <MoneyField
                  label="Member price"
                  name="memberPrice"
                  onChange={setMemberPrice}
                  placeholder="60.00"
                  required={allowCard || allowCash}
                  value={memberPrice}
                />
                <MoneyField
                  label="Non-member price"
                  name="nonMemberPrice"
                  onChange={setNonMemberPrice}
                  placeholder="80.00"
                  required={allowCard || allowCash}
                  value={nonMemberPrice}
                />
                {memberPriceDifference && (
                  <p className="member-price-comparison">
                    <Sparkles aria-hidden size={15} />
                    {memberPriceDifference}
                  </p>
                )}
              </>
            )}
            {allowCredits && (
              <label>
                <span>Credit cost</span>
                <input min="1" name="creditCost" required type="number" />
              </label>
            )}
            {isMembership && (
              <input
                name="recurringInterval"
                type="hidden"
                value={membershipBillingMode === "annual" ? "year" : "month"}
              />
            )}
            {isMembership && (
              <input name="recurringIntervalCount" type="hidden" value="1" />
            )}
            {isMembership && membershipBillingMode === "monthly-and-annual" && (
              <>
                <input
                  name="annualPrice"
                  type="hidden"
                  value={memberPricing ? "" : (annualPrice(basePrice) ?? "")}
                />
                <input
                  name="annualMemberPrice"
                  type="hidden"
                  value={annualMemberPrice ?? ""}
                />
                <input
                  name="annualNonMemberPrice"
                  type="hidden"
                  value={annualNonMemberPrice ?? ""}
                />
              </>
            )}
            {type === "plan" && selectedSubtype === "credit-pack" && (
              <label>
                <span>Credits granted</span>
                <input
                  min="1"
                  onChange={(event) =>
                    setCreditsGranted(Math.max(1, Number(event.target.value)))
                  }
                  required
                  type="number"
                  value={creditsGranted}
                />
              </label>
            )}
          </div>
        </fieldset>

        {isMembership && (
          <fieldset className="membership-plan-builder">
            <legend>Membership structure</legend>
            <p>
              Membership is always optional for the business. Create one or more
              tiers only when it adds clear value for your community.
            </p>
            <div className="membership-billing-selector">
              {[
                {
                  value: "monthly" as const,
                  label: "Monthly",
                  detail: "One recurring monthly option.",
                },
                {
                  value: "annual" as const,
                  label: "Annual",
                  detail: "One recurring annual option.",
                },
                {
                  value: "monthly-and-annual" as const,
                  label: "Monthly + annual",
                  detail: "Let members choose at checkout.",
                },
              ].map((option) => (
                <button
                  className={
                    membershipBillingMode === option.value ? "active" : ""
                  }
                  key={option.value}
                  onClick={() => setMembershipBillingMode(option.value)}
                  type="button"
                >
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                  </span>
                  <i aria-hidden />
                </button>
              ))}
            </div>
            {membershipBillingMode === "monthly-and-annual" && (
              <div className="membership-annual-preview">
                <label>
                  <span>Annual discount</span>
                  <span className="operator-suffixed-input">
                    <input
                      max="50"
                      min="0"
                      onChange={(event) =>
                        setAnnualDiscountPercent(
                          Math.min(50, Math.max(0, Number(event.target.value))),
                        )
                      }
                      type="number"
                      value={annualDiscountPercent}
                    />
                    <small>%</small>
                  </span>
                </label>
                <div>
                  <span>Annual checkout preview</span>
                  <strong>
                    {memberPricing
                      ? annualMemberPrice !== undefined &&
                        annualNonMemberPrice !== undefined
                        ? `$${annualMemberPrice.toFixed(2)} members · $${annualNonMemberPrice.toFixed(2)} public`
                        : "Add both monthly prices above"
                      : annualPrice(basePrice) !== undefined
                        ? `$${annualPrice(basePrice)?.toFixed(2)} per year`
                        : "Add the monthly price above"}
                  </strong>
                  <small>
                    The annual amount is stored as its own recurring checkout
                    option.
                  </small>
                </div>
              </div>
            )}
            <div className="operator-form-grid operator-form-grid--two">
              <label>
                <span>Credits included each billing cycle</span>
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
                <small className="operator-field-helper">
                  Credits are organization-specific and refresh with a
                  successful membership payment.
                </small>
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
                <small className="operator-field-helper">
                  Leave blank for unlimited access to the selected offers.
                </small>
              </label>
              <label className="operator-field--wide">
                <span>Benefits · one per line</span>
                <textarea
                  onChange={(event) =>
                    setMembershipBenefits(event.target.value)
                  }
                  placeholder={
                    "Priority booking\n10% member pricing\nMonthly community meetup"
                  }
                  rows={4}
                  value={membershipBenefits}
                />
              </label>
            </div>
            <div className="membership-inclusion-picker">
              <span>Included events and services</span>
              <small>
                Select only the offers this tier includes. Price-specific member
                discounts can still be configured above.
              </small>
              <div>
                {workspace.catalog
                  .filter(
                    (item) => item.type === "event" || item.type === "service",
                  )
                  .map((item) => {
                    const checked = includedCatalogItemIds.includes(item.id);
                    return (
                      <label className={checked ? "active" : ""} key={item.id}>
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
                {workspace.catalog.every(
                  (item) => item.type !== "event" && item.type !== "service",
                ) && (
                  <p className="hq-empty">
                    Create an event or service first, then include it in this
                    membership tier.
                  </p>
                )}
              </div>
            </div>
          </fieldset>
        )}

        {!isMembership &&
          allowCard &&
          (type === "service" || type === "event" || type === "plan") && (
            <fieldset className="flexible-payment-builder">
              <legend>Flexible ways to pay</legend>
              <label className="operator-switch">
                <input
                  checked={allowInstallments}
                  onChange={(event) =>
                    setAllowInstallments(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  <strong>Offer an installment plan</strong>
                  Let the customer pay over a fixed number of monthly
                  installments.
                </span>
              </label>
              {allowInstallments && (
                <div className="flexible-payment-detail">
                  <label>
                    <span>Number of monthly payments</span>
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
                  <div>
                    <CircleAlert aria-hidden size={17} />
                    <span>
                      <strong>Future payments can still fail.</strong>
                      Duna uses automatic retries and reminders, but does not
                      guarantee collection of a customer’s future installments.
                      The buyer must acknowledge this before checkout.
                    </span>
                  </div>
                </div>
              )}
            </fieldset>
          )}

        {type === "good" && (
          <fieldset className="product-option-builder">
            <legend>
              Options + variants
              <Badge tone={variantCount > 500 ? "warning" : "neutral"}>
                {variantCount} variants
              </Badge>
            </legend>
            <p>
              Add any number of option dimensions. Duna prevents accidental
              batches above 500 variants.
            </p>
            {options.map((option) => (
              <div className="product-option-row" key={option.id}>
                <label>
                  <span>Option</span>
                  <input
                    onChange={(event) =>
                      setOptions((current) =>
                        current.map((item) =>
                          item.id === option.id
                            ? { ...item, name: event.target.value }
                            : item,
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
                        current.map((item) =>
                          item.id === option.id
                            ? { ...item, values: event.target.value }
                            : item,
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
                      current.filter((item) => item.id !== option.id),
                    )
                  }
                  type="button"
                >
                  <X size={16} />
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
              <Plus size={15} /> Add option
            </button>
          </fieldset>
        )}

        <div className="product-policy-grid">
          <label className="operator-choice-card">
            <input name="membershipRequired" type="checkbox" value="true" />
            <span>
              <strong>Membership required</strong>
              Only active members may purchase or join.
            </span>
          </label>
          <label className="operator-choice-card">
            <input name="taxable" type="checkbox" value="true" />
            <span>
              <strong>Taxable</strong>
              Use the organization, venue, or shipping tax location.
            </span>
          </label>
        </div>
        <label>
          <span>Tax code · optional</span>
          <input name="stripeTaxCode" placeholder="txcd_99999999" />
        </label>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>Create this as a private draft.</strong>
            Pricing and fulfillment can be reviewed before publication.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton
            disabled={
              variantCount > 500 || (!allowCard && !allowCash && !allowCredits)
            }
            pending={pending}
          >
            Create product draft
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

export function InventoryComposer({
  catalogItemId,
  workspace,
}: {
  readonly catalogItemId?: string;
  readonly workspace: OperatorWorkspace;
}) {
  const goods = workspace.catalog.filter(
    (item) =>
      item.type === "good" && (!catalogItemId || item.id === catalogItemId),
  );
  const variants = goods.flatMap((item) =>
    item.variants.map((variant) => ({ item, variant })),
  );
  const receiptHistory = workspace.inventory
    .filter(
      (receipt) => !catalogItemId || receipt.catalogItemId === catalogItemId,
    )
    .toSorted(
      (left, right) =>
        new Date(right.receivedAt).getTime() -
        new Date(left.receivedAt).getTime(),
    );
  const [trackingMode, setTrackingMode] = useState<"quantity" | "serialized">(
    "quantity",
  );
  const [state, action, pending] = useActionState(
    createInventoryStockAction,
    initialState,
  );
  return (
    <section className="hq-card operator-control-card inventory-composer">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Goods + equipment</span>
          <h2>Receive another cost layer</h2>
          <p>
            Record each shipment or contribution separately so quantity, source,
            and historical cost stay intact.
          </p>
        </div>
        <Boxes aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label className="operator-field--wide">
            <span>Product variant</span>
            <select
              disabled={variants.length === 0}
              name="catalogVariantId"
              required
            >
              {variants.map(({ item, variant }) => (
                <option key={variant.id} value={variant.id}>
                  {item.title} · {variant.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Purpose</span>
            <select defaultValue="sale" name="purpose">
              <option value="sale">For sale</option>
              <option value="rental">For rent</option>
              <option value="coach-use">Coach use</option>
              <option value="operations">Operations</option>
            </select>
          </label>
          <label>
            <span>Tracking</span>
            <select
              name="trackingMode"
              onChange={(event) =>
                setTrackingMode(
                  event.target.value === "serialized"
                    ? "serialized"
                    : "quantity",
                )
              }
              value={trackingMode}
            >
              <option value="quantity">Quantity</option>
              <option value="serialized">Individual asset</option>
            </select>
          </label>
          <label>
            <span>Location</span>
            <select name="inventoryLocationId">
              <option value="">Create or use main inventory</option>
              {workspace.inventoryLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>New location name · optional</span>
            <input name="locationName" placeholder="Coach van or main shed" />
          </label>
          <label>
            <span>Quantity</span>
            <input
              defaultValue="1"
              max={trackingMode === "serialized" ? 1 : undefined}
              min="1"
              name="quantity"
              required
              type="number"
            />
          </label>
          <label>
            <span>Reorder at</span>
            <input defaultValue="0" min="0" name="reorderPoint" type="number" />
          </label>
          {trackingMode === "serialized" && (
            <>
              <label>
                <span>Serial number</span>
                <input name="serialNumber" />
              </label>
              <label>
                <span>Asset tag</span>
                <input name="assetTag" />
              </label>
            </>
          )}
          <label>
            <span>Condition</span>
            <select defaultValue="new" name="condition">
              <option value="new">New</option>
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="repair">Needs repair</option>
            </select>
          </label>
          <MoneyField
            helper="Enter the invoice or receipt total for this quantity. Duna calculates the per-unit layer."
            label="Total receipt cost · all units"
            name="totalCost"
          />
          <label>
            <span>Date purchased</span>
            <input name="acquiredAt" type="date" />
          </label>
          <label>
            <span>Purchased from</span>
            <input name="vendorName" placeholder="Vendor or retailer" />
          </label>
          <label>
            <span>Receipt or invoice URL</span>
            <input name="receiptUrl" type="url" />
          </label>
          <label>
            <span>Placed in service</span>
            <input name="placedInServiceAt" type="date" />
          </label>
          <label>
            <span>Depreciation treatment</span>
            <select defaultValue="none" name="depreciationMethod">
              <option value="none">Track cost only</option>
              <option value="straight-line">Straight line</option>
              <option value="declining-balance">Declining balance</option>
              <option value="section-179">Section 179 candidate</option>
              <option value="bonus">Bonus depreciation candidate</option>
            </select>
          </label>
          <label>
            <span>Useful life · months</span>
            <input min="1" name="usefulLifeMonths" type="number" />
          </label>
          <MoneyField label="Salvage value" name="salvageValue" />
          <label className="operator-field--wide">
            <span>Notes</span>
            <textarea name="notes" rows={3} />
          </label>
        </div>
        <div className="operator-legal-boundary">
          <ReceiptText aria-hidden size={18} />
          <p>
            Duna tracks acquisition and book-value inputs for reporting. Tax
            treatment still requires the operator or their tax professional to
            confirm.
          </p>
        </div>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>I checked the quantity and cost.</strong>
            Receiving inventory creates an append-only movement record.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton disabled={variants.length === 0} pending={pending}>
            Receive inventory
          </SubmitButton>
        </div>
      </form>
      {receiptHistory.length > 0 && (
        <div className="inventory-receipt-history">
          <header>
            <div>
              <strong>Receipt history</strong>
              <small>
                Every row is a distinct cost layer; sold-out layers remain in
                history.
              </small>
            </div>
            <Badge>{receiptHistory.length} layers</Badge>
          </header>
          <div>
            {receiptHistory.slice(0, 12).map((receipt) => (
              <article key={receipt.id}>
                <span>
                  <strong>{receipt.itemTitle}</strong>
                  <small>
                    {receipt.variantTitle} · {receipt.locationName}
                  </small>
                </span>
                <span>
                  <small>Received</small>
                  <strong>{receipt.quantityReceived}</strong>
                </span>
                <span>
                  <small>Still on hand</small>
                  <strong>{receipt.quantityOnHand}</strong>
                </span>
                <span>
                  <small>Unit cost</small>
                  <strong>
                    {receipt.unitCostMinor === undefined
                      ? "Not entered"
                      : new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency:
                            receipt.currency ?? workspace.organization.currency,
                        }).format(receipt.unitCostMinor / 100)}
                  </strong>
                </span>
                <span>
                  <small>Receipt total</small>
                  <strong>
                    {receipt.totalCostMinor === undefined
                      ? "Not entered"
                      : new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency:
                            receipt.currency ?? workspace.organization.currency,
                        }).format(receipt.totalCostMinor / 100)}
                  </strong>
                </span>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function CatalogStatusRow({
  item,
}: {
  readonly item: OperatorWorkspace["catalog"][number];
}) {
  const [state, action, pending] = useActionState(
    setCatalogItemStatusAction,
    initialState,
  );
  const nextStatus = item.status === "active" ? "draft" : "active";
  const inventoryOnlyGood =
    item.type === "good" && item.configuration.saleEnabled === false;
  return (
    <article className="catalog-status-row">
      <div className="catalog-status-row__summary">
        <Badge
          tone={
            item.status === "active"
              ? "positive"
              : item.status === "archived"
                ? "warning"
                : "neutral"
          }
        >
          {item.status}
        </Badge>
        <span>
          <strong>{item.title}</strong>
          <small>
            {item.type} · {item.subtype} · {item.visibility}
          </small>
        </span>
      </div>
      <div className="catalog-status-actions">
        <form action={action}>
          <input name="catalogItemId" type="hidden" value={item.id} />
          <input name="status" type="hidden" value={nextStatus} />
          <input name="confirmed" type="hidden" value="true" />
          <SubmitButton
            disabled={inventoryOnlyGood}
            pending={pending}
            secondary={item.status !== "draft"}
          >
            {inventoryOnlyGood
              ? "Set sales first"
              : item.status === "draft"
                ? "Publish"
                : item.status === "active"
                  ? "Move to draft"
                  : "Restore + publish"}
          </SubmitButton>
        </form>
        {item.status !== "archived" && (
          <form action={action}>
            <input name="catalogItemId" type="hidden" value={item.id} />
            <input name="status" type="hidden" value="archived" />
            <input name="confirmed" type="hidden" value="true" />
            <button
              className="catalog-archive-button"
              disabled={pending}
              type="submit"
            >
              Archive
            </button>
          </form>
        )}
      </div>
      <ActionNotice state={state} />
    </article>
  );
}

function CatalogStatusControls({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  if (workspace.catalog.length === 0) return null;
  return (
    <section className="hq-card operator-control-card catalog-status-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Publication</span>
          <h2>Review before it goes live.</h2>
          <p>
            Duna checks pricing, payment readiness, recurring billing, credit
            grants, and tax location before publishing.
          </p>
        </div>
        <ShieldCheck aria-hidden size={24} />
      </header>
      <div className="catalog-status-list">
        {workspace.catalog.map((item) => (
          <CatalogStatusRow item={item} key={item.id} />
        ))}
      </div>
    </section>
  );
}

export function ProductCatalogControls({
  focused = false,
  waivers,
  workspace,
}: {
  readonly focused?: boolean;
  readonly waivers?: WaiverWorkspace;
  readonly workspace: OperatorWorkspace;
}) {
  if (focused)
    return <GuidedProductBuilder waivers={waivers} workspace={workspace} />;
  return (
    <div className="commerce-controls">
      <GuidedProductBuilder waivers={waivers} workspace={workspace} />
      <CatalogStatusControls workspace={workspace} />
      <div className="operator-controls-grid">
        <InventoryComposer workspace={workspace} />
        <section className="hq-card operator-control-card recommendation-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Duna recommendations</span>
              <h2>Keep the offer simple.</h2>
              <p>
                Suggestions are grounded in what this organization has set up.
              </p>
            </div>
            <Sparkles aria-hidden size={24} />
          </header>
          <div className="recommendation-list">
            {workspace.recommendations.map((recommendation) => (
              <article key={recommendation.id}>
                <Badge
                  tone={
                    recommendation.tone === "attention" ? "warning" : "neutral"
                  }
                >
                  {recommendation.tone}
                </Badge>
                <strong>{recommendation.title}</strong>
                <p>{recommendation.detail}</p>
                <a href={recommendation.href}>{recommendation.action}</a>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function PeopleWalletControls({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    issueOrganizationCreditsAction,
    initialState,
  );
  return (
    <section className="hq-card operator-control-card credit-adjustment-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Organization wallet</span>
          <h2>Issue credits</h2>
          <p>
            Credits are usable only with {workspace.organization.name}. Every
            adjustment posts an equal debit and credit to the organization
            subledger.
          </p>
        </div>
        <WalletCards aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Person</span>
            <select
              disabled={workspace.people.length === 0}
              name="personId"
              required
            >
              {workspace.people.map((person) => (
                <option key={person.personId} value={person.personId}>
                  {person.displayName} · {person.creditBalance} credits
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Credits</span>
            <input min="1" name="credits" required type="number" />
          </label>
          <label>
            <span>Expires · optional</span>
            <input name="expiresAt" type="datetime-local" />
          </label>
          <label>
            <span>Reason</span>
            <input
              name="reason"
              placeholder="Service recovery, refund, or manual adjustment"
              required
            />
          </label>
        </div>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>Post this credit adjustment.</strong>
            This creates an auditable journal and cannot be silently edited.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton
            disabled={workspace.people.length === 0}
            pending={pending}
          >
            Issue credits
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

export function PeopleRefundControls({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const purchases = workspace.people.flatMap((person) =>
    person.recentPurchases
      .filter((purchase) =>
        ["paid", "partially-refunded"].includes(purchase.status),
      )
      .map((purchase) => ({
        ...purchase,
        personName: person.displayName,
      })),
  );
  const [orderId, setOrderId] = useState(purchases[0]?.orderId ?? "");
  const [disposition, setDisposition] = useState<
    "original-payment" | "organization-credit"
  >("original-payment");
  const selected =
    purchases.find((purchase) => purchase.orderId === orderId) ?? purchases[0];
  const [state, action, pending] = useActionState(
    refundOrganizationOrderAction,
    initialState,
  );
  return (
    <section className="hq-card operator-control-card refund-composer">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Purchase care</span>
          <h2>Refund a purchase</h2>
          <p>
            Return funds through the original payment method or issue
            closed-loop organization credits. Duna records the corresponding
            reversal journal.
          </p>
        </div>
        <ReceiptText aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form" key={selected?.orderId}>
        <div className="operator-form-grid operator-form-grid--two">
          <label className="operator-field--wide">
            <span>Purchase</span>
            <select
              disabled={purchases.length === 0}
              name="orderId"
              onChange={(event) => setOrderId(event.target.value)}
              required
              value={selected?.orderId ?? ""}
            >
              {purchases.map((purchase) => (
                <option key={purchase.orderId} value={purchase.orderId}>
                  {purchase.personName} · {purchase.description} ·{" "}
                  {(purchase.amountMinor / 100).toLocaleString("en-US", {
                    style: "currency",
                    currency: purchase.currency,
                  })}
                </option>
              ))}
            </select>
          </label>
          <MoneyField
            label="Refund amount"
            name="amount"
            placeholder={
              selected ? (selected.amountMinor / 100).toFixed(2) : "0.00"
            }
          />
          <label>
            <span>Return as</span>
            <select
              name="disposition"
              onChange={(event) =>
                setDisposition(
                  event.target.value as
                    "original-payment" | "organization-credit",
                )
              }
              value={disposition}
            >
              <option value="original-payment">Original payment</option>
              <option value="organization-credit">Organization credits</option>
            </select>
          </label>
          {disposition === "organization-credit" && (
            <label>
              <span>Credits to issue</span>
              <input min="1" name="credits" required type="number" />
            </label>
          )}
          <label className="operator-field--wide">
            <span>Reason</span>
            <input
              minLength={5}
              name="reason"
              placeholder="Cancellation, service recovery, duplicate charge…"
              required
            />
          </label>
        </div>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>Review and confirm this refund.</strong>
            Original-payment refunds move real money and cannot be undone from
            Duna.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton disabled={!selected} pending={pending}>
            Submit refund
          </SubmitButton>
        </div>
      </form>
      {purchases.length === 0 && (
        <p className="hq-empty">
          Paid organization purchases will appear here.
        </p>
      )}
    </section>
  );
}

function BrandKnowledgeSourceCard({
  source,
}: {
  readonly source: OperatorWorkspace["brandKnowledge"]["sources"][number];
}) {
  const [state, action, pending] = useActionState(
    archiveBrandKnowledgeSourceAction,
    initialState,
  );
  const sourceHref = source.sourceUrl ?? source.storageUrl;
  const updated = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(source.updatedAt));
  return (
    <article className="brand-knowledge-source">
      <div className="brand-knowledge-source__icon" aria-hidden>
        {source.kind === "link" ? (
          <Link2 size={18} />
        ) : source.kind === "document" ? (
          <FileText size={18} />
        ) : (
          <BookOpen size={18} />
        )}
      </div>
      <div className="brand-knowledge-source__copy">
        <div className="brand-knowledge-source__title">
          <strong>{source.title}</strong>
          <span
            className={`brand-knowledge-status brand-knowledge-status--${source.status}`}
          >
            {source.status}
          </span>
        </div>
        <p>{source.contentText}</p>
        <small>
          {source.scope} · {source.kind} · updated {updated}
        </small>
        {source.failureReason && (
          <span className="brand-knowledge-source__error">
            {source.failureReason}
          </span>
        )}
      </div>
      <div className="brand-knowledge-source__actions">
        {sourceHref && (
          <a
            aria-label={`Open ${source.title}`}
            href={sourceHref}
            rel="noreferrer"
            target="_blank"
          >
            <Globe2 aria-hidden size={17} />
          </a>
        )}
        {source.status !== "archived" && (
          <form action={action}>
            <input name="sourceId" type="hidden" value={source.id} />
            <input name="confirmed" type="hidden" value="true" />
            <button
              aria-label={`Archive ${source.title}`}
              disabled={pending}
              type="submit"
            >
              <Archive aria-hidden size={17} />
            </button>
          </form>
        )}
      </div>
      <ActionNotice state={state} />
    </article>
  );
}

export function ThemeKitEditor({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    updateThemeAction,
    initialState,
  );
  const [knowledgeState, knowledgeAction, knowledgePending] = useActionState(
    addBrandKnowledgeSourceAction,
    initialState,
  );
  const [brandDisplayName, setBrandDisplayName] = useState(
    workspace.theme.brandDisplayName ?? workspace.organization.name,
  );
  const [membershipProgramName, setMembershipProgramName] = useState(
    workspace.theme.membershipProgramName ?? "",
  );
  const [logoUrl, setLogoUrl] = useState(workspace.theme.logoUrl ?? "");
  const [markUrl, setMarkUrl] = useState(workspace.theme.markUrl ?? "");
  const [logoLightUrl, setLogoLightUrl] = useState(
    workspace.theme.logoLightUrl ?? "",
  );
  const [logoDarkUrl, setLogoDarkUrl] = useState(
    workspace.theme.logoDarkUrl ?? "",
  );
  const [heroMediaType, setHeroMediaType] = useState<"image" | "video">(
    workspace.theme.heroMediaType ?? "image",
  );
  const [heroMediaUrl, setHeroMediaUrl] = useState(
    workspace.theme.heroMediaUrl ?? "",
  );
  const [heroPosterUrl, setHeroPosterUrl] = useState(
    workspace.theme.heroPosterUrl ?? "",
  );
  const [tagline, setTagline] = useState(workspace.theme.tagline ?? "");
  const [profileSummary, setProfileSummary] = useState(
    workspace.theme.profileSummary ?? "",
  );
  const [brandVoice, setBrandVoice] = useState(
    workspace.theme.brandVoice ?? "",
  );
  const [submittedClubColor, setSubmittedClubColor] = useState(
    workspace.theme.palette.primary,
  );
  const headingFont = "Satoshi";
  const bodyFont = "Satoshi";
  const [cardStyle, setCardStyle] = useState(workspace.theme.cardStyle);
  const [profileLayout, setProfileLayout] = useState(
    workspace.theme.profileLayout === "immersive" ||
      workspace.theme.profileLayout === "compact"
      ? workspace.theme.profileLayout
      : "editorial",
  );
  const [knowledgeKind, setKnowledgeKind] = useState<
    "note" | "link" | "document"
  >("note");
  const [mediaUploads, setMediaUploads] = useState<
    Record<BrandMediaTarget, BrandMediaUpload>
  >({
    logoUrl: { status: "idle", message: "" },
    markUrl: { status: "idle", message: "" },
    logoLightUrl: { status: "idle", message: "" },
    logoDarkUrl: { status: "idle", message: "" },
    heroMediaUrl: { status: "idle", message: "" },
    heroPosterUrl: { status: "idle", message: "" },
  });
  const normalizedClubColor = useMemo(
    () => normalizeClubColor(submittedClubColor),
    [submittedClubColor],
  );
  const previewStyle = {
    "--theme-preview-primary": normalizedClubColor.core,
    "--theme-preview-accent": normalizedClubColor.edge,
    "--theme-preview-sand": normalizedClubColor.tint,
    "--theme-preview-ink": "#1B1B19",
    "--theme-preview-canvas": "#F6F5F1",
    "--theme-preview-success": "#2F6B3A",
    "--club-tint": normalizedClubColor.tint,
    "--club-edge": normalizedClubColor.edge,
    "--club-core": normalizedClubColor.core,
    "--club-ink": normalizedClubColor.ink,
    "--theme-preview-heading": `"${headingFont}", sans-serif`,
    "--theme-preview-body": `"${bodyFont}", sans-serif`,
  } as CSSProperties;
  const activeSources = workspace.brandKnowledge.sources.filter(
    (source) => source.status !== "archived",
  );

  function setMediaUpload(
    target: BrandMediaTarget,
    status: BrandMediaUpload["status"],
    message: string,
  ) {
    setMediaUploads((current) => ({
      ...current,
      [target]: { status, message },
    }));
  }

  function setBrandMediaValue(target: BrandMediaTarget, value: string) {
    if (target === "logoUrl") setLogoUrl(value);
    if (target === "markUrl") setMarkUrl(value);
    if (target === "logoLightUrl") setLogoLightUrl(value);
    if (target === "logoDarkUrl") setLogoDarkUrl(value);
    if (target === "heroMediaUrl") setHeroMediaUrl(value);
    if (target === "heroPosterUrl") setHeroPosterUrl(value);
  }

  function updateHeroMediaUrl(value: string) {
    setHeroMediaUrl(value);
    setHeroMediaType(inferMediaKindFromUrl(value) ?? "image");
    setMediaUpload("heroMediaUrl", "idle", "");
  }

  async function uploadBrandMedia(
    file: File | undefined,
    target: BrandMediaTarget,
  ) {
    if (!file) return;
    if (target !== "heroMediaUrl" && !file.type.startsWith("image/")) {
      setMediaUpload(
        target,
        "error",
        target === "heroPosterUrl"
          ? "Choose an image for the video poster."
          : "Choose an image for this logo.",
      );
      return;
    }
    setMediaUpload(target, "uploading", "Preparing your file…");
    try {
      const prepared = file.type.startsWith("image/")
        ? await optimizeImageUpload(file)
        : file;
      const stored = await upload(
        createBrandMediaPath(workspace.organization.id, prepared.type),
        prepared,
        {
          access: "public",
          clientPayload: JSON.stringify({
            organizationId: workspace.organization.id,
            fileName: prepared.name,
            contentType: prepared.type,
            size: prepared.size,
            purpose: "brand",
          }),
          contentType: prepared.type,
          handleUploadUrl: "/api/media/upload",
          onUploadProgress: ({ percentage }) => {
            setMediaUpload(
              target,
              "uploading",
              `Uploading… ${Math.round(percentage)}%`,
            );
          },
        },
      );
      if (!stored.url) {
        throw new Error("Duna storage did not return a media URL.");
      }
      setBrandMediaValue(target, stored.url);
      if (target === "heroMediaUrl") {
        setHeroMediaType(
          prepared.type.startsWith("video/") ? "video" : "image",
        );
      }
      setMediaUpload(target, "ready", "Uploaded. Save to apply it.");
    } catch (error) {
      setMediaUpload(
        target,
        "error",
        error instanceof Error ? error.message : "The upload could not finish.",
      );
    }
  }

  const mediaUploadPending = Object.values(mediaUploads).some(
    (item) => item.status === "uploading",
  );

  return (
    <section
      className="hq-card operator-control-card theme-kit-editor"
      id="theme-kit"
    >
      <header className="theme-kit-identity-header">
        <div>
          <span className="hq-eyebrow">Brand Theme Kit</span>
          <h2>One source for every branded surface.</h2>
          <p>
            Profiles, offers, messages, event posters, and Duna AI previews
            resolve this same saved identity.
          </p>
        </div>
        <span className="theme-kit-canonical">
          <ShieldCheck aria-hidden size={17} />
          Canonical identity
        </span>
      </header>

      <form action={action} className="operator-form theme-kit-form">
        <div className="theme-kit-workspace">
          <div className="theme-kit-settings">
            <section className="theme-kit-section">
              <header className="theme-kit-section__heading">
                <ShieldCheck aria-hidden size={20} />
                <div>
                  <span>Identity foundation</span>
                  <strong>Name it once. Carry its voice everywhere.</strong>
                </div>
              </header>
              <div className="operator-form-grid operator-form-grid--two">
                <label>
                  <span>Brand display name</span>
                  <input
                    maxLength={120}
                    name="brandDisplayName"
                    onChange={(event) =>
                      setBrandDisplayName(event.target.value)
                    }
                    value={brandDisplayName}
                  />
                </label>
                <label>
                  <span>Membership program name</span>
                  <input
                    maxLength={120}
                    name="membershipProgramName"
                    onChange={(event) =>
                      setMembershipProgramName(event.target.value)
                    }
                    placeholder={`${brandDisplayName || "Your brand"} Members`}
                    value={membershipProgramName}
                  />
                </label>
                <label className="operator-field--wide">
                  <span>Tagline</span>
                  <input
                    maxLength={180}
                    name="tagline"
                    onChange={(event) => setTagline(event.target.value)}
                    placeholder="Where the next point begins."
                    value={tagline}
                  />
                </label>
                <label className="operator-field--wide">
                  <span>Profile summary</span>
                  <textarea
                    maxLength={2000}
                    name="profileSummary"
                    onChange={(event) => setProfileSummary(event.target.value)}
                    placeholder="What should players and parents understand first?"
                    rows={4}
                    value={profileSummary}
                  />
                </label>
                <label className="operator-field--wide">
                  <span>Brand voice</span>
                  <textarea
                    maxLength={4000}
                    name="brandVoice"
                    onChange={(event) => setBrandVoice(event.target.value)}
                    placeholder="Describe how your organization sounds. Include words to use, words to avoid, and an example welcome message."
                    rows={5}
                    value={brandVoice}
                  />
                  <small>
                    Used as guidance for drafts. Every outbound message remains
                    reviewable before it is sent.
                  </small>
                </label>
              </div>
            </section>

            <section className="theme-kit-section">
              <header className="theme-kit-section__heading">
                <Palette aria-hidden size={20} />
                <div>
                  <span>Color system</span>
                  <strong>One club color, tuned for every surface.</strong>
                </div>
              </header>
              <div className="theme-color-system theme-color-system--normalized">
                <label className="theme-color-field theme-color-field--source">
                  <input
                    aria-label="Club color"
                    name="submittedClubColor"
                    onChange={(event) =>
                      setSubmittedClubColor(event.target.value)
                    }
                    type="color"
                    value={submittedClubColor}
                  />
                  <span>
                    <strong>Club color</strong>
                    <code>{submittedClubColor.toUpperCase()}</code>
                  </span>
                </label>
                <div
                  aria-label="Normalized club color tones"
                  className="theme-color-system__swatches"
                >
                  {[
                    ["Tint", normalizedClubColor.tint],
                    ["Edge", normalizedClubColor.edge],
                    ["Core", normalizedClubColor.core],
                    ["Ink", normalizedClubColor.ink],
                  ].map(([label, color]) => (
                    <span key={label}>
                      <i style={{ backgroundColor: color }} />
                      <small>{label}</small>
                      <code>{color}</code>
                    </span>
                  ))}
                </div>
                <p>
                  Duna tunes your color so it stays readable across the product.
                  Your hue is preserved.
                </p>
                {normalizedClubColor.conflictsWithFlare && (
                  <p className="operator-action-notice operator-action-notice--error">
                    <CircleAlert aria-hidden size={15} />
                    Choose a color farther from Duna live coral so status
                    remains unmistakable.
                  </p>
                )}
              </div>
            </section>

            <section className="theme-kit-section">
              <header className="theme-kit-section__heading">
                <ImageIcon aria-hidden size={20} />
                <div>
                  <span>Adaptive identity assets</span>
                  <strong>
                    Correct marks for light, dark, and compact use.
                  </strong>
                </div>
              </header>
              <div className="theme-asset-grid">
                {[
                  {
                    label: "Primary logo",
                    name: "logoUrl",
                    target: "logoUrl" as const,
                    value: logoUrl,
                    setter: setLogoUrl,
                    className: "theme-asset--light",
                  },
                  {
                    label: "Compact mark",
                    name: "markUrl",
                    target: "markUrl" as const,
                    value: markUrl,
                    setter: setMarkUrl,
                    className: "theme-asset--light",
                  },
                  {
                    label: "Light-surface logo",
                    name: "logoLightUrl",
                    target: "logoLightUrl" as const,
                    value: logoLightUrl,
                    setter: setLogoLightUrl,
                    className: "theme-asset--light",
                  },
                  {
                    label: "Dark-surface logo",
                    name: "logoDarkUrl",
                    target: "logoDarkUrl" as const,
                    value: logoDarkUrl,
                    setter: setLogoDarkUrl,
                    className: "theme-asset--dark",
                  },
                ].map((asset) => (
                  <div
                    className={`theme-asset ${asset.className}`}
                    key={asset.name}
                  >
                    <span
                      className="theme-asset__preview"
                      style={
                        asset.value
                          ? { backgroundImage: `url("${asset.value}")` }
                          : undefined
                      }
                    >
                      {!asset.value && brandDisplayName.slice(0, 2)}
                    </span>
                    <strong>{asset.label}</strong>
                    <small>Transparent PNG, WebP, AVIF, or JPEG</small>
                    <label className="theme-asset__upload">
                      <input
                        accept="image/avif,image/jpeg,image/png,image/webp"
                        disabled={
                          mediaUploads[asset.target].status === "uploading"
                        }
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          event.currentTarget.value = "";
                          void uploadBrandMedia(file, asset.target);
                        }}
                        type="file"
                      />
                      <span>
                        <UploadCloud aria-hidden size={15} />
                        {mediaUploads[asset.target].status === "uploading"
                          ? "Uploading…"
                          : asset.value
                            ? "Replace image"
                            : "Upload image"}
                      </span>
                    </label>
                    <details className="theme-asset__url">
                      <summary>Use a hosted URL instead</summary>
                      <input
                        aria-label={`${asset.label} URL`}
                        name={asset.name}
                        onChange={(event) => asset.setter(event.target.value)}
                        placeholder="https://…"
                        type="url"
                        value={asset.value}
                      />
                    </details>
                    {mediaUploads[asset.target].message && (
                      <span
                        aria-live="polite"
                        className={`theme-media-status theme-media-status--${mediaUploads[asset.target].status}`}
                      >
                        {mediaUploads[asset.target].message}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="theme-kit-section">
              <header className="theme-kit-section__heading">
                <ImageIcon aria-hidden size={20} />
                <div>
                  <span>Hero media</span>
                  <strong>
                    Set the atmosphere without hiding the utility.
                  </strong>
                </div>
              </header>
              <label className="theme-hero-upload">
                <span
                  className="theme-hero-upload__preview"
                  style={
                    heroMediaType === "image" && heroMediaUrl
                      ? { backgroundImage: `url("${heroMediaUrl}")` }
                      : heroMediaType === "video" && heroPosterUrl
                        ? { backgroundImage: `url("${heroPosterUrl}")` }
                        : undefined
                  }
                >
                  {heroMediaType === "video" && heroMediaUrl ? (
                    <span>Video ready</span>
                  ) : !heroMediaUrl ? (
                    <ImageIcon aria-hidden size={24} />
                  ) : null}
                </span>
                <span className="theme-hero-upload__copy">
                  <strong>
                    {mediaUploads.heroMediaUrl.status === "uploading"
                      ? mediaUploads.heroMediaUrl.message
                      : heroMediaUrl
                        ? "Replace hero media"
                        : "Upload a hero image or video"}
                  </strong>
                  <small>
                    Duna optimizes images. Videos upload directly and may take a
                    moment.
                  </small>
                </span>
                <span className="theme-hero-upload__button">
                  <UploadCloud aria-hidden size={16} /> Choose file
                </span>
                <input
                  accept="image/avif,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                  disabled={mediaUploads.heroMediaUrl.status === "uploading"}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    void uploadBrandMedia(file, "heroMediaUrl");
                  }}
                  type="file"
                />
              </label>
              {mediaUploads.heroMediaUrl.message &&
                mediaUploads.heroMediaUrl.status !== "uploading" && (
                  <span
                    aria-live="polite"
                    className={`theme-media-status theme-media-status--${mediaUploads.heroMediaUrl.status}`}
                  >
                    {mediaUploads.heroMediaUrl.message}
                  </span>
                )}
              <div className="operator-form-grid operator-form-grid--two">
                <input
                  name="heroMediaType"
                  type="hidden"
                  value={heroMediaType}
                />
                <label>
                  <span>Layout</span>
                  <select
                    name="profileLayout"
                    onChange={(event) =>
                      setProfileLayout(
                        event.target.value === "immersive" ||
                          event.target.value === "compact"
                          ? event.target.value
                          : "editorial",
                      )
                    }
                    value={profileLayout}
                  >
                    <option value="editorial">Editorial</option>
                    <option value="immersive">Immersive hero</option>
                    <option value="compact">Compact utility</option>
                  </select>
                </label>
                <label className="operator-field--wide">
                  <span>Hosted image or video URL · optional</span>
                  <input
                    name="heroMediaUrl"
                    onChange={(event) => updateHeroMediaUrl(event.target.value)}
                    placeholder="https://…"
                    type="url"
                    value={heroMediaUrl}
                  />
                  <small className="theme-media-detection">
                    {heroMediaUrl
                      ? `${heroMediaType === "video" ? "Video" : "Image"} detected automatically from the uploaded file or hosted URL.`
                      : "Image or video type is detected automatically after upload or when you add a hosted URL."}
                  </small>
                </label>
                <div className="operator-field--wide theme-poster-field">
                  <span
                    className="theme-poster-field__preview"
                    style={
                      heroPosterUrl
                        ? { backgroundImage: `url("${heroPosterUrl}")` }
                        : undefined
                    }
                  >
                    {!heroPosterUrl && <ImageIcon aria-hidden size={20} />}
                  </span>
                  <span className="theme-poster-field__copy">
                    <strong>Video poster image · optional</strong>
                    <small>Shown while a video loads or cannot autoplay.</small>
                  </span>
                  <label className="theme-asset__upload">
                    <input
                      accept="image/avif,image/jpeg,image/png,image/webp"
                      disabled={
                        mediaUploads.heroPosterUrl.status === "uploading"
                      }
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        void uploadBrandMedia(file, "heroPosterUrl");
                      }}
                      type="file"
                    />
                    <span>
                      <UploadCloud aria-hidden size={15} />
                      {mediaUploads.heroPosterUrl.status === "uploading"
                        ? "Uploading…"
                        : heroPosterUrl
                          ? "Replace image"
                          : "Upload image"}
                    </span>
                  </label>
                  <details className="theme-asset__url">
                    <summary>Use a hosted URL instead</summary>
                    <input
                      aria-label="Video poster image URL"
                      onChange={(event) => {
                        setHeroPosterUrl(event.target.value);
                        setMediaUpload("heroPosterUrl", "idle", "");
                      }}
                      placeholder="https://…"
                      type="url"
                      value={heroPosterUrl}
                    />
                  </details>
                  <input
                    name="heroPosterUrl"
                    type="hidden"
                    value={heroPosterUrl}
                  />
                  {mediaUploads.heroPosterUrl.message && (
                    <span
                      aria-live="polite"
                      className={`theme-media-status theme-media-status--${mediaUploads.heroPosterUrl.status}`}
                    >
                      {mediaUploads.heroPosterUrl.message}
                    </span>
                  )}
                </div>
              </div>
            </section>

            <section className="theme-kit-section">
              <header className="theme-kit-section__heading">
                <Type aria-hidden size={20} />
                <div>
                  <span>Type & licensing</span>
                  <strong>Brand type, with resilient fallbacks.</strong>
                </div>
              </header>
              <div className="operator-form-grid operator-form-grid--two">
                <input name="headingFont" type="hidden" value="Satoshi" />
                <input name="bodyFont" type="hidden" value="Satoshi" />
                <div className="operator-field--wide theme-kit-type-lock">
                  <span>Typography system</span>
                  <strong>Satoshi throughout the Duna product.</strong>
                  <p>
                    Duna keeps type consistent and licensed across club pages.
                    Your submitted color, imagery, mark, and voice carry the
                    club identity.
                  </p>
                </div>
                <label>
                  <span>Card style</span>
                  <select
                    name="cardStyle"
                    onChange={(event) =>
                      setCardStyle(
                        event.target.value === "crisp" ||
                          event.target.value === "borderless"
                          ? event.target.value
                          : "soft",
                      )
                    }
                    value={cardStyle}
                  >
                    <option value="soft">Soft</option>
                    <option value="crisp">Crisp</option>
                    <option value="borderless">Borderless</option>
                  </select>
                </label>
                <input
                  name="safeFallbackFont"
                  type="hidden"
                  value="Satoshi, sans-serif"
                />
              </div>
              <input name="fontLicenseConfirmed" type="hidden" value="true" />
            </section>
          </div>

          <aside
            className={`theme-kit-preview theme-kit-preview--${profileLayout} theme-kit-preview--${cardStyle}`}
            style={previewStyle}
          >
            <span className="hq-eyebrow">Live member preview</span>
            <div className="theme-kit-preview__frame">
              <div
                className="theme-kit-preview__hero"
                style={
                  heroMediaType === "image" && heroMediaUrl
                    ? { backgroundImage: `url("${heroMediaUrl}")` }
                    : heroMediaType === "video" && heroPosterUrl
                      ? { backgroundImage: `url("${heroPosterUrl}")` }
                      : undefined
                }
              >
                {heroMediaType === "video" && heroMediaUrl && (
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    poster={heroPosterUrl || undefined}
                    src={heroMediaUrl}
                  />
                )}
                {logoLightUrl || logoUrl ? (
                  <span
                    aria-label={`${brandDisplayName} logo`}
                    className="theme-kit-preview__logo"
                    role="img"
                    style={{
                      backgroundImage: `url("${logoLightUrl || logoUrl}")`,
                    }}
                  />
                ) : (
                  <span>{brandDisplayName.slice(0, 2)}</span>
                )}
              </div>
              <div className="theme-kit-preview__copy">
                <small>{brandDisplayName}</small>
                <h3>{tagline || "Make every session count."}</h3>
                <p>
                  {profileSummary ||
                    "A clear, welcoming home for your community, schedule, and offers."}
                </p>
              </div>
              <div className="theme-kit-preview__cards">
                <article>
                  <small>Next up</small>
                  <strong>Community open play</strong>
                  <span>8 spots · 6:00 PM</span>
                </article>
                <article>
                  <small>{membershipProgramName || "For members"}</small>
                  <strong>Book with one tap</strong>
                  <span>Credits and access apply automatically</span>
                </article>
              </div>
              <button type="button">Explore the schedule</button>
            </div>
            <div className="theme-kit-preview__voice">
              <Sparkles aria-hidden size={17} />
              <div>
                <small>Voice sample</small>
                <p>
                  {brandVoice ||
                    "Welcome back. We found a few sessions that fit the way you like to play."}
                </p>
              </div>
            </div>
          </aside>
        </div>

        <label className="operator-switch">
          <input
            defaultChecked={Boolean(workspace.theme.publishedAt)}
            name="publish"
            type="checkbox"
            value="true"
          />
          <span>
            <strong>Apply this identity to player-facing surfaces</strong>
            Leave off while the first Theme Kit is still being prepared.
          </span>
        </label>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>I reviewed the identity and live preview.</strong>
            Saved changes become the canonical source for supported surfaces.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton
            disabled={
              normalizedClubColor.conflictsWithFlare || mediaUploadPending
            }
            pending={pending}
          >
            Save canonical Theme Kit
          </SubmitButton>
        </div>
      </form>

      <section className="brand-knowledge">
        <header className="brand-knowledge__header">
          <div>
            <span className="hq-eyebrow">Brand Knowledge</span>
            <h3>Teach Duna how your business works.</h3>
            <p>
              Approve the voice, services, policies, venues, and operating
              context Duna should use when drafting and recommending.
            </p>
          </div>
          <div className="brand-knowledge__metrics">
            <span>
              <strong>{workspace.brandKnowledge.activeSourceCount}</strong>
              active sources
            </span>
            <span>
              <strong>
                {workspace.brandKnowledge.contextRevision.slice(0, 8)}
              </strong>
              context revision
            </span>
          </div>
        </header>

        <div className="brand-knowledge__workspace">
          <form
            action={knowledgeAction}
            className="brand-knowledge-composer operator-form"
          >
            <div className="brand-knowledge-composer__heading">
              <Sparkles aria-hidden size={20} />
              <div>
                <strong>Add approved knowledge</strong>
                <span>
                  Nothing joins Duna AI context until an operator confirms it.
                </span>
              </div>
            </div>
            <fieldset className="brand-knowledge-choice-grid">
              <legend>Source type</legend>
              {[
                {
                  value: "note",
                  label: "Knowledge note",
                  help: "A direct fact, rule, or brand instruction",
                  icon: BookOpen,
                },
                {
                  value: "link",
                  label: "Approved link",
                  help: "A public page plus your approved summary",
                  icon: Link2,
                },
                {
                  value: "document",
                  label: "Document",
                  help: "A private file reference plus approved summary",
                  icon: FileText,
                },
              ].map((option) => {
                const Icon = option.icon;
                return (
                  <label
                    className={
                      knowledgeKind === option.value ? "is-selected" : ""
                    }
                    key={option.value}
                  >
                    <input
                      checked={knowledgeKind === option.value}
                      name="kind"
                      onChange={() =>
                        setKnowledgeKind(
                          option.value as "note" | "link" | "document",
                        )
                      }
                      type="radio"
                      value={option.value}
                    />
                    <Icon aria-hidden size={19} />
                    <strong>{option.label}</strong>
                    <small>{option.help}</small>
                  </label>
                );
              })}
            </fieldset>
            <div className="operator-form-grid operator-form-grid--two">
              <label>
                <span>Knowledge scope</span>
                <select defaultValue="brand" name="scope">
                  <option value="brand">Brand-wide</option>
                  <option value="organization">Organization operations</option>
                  <option value="venue">Venue-specific</option>
                  <option value="service">Service-specific</option>
                  <option value="product">Product-specific</option>
                </select>
              </label>
              <label>
                <span>Source title</span>
                <input
                  maxLength={160}
                  name="title"
                  placeholder="Youth clinic voice & expectations"
                  required
                />
              </label>
              {knowledgeKind === "link" && (
                <label className="operator-field--wide">
                  <span>Public source URL</span>
                  <input name="sourceUrl" required type="url" />
                </label>
              )}
              {knowledgeKind === "document" && (
                <>
                  <label>
                    <span>Secure document URL</span>
                    <input name="storageUrl" required type="url" />
                  </label>
                  <label>
                    <span>File name</span>
                    <input
                      name="originalFilename"
                      placeholder="club-handbook.pdf"
                      required
                    />
                  </label>
                  <label className="operator-field--wide">
                    <span>File type</span>
                    <input name="mimeType" placeholder="application/pdf" />
                  </label>
                </>
              )}
              <label className="operator-field--wide">
                <span>Approved knowledge</span>
                <textarea
                  maxLength={100000}
                  minLength={20}
                  name="contentText"
                  placeholder={
                    knowledgeKind === "note"
                      ? "State the fact, policy, preference, or voice instruction Duna should use."
                      : "Summarize exactly what Duna is approved to learn and use from this source."
                  }
                  required
                  rows={6}
                />
                <small>
                  Be explicit. Duna uses this text as the approved context and
                  retains the source for traceability.
                </small>
              </label>
            </div>
            <label className="operator-confirmation">
              <input name="confirmed" required type="checkbox" value="true" />
              <span>
                <strong>I approve this source for Duna AI.</strong>
                It may inform drafts and recommendations, but never bypasses
                product, safety, legal, access, pricing, or payment controls.
              </span>
            </label>
            <div className="operator-form-footer">
              <ActionNotice state={knowledgeState} />
              <SubmitButton pending={knowledgePending}>
                Approve and add source
              </SubmitButton>
            </div>
          </form>

          <aside className="brand-knowledge-context">
            <div className="brand-knowledge-context__heading">
              <ShieldCheck aria-hidden size={22} />
              <div>
                <span className="hq-eyebrow">Effective AI context</span>
                <strong>Grounded, scoped, and reviewable.</strong>
              </div>
            </div>
            <div className="brand-knowledge-context__preview">
              <small>What Duna currently knows</small>
              {workspace.brandKnowledge.contextPreview.length > 0 ? (
                <ul>
                  {workspace.brandKnowledge.contextPreview.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p>
                  Add the first approved source to create this organization’s
                  grounded brand context.
                </p>
              )}
            </div>
            <div className="brand-knowledge-context__rules">
              <small>Always authoritative</small>
              <ul>
                {workspace.brandKnowledge.safetyRules.map((rule) => (
                  <li key={rule}>
                    <ShieldCheck aria-hidden size={15} />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        <div className="brand-knowledge-library">
          <div className="brand-knowledge-library__heading">
            <div>
              <span className="hq-eyebrow">Source library</span>
              <h4>
                {activeSources.length === 0
                  ? "No approved sources yet."
                  : `${activeSources.length} approved ${
                      activeSources.length === 1 ? "source" : "sources"
                    }`}
              </h4>
            </div>
            <span>
              Archived sources stay in the audit trail and leave active AI
              context immediately.
            </span>
          </div>
          {workspace.brandKnowledge.sources.length > 0 ? (
            <div className="brand-knowledge-source-list">
              {workspace.brandKnowledge.sources.map((source) => (
                <BrandKnowledgeSourceCard key={source.id} source={source} />
              ))}
            </div>
          ) : (
            <div className="brand-knowledge-empty">
              <BookOpen aria-hidden size={22} />
              <div>
                <strong>Start with the facts your team repeats most.</strong>
                <span>
                  Voice guidance, service descriptions, venue details, and
                  approved FAQs are good first sources.
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function TaxSettingsEditor({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    updateCommerceSettingsAction,
    initialState,
  );
  return (
    <section className="hq-card operator-control-card" id="tax">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Business + tax location</span>
          <h2>Organization address</h2>
          <p>
            Duna uses this as the fallback taxable location. In-person sales use
            the venue address, and shipped goods use the delivery address.
          </p>
        </div>
        <ShieldCheck aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label className="operator-field--wide">
            <span>Legal business name</span>
            <input
              defaultValue={workspace.organization.legalName}
              name="legalName"
            />
          </label>
          <AddressEntry
            initial={{
              googlePlaceId: workspace.organization.googlePlaceId,
              addressLine1: workspace.organization.addressLine1,
              addressLine2: workspace.organization.addressLine2,
              locality: workspace.organization.locality,
              administrativeArea: workspace.organization.administrativeArea,
              postalCode: workspace.organization.postalCode,
              countryCode: workspace.organization.countryCode,
              latitude: workspace.organization.latitude,
              longitude: workspace.organization.longitude,
            }}
            label="Business address"
            required
          />
        </div>
        <label className="operator-switch">
          <input
            defaultChecked={workspace.organization.stripeTaxEnabled}
            name="stripeTaxEnabled"
            type="checkbox"
            value="true"
          />
          <span>
            <strong>Calculate eligible tax automatically</strong>
            Requires completed payment onboarding and appropriate tax
            registrations.
          </span>
        </label>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>I checked the legal address.</strong>
            Duna will not register the business for taxes or make legal
            attestations on its behalf.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton pending={pending}>Save business settings</SubmitButton>
        </div>
      </form>
    </section>
  );
}

export function CommerceSettingsControls({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  return (
    <div className="operator-controls-grid">
      <ThemeKitEditor workspace={workspace} />
      <TaxSettingsEditor workspace={workspace} />
    </div>
  );
}
