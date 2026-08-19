"use client";

import type { OperatorWorkspace, WaiverWorkspace } from "@duna/api";
import { Badge } from "@duna/ui";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Eye,
  Image as ImageIcon,
  Pencil,
  Rocket,
  Search,
  ShieldCheck,
  ShoppingBag,
  UserRound,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  enableInventoryGoodSalesAction,
  setCatalogItemStatusAction,
  updateCatalogItemAction,
  type OperatorActionState,
} from "@/app/actions";
import { InventoryComposer } from "./commerce-controls";

const initialState: OperatorActionState = { status: "idle", message: "" };

function configurationString(
  configuration: Record<string, unknown>,
  key: string,
) {
  return typeof configuration[key] === "string"
    ? (configuration[key] as string)
    : "";
}

function configurationStrings(
  configuration: Record<string, unknown>,
  key: string,
) {
  const value = configuration[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function moneyLabel(amountMinor: number | undefined, currency: string) {
  if (amountMinor === undefined) return "Price not set";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function notice(state: OperatorActionState) {
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

export function CatalogItemEditor({
  created,
  item,
  waivers,
  workspace,
}: {
  readonly created: boolean;
  readonly item: OperatorWorkspace["catalog"][number];
  readonly waivers: WaiverWorkspace;
  readonly workspace: OperatorWorkspace;
}) {
  const configuration = item.configuration ?? {};
  const eligibleCoaches = workspace.staff.filter(
    (person) => person.active && person.role === "coach",
  );
  const configuredCoachIds = Array.isArray(configuration.coachPersonIds)
    ? configuration.coachPersonIds.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const [coachMode, setCoachMode] = useState<"all" | "selected">(
    configuration.coachAssignmentMode === "selected" ? "selected" : "all",
  );
  const [selectedCoachIds, setSelectedCoachIds] =
    useState<readonly string[]>(configuredCoachIds);
  const [requiredCoachCount, setRequiredCoachCount] = useState(
    typeof configuration.requiredCoachCount === "number"
      ? Math.max(1, configuration.requiredCoachCount)
      : 1,
  );
  const [customerCoachSelection, setCustomerCoachSelection] = useState(
    configuration.customerCoachSelection !== false,
  );
  const [coachSearch, setCoachSearch] = useState("");
  const [bestFor, setBestFor] = useState(
    configurationString(configuration, "bestFor"),
  );
  const [highlights, setHighlights] = useState(
    configurationStrings(configuration, "highlights").join("\n"),
  );
  const [validityDays, setValidityDays] = useState(
    typeof configuration.validityDays === "number"
      ? String(configuration.validityDays)
      : "",
  );
  const [redemptionNotes, setRedemptionNotes] = useState(
    configurationString(configuration, "redemptionNotes"),
  );
  const [membershipWaiverDocumentIds, setMembershipWaiverDocumentIds] =
    useState<readonly string[]>(() =>
      configurationStrings(configuration, "waiverDocumentIds"),
    );
  const [state, action, pending] = useActionState(
    updateCatalogItemAction,
    initialState,
  );
  const [statusState, statusAction, statusPending] = useActionState(
    setCatalogItemStatusAction,
    initialState,
  );
  const [salesState, salesAction, salesPending] = useActionState(
    enableInventoryGoodSalesAction,
    initialState,
  );
  const supportsCoaches = item.type === "event" || item.type === "service";
  const isMembership = item.type === "plan" && item.subtype === "membership";
  const inventoryOnlyGood =
    item.type === "good" && configuration.saleEnabled === false;
  const assignedCoachIds =
    coachMode === "all"
      ? eligibleCoaches.map((coach) => coach.personId)
      : selectedCoachIds;
  const filteredCoaches = useMemo(() => {
    const query = coachSearch.trim().toLowerCase();
    if (!query) return eligibleCoaches;
    return eligibleCoaches.filter(
      (coach) =>
        coach.displayName.toLowerCase().includes(query) ||
        coach.handle.toLowerCase().includes(query) ||
        coach.homeMarket?.toLowerCase().includes(query),
    );
  }, [coachSearch, eligibleCoaches]);
  const parsedHighlights = highlights
    .split("\n")
    .map((highlight) => highlight.trim())
    .filter(Boolean);
  const nextConfiguration = {
    ...configuration,
    bestFor: bestFor.trim() || undefined,
    highlights: parsedHighlights,
    validityDays: validityDays ? Math.max(0, Number(validityDays)) : undefined,
    redemptionNotes: redemptionNotes.trim() || undefined,
    ...(isMembership ? { waiverDocumentIds: membershipWaiverDocumentIds } : {}),
    ...(supportsCoaches
      ? {
          coachAssignmentMode: coachMode,
          coachPersonIds: assignedCoachIds,
          requiredCoachCount: Math.min(
            Math.max(1, requiredCoachCount),
            Math.max(1, assignedCoachIds.length),
          ),
          customerCoachSelection,
        }
      : {}),
  };
  const nextStatus = item.status === "active" ? "draft" : "active";
  const coverMedia = item.media[0];
  const primaryPrice = item.variants
    .flatMap((variant) => variant.prices)
    .find(
      (price) =>
        price.active &&
        price.paymentKind === "card" &&
        price.amountMinor !== undefined,
    );
  const previewHighlights =
    parsedHighlights.length > 0
      ? parsedHighlights
      : configurationStrings(configuration, "highlights");
  const membershipConfigured = workspace.catalog.some(
    (candidate) =>
      candidate.type === "plan" &&
      candidate.subtype === "membership" &&
      candidate.status === "active",
  );
  const liveProductUrl = `https://duna.coach/clubs/${workspace.organization.slug}/products/${item.slug}`;

  return (
    <div className="catalog-editor">
      <header className="catalog-editor__hero">
        <div>
          <Link href="/products">
            <ArrowLeft aria-hidden size={16} />
            Back to products
          </Link>
          <span className="hq-eyebrow">Offer details</span>
          <h1>{item.title}</h1>
          <p>
            Edit the storefront story and decide which coaches can deliver this
            offer.
          </p>
        </div>
        <Badge tone={item.status === "active" ? "positive" : "neutral"}>
          {item.status}
        </Badge>
      </header>

      {created && (
        <div className="catalog-editor__created" role="status">
          <Check aria-hidden size={18} />
          <span>
            <strong>Draft saved.</strong> This is what customers will see. Edit
            anything below or publish it live when it feels right.
          </span>
        </div>
      )}

      <section className="catalog-draft-preview" aria-label="Customer preview">
        <div className="catalog-draft-preview__media">
          {coverMedia?.kind === "image" ? (
            <img alt={coverMedia.alt ?? item.title} src={coverMedia.url} />
          ) : coverMedia?.kind === "video" ? (
            <video
              aria-label={coverMedia.alt ?? item.title}
              controls
              playsInline
              poster={coverMedia.posterUrl}
              preload="metadata"
              src={coverMedia.url}
            />
          ) : (
            <span>
              <ImageIcon aria-hidden size={32} />
              Add a cover image below
            </span>
          )}
          {coverMedia && (
            <i>
              {coverMedia.kind === "video" ? (
                <Video aria-hidden size={14} />
              ) : (
                <ImageIcon aria-hidden size={14} />
              )}
              Customer cover
            </i>
          )}
        </div>
        <div className="catalog-draft-preview__story">
          <span className="hq-eyebrow">Customer page preview</span>
          <div>
            <Badge>{item.subtype.replaceAll("-", " ")}</Badge>
            <Badge tone={item.status === "active" ? "positive" : "neutral"}>
              {item.status === "active" ? "Live" : "Private draft"}
            </Badge>
          </div>
          <h2>{item.title}</h2>
          <p>
            {item.shortSummary ??
              "Add a short customer-facing summary to make this offer easier to choose."}
          </p>
          {bestFor && (
            <small>
              <strong>Best for</strong> {bestFor}
            </small>
          )}
          {previewHighlights.length > 0 && (
            <ul>
              {previewHighlights.slice(0, 4).map((highlight) => (
                <li key={highlight}>
                  <Check aria-hidden size={14} /> {highlight}
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside className="catalog-draft-preview__checkout">
          <small>Customer price</small>
          <strong>
            {moneyLabel(
              primaryPrice?.amountMinor,
              primaryPrice?.currency ?? workspace.organization.currency,
            )}
          </strong>
          {primaryPrice?.recurringInterval && (
            <span>Renews every {primaryPrice.recurringInterval}</span>
          )}
          <Link
            className="hq-button hq-button--secondary"
            href={`/products/${item.id}/builder`}
          >
            <Pencil aria-hidden size={15} /> Edit draft
          </Link>
          {item.status === "active" ? (
            <a
              className="hq-button hq-button--primary"
              href={liveProductUrl}
              rel="noreferrer"
              target="_blank"
            >
              <Eye aria-hidden size={15} /> View live
            </a>
          ) : (
            <form action={statusAction}>
              <input name="catalogItemId" type="hidden" value={item.id} />
              <input name="status" type="hidden" value="active" />
              <input name="confirmed" type="hidden" value="true" />
              <button
                className="hq-button hq-button--primary"
                disabled={statusPending || inventoryOnlyGood}
                type="submit"
              >
                <Rocket aria-hidden size={15} />
                {inventoryOnlyGood
                  ? "Set sales first"
                  : statusPending
                    ? "Publishing…"
                    : "Publish live"}
              </button>
            </form>
          )}
          {notice(statusState)}
        </aside>
      </section>

      <form
        action={action}
        className="hq-card operator-form catalog-editor__form"
        id="edit-product"
      >
        <input name="catalogItemId" type="hidden" value={item.id} />
        <input
          name="configuration"
          type="hidden"
          value={JSON.stringify(nextConfiguration)}
        />
        <input name="confirmed" type="hidden" value="true" />
        <div className="operator-form-grid operator-form-grid--two">
          <label className="operator-field--wide">
            <span>Name</span>
            <input defaultValue={item.title} name="title" required />
          </label>
          <label className="operator-field--wide">
            <span>Short summary</span>
            <input
              defaultValue={item.shortSummary ?? ""}
              maxLength={240}
              name="shortSummary"
            />
          </label>
          <label className="operator-field--wide">
            <span>Description · Markdown supported</span>
            <textarea
              defaultValue={item.description ?? ""}
              name="description"
              rows={7}
            />
          </label>
          <label className="operator-field--wide">
            <span>Best for</span>
            <input
              maxLength={220}
              onChange={(event) => setBestFor(event.target.value)}
              placeholder="Players who want a flexible way to train twice a week."
              value={bestFor}
            />
          </label>
          <label className="operator-field--wide">
            <span>What they get · one benefit per line</span>
            <textarea
              onChange={(event) => setHighlights(event.target.value)}
              placeholder="Priority booking\nMember pricing\nA welcoming club community"
              rows={4}
              value={highlights}
            />
          </label>
          <label>
            <span>Valid for · days · optional</span>
            <input
              min="0"
              onChange={(event) => setValidityDays(event.target.value)}
              placeholder="365"
              type="number"
              value={validityDays}
            />
          </label>
          <label>
            <span>How to use it · optional</span>
            <input
              maxLength={280}
              onChange={(event) => setRedemptionNotes(event.target.value)}
              placeholder="Choose this balance when booking an eligible offer."
              value={redemptionNotes}
            />
          </label>
          <label>
            <span>Who can see it?</span>
            <select defaultValue={item.visibility} name="visibility">
              <option value="public">Everyone</option>
              <option disabled={!membershipConfigured} value="members">
                {membershipConfigured
                  ? "Members"
                  : "Members · publish a membership first"}
              </option>
              <option value="private">Private link or staff only</option>
            </select>
          </label>
          <label className="operator-switch">
            <input
              defaultChecked={item.membershipRequired}
              disabled={
                isMembership ||
                (!membershipConfigured && !item.membershipRequired)
              }
              name="membershipRequired"
              type="checkbox"
              value="true"
            />
            <span>
              <strong>Membership required to buy</strong>
              {isMembership
                ? "A membership cannot require another membership."
                : membershipConfigured
                  ? "Nonmembers will be offered the club membership in checkout."
                  : item.membershipRequired
                    ? "Turn this off, or publish a membership before keeping it required."
                    : "Publish a membership before turning this on."}
            </span>
          </label>
        </div>

        {supportsCoaches && (
          <fieldset className="product-coach-assignment">
            <legend>
              <UserRound aria-hidden size={18} />
              Coaching team
            </legend>
            <p>
              Availability is built from the selected coaches. Customers can
              choose a preferred coach when that option is enabled.
            </p>
            {eligibleCoaches.length === 0 ? (
              <div className="product-coach-empty">
                <span>
                  <strong>No active coaches yet.</strong>
                  Add a coach manually or share a claim link, then return here.
                </span>
                <Link href="/team/invite">Open team setup</Link>
              </div>
            ) : (
              <>
                <div className="product-coach-mode">
                  <button
                    className={coachMode === "all" ? "active" : undefined}
                    onClick={() => setCoachMode("all")}
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
                      <small>Future active coaches join this pool.</small>
                    </span>
                  </button>
                  <button
                    className={coachMode === "selected" ? "active" : undefined}
                    onClick={() => setCoachMode("selected")}
                    type="button"
                  >
                    <UserRound aria-hidden size={24} />
                    <span>
                      <strong>Selected coaches</strong>
                      <small>Use a dedicated team for this offer.</small>
                    </span>
                  </button>
                </div>
                {coachMode === "selected" && (
                  <div className="product-coach-picker">
                    <label className="product-coach-search">
                      <Search aria-hidden size={17} />
                      <input
                        onChange={(event) => setCoachSearch(event.target.value)}
                        placeholder="Search coaches"
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
                    <span>Coaches required at once</span>
                    <input
                      max={Math.max(1, assignedCoachIds.length)}
                      min="1"
                      onChange={(event) =>
                        setRequiredCoachCount(Number(event.target.value))
                      }
                      type="number"
                      value={requiredCoachCount}
                    />
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
                      <strong>Let customers choose their coach</strong>
                      Show coach photos, display names, and matching times.
                    </span>
                  </label>
                </div>
                {coachMode === "selected" && selectedCoachIds.length === 0 && (
                  <p className="product-coach-warning" role="alert">
                    Select at least one coach before saving.
                  </p>
                )}
              </>
            )}
          </fieldset>
        )}

        {isMembership && (
          <fieldset className="product-coach-assignment">
            <legend>
              <ShieldCheck aria-hidden size={18} /> Required agreements
            </legend>
            <p>
              Customers must review and sign each selected active waiver before
              this membership can be purchased. Duna records the exact version
              they accepted; changing a waiver creates a new requirement.
            </p>
            {waivers.documents.some(
              (waiver) => waiver.status === "active" && waiver.versionId,
            ) ? (
              <div className="product-coach-grid catalog-waiver-grid">
                {waivers.documents
                  .filter(
                    (waiver) => waiver.status === "active" && waiver.versionId,
                  )
                  .map((waiver) => {
                    const checked = membershipWaiverDocumentIds.includes(
                      waiver.id,
                    );
                    return (
                      <label
                        className={checked ? "active" : undefined}
                        key={waiver.id}
                      >
                        <input
                          checked={checked}
                          onChange={(event) =>
                            setMembershipWaiverDocumentIds((current) =>
                              event.target.checked
                                ? [...current, waiver.id]
                                : current.filter((id) => id !== waiver.id),
                            )
                          }
                          type="checkbox"
                        />
                        <span className="product-coach-fallback">
                          <ShieldCheck aria-hidden size={17} />
                        </span>
                        <span>
                          <strong>{waiver.title}</strong>
                          <small>
                            Version {waiver.version} · valid{" "}
                            {waiver.signatureValidityDays} days
                          </small>
                        </span>
                        <i aria-hidden />
                      </label>
                    );
                  })}
              </div>
            ) : (
              <div className="product-coach-empty">
                <span>
                  <strong>No active agreement is available.</strong>
                  Create and publish a waiver in Settings before requiring it at
                  checkout.
                </span>
                <Link href="/settings?section=waivers">
                  Open waiver library
                </Link>
              </div>
            )}
          </fieldset>
        )}

        <footer className="operator-form-footer">
          {notice(state)}
          <button
            className="hq-button hq-button--primary"
            disabled={
              pending ||
              (supportsCoaches &&
                coachMode === "selected" &&
                selectedCoachIds.length === 0)
            }
            type="submit"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </form>

      {inventoryOnlyGood && (
        <section className="hq-card catalog-inventory-sale-conversion">
          <header>
            <div>
              <span className="hq-eyebrow">Inventory → storefront</span>
              <h2>Ready to offer this stock for sale?</h2>
              <p>
                Add one sale price across the current variants. Existing
                receipts, quantities, and historical costs stay unchanged.
              </p>
            </div>
            <ShoppingBag aria-hidden size={24} />
          </header>
          <form action={salesAction} className="operator-form">
            <input name="catalogItemId" type="hidden" value={item.id} />
            <input name="confirmed" type="hidden" value="true" />
            <div className="operator-form-grid operator-form-grid--two">
              <label>
                <span>Sale price</span>
                <span className="operator-money-input">
                  <small>$</small>
                  <input
                    inputMode="decimal"
                    min="0.01"
                    name="price"
                    required
                    step="0.01"
                    type="number"
                  />
                </span>
              </label>
              <div className="catalog-sale-payment-options">
                <label>
                  <input
                    defaultChecked
                    name="allowCard"
                    type="checkbox"
                    value="true"
                  />
                  Card
                </label>
                <label>
                  <input name="allowCash" type="checkbox" value="true" />
                  Cash
                </label>
                <label>
                  <input
                    defaultChecked
                    name="taxable"
                    type="checkbox"
                    value="true"
                  />
                  Taxable
                </label>
              </div>
            </div>
            <footer className="operator-form-footer">
              {notice(salesState)}
              <button
                className="hq-button hq-button--primary"
                disabled={salesPending}
                type="submit"
              >
                {salesPending ? "Preparing sales…" : "Turn on sales"}
              </button>
            </footer>
          </form>
        </section>
      )}

      {item.type === "good" && (
        <InventoryComposer catalogItemId={item.id} workspace={workspace} />
      )}

      <section className="hq-card catalog-editor__publication">
        <div>
          <span className="hq-eyebrow">Publication</span>
          <h2>
            {item.status === "active" ? "This offer is live." : "Private draft"}
          </h2>
          <p>Publishing makes the offer available to its selected audience.</p>
        </div>
        <div>
          <form action={statusAction}>
            <input name="catalogItemId" type="hidden" value={item.id} />
            <input name="status" type="hidden" value={nextStatus} />
            <input name="confirmed" type="hidden" value="true" />
            <button
              className="hq-button hq-button--primary"
              disabled={statusPending || inventoryOnlyGood}
              type="submit"
            >
              {inventoryOnlyGood
                ? "Set sales first"
                : statusPending
                  ? "Updating…"
                  : item.status === "active"
                    ? "Move to draft"
                    : "Publish offer"}
            </button>
          </form>
          {notice(statusState)}
        </div>
      </section>
    </div>
  );
}
