"use client";

import { report } from "@duna/observability";
import {
  Button,
  Checkbox,
  Field,
  Input,
  MoneyInput,
  Notice,
  NumberInput,
  RadioGroup,
  RadioOption,
  Select,
  Switch,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  receiveStockAction,
  revertVersionAction,
  saveOfferingAction,
  savePriceAction,
} from "@/app/(next)/(hq)/offerings/actions";
import { unwrap } from "../money/money-action-result";
import {
  LineList,
  SectionFooter,
  cleanLines,
  useSectionSave,
} from "./section-save";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function ids(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];
}

/** Settings › Who can see and book it. */
export function VisibilityForm({
  itemId,
  title,
  live,
  visibility,
  membershipRequired,
  isMembership,
  hasActiveMembership,
  canWrite,
}: {
  readonly itemId: string;
  readonly title: string;
  readonly live: boolean;
  readonly visibility: "public" | "members" | "private";
  readonly membershipRequired: boolean;
  readonly isMembership: boolean;
  readonly hasActiveMembership: boolean;
  readonly canWrite: boolean;
}) {
  const [shown, setShown] = useState(visibility);
  const [members, setMembers] = useState(membershipRequired);
  const dirty = shown !== visibility || members !== membershipRequired;
  const needsMembership =
    !isMembership && (shown === "members" || members) && !hasActiveMembership;
  const { button, online, dialog } = useSectionSave({
    what: "Who can book it",
    dirty: dirty && !needsMembership,
    live,
    title,
    perform: (idempotencyKey) =>
      saveOfferingAction({
        itemId,
        visibility: shown,
        membershipRequired: isMembership ? false : members,
        idempotencyKey,
      }),
  });
  return (
    <form className="of-form" onSubmit={(event) => event.preventDefault()}>
      <RadioGroup
        aria-label="Who sees it"
        disabled={!canWrite}
        onValueChange={(value) => setShown(value as typeof shown)}
        value={shown}
      >
        <RadioOption
          description="On your club page for everyone."
          label="Everyone"
          value="public"
        />
        {!isMembership ? (
          <RadioOption
            description="Only members see and book it."
            label="Members"
            value="members"
          />
        ) : null}
        <RadioOption
          description="Only people you send the link to."
          label="Only with the link"
          value="private"
        />
      </RadioGroup>
      {!isMembership ? (
        <Switch
          checked={members}
          disabled={!canWrite}
          label="Only members can book it"
          onCheckedChange={setMembers}
        />
      ) : null}
      {needsMembership ? (
        <Notice title="Members-only needs a live membership" tone="info">
          <a
            className="of-inline-link"
            href="/offerings/create?kind=plans&template=membership"
          >
            Create a membership
          </a>
        </Notice>
      ) : null}
      {canWrite ? (
        <SectionFooter online={online}>{button("Save")}</SectionFooter>
      ) : null}
      {dialog}
    </form>
  );
}

