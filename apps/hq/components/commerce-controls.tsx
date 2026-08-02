"use client";

import type { OperatorWorkspace } from "@duna/api";
import { Badge } from "@duna/ui";
import {
  Boxes,
  CalendarDays,
  Check,
  CircleAlert,
  CreditCard,
  Plus,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trophy,
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
  createCatalogItemAction,
  createInventoryStockAction,
  issueOrganizationCreditsAction,
  refundOrganizationOrderAction,
  setCatalogItemStatusAction,
  updateCommerceSettingsAction,
  updateThemeAction,
  type OperatorActionState,
} from "@/app/actions";
import { PlaceAddressFields } from "./place-address-fields";

const initialState: OperatorActionState = { status: "idle", message: "" };

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

function ProductComposer({
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

function InventoryComposer({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const goods = workspace.catalog.filter((item) => item.type === "good");
  const variants = goods.flatMap((item) =>
    item.variants.map((variant) => ({ item, variant })),
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
          <h2>Receive inventory</h2>
          <p>
            Record stock for sale, rental, coach use, or operations—including
            cost basis and depreciation details.
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
          <MoneyField label="Price paid per item" name="unitCost" />
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
          <SubmitButton pending={pending} secondary={item.status !== "draft"}>
            {item.status === "draft"
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
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  return (
    <div className="commerce-controls">
      <ProductComposer workspace={workspace} />
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

function ThemeKitEditor({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    updateThemeAction,
    initialState,
  );
  const [logoUrl, setLogoUrl] = useState(workspace.theme.logoUrl ?? "");
  const [heroMediaType, setHeroMediaType] = useState<"image" | "video">(
    workspace.theme.heroMediaType ?? "image",
  );
  const [heroMediaUrl, setHeroMediaUrl] = useState(
    workspace.theme.heroMediaUrl ?? "",
  );
  const [tagline, setTagline] = useState(workspace.theme.tagline ?? "");
  const [profileSummary, setProfileSummary] = useState(
    workspace.theme.profileSummary ?? "",
  );
  const [palette, setPalette] = useState(workspace.theme.palette);
  const [headingFont, setHeadingFont] = useState(
    workspace.theme.typography.heading,
  );
  const [bodyFont, setBodyFont] = useState(workspace.theme.typography.body);
  const [cardStyle, setCardStyle] = useState(workspace.theme.cardStyle);
  const [profileLayout, setProfileLayout] = useState(
    workspace.theme.profileLayout === "immersive" ||
      workspace.theme.profileLayout === "compact"
      ? workspace.theme.profileLayout
      : "editorial",
  );
  const previewStyle = {
    "--theme-preview-primary": palette.primary,
    "--theme-preview-accent": palette.accent,
    "--theme-preview-sand": palette.sand,
    "--theme-preview-ink": palette.ink,
    "--theme-preview-canvas": palette.canvas,
    "--theme-preview-heading": `"${headingFont}", sans-serif`,
    "--theme-preview-body": `"${bodyFont}", sans-serif`,
  } as CSSProperties;
  return (
    <section
      className="hq-card operator-control-card theme-kit-editor"
      id="theme-kit"
    >
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Player-facing profile</span>
          <h2>Theme Kit</h2>
          <p>
            Customize the organization profile without turning setup into a
            website builder.
          </p>
        </div>
        <Sparkles aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="theme-kit-workspace">
          <div className="theme-kit-settings">
            <div className="operator-form-grid operator-form-grid--two">
              <label>
                <span>Logo URL</span>
                <input
                  name="logoUrl"
                  onChange={(event) => setLogoUrl(event.target.value)}
                  type="url"
                  value={logoUrl}
                />
              </label>
              <label>
                <span>Hero media</span>
                <select
                  name="heroMediaType"
                  onChange={(event) =>
                    setHeroMediaType(
                      event.target.value === "video" ? "video" : "image",
                    )
                  }
                  value={heroMediaType}
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </label>
              <label className="operator-field--wide">
                <span>Hero image or video URL</span>
                <input
                  name="heroMediaUrl"
                  onChange={(event) => setHeroMediaUrl(event.target.value)}
                  type="url"
                  value={heroMediaUrl}
                />
              </label>
              <label className="operator-field--wide">
                <span>Tagline</span>
                <input
                  name="tagline"
                  onChange={(event) => setTagline(event.target.value)}
                  placeholder="Where the next point begins."
                  value={tagline}
                />
              </label>
              <label className="operator-field--wide">
                <span>Profile summary</span>
                <textarea
                  name="profileSummary"
                  onChange={(event) => setProfileSummary(event.target.value)}
                  rows={4}
                  value={profileSummary}
                />
              </label>
              {Object.entries(palette).map(([name, value]) => (
                <label className="theme-color-field" key={name}>
                  <span>{name}</span>
                  <input
                    name={name}
                    onChange={(event) =>
                      setPalette((current) => ({
                        ...current,
                        [name]: event.target.value,
                      }))
                    }
                    type="color"
                    value={value}
                  />
                  <code>{value}</code>
                </label>
              ))}
              <label>
                <span>Heading font</span>
                <select
                  name="headingFont"
                  onChange={(event) => setHeadingFont(event.target.value)}
                  value={headingFont}
                >
                  {[
                    "Instrument Sans",
                    "DM Sans",
                    "Space Grotesk",
                    "Playfair Display",
                  ].map((font) => (
                    <option key={font}>{font}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Body font</span>
                <select
                  name="bodyFont"
                  onChange={(event) => setBodyFont(event.target.value)}
                  value={bodyFont}
                >
                  {["Archivo", "Inter", "DM Sans", "Source Sans 3"].map(
                    (font) => (
                      <option key={font}>{font}</option>
                    ),
                  )}
                </select>
              </label>
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
              <label>
                <span>Profile layout</span>
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
            </div>
          </div>
          <aside
            className={`theme-kit-preview theme-kit-preview--${profileLayout} theme-kit-preview--${cardStyle}`}
            style={previewStyle}
          >
            <span className="hq-eyebrow">Live player preview</span>
            <div
              className="theme-kit-preview__hero"
              style={
                heroMediaType === "image" && heroMediaUrl
                  ? { backgroundImage: `url("${heroMediaUrl}")` }
                  : undefined
              }
            >
              {logoUrl ? (
                <span
                  aria-label={`${workspace.organization.name} logo`}
                  className="theme-kit-preview__logo"
                  role="img"
                  style={{ backgroundImage: `url("${logoUrl}")` }}
                />
              ) : (
                <span>{workspace.organization.name.slice(0, 2)}</span>
              )}
            </div>
            <div className="theme-kit-preview__copy">
              <small>{workspace.organization.name}</small>
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
                <small>For members</small>
                <strong>Book with one tap</strong>
                <span>Credits and access apply automatically</span>
              </article>
            </div>
          </aside>
        </div>
        <label className="operator-switch">
          <input name="publish" type="checkbox" value="true" />
          <span>
            <strong>Publish after saving</strong>
            Leave off to keep this as a private draft.
          </span>
        </label>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>I reviewed the player-facing preview.</strong>
            Publishing updates the organization profile theme.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton pending={pending}>Save Theme Kit</SubmitButton>
        </div>
      </form>
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
          <PlaceAddressFields
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
