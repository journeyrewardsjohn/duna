"use client";

import type { PromoCodeWorkspace } from "@duna/api";
import {
  BadgeDollarSign,
  CalendarRange,
  Check,
  Copy,
  Percent,
  TicketPercent,
  UsersRound,
} from "lucide-react";
import { useActionState, useState } from "react";
import {
  createPromoCodeAction,
  deactivatePromoCodeAction,
  duplicatePromoCodeAction,
  type PromoActionState,
} from "@/app/promo-codes/actions";

const initialState: PromoActionState = { status: "idle", message: "" };

function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
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
  const [discountType, setDiscountType] = useState<"percent" | "amount">(
    "percent",
  );
  const [scopeSearch, setScopeSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<
    readonly string[]
  >([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<readonly string[]>(
    [],
  );
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
    `${item.title} ${item.type}`
      .toLowerCase()
      .includes(scopeSearch.toLowerCase()),
  );
  const visibleMembers = workspace.members.filter((member) =>
    `${member.displayName} ${member.email ?? ""}`
      .toLowerCase()
      .includes(memberSearch.toLowerCase()),
  );

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

      <div className="promo-workspace__grid">
        <section className="hq-card promo-builder">
          <header>
            <span className="hq-eyebrow">New promotion</span>
            <h2>Build an offer people can act on.</h2>
            <p>
              Duna enforces who, what, when, and how often. Stripe receives the
              coupon and promotion-code records used at payment.
            </p>
          </header>
          <form action={action}>
            <input
              name="currency"
              type="hidden"
              value={workspace.organization.currency}
            />
            {selectedCatalogIds.map((id) => (
              <input key={id} name="catalogItemIds" type="hidden" value={id} />
            ))}
            {selectedMemberIds.map((id) => (
              <input key={id} name="memberPersonIds" type="hidden" value={id} />
            ))}
            <div className="operator-form-grid operator-form-grid--two">
              <label>
                <span>Campaign name</span>
                <input
                  name="name"
                  placeholder="Fall membership push"
                  required
                />
              </label>
              <label>
                <span>Customer code</span>
                <input
                  autoCapitalize="characters"
                  name="code"
                  pattern="[A-Za-z0-9-]{3,48}"
                  placeholder="FALL20"
                  required
                />
              </label>
            </div>

            <fieldset className="promo-builder__section">
              <legend>Discount</legend>
              <div className="promo-segmented">
                <label>
                  <input
                    checked={discountType === "percent"}
                    name="discountType"
                    onChange={() => setDiscountType("percent")}
                    type="radio"
                    value="percent"
                  />
                  <span>Percentage off</span>
                </label>
                <label>
                  <input
                    checked={discountType === "amount"}
                    name="discountType"
                    onChange={() => setDiscountType("amount")}
                    type="radio"
                    value="amount"
                  />
                  <span>Dollars off</span>
                </label>
              </div>
              <div className="operator-form-grid operator-form-grid--three">
                <label>
                  <span>
                    {discountType === "percent" ? "Percent off" : "USD off"}
                  </span>
                  <input
                    max={discountType === "percent" ? 100 : undefined}
                    min="0.01"
                    name="discountValue"
                    placeholder={discountType === "percent" ? "20" : "10.00"}
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
                <label>
                  <span>Minimum purchase · optional</span>
                  <input
                    min="0.01"
                    name="minimumPurchase"
                    placeholder="50.00"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label>
                  <span>Maximum discount · optional</span>
                  <input
                    min="0.01"
                    name="maximumDiscount"
                    placeholder="100.00"
                    step="0.01"
                    type="number"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="promo-builder__section">
              <legend>Eligible offers</legend>
              <div className="promo-scope-all">
                <label>
                  <input name="appliesToAllPlans" type="checkbox" />
                  <span>
                    <strong>All plans</strong>Memberships and credit plans
                  </span>
                </label>
                <label>
                  <input name="appliesToAllServices" type="checkbox" />
                  <span>
                    <strong>All services</strong>Lessons, programs, and bookings
                  </span>
                </label>
                <label>
                  <input name="appliesToAllProducts" type="checkbox" />
                  <span>
                    <strong>All products</strong>Goods, events, and merchandise
                  </span>
                </label>
              </div>
              <label className="promo-search">
                <span>
                  Or choose individual offers · {selectedCatalogIds.length}{" "}
                  selected
                </span>
                <input
                  onChange={(event) => setScopeSearch(event.target.value)}
                  placeholder="Search plans, products, services…"
                  type="search"
                  value={scopeSearch}
                />
              </label>
              <div className="promo-multiselect">
                {visibleCatalog.map((item) => (
                  <label key={item.id}>
                    <input
                      checked={selectedCatalogIds.includes(item.id)}
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
                      {item.type} · {item.subtype}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="promo-builder__section">
              <legend>Timing and limits</legend>
              <div className="operator-form-grid operator-form-grid--two">
                <label>
                  <span>Starts · optional</span>
                  <input name="startsAt" type="datetime-local" />
                </label>
                <label>
                  <span>Ends · optional</span>
                  <input name="endsAt" type="datetime-local" />
                </label>
                <label>
                  <span>Total uses · blank is unlimited</span>
                  <input
                    min="1"
                    name="redemptionCap"
                    placeholder="Unlimited"
                    type="number"
                  />
                </label>
                <label>
                  <span>Uses per member · blank is unlimited</span>
                  <input
                    min="1"
                    name="perPersonLimit"
                    placeholder="Unlimited"
                    type="number"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="promo-builder__section">
              <legend>Member eligibility · optional</legend>
              <label className="promo-search">
                <span>
                  Leave everyone unselected to allow any eligible buyer ·{" "}
                  {selectedMemberIds.length} selected
                </span>
                <input
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="Search members…"
                  type="search"
                  value={memberSearch}
                />
              </label>
              <div className="promo-multiselect promo-multiselect--members">
                {visibleMembers.map((member) => (
                  <label key={member.id}>
                    <input
                      checked={selectedMemberIds.includes(member.id)}
                      onChange={(event) =>
                        setSelectedMemberIds((current) =>
                          event.target.checked
                            ? [...current, member.id]
                            : current.filter((id) => id !== member.id),
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      <strong>{member.displayName}</strong>
                      {member.email ?? "Member"}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

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
            <button
              className="hq-button hq-button--primary"
              disabled={pending}
              type="submit"
            >
              <TicketPercent aria-hidden size={17} />
              {pending ? "Creating…" : "Create promo code"}
            </button>
          </form>
        </section>

        <section className="promo-list">
          <header>
            <span className="hq-eyebrow">Campaigns</span>
            <h2>Live performance, one code at a time.</h2>
          </header>
          {workspace.promoCodes.length ? (
            workspace.promoCodes.map((promo) => (
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
                <footer>
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
                        Deactivate
                      </button>
                    </form>
                  ) : null}
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
            ))
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
    </div>
  );
}