/** Settings › Membership terms: term, renewal, cancellation, refunds, trial, waivers, what it includes. */
export function MembershipForm({
  itemId,
  title,
  live,
  configuration,
  waivers,
  offerings,
  canWrite,
}: {
  readonly itemId: string;
  readonly title: string;
  readonly live: boolean;
  readonly configuration: Record<string, unknown>;
  readonly waivers:
    readonly { readonly id: string; readonly title: string }[] | null;
  readonly offerings: readonly {
    readonly id: string;
    readonly title: string;
  }[];
  readonly canWrite: boolean;
}) {
  const membership = record(configuration.membership);
  const policy = record(membership.subscriptionPolicy);
  const [term, setTerm] = useState<number | null>(
    typeof policy.initialTermMonths === "number" ? policy.initialTermMonths : 0,
  );
  const [renewal, setRenewal] = useState(
    String(policy.renewalBehavior ?? "automatic"),
  );
  const [timing, setTiming] = useState(
    String(policy.cancellationTiming ?? "period-end"),
  );
  const [refund, setRefund] = useState(String(policy.refundBehavior ?? "none"));
  const [window_, setWindow] = useState<number | null>(
    typeof policy.refundWindowDays === "number" ? policy.refundWindowDays : 7,
  );
  const [trial, setTrial] = useState<number | null>(
    typeof policy.trialDays === "number" ? policy.trialDays : 0,
  );
  const [trialCard, setTrialCard] = useState(
    String(policy.trialPaymentMethod ?? "required"),
  );
  const [reminder, setReminder] = useState<number | null>(
    typeof policy.renewalReminderDays === "number"
      ? policy.renewalReminderDays
      : 7,
  );
  const [benefits, setBenefits] = useState<string[]>(ids(membership.benefits));
  const [waiverIds, setWaiverIds] = useState(ids(membership.waiverDocumentIds));
  const [included, setIncluded] = useState(
    ids(membership.includedCatalogItemIds),
  );
  const effectiveRefund = timing === "period-end" ? "none" : refund;
  const state = JSON.stringify({
    term,
    renewal,
    timing,
    refund: effectiveRefund,
    window_,
    trial,
    trialCard,
    reminder,
    benefits,
    waiverIds,
    included,
  });
  const [initial] = useState(state);
  const dirty = state !== initial;
  const { button, online, dialog } = useSectionSave({
    what: "Membership terms",
    dirty,
    live,
    title,
    perform: (idempotencyKey) =>
      saveOfferingAction({
        itemId,
        configuration: {
          membership: {
            ...membership,
            benefits: cleanLines(benefits),
            waiverDocumentIds: waiverIds,
            includedCatalogItemIds: included,
            subscriptionPolicy: {
              initialTermMonths: term && term > 0 ? term : undefined,
              renewalBehavior: term && term > 0 ? renewal : "automatic",
              cancellationTiming: timing,
              refundBehavior: effectiveRefund,
              refundWindowDays:
                effectiveRefund === "full-within-window"
                  ? (window_ ?? 7)
                  : undefined,
              trialDays: trial ?? 0,
              trialPaymentMethod: trialCard,
              renewalReminderDays: reminder ?? 7,
            },
          },
        },
        idempotencyKey,
      }),
  });
  const disabled = !canWrite;
  return (
    <form className="of-form" onSubmit={(event) => event.preventDefault()}>
      <LineList
        addLabel="Add a benefit"
        disabled={disabled}
        label="Benefits"
        onChange={setBenefits}
        values={benefits}
      />
      <div className="of-grid">
        <Field hint="0 for no fixed term." label="Minimum term (months)">
          <NumberInput
            disabled={disabled}
            min={0}
            onValueChange={(value) =>
              setTerm(value === null ? null : Math.trunc(value))
            }
            value={term}
          />
        </Field>
        {term && term > 0 ? (
          <Field label="At the end of the term">
            <Select
              disabled={disabled}
              onValueChange={(value) => setRenewal(String(value))}
              options={[
                { value: "automatic", label: "It renews" },
                { value: "ends-after-term", label: "It ends" },
              ]}
              value={renewal}
            />
          </Field>
        ) : null}
        <Field label="When a member cancels">
          <Select
            disabled={disabled}
            onValueChange={(value) => setTiming(String(value))}
            options={[
              {
                value: "period-end",
                label: "It ends at the end of the period",
              },
              { value: "immediate", label: "It ends straight away" },
            ]}
            value={timing}
          />
        </Field>
        {timing === "immediate" ? (
          <Field label="Refund">
            <Select
              disabled={disabled}
              onValueChange={(value) => setRefund(String(value))}
              options={[
                { value: "none", label: "No refund" },
                { value: "prorated", label: "The unused part" },
                {
                  value: "full-within-window",
                  label: "In full, within a window",
                },
              ]}
              value={refund}
            />
          </Field>
        ) : null}
        {timing === "immediate" && refund === "full-within-window" ? (
          <Field label="Refund window (days)">
            <NumberInput
              disabled={disabled}
              max={30}
              min={1}
              onValueChange={(value) =>
                setWindow(value === null ? null : Math.trunc(value))
              }
              value={window_}
            />
          </Field>
        ) : null}
        <Field hint="0 for no trial." label="Free trial (days)">
          <NumberInput
            disabled={disabled}
            max={90}
            min={0}
            onValueChange={(value) =>
              setTrial(value === null ? null : Math.trunc(value))
            }
            value={trial}
          />
        </Field>
        {trial && trial > 0 ? (
          <Field label="During the trial">
            <Select
              disabled={disabled}
              onValueChange={(value) => setTrialCard(String(value))}
              options={[
                { value: "required", label: "A card is needed to start" },
                { value: "optional", label: "No card needed to start" },
              ]}
              value={trialCard}
            />
          </Field>
        ) : null}
        <Field label="Remind before renewal (days)">
          <NumberInput
            disabled={disabled}
            max={45}
            min={3}
            onValueChange={(value) =>
              setReminder(value === null ? null : Math.trunc(value))
            }
            value={reminder}
          />
        </Field>
      </div>
      <fieldset className="of-fieldset">
        <legend className="pt-label">Waivers members sign</legend>
        {waivers === null ? (
          <p className="pt-quiet">
            Waivers couldn't be loaded. Reload to try again.
          </p>
        ) : waivers.length === 0 ? (
          <p className="pt-quiet">
            No active waiver yet.{" "}
            <a className="of-inline-link" href="/settings?section=waivers">
              Add one in Settings
            </a>
          </p>
        ) : (
          waivers.map((waiver) => (
            <Checkbox
              checked={waiverIds.includes(waiver.id)}
              disabled={disabled}
              key={waiver.id}
              label={waiver.title}
              onCheckedChange={(checked) =>
                setWaiverIds((current) =>
                  checked
                    ? [...current, waiver.id]
                    : current.filter((id) => id !== waiver.id),
                )
              }
            />
          ))
        )}
      </fieldset>
      <Includes
        disabled={disabled}
        label="Included with the membership"
        offerings={offerings}
        onChange={setIncluded}
        value={included}
      />
      {canWrite ? (
        <SectionFooter online={online}>
          {button("Save membership terms")}
        </SectionFooter>
      ) : null}
      {dialog}
    </form>
  );
}

