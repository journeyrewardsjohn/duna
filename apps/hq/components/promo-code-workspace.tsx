"use client";

import type { PromoCodeWorkspace } from "@duna/api";
import {
  addLocalDays,
  formatLocalDate,
  SmartDateRangePicker,
  type SmartDateRangeValue,
} from "@duna/ui";
import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  CalendarRange,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  History,
  Pencil,
  Percent,
  Search,
  ShoppingBag,
  TicketPercent,
  UsersRound,
} from "lucide-react";
import { useActionState, useMemo, useState, type ReactNode } from "react";
import {
  createPromoCodeAction,
  deactivatePromoCodeAction,
  duplicatePromoCodeAction,
  type PromoActionState,
} from "@/app/promo-codes/actions";

const initialState: PromoActionState = { status: "idle", message: "" };
const creationSteps = [
  { label: "The offer", shortLabel: "Offer" },
  { label: "Eligible purchases", shortLabel: "Purchases" },
  { label: "Availability", shortLabel: "Availability" },
  { label: "Review and create", shortLabel: "Review" },
] as const;

type DiscountType = "percent" | "amount";
type ScopeMode = "everything" | "categories" | "offers";
type ScheduleMode = "always" | "window";
type AudienceMode = "everyone" | "selected";
type PromoCodeRecord = PromoCodeWorkspace["promoCodes"][number];