function Includes({
  label,
  offerings,
  value,
  onChange,
  disabled,
}: {
  readonly label: string;
  readonly offerings: readonly {
    readonly id: string;
    readonly title: string;
  }[];
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly disabled?: boolean;
}) {
  return (
    <fieldset className="of-fieldset">
      <legend className="pt-label">{label}</legend>
      {offerings.length === 0 ? (
        <p className="pt-quiet">Nothing else to include yet.</p>
      ) : (
        offerings.map((offering) => (
          <Checkbox
            checked={value.includes(offering.id)}
            disabled={disabled}
            key={offering.id}
            label={offering.title}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...value, offering.id]
                  : value.filter((id) => id !== offering.id),
              )
            }
          />
        ))
      )}
    </fieldset>
  );
}

/** Settings › What it includes (a bundle, or a program's extras). */
export function IncludesForm({
  itemId,
  title,
  live,
  configuration,
  offerings,
  kind,
  canWrite,
}: {
  readonly itemId: string;
  readonly title: string;
  readonly live: boolean;
  readonly configuration: Record<string, unknown>;
  readonly offerings: readonly {
    readonly id: string;
    readonly title: string;
  }[];
  readonly kind: "bundle" | "program";
  readonly canWrite: boolean;
}) {
  const holder = record(configuration[kind]);
  const [included, setIncluded] = useState(ids(holder.includedCatalogItemIds));
  const dirty =
    JSON.stringify(included) !==
    JSON.stringify(ids(holder.includedCatalogItemIds));
  const tooFew = kind === "bundle" && included.length < 2;
  const { button, online, dialog } = useSectionSave({
    what: "What it includes",
    dirty: dirty && !tooFew,
    live,
    title,
    perform: (idempotencyKey) =>
      saveOfferingAction({
        itemId,
        configuration: {
          [kind]: { ...holder, includedCatalogItemIds: included },
        },
        idempotencyKey,
      }),
  });
  return (
    <form className="of-form" onSubmit={(event) => event.preventDefault()}>
      <Includes
        disabled={!canWrite}
        label={kind === "bundle" ? "In the bundle" : "Comes with the program"}
        offerings={offerings}
        onChange={setIncluded}
        value={included}
      />
      {tooFew && dirty ? (
        <p className="pt-quiet" role="alert">
          A bundle needs at least two things in it.
        </p>
      ) : null}
      {canWrite ? (
        <SectionFooter online={online}>{button("Save")}</SectionFooter>
      ) : null}
      {dialog}
    </form>
  );
}

/** Settings › Options (sizes, colours): every combination becomes a variant. */
export function OptionsForm({
  itemId,
  title,
  live,
  options,
  configuration,
  canWrite,
}: {
  readonly itemId: string;
  readonly title: string;
  readonly live: boolean;
  readonly options: readonly {
    readonly name: string;
    readonly values: readonly string[];
  }[];
  readonly configuration: Record<string, unknown>;
  readonly canWrite: boolean;
}) {
  const [rows, setRows] = useState(
    options.map((option) => ({
      name: option.name,
      values: option.values.join(", "),
    })),
  );
  const [selling, setSelling] = useState(configuration.saleEnabled !== false);
  const [tracking, setTracking] = useState(
    configuration.inventoryTracked !== false,
  );
  const [costing, setCosting] = useState(
    String(configuration.inventoryCostingMethod ?? "fifo"),
  );
  const [purpose, setPurpose] = useState(
    String(configuration.inventoryPurpose ?? "operations"),
  );
  const parsed = rows
    .map((row) => ({
      name: row.name.trim(),
      values: [
        ...new Set(
          row.values
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ],
    }))
    .filter((row) => row.name && row.values.length > 0);
  const combinations = parsed.reduce(
    (total, row) => total * row.values.length,
    1,
  );
  const state = JSON.stringify({ parsed, selling, tracking, costing, purpose });
  const [initial] = useState(state);
  const dirty = state !== initial;
  const problems = [
    ...(combinations > 500
      ? ["That makes more than 500 variants. Split it into smaller products."]
      : []),
    ...(!selling && !tracking ? ["Sell it, track it, or both."] : []),
  ];
  const { button, online, dialog } = useSectionSave({
    what: "Options and stock settings",
    dirty: dirty && problems.length === 0,
    live,
    title,
    republishes: true,
    perform: (idempotencyKey) =>
      savePriceAction({
        itemId,
        change: {
          options: parsed,
          configuration: {
            saleEnabled: selling,
            inventoryTracked: tracking,
            inventoryCostingMethod: costing,
            ...(tracking && !selling ? { inventoryPurpose: purpose } : {}),
            variantCount: combinations,
          },
        },
        idempotencyKey,
      }),
  });
  const disabled = !canWrite;
  return (
    <form className="of-form" onSubmit={(event) => event.preventDefault()}>
      {rows.map((row, index) => (
        <div className="of-pair" key={index}>
          <Input
            aria-label={`Option ${index + 1} name`}
            disabled={disabled}
            onValueChange={(value) =>
              setRows((list) =>
                list.map((entry, at) =>
                  at === index
                    ? { ...entry, name: String(value ?? "") }
                    : entry,
                ),
              )
            }
            placeholder="Size"
            value={row.name}
          />
          <Input
            aria-label={`Option ${index + 1} values, separated by commas`}
            disabled={disabled}
            onValueChange={(value) =>
              setRows((list) =>
                list.map((entry, at) =>
                  at === index
                    ? { ...entry, values: String(value ?? "") }
                    : entry,
                ),
              )
            }
            placeholder="S, M, L"
            value={row.values}
          />
          <Button
            disabled={disabled}
            onClick={() =>
              setRows((list) => list.filter((_, at) => at !== index))
            }
            size="sm"
            variant="ghost"
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        disabled={disabled || rows.length >= 12}
        onClick={() => setRows((list) => [...list, { name: "", values: "" }])}
        size="sm"
        variant="secondary"
      >
        Add an option
      </Button>
      <p className="pt-quiet">{`${combinations} variant${combinations === 1 ? "" : "s"}.`}</p>
      <Switch
        checked={selling}
        disabled={disabled}
        label="Sell it to players"
        onCheckedChange={setSelling}
      />
      <Switch
        checked={tracking}
        disabled={disabled}
        label="Track stock"
        onCheckedChange={setTracking}
      />
      {tracking ? (
        <Field label="Cost stock by">
          <Select
            disabled={disabled}
            onValueChange={(value) => setCosting(String(value))}
            options={[
              { value: "fifo", label: "Oldest stock first" },
              { value: "lifo", label: "Newest stock first" },
            ]}
            value={costing}
          />
        </Field>
      ) : null}
      {tracking && !selling ? (
        <Field label="Kept for">
          <Select
            disabled={disabled}
            onValueChange={(value) => setPurpose(String(value))}
            options={[
              { value: "operations", label: "Running the club" },
              { value: "coach-use", label: "Coaches' use" },
              { value: "rental", label: "Renting out" },
            ]}
            value={purpose}
          />
        </Field>
      ) : null}
      {problems.length > 0 && dirty ? (
        <ul className="of-issues" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {canWrite ? (
        <SectionFooter online={online}>{button("Save options")}</SectionFooter>
      ) : null}
      {dialog}
    </form>
  );
}

/** Settings › Receive stock (goods): the movement history stays append-only. */
export function StockReceiver({
  variants,
  locations,
  currency,
  canWrite,
}: {
  readonly variants: readonly { readonly id: string; readonly label: string }[];
  readonly locations: readonly { readonly id: string; readonly name: string }[];
  readonly currency: string;
  readonly canWrite: boolean;
}) {
  const router = useRouter();
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [location, setLocation] = useState(locations[0]?.id ?? "new");
  const [newLocation, setNewLocation] = useState("");
  const [vendor, setVendor] = useState("");
  const receive = useAction(
    async ({ idempotencyKey }) =>
      unwrap(
        await receiveStockAction({
          catalogVariantId: variantId,
          quantity: quantity ?? 0,
          ...(cost !== null ? { totalCostMinor: cost } : {}),
          ...(location !== "new"
            ? { inventoryLocationId: location }
            : { locationName: newLocation.trim() || "Main stock" }),
          ...(vendor.trim() ? { vendorName: vendor.trim() } : {}),
          idempotencyKey,
        }),
      ),
    {
      messages: {
        success: "Stock received",
        error: "The stock wasn't recorded.",
      },
      report: (error) =>
        void report(error, { event: "hq.offerings.stock_failed" }),
      onSuccess: () => {
        setQuantity(null);
        setCost(null);
        router.refresh();
      },
    },
  );
  if (!canWrite) return null;
  return (
    <div className="of-form">
      <div className="of-grid">
        {variants.length > 1 ? (
          <Field label="Variant">
            <Select
              onValueChange={(value) => setVariantId(String(value))}
              options={variants.map((variant) => ({
                value: variant.id,
                label: variant.label,
              }))}
              value={variantId}
            />
          </Field>
        ) : null}
        <Field label="How many arrived">
          <NumberInput
            min={1}
            onValueChange={(value) =>
              setQuantity(value === null ? null : Math.trunc(value))
            }
            value={quantity}
          />
        </Field>
        <Field label="What it cost in total" optional>
          <MoneyInput
            currency={currency}
            onValueChange={setCost}
            value={cost}
          />
        </Field>
        <Field label="Kept at">
          <Select
            onValueChange={(value) => setLocation(String(value))}
            options={[
              ...locations.map((entry) => ({
                value: entry.id,
                label: entry.name,
              })),
              { value: "new", label: "A new place" },
            ]}
            value={location}
          />
        </Field>
        {location === "new" ? (
          <Field label="Name of the place">
            <Input
              onValueChange={(value) => setNewLocation(String(value ?? ""))}
              value={newLocation}
            />
          </Field>
        ) : null}
        <Field label="Supplier" optional>
          <Input
            onValueChange={(value) => setVendor(String(value ?? ""))}
            value={vendor}
          />
        </Field>
      </div>
      <div className="pt-actions">
        <Button
          {...receive.buttonProps}
          disabled={!quantity || !variantId}
          variant="secondary"
        >
          Record stock
        </Button>
      </div>
    </div>
  );
}

/** Settings › Versions: every saved version; an earlier one can come back as a draft. */
export function VersionList({
  itemId,
  title,
  versions,
  canWrite,
}: {
  readonly itemId: string;
  readonly title: string;
  readonly versions: readonly {
    readonly id: string;
    readonly version: number;
    readonly title: string;
    readonly createdAt: string;
    readonly current: boolean;
  }[];
  readonly canWrite: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  if (versions.length === 0)
    return <p className="pt-quiet">No saved versions yet.</p>;
  return (
    <>
      <ul className="pt-roster">
        {versions.map((version) => (
          <li key={version.id}>
            <span>{`Version ${version.version} · ${version.title}`}</span>
            <span className="pt-quiet">
              {version.current
                ? "Current"
                : new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                  }).format(new Date(version.createdAt))}
            </span>
            {!version.current && canWrite ? (
              <Button
                onClick={() =>
                  void confirm
                    .run({
                      tier: "confirm",
                      title: `Bring back version ${version.version} of ${title}?`,
                      description:
                        "It comes back as a draft. Publish it again when it's ready.",
                      verb: `Restore version ${version.version}`,
                      cancelLabel: "Keep the current version",
                      agentConfirm: `Restores version ${version.version} of ${title} as a draft`,
                      perform: async ({ idempotencyKey }) =>
                        unwrap(
                          await revertVersionAction({
                            itemId,
                            versionId: version.id,
                            idempotencyKey,
                          }),
                        ),
                      success: `Version ${version.version} is back as a draft`,
                    })
                    .then((outcome) => {
                      if (outcome.status === "done") router.refresh();
                    })
                }
                size="sm"
                variant="ghost"
              >
                Restore
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {confirm.dialog}
    </>
  );
}