function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function displayMoney(value: string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return money(0, currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function displayDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function inputMoney(minor: number | null) {
  return minor === null ? "" : (minor / 100).toFixed(2);
}

function localDateTime(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${formatLocalDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextRevisionCode(promo: PromoCodeRecord) {
  const suffix = `-V${promo.revision + 1}`;
  return `${promo.code.slice(0, 48 - suffix.length)}${suffix}`;
}

function ChoiceCard({
  active,
  detail,
  icon,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly detail: string;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`promo-choice-card${active ? " is-active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className="promo-choice-card__icon">{icon}</span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <span className="promo-choice-card__check" aria-hidden>
        {active ? <Check size={14} /> : null}
      </span>
    </button>
  );
}

function ToggleField({
  checked,
  children,
  detail,
  label,
  onChange,
}: {
  readonly checked: boolean;
  readonly children?: ReactNode;
  readonly detail: string;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <div className={`promo-toggle-field${checked ? " is-active" : ""}`}>
      <label>
        <span>
          <strong>{label}</strong>
          <small>{detail}</small>
        </span>
        <input
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span className="promo-switch" aria-hidden />
      </label>
      {checked ? children : null}
    </div>
  );
}

export function PromoCodeWorkspaceView({
  workspace,
}: {
  readonly workspace: PromoCodeWorkspace;
}) {
  const [state, action, pending] = useActionState(
    createPromoCodeAction,
    initialState,
  );
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [stepMessage, setStepMessage] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [hasMinimumPurchase, setHasMinimumPurchase] = useState(false);
  const [minimumPurchase, setMinimumPurchase] = useState("");
  const [hasMaximumDiscount, setHasMaximumDiscount] = useState(false);
  const [maximumDiscount, setMaximumDiscount] = useState("");
  const [scopeMode, setScopeMode] = useState<ScopeMode>("everything");
  const [allPlans, setAllPlans] = useState(false);
  const [allServices, setAllServices] = useState(false);
  const [allProducts, setAllProducts] = useState(false);
  const [scopeSearch, setScopeSearch] = useState("");
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<
    readonly string[]
  >([]);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("always");
  const [schedule, setSchedule] = useState<SmartDateRangeValue>({
    start: "",
    end: "",
  });
  const [redemptionLimited, setRedemptionLimited] = useState(false);
  const [redemptionCap, setRedemptionCap] = useState("");
  const [perMemberLimited, setPerMemberLimited] = useState(false);
  const [perPersonLimit, setPerPersonLimit] = useState("1");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("everyone");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<readonly string[]>(
    [],
  );
  const [revisionSourceId, setRevisionSourceId] = useState<string | null>(null);

  const isRevision = revisionSourceId !== null;

  const active = workspace.promoCodes.filter((promo) => promo.activeNow);
  const totals = workspace.promoCodes.reduce(
    (value, promo) => ({
      redemptions: value.redemptions + promo.metrics.redemptions,
      gross: value.gross + promo.metrics.grossSalesMinor,
      discounts: value.discounts + promo.metrics.discountsMinor,
    }),
    { redemptions: 0, gross: 0, discounts: 0 },
  );
  const visibleCatalog = workspace.catalog.filter((item) =>
    `${item.title} ${item.type} ${item.subtype}`
      .toLowerCase()
      .includes(scopeSearch.toLowerCase()),
  );
  const visibleMembers = workspace.members.filter((member) =>
    `${member.displayName} ${member.email ?? ""}`
      .toLowerCase()
      .includes(memberSearch.toLowerCase()),
  );
  const selectedCatalog = workspace.catalog.filter((item) =>
    selectedCatalogIds.includes(item.id),
  );
  const selectedMembers = workspace.members.filter((member) =>
    selectedMemberIds.includes(member.id),
  );
  const resolvedAllPlans =
    scopeMode === "everything" || (scopeMode === "categories" && allPlans);
  const resolvedAllServices =
    scopeMode === "everything" || (scopeMode === "categories" && allServices);
  const resolvedAllProducts =
    scopeMode === "everything" || (scopeMode === "categories" && allProducts);
  const resolvedCatalogIds =
    scopeMode === "offers" ? selectedCatalogIds : ([] as readonly string[]);
  const resolvedMemberIds =
    audienceMode === "selected" ? selectedMemberIds : ([] as readonly string[]);

  const scopeSummary = useMemo(() => {
    if (scopeMode === "everything") return "Everything you sell";
    if (scopeMode === "offers") {
      if (!selectedCatalog.length) return "No offers selected yet";
      if (selectedCatalog.length === 1) return selectedCatalog[0]!.title;
      return `${selectedCatalog.length} selected offers`;
    }
    const categories = [
      allPlans && "Plans",
      allServices && "Services",
      allProducts && "Products and events",
    ].filter(Boolean);
    return categories.length ? categories.join(", ") : "No categories selected";
  }, [allPlans, allProducts, allServices, scopeMode, selectedCatalog]);

  const audienceSummary =
    audienceMode === "everyone"
      ? "Any eligible buyer"
      : selectedMembers.length === 1
        ? selectedMembers[0]!.displayName
        : `${selectedMembers.length} selected members`;
  const availabilitySummary =
    scheduleMode === "always"
      ? "Starts now. No end date."
      : schedule.start && schedule.end
        ? `${displayDateTime(schedule.start)} to ${displayDateTime(schedule.end)}`
        : "Choose a start and end";
  const limitSummary = redemptionLimited
    ? `${redemptionCap || "0"} total uses`
    : "Unlimited total uses";
  const discountSummary =
    discountType === "percent"
      ? `${discountValue || "0"}% off`
      : `${displayMoney(discountValue, workspace.organization.currency)} off`;

  function openSchedule() {
    setScheduleMode("window");
    if (!schedule.start || !schedule.end) {
      const today = formatLocalDate(new Date());
      setSchedule({
        start: `${today}T09:00`,
        end: `${addLocalDays(today, 7)}T23:59`,
      });
    }
  }

  function validateStep(index: number) {
    if (index === 0) {
      if (!name.trim()) return "Give this promotion an internal name.";
      if (!/^[A-Z0-9-]{3,48}$/.test(code)) {
        return "Use 3–48 letters, numbers, or dashes for the customer code.";
      }
      const discount = Number(discountValue);
      if (!Number.isFinite(discount) || discount <= 0) {
        return "Add a discount greater than zero.";
      }
      if (discountType === "percent" && discount > 100) {
        return "Percentage discounts cannot exceed 100%.";
      }
      if (hasMinimumPurchase && Number(minimumPurchase) <= 0) {
        return "Add the minimum purchase amount.";
      }
      if (
        discountType === "percent" &&
        hasMaximumDiscount &&
        Number(maximumDiscount) <= 0
      ) {
        return "Add the maximum discount amount.";
      }
    }
    if (index === 1) {
      if (
        scopeMode === "categories" &&
        !allPlans &&
        !allServices &&
        !allProducts
      ) {
        return "Choose at least one purchase category.";
      }
      if (scopeMode === "offers" && selectedCatalogIds.length === 0) {
        return "Choose at least one eligible offer.";
      }
    }
    if (index === 2) {
      if (scheduleMode === "window" && (!schedule.start || !schedule.end)) {
        return "Choose the promotion start and end.";
      }
      if (
        scheduleMode === "window" &&
        new Date(schedule.end) <= new Date(schedule.start)
      ) {
        return "The promotion must end after it starts.";
      }
      if (redemptionLimited && Number(redemptionCap) < 1) {
        return "Add a total redemption limit.";
      }
      if (perMemberLimited && Number(perPersonLimit) < 1) {
        return "Add how many times each member can use the code.";
      }
      if (audienceMode === "selected" && selectedMemberIds.length === 0) {
        return "Choose at least one member or make the code available to everyone.";
      }
    }
    return "";
  }

  function continueToNextStep() {
    const message = validateStep(step);
    setStepMessage(message);
    if (message) return;
    const nextStep = Math.min(step + 1, creationSteps.length - 1);
    setStep(nextStep);
    setFurthestStep((current) => Math.max(current, nextStep));
  }

  function goToStep(index: number) {
    if (index > furthestStep) return;
    setStepMessage("");
    setStep(index);
  }

  function startRevision(promo: PromoCodeRecord) {
    const today = formatLocalDate(new Date());
    const usesSchedule = Boolean(promo.startsAt || promo.endsAt);
    const exactOffers = promo.catalogItems.length > 0;
    setRevisionSourceId(promo.id);
    setName(promo.name);
    setCode(nextRevisionCode(promo));
    setDiscountType(promo.discountType as DiscountType);
    setDiscountValue(
      promo.discountType === "percent"
        ? String(promo.discountValue / 100)
        : inputMoney(promo.discountValue),
    );
    setHasMinimumPurchase(promo.minimumPurchaseMinor !== null);
    setMinimumPurchase(inputMoney(promo.minimumPurchaseMinor));
    setHasMaximumDiscount(promo.maximumDiscountMinor !== null);
    setMaximumDiscount(inputMoney(promo.maximumDiscountMinor));
    setScopeMode(
      promo.appliesToAllPlans &&
        promo.appliesToAllServices &&
        promo.appliesToAllProducts
        ? "everything"
        : exactOffers
          ? "offers"
          : "categories",
    );
    setAllPlans(promo.appliesToAllPlans);
    setAllServices(promo.appliesToAllServices);
    setAllProducts(promo.appliesToAllProducts);
    setSelectedCatalogIds(promo.catalogItems.map((item) => item.id));
    setScheduleMode(usesSchedule ? "window" : "always");
    setSchedule({
      start: localDateTime(promo.startsAt, `${today}T09:00`),
      end: localDateTime(promo.endsAt, `${addLocalDays(today, 7)}T23:59`),
    });
    setRedemptionLimited(promo.redemptionCap !== null);
    setRedemptionCap(promo.redemptionCap?.toString() ?? "");
    setPerMemberLimited(promo.perPersonLimit !== null);
    setPerPersonLimit(promo.perPersonLimit?.toString() ?? "1");
    setAudienceMode(promo.members.length ? "selected" : "everyone");
    setSelectedMemberIds(promo.members.map((member) => member.id));
    setStep(0);
    setFurthestStep(0);
    setStepMessage("");
  }

  return (
    <div className="promo-workspace">
      <section className="promo-metrics" aria-label="Promotion performance">
        <article>
          <TicketPercent aria-hidden size={19} />
          <span>Active codes</span>
          <strong>{active.length}</strong>
        </article>
        <article>
          <UsersRound aria-hidden size={19} />
          <span>Redemptions</span>
          <strong>{totals.redemptions}</strong>
        </article>
        <article>
          <BadgeDollarSign aria-hidden size={19} />
          <span>Sales using codes</span>
          <strong>
            {money(totals.gross, workspace.organization.currency)}
          </strong>
        </article>
        <article>
          <Percent aria-hidden size={19} />
          <span>Total discounts</span>
          <strong>
            {money(totals.discounts, workspace.organization.currency)}
          </strong>
        </article>
      </section>

      <section className="promo-creator" aria-labelledby="promo-creator-title">
        <header className="promo-creator__heading">
          <div>
            <span className="hq-eyebrow">
              {isRevision ? "New promo revision" : "New promotion"}
            </span>
            <h2 id="promo-creator-title">
              {isRevision
                ? "Create the next, traceable version."
                : "Create a code customers understand."}
            </h2>
            <p>
              {isRevision
                ? "The prior code will be retained for reporting and retired only after this successor is ready."
                : "Make one decision at a time. The live summary shows exactly what a buyer will receive and every rule Duna will enforce."}
            </p>
          </div>
          <span className="promo-draft-chip">
            {isRevision ? "Revision draft" : "Draft"}
          </span>
        </header>

        <nav className="promo-stepper" aria-label="Promotion creation steps">
          {creationSteps.map((item, index) => {
            const available = index <= furthestStep;
            const complete = index < step;
            return (
              <button
                aria-current={index === step ? "step" : undefined}
                className={`${index === step ? "is-active" : ""}${complete ? " is-complete" : ""}`}
                disabled={!available}
                key={item.label}
                onClick={() => goToStep(index)}
                type="button"
              >
                <span>{complete ? <Check size={14} /> : index + 1}</span>
                <strong>{item.label}</strong>
                <small>{item.shortLabel}</small>
              </button>
            );
          })}
        </nav>

        <form action={action} className="promo-creator__form">
          <input
            name="sourcePromoCodeId"
            type="hidden"
            value={revisionSourceId ?? ""}
          />
          <input name="name" type="hidden" value={name} />
          <input name="code" type="hidden" value={code} />
          <input name="discountType" type="hidden" value={discountType} />
          <input name="discountValue" type="hidden" value={discountValue} />
          <input
            name="currency"
            type="hidden"
            value={workspace.organization.currency}
          />
          <input
            name="minimumPurchase"
            type="hidden"
            value={hasMinimumPurchase ? minimumPurchase : ""}
          />
          <input
            name="maximumDiscount"
            type="hidden"
            value={hasMaximumDiscount ? maximumDiscount : ""}
          />
          <input
            name="appliesToAllPlans"
            type="hidden"
            value={resolvedAllPlans ? "on" : ""}
          />
          <input
            name="appliesToAllServices"
            type="hidden"
            value={resolvedAllServices ? "on" : ""}
          />
          <input
            name="appliesToAllProducts"
            type="hidden"
            value={resolvedAllProducts ? "on" : ""}
          />
          <input
            name="startsAt"
            type="hidden"
            value={scheduleMode === "window" ? schedule.start : ""}
          />
          <input
            name="endsAt"
            type="hidden"
            value={scheduleMode === "window" ? schedule.end : ""}
          />
          <input
            name="redemptionCap"
            type="hidden"
            value={redemptionLimited ? redemptionCap : ""}
          />
          <input
            name="perPersonLimit"
            type="hidden"
            value={perMemberLimited ? perPersonLimit : ""}
          />
          {resolvedCatalogIds.map((id) => (
            <input key={id} name="catalogItemIds" type="hidden" value={id} />
          ))}
          {resolvedMemberIds.map((id) => (
            <input key={id} name="memberPersonIds" type="hidden" value={id} />
          ))}

          <div className="promo-stage">
            {step === 0 ? (
              <section aria-labelledby="promo-step-offer">
                <header className="promo-stage__heading">
                  <span>01</span>
                  <div>
                    <h3 id="promo-step-offer">What are you offering?</h3>
                    <p>
                      Name the campaign for your team, then set the code and
                      savings customers will see.
                    </p>
                  </div>
                </header>

                <div className="promo-field-grid promo-field-grid--two">
                  <label className="promo-field">
                    <span>Campaign name</span>
                    <input
                      autoComplete="off"
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Fall membership push"
                      required
                      value={name}
                    />
                    <small>
                      Internal only. Use a name your team will recognize.
                    </small>
                  </label>
                  <label className="promo-field">
                    <span>Customer code</span>
                    <span className="promo-code-input">
                      <input
                        autoCapitalize="characters"
                        autoComplete="off"
                        onChange={(event) =>
                          setCode(
                            event.target.value
                              .toUpperCase()
                              .replaceAll(/\s+/g, "-")
                              .replaceAll(/[^A-Z0-9-]/g, ""),
                          )
                        }
                        pattern="[A-Z0-9-]{3,48}"
                        placeholder="FALL20"
                        required
                        value={code}
                      />
                      <button
                        disabled={!name.trim()}
                        onClick={() =>
                          setCode(
                            name
                              .trim()
                              .toUpperCase()
                              .replaceAll(/[^A-Z0-9]+/g, "-")
                              .replaceAll(/^-|-$/g, "")
                              .slice(0, 40),
                          )
                        }
                        type="button"
                      >
                        Use name
                      </button>
                    </span>
                    <small>3–48 letters, numbers, or dashes.</small>
                  </label>
                </div>

                <fieldset className="promo-fieldset">
                  <legend>Discount</legend>
                  <div className="promo-discount-layout">
                    <div className="promo-segmented" aria-label="Discount type">
                      <label>
                        <input
                          checked={discountType === "percent"}
                          name="discountTypeChoice"
                          onChange={() => setDiscountType("percent")}
                          type="radio"
                          value="percent"
                        />
                        <span>
                          <Percent size={17} /> Percentage
                        </span>
                      </label>
                      <label>
                        <input
                          checked={discountType === "amount"}
                          name="discountTypeChoice"
                          onChange={() => {
                            setDiscountType("amount");
                            setHasMaximumDiscount(false);
                          }}
                          type="radio"
                          value="amount"
                        />
                        <span>
                          <BadgeDollarSign size={17} /> Fixed amount
                        </span>
                      </label>
                    </div>
                    <label className="promo-field promo-field--discount">
                      <span>
                        {discountType === "percent"
                          ? "Percentage off"
                          : `${workspace.organization.currency} off`}
                      </span>
                      <span className="promo-number-input">
                        {discountType === "amount" ? <b>$</b> : null}
                        <input
                          max={discountType === "percent" ? 100 : undefined}
                          min="0.01"
                          onChange={(event) =>
                            setDiscountValue(event.target.value)
                          }
                          placeholder={
                            discountType === "percent" ? "20" : "10.00"
                          }
                          required
                          step="0.01"
                          type="number"
                          value={discountValue}
                        />
                        {discountType === "percent" ? <b>%</b> : null}
                      </span>
                    </label>
                  </div>
                </fieldset>

                <div className="promo-optional-grid">
                  <ToggleField
                    checked={hasMinimumPurchase}
                    detail="Require a minimum cart subtotal."
                    label="Set a minimum purchase"
                    onChange={setHasMinimumPurchase}
                  >
                    <label className="promo-field">
                      <span>Minimum purchase</span>
                      <span className="promo-number-input">
                        <b>$</b>
                        <input
                          min="0.01"
                          onChange={(event) =>
                            setMinimumPurchase(event.target.value)
                          }
                          placeholder="50.00"
                          step="0.01"
                          type="number"
                          value={minimumPurchase}
                        />
                      </span>
                    </label>
                  </ToggleField>
                  {discountType === "percent" ? (
                    <ToggleField
                      checked={hasMaximumDiscount}
                      detail="Protect high-value purchases with a savings cap."
                      label="Cap the discount"
                      onChange={setHasMaximumDiscount}
                    >
                      <label className="promo-field">
                        <span>Maximum discount</span>
                        <span className="promo-number-input">
                          <b>$</b>
                          <input
                            min="0.01"
                            onChange={(event) =>
                              setMaximumDiscount(event.target.value)
                            }
                            placeholder="100.00"
                            step="0.01"
                            type="number"
                            value={maximumDiscount}
                          />
                        </span>
                      </label>
                    </ToggleField>
                  ) : null}
                </div>
              </section>
            ) : null}

            {step === 1 ? (
              <section aria-labelledby="promo-step-purchases">
                <header className="promo-stage__heading">
                  <span>02</span>
                  <div>
                    <h3 id="promo-step-purchases">What can customers buy?</h3>
                    <p>
                      Keep the offer broad, choose purchase categories, or
                      target exact items in your catalog.
                    </p>
                  </div>
                </header>
                <div className="promo-choice-grid promo-choice-grid--three">
                  <ChoiceCard
                    active={scopeMode === "everything"}
                    detail="Plans, services, products, and events."
                    icon={<ShoppingBag size={19} />}
                    label="Everything you sell"
                    onClick={() => setScopeMode("everything")}
                  />
                  <ChoiceCard
                    active={scopeMode === "categories"}
                    detail="Choose one or more purchase types."
                    icon={<BadgeDollarSign size={19} />}
                    label="Offer categories"
                    onClick={() => setScopeMode("categories")}
                  />
                  <ChoiceCard
                    active={scopeMode === "offers"}
                    detail="Select exact catalog items."
                    icon={<TicketPercent size={19} />}
                    label="Specific offers"
                    onClick={() => setScopeMode("offers")}
                  />
                </div>

                {scopeMode === "categories" ? (
                  <fieldset className="promo-fieldset promo-fieldset--inset">
                    <legend>Eligible categories</legend>
                    <div className="promo-category-grid">
                      {[
                        [
                          "Plans",
                          "Memberships and credit packs",
                          allPlans,
                          setAllPlans,
                        ],
                        [
                          "Services",
                          "Lessons, programs, and bookings",
                          allServices,
                          setAllServices,
                        ],
                        [
                          "Products and events",
                          "Goods, tickets, and merchandise",
                          allProducts,
                          setAllProducts,
                        ],
                      ].map(([label, detail, checked, setter]) => (
                        <label key={String(label)}>
                          <input
                            checked={Boolean(checked)}
                            onChange={(event) =>
                              (setter as (value: boolean) => void)(
                                event.target.checked,
                              )
                            }
                            type="checkbox"
                          />
                          <span>
                            <strong>{String(label)}</strong>
                            <small>{String(detail)}</small>
                          </span>
                          {checked ? <Check aria-hidden size={15} /> : null}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {scopeMode === "offers" ? (
                  <section
                    className="promo-selection-panel"
                    aria-label="Specific offers"
                  >
                    <header>
                      <div>
                        <strong>Choose eligible offers</strong>
                        <small>{selectedCatalogIds.length} selected</small>
                      </div>
                      <label className="promo-search">
                        <Search aria-hidden size={17} />
                        <span className="sr-only">Search offers</span>
                        <input
                          onChange={(event) =>
                            setScopeSearch(event.target.value)
                          }
                          placeholder="Search plans, products, and services"
                          type="search"
                          value={scopeSearch}
                        />
                      </label>
                    </header>
                    <div className="promo-select-list">
                      {visibleCatalog.length ? (
                        visibleCatalog.map((item) => {
                          const checked = selectedCatalogIds.includes(item.id);
                          return (
                            <label
                              className={checked ? "is-selected" : ""}
                              key={item.id}
                            >
                              <input
                                checked={checked}
                                onChange={(event) =>
                                  setSelectedCatalogIds((current) =>
                                    event.target.checked
                                      ? [...current, item.id]
                                      : current.filter((id) => id !== item.id),
                                  )
                                }
                                type="checkbox"
                              />
                              <span>
                                <strong>{item.title}</strong>
                                <small>
                                  {item.type} ·{" "}
                                  {item.subtype.replaceAll("-", " ")}
                                </small>
                              </span>
                              {checked ? <Check aria-hidden size={15} /> : null}
                            </label>
                          );
                        })
                      ) : (
                        <p>No offers match that search.</p>
                      )}
                    </div>
                  </section>
                ) : null}
              </section>
            ) : null}

            {step === 2 ? (
              <section aria-labelledby="promo-step-availability">
                <header className="promo-stage__heading">
                  <span>03</span>
                  <div>
                    <h3 id="promo-step-availability">
                      When and who can use it?
                    </h3>
                    <p>
                      Set the window, protect inventory, and decide whether the
                      promotion is public or reserved.
                    </p>
                  </div>
                </header>

                <div className="promo-decision-block">
                  <header>
                    <CalendarRange aria-hidden size={19} />
                    <div>
                      <strong>Availability</strong>
                      <small>Times use your current local timezone.</small>
                    </div>
                  </header>
                  <div className="promo-choice-grid">
                    <ChoiceCard
                      active={scheduleMode === "always"}
                      detail="Activate after creation and keep running."
                      icon={<Clock3 size={19} />}
                      label="Start now. No end date."
                      onClick={() => setScheduleMode("always")}
                    />
                    <ChoiceCard
                      active={scheduleMode === "window"}
                      detail="Choose an exact start and end."
                      icon={<CalendarRange size={19} />}
                      label="Schedule a window"
                      onClick={openSchedule}
                    />
                  </div>
                  {scheduleMode === "window" ? (
                    <div className="promo-calendar">
                      <SmartDateRangePicker
                        label="Promotion window"
                        minimumDate={schedule.start.slice(0, 10)}
                        onChange={setSchedule}
                        timeMode="required"
                        value={schedule}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="promo-decision-columns">
                  <div className="promo-decision-block">
                    <header>
                      <TicketPercent aria-hidden size={19} />
                      <div>
                        <strong>Redemption limits</strong>
                        <small>
                          Prevent a campaign from exceeding its intent.
                        </small>
                      </div>
                    </header>
                    <ToggleField
                      checked={redemptionLimited}
                      detail="Otherwise total uses are unlimited."
                      label="Limit total redemptions"
                      onChange={setRedemptionLimited}
                    >
                      <label className="promo-field">
                        <span>Total available uses</span>
                        <input
                          min="1"
                          onChange={(event) =>
                            setRedemptionCap(event.target.value)
                          }
                          placeholder="100"
                          type="number"
                          value={redemptionCap}
                        />
                      </label>
                    </ToggleField>
                    <ToggleField
                      checked={perMemberLimited}
                      detail="Useful for one-time acquisition offers."
                      label="Limit uses per member"
                      onChange={setPerMemberLimited}
                    >
                      <label className="promo-field">
                        <span>Uses per member</span>
                        <input
                          min="1"
                          onChange={(event) =>
                            setPerPersonLimit(event.target.value)
                          }
                          placeholder="1"
                          type="number"
                          value={perPersonLimit}
                        />
                      </label>
                    </ToggleField>
                  </div>

                  <div className="promo-decision-block">
                    <header>
                      <UsersRound aria-hidden size={19} />
                      <div>
                        <strong>Member access</strong>
                        <small>Choose whether the code can be shared.</small>
                      </div>
                    </header>
                    <div className="promo-choice-grid promo-choice-grid--stacked">
                      <ChoiceCard
                        active={audienceMode === "everyone"}
                        detail="Any buyer with the code can use it."
                        icon={<UsersRound size={19} />}
                        label="Everyone"
                        onClick={() => setAudienceMode("everyone")}
                      />
                      <ChoiceCard
                        active={audienceMode === "selected"}
                        detail="Only members you choose can redeem it."
                        icon={<CheckCircle2 size={19} />}
                        label="Selected members"
                        onClick={() => setAudienceMode("selected")}
                      />
                    </div>
                  </div>
                </div>

                {audienceMode === "selected" ? (
                  <section
                    className="promo-selection-panel"
                    aria-label="Selected members"
                  >
                    <header>
                      <div>
                        <strong>Choose members</strong>
                        <small>{selectedMemberIds.length} selected</small>
                      </div>
                      <label className="promo-search">
                        <Search aria-hidden size={17} />
                        <span className="sr-only">Search members</span>
                        <input
                          onChange={(event) =>
                            setMemberSearch(event.target.value)
                          }
                          placeholder="Search members"
                          type="search"
                          value={memberSearch}
                        />
                      </label>
                    </header>
                    <div className="promo-select-list promo-select-list--members">
                      {visibleMembers.length ? (
                        visibleMembers.map((member) => {
                          const checked = selectedMemberIds.includes(member.id);
                          return (
                            <label
                              className={checked ? "is-selected" : ""}
                              key={member.id}
                            >
                              <input
                                checked={checked}
                                onChange={(event) =>
                                  setSelectedMemberIds((current) =>
                                    event.target.checked
                                      ? [...current, member.id]
                                      : current.filter(
                                          (id) => id !== member.id,
                                        ),
                                  )
                                }
                                type="checkbox"
                              />
                              <span>
                                <strong>{member.displayName}</strong>
                                <small>{member.email ?? "Member"}</small>
                              </span>
                              {checked ? <Check aria-hidden size={15} /> : null}
                            </label>
                          );
                        })
                      ) : (
                        <p>No members match that search.</p>
                      )}
                    </div>
                  </section>
                ) : null}
              </section>
            ) : null}

            {step === 3 ? (
              <section aria-labelledby="promo-step-review">
                <header className="promo-stage__heading">
                  <span>04</span>
                  <div>
                    <h3 id="promo-step-review">
                      Review the rules before launch.
                    </h3>
                    <p>
                      Duna creates the code immediately and syncs the eligible
                      Stripe-backed offers used at checkout.
                    </p>
                  </div>
                </header>
                <div className="promo-review-list">
                  <article>
                    <span>
                      <TicketPercent aria-hidden size={18} />
                    </span>
                    <div>
                      <small>Offer</small>
                      <strong>{discountSummary}</strong>
                      <p>
                        {name} · {code}
                      </p>
                    </div>
                    <button onClick={() => goToStep(0)} type="button">
                      Edit
                    </button>
                  </article>
                  <article>
                    <span>
                      <ShoppingBag aria-hidden size={18} />
                    </span>
                    <div>
                      <small>Eligible purchases</small>
                      <strong>{scopeSummary}</strong>
                      <p>
                        {hasMinimumPurchase
                          ? `Minimum purchase ${displayMoney(minimumPurchase, workspace.organization.currency)}.`
                          : "No minimum purchase."}
                      </p>
                    </div>
                    <button onClick={() => goToStep(1)} type="button">
                      Edit
                    </button>
                  </article>
                  <article>
                    <span>
                      <CalendarRange aria-hidden size={18} />
                    </span>
                    <div>
                      <small>Availability</small>
                      <strong>{availabilitySummary}</strong>
                      <p>
                        {limitSummary}. {audienceSummary}.
                      </p>
                    </div>
                    <button onClick={() => goToStep(2)} type="button">
                      Edit
                    </button>
                  </article>
                </div>
                <div className="promo-launch-note">
                  <CheckCircle2 aria-hidden size={21} />
                  <div>
                    <strong>
                      {isRevision
                        ? "Ready to create a successor"
                        : "Ready to create"}
                    </strong>
                    <p>
                      {isRevision
                        ? "Duna creates a new code, preserves the prior record, and retires the prior code only after the successor is ready."
                        : "The promotion will be active immediately unless you chose a future start. You can deactivate or duplicate it later."}
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            {stepMessage ? (
              <p className="promo-step-message" role="alert">
                {stepMessage}
              </p>
            ) : null}
            {state.message ? (
              <p
                className={`promo-action-state promo-action-state--${state.status}`}
                role="status"
              >
                {state.status === "success" ? (
                  <Check aria-hidden size={16} />
                ) : null}
                {state.message}
              </p>
            ) : null}

            <footer className="promo-stage__actions">
              {step > 0 ? (
                <button
                  className="hq-button hq-button--secondary"
                  onClick={() => {
                    setStepMessage("");
                    setStep((current) => Math.max(0, current - 1));
                  }}
                  type="button"
                >
                  <ArrowLeft aria-hidden size={17} /> Back
                </button>
              ) : (
                <span />
              )}
              {step < creationSteps.length - 1 ? (
                <button
                  className="hq-button hq-button--primary"
                  onClick={continueToNextStep}
                  type="button"
                >
                  Continue <ArrowRight aria-hidden size={17} />
                </button>
              ) : (
                <button
                  className="hq-button hq-button--primary"
                  disabled={pending}
                  type="submit"
                >
                  <TicketPercent aria-hidden size={17} />
                  {pending
                    ? "Creating…"
                    : isRevision
                      ? "Create next version"
                      : "Create promo code"}
                </button>
              )}
            </footer>
          </div>

          <aside className="promo-preview" aria-label="Promotion preview">
            <header>
              <div>
                <span className="hq-eyebrow">Live summary</span>
                <strong>What you’re creating</strong>
              </div>
              <span className="promo-draft-chip">Draft</span>
            </header>
            <div className="promo-ticket">
              <span className="promo-ticket__eyebrow">Customer code</span>
              <strong>{code || "YOURCODE"}</strong>
              <span className="promo-ticket__discount">{discountSummary}</span>
              <p>{name || "Your campaign name"}</p>
              <div className="promo-ticket__cut" aria-hidden />
              <dl>
                <div>
                  <dt>
                    <ShoppingBag aria-hidden size={15} /> Applies to
                  </dt>
                  <dd>{scopeSummary}</dd>
                </div>
                <div>
                  <dt>
                    <CalendarRange aria-hidden size={15} /> Runs
                  </dt>
                  <dd>{availabilitySummary}</dd>
                </div>
                <div>
                  <dt>
                    <UsersRound aria-hidden size={15} /> Who can use it
                  </dt>
                  <dd>{audienceSummary}</dd>
                </div>
                <div>
                  <dt>
                    <TicketPercent aria-hidden size={15} /> Limits
                  </dt>
                  <dd>
                    {limitSummary}
                    {perMemberLimited
                      ? ` · ${perPersonLimit || "0"} per member`
                      : ""}
                  </dd>
                </div>
              </dl>
            </div>
            <p className="promo-preview__note">
              Stripe receives the coupon and promotion-code records. Duna keeps
              the audience, catalog, schedule, and redemption rules explicit.
            </p>
          </aside>
        </form>
      </section>

      <section className="promo-list" aria-labelledby="promo-list-title">
        <header>
          <div>
            <span className="hq-eyebrow">Campaigns</span>
            <h2 id="promo-list-title">Live performance, one code at a time.</h2>
            <p className="promo-list__description">
              Deactivate a code to stop future redemptions. Its history stays
              here for reporting.
            </p>
          </div>
          <span>{workspace.promoCodes.length} total</span>
        </header>
        {workspace.promoCodes.length ? (
          <div className="promo-list__grid">
            {workspace.promoCodes.map((promo) => {
              const hasSuccessor = promo.lineage.some(
                (version) => version.supersedesPromoCodeId === promo.id,
              );
              return (
                <article className="hq-card promo-card" key={promo.id}>
                  <header>
                    <div>
                      <span
                        className={`promo-status ${promo.lifecycle === "active" ? "active" : ""}`}
                      >
                        {promo.lifecycle === "active"
                          ? "Active"
                          : promo.lifecycle === "scheduled"
                            ? "Scheduled"
                            : promo.lifecycle === "expired"
                              ? "Expired"
                              : "Inactive"}
                      </span>
                      <h3>{promo.code}</h3>
                      <p>{promo.name}</p>
                    </div>
                    <strong>
                      {promo.discountType === "percent"
                        ? `${promo.discountValue / 100}% off`
                        : `${money(promo.discountValue, promo.currency)} off`}
                    </strong>
                  </header>
                  <dl>
                    <div>
                      <dt>Redemptions</dt>
                      <dd>
                        {promo.metrics.redemptions}
                        {promo.redemptionCap ? ` / ${promo.redemptionCap}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Sales</dt>
                      <dd>
                        {money(promo.metrics.grossSalesMinor, promo.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt>Discounts</dt>
                      <dd>
                        {money(promo.metrics.discountsMinor, promo.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt>Stripe</dt>
                      <dd>{promo.stripeSyncStatus}</dd>
                    </div>
                  </dl>
                  <div className="promo-card__scope">
                    <CalendarRange aria-hidden size={15} />
                    <span>
                      {promo.startsAt
                        ? new Date(promo.startsAt).toLocaleDateString()
                        : "Now"}{" "}
                      –{" "}
                      {promo.endsAt
                        ? new Date(promo.endsAt).toLocaleDateString()
                        : "No end date"}
                    </span>
                  </div>
                  <details className="promo-card__history">
                    <summary>
                      <History aria-hidden size={15} /> Version history ·{" "}
                      {promo.lineage.length}
                    </summary>
                    <ol>
                      {promo.lineage.map((version) => (
                        <li
                          className={
                            version.id === promo.id ? "is-current" : ""
                          }
                          key={version.id}
                        >
                          <span>V{version.revision}</span>
                          <strong>{version.code}</strong>
                          <small>
                            {version.lifecycle} ·{" "}
                            {new Date(version.createdAt).toLocaleDateString()}
                          </small>
                        </li>
                      ))}
                    </ol>
                  </details>
                  <footer>
                    <div className="promo-card__actions">
                      {promo.active ? (
                        <form action={deactivatePromoCodeAction}>
                          <input
                            name="promoCodeId"
                            type="hidden"
                            value={promo.id}
                          />
                          <button
                            className="hq-button hq-button--secondary"
                            type="submit"
                          >
                            Deactivate code
                          </button>
                        </form>
                      ) : (
                        <span className="promo-card__inactive-note">
                          Deactivated · history retained
                        </span>
                      )}
                      {!hasSuccessor ? (
                        <button
                          className="hq-button hq-button--secondary"
                          onClick={() => startRevision(promo)}
                          type="button"
                        >
                          <Pencil aria-hidden size={15} /> Edit as new version
                        </button>
                      ) : null}
                    </div>
                    <details>
                      <summary>
                        <Copy aria-hidden size={15} /> Duplicate
                      </summary>
                      <form action={duplicatePromoCodeAction}>
                        <input
                          name="promoCodeId"
                          type="hidden"
                          value={promo.id}
                        />
                        <input
                          aria-label="New promo code"
                          name="code"
                          placeholder={`${promo.code}-COPY`}
                          required
                        />
                        <button
                          className="hq-button hq-button--secondary"
                          type="submit"
                        >
                          Create copy
                        </button>
                      </form>
                    </details>
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="hq-card promo-empty">
            <TicketPercent aria-hidden size={24} />
            <h3>No promo codes yet</h3>
            <p>
              Create the first campaign and its live performance will appear
              here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
