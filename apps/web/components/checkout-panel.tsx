"use client";

import type {
  EventDivisionSummary,
  EventSummary,
  PersonSummary,
} from "@duna/core";
import { formatMoney } from "@duna/core";
import { priceConsumerOrder } from "@duna/pricing";
import { Badge, Numeric } from "@duna/ui";
import {
  Check,
  ChevronRight,
  Copy,
  CreditCard,
  Link2,
  LockKeyhole,
  Mail,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  Ticket,
  UserPlus,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  checkoutStatusAction,
  startEventCheckoutAction,
} from "@/app/app/checkout/[slug]/actions";

type PurchaseKind = "entry" | "ticket";
type CompletionState =
  "confirmed" | "pending-approval" | "waitlisted" | "already-registered";

interface TeamSlot {
  readonly index: number;
  readonly mode: "duna" | "invite";
  readonly personId?: string;
  readonly inviteTarget: string;
}

function teamSize(division?: EventDivisionSummary) {
  if (division?.teamSize) return division.teamSize;
  return {
    solo: 1,
    doubles: 2,
    "three-person": 3,
    "four-person": 4,
    "six-person": 6,
  }[division?.teamFormat ?? "solo"];
}

function divisionMeta(division: EventDivisionSummary) {
  return [
    division.teamFormat?.replaceAll("-", " ") ??
      division.discipline.replaceAll("-", " "),
    division.gender,
    division.surface,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function CheckoutPanel({
  event,
  initialDivisionId,
  initialTicketTypeId,
  initialTeamClaimToken,
  initialCheckoutSessionId,
  initialNotice,
  isDunaPlus,
  participants,
  player,
  searchablePlayers,
  walletAvailableMinor,
}: {
  readonly event: EventSummary;
  readonly initialDivisionId?: string;
  readonly initialTicketTypeId?: string;
  readonly initialTeamClaimToken?: string;
  readonly initialCheckoutSessionId?: string;
  readonly initialNotice?: string;
  readonly isDunaPlus: boolean;
  readonly participants: readonly {
    readonly person: PersonSummary;
    readonly label: string;
    readonly available: boolean;
  }[];
  readonly player: PersonSummary;
  readonly searchablePlayers: readonly PersonSummary[];
  readonly walletAvailableMinor: number;
}) {
  const initialTicket = event.tickets?.find(
    (ticketItem) => ticketItem.id === initialTicketTypeId,
  );
  const [purchaseKind, setPurchaseKind] = useState<PurchaseKind>(
    initialTicket ? "ticket" : "entry",
  );
  const [selectedDivisionId, setSelectedDivisionId] = useState(
    event.divisions?.find((division) => division.id === initialDivisionId)
      ?.id ?? event.divisions?.[0]?.id,
  );
  const [selectedTicketId, setSelectedTicketId] = useState(
    initialTicket?.id ?? event.tickets?.[0]?.id,
  );
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const firstAvailableParticipant =
    participants.find((participant) => participant.available) ??
    participants[0];
  const [selectedParticipantId, setSelectedParticipantId] = useState(
    firstAvailableParticipant?.person.id ?? player.id,
  );
  const [teamPaymentMode, setTeamPaymentMode] = useState<"self" | "team">(
    "self",
  );
  const [teamSlots, setTeamSlots] = useState<readonly TeamSlot[]>([]);
  const [acceptedPolicyIds, setAcceptedPolicyIds] = useState<readonly string[]>(
    [],
  );
  const [readPolicyIds, setReadPolicyIds] = useState<readonly string[]>([]);
  const [completion, setCompletion] = useState<CompletionState>();
  const [teamClaimToken, setTeamClaimToken] = useState(initialTeamClaimToken);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [error, setError] = useState<string>();
  const [processingReturn, setProcessingReturn] = useState(
    Boolean(initialCheckoutSessionId),
  );
  const [isPending, startTransition] = useTransition();
  const idempotencyKey = useRef(crypto.randomUUID());

  const selectedDivision = event.divisions?.find(
    (division) => division.id === selectedDivisionId,
  );
  const selectedTicket = event.tickets?.find(
    (ticketItem) => ticketItem.id === selectedTicketId,
  );
  const selectedParticipant =
    participants.find(
      (participant) => participant.person.id === selectedParticipantId,
    ) ?? firstAvailableParticipant;
  const selectedTeamSize =
    purchaseKind === "entry" ? teamSize(selectedDivision) : 1;
  const teamEntry = purchaseKind === "entry" && selectedTeamSize > 1;
  const price =
    purchaseKind === "ticket"
      ? (selectedTicket?.price ?? event.price)
      : (selectedDivision?.price ?? event.price);
  const purchaseQuantity =
    purchaseKind === "ticket"
      ? ticketQuantity
      : teamEntry &&
          teamPaymentMode === "team" &&
          selectedDivision?.priceBasis === "per-person"
        ? selectedTeamSize
        : 1;
  const pricing = useMemo(
    () =>
      priceConsumerOrder({
        currency: price.currency,
        isDunaPlus,
        items: [
          {
            id:
              purchaseKind === "ticket"
                ? (selectedTicket?.id ?? event.id)
                : (selectedDivision?.id ?? event.id),
            kind:
              purchaseKind === "ticket"
                ? "ticket"
                : event.kind === "tournament" || event.kind === "league"
                  ? "registration"
                  : "booking",
            description:
              purchaseKind === "ticket"
                ? `${event.title} · ${selectedTicket?.name ?? "Event ticket"}`
                : selectedDivision
                  ? `${event.title} · ${selectedDivision.name}`
                  : event.title,
            quantity: purchaseQuantity,
            unitAmountMinor: price.amountMinor,
          },
        ],
      }),
    [
      event.id,
      event.kind,
      event.title,
      isDunaPlus,
      price,
      purchaseKind,
      purchaseQuantity,
      selectedDivision,
      selectedTicket,
    ],
  );

  const applicablePolicies =
    event.policies?.filter(
      (policy) => purchaseKind === "entry" || policy.kind !== "waiver",
    ) ?? [];
  const requiredPolicies = applicablePolicies.filter(
    (policy) => policy.required,
  );
  const policiesAccepted = requiredPolicies.every((policy) =>
    acceptedPolicyIds.includes(policy.id),
  );
  const rosterComplete =
    !teamEntry ||
    teamSlots.every(
      (slot) =>
        (slot.mode === "duna" && Boolean(slot.personId)) ||
        (slot.mode === "invite" && slot.inviteTarget.trim().length >= 3),
    );
  const canCheckout =
    Boolean(
      purchaseKind === "ticket"
        ? selectedTicket
        : selectedParticipant?.available,
    ) &&
    rosterComplete &&
    policiesAccepted;

  useEffect(() => {
    const requiredSlots = Math.max(0, selectedTeamSize - 1);
    setTeamSlots((current) =>
      Array.from({ length: requiredSlots }, (_, index) => {
        const existing = current[index];
        return (
          existing ?? {
            index,
            mode: "duna" as const,
            inviteTarget: "",
          }
        );
      }),
    );
    setTeamPaymentMode(
      selectedDivision?.priceBasis === "per-team" ? "team" : "self",
    );
    idempotencyKey.current = crypto.randomUUID();
  }, [selectedDivision?.id, selectedDivision?.priceBasis, selectedTeamSize]);

  useEffect(() => {
    setAcceptedPolicyIds([]);
    setReadPolicyIds([]);
    idempotencyKey.current = crypto.randomUUID();
  }, [purchaseKind]);

  useEffect(() => {
    if (!initialCheckoutSessionId) return;
    let cancelled = false;
    let attempt = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      attempt += 1;
      const response = await checkoutStatusAction(initialCheckoutSessionId);
      if (cancelled) return;
      if (response.ok && response.status.complete) {
        setCompletion(
          response.status.fulfillmentStatus === "pending-approval"
            ? "pending-approval"
            : "confirmed",
        );
        setProcessingReturn(false);
        return;
      }
      if (
        response.ok &&
        ["failed", "cancelled", "refunded"].includes(
          response.status.orderStatus,
        )
      ) {
        setError(
          "Payment did not complete. Your temporary hold is being released.",
        );
        setProcessingReturn(false);
        return;
      }
      if (attempt >= 15) {
        setError(
          "Payment is still processing. Your hold remains protected; refresh shortly.",
        );
        setProcessingReturn(false);
        return;
      }
      timeout = setTimeout(poll, 2_000);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [initialCheckoutSessionId]);

  const changePurchaseKind = (kind: PurchaseKind) => {
    setPurchaseKind(kind);
    setError(undefined);
    idempotencyKey.current = crypto.randomUUID();
  };

  const updateTeamSlot = (index: number, patch: Partial<TeamSlot>) => {
    setTeamSlots((slots) =>
      slots.map((slot) =>
        slot.index === index ? { ...slot, ...patch } : slot,
      ),
    );
    idempotencyKey.current = crypto.randomUUID();
  };

  const inviteHref = teamClaimToken
    ? `/app/team/claim/${teamClaimToken}`
    : undefined;

  if (completion) {
    const ticketPurchase = purchaseKind === "ticket";
    return (
      <section className="checkout-complete">
        <span>
          <Check aria-hidden size={29} />
        </span>
        <Badge
          tone={
            completion === "waitlisted" || completion === "pending-approval"
              ? "warning"
              : "positive"
          }
        >
          {completion === "waitlisted"
            ? "Waitlisted"
            : completion === "pending-approval"
              ? "Host approval pending"
              : teamClaimToken
                ? "Captain secured"
                : "Confirmed"}
        </Badge>
        <h1>
          {completion === "waitlisted"
            ? "You’re on the list."
            : completion === "pending-approval"
              ? "Your request is with the host."
              : completion === "already-registered"
                ? "You were already in."
                : ticketPurchase
                  ? "Your tickets are ready."
                  : teamClaimToken
                    ? "Your team entry has started."
                    : "You’re in."}
        </h1>
        <p>
          {completion === "waitlisted"
            ? `${event.title} is full. Your position is saved and Duna will surface a promotion when capacity opens.`
            : completion === "pending-approval"
              ? `Payment is complete and your ${selectedTicket?.name ?? "ticket"} is reserved. It becomes scannable as soon as the host approves it.`
              : ticketPurchase
                ? `${event.title} is in your Duna plans. Your issued tickets remain connected to your account.`
                : teamClaimToken
                  ? "Your payment and captain spot are secured. The team confirms when every invited player claims their place and completes required agreements."
                  : `${event.title} is on your connected Duna calendar.`}
        </p>
        {inviteHref && (
          <div className="checkout-team-invite">
            <span>
              <Link2 aria-hidden size={18} />
              <strong>Team invite link</strong>
            </span>
            <code>{inviteHref}</code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(
                  `${window.location.origin}${inviteHref}`,
                );
                setCopiedInvite(true);
              }}
              type="button"
            >
              {copiedInvite ? (
                <Check aria-hidden size={16} />
              ) : (
                <Copy aria-hidden size={16} />
              )}
              {copiedInvite ? "Copied" : "Copy invite"}
            </button>
          </div>
        )}
        <a className="primary-action" href="/app/play">
          View your plans <ChevronRight aria-hidden size={17} />
        </a>
      </section>
    );
  }

  if (processingReturn) {
    return (
      <section className="checkout-complete" aria-live="polite">
        <Badge tone="warning">Confirming payment</Badge>
        <h1>Checkout sent you back safely.</h1>
        <p>
          Duna is verifying the signed payment event and converting your hold
          into a confirmed purchase.
        </p>
      </section>
    );
  }

  return (
    <div className="checkout-layout checkout-layout--event">
      <section className="checkout-main">
        {initialNotice && (
          <article className="checkout-section">
            <p>{initialNotice}</p>
          </article>
        )}
        <div className="checkout-intro">
          <span className="page-eyebrow">Secure Duna checkout</span>
          <h1>Join in a few clear steps.</h1>
          <p>
            Pick what you&apos;re buying, complete your people, review the
            agreements, then pay through secure checkout.
          </p>
        </div>

        {event.divisions?.length && event.tickets?.length ? (
          <div className="checkout-kind-switch" role="tablist">
            <button
              aria-selected={purchaseKind === "entry"}
              className={purchaseKind === "entry" ? "active" : undefined}
              onClick={() => changePurchaseKind("entry")}
              role="tab"
              type="button"
            >
              <UsersRound aria-hidden size={18} />
              Play
              <small>{event.divisions.length} divisions</small>
            </button>
            <button
              aria-selected={purchaseKind === "ticket"}
              className={purchaseKind === "ticket" ? "active" : undefined}
              onClick={() => changePurchaseKind("ticket")}
              role="tab"
              type="button"
            >
              <Ticket aria-hidden size={18} />
              Attend
              <small>{event.tickets.length} ticket types</small>
            </button>
          </div>
        ) : null}

        <article className="checkout-section">
          <div className="checkout-section__heading">
            <span>
              <Numeric>1</Numeric>
            </span>
            <h2>
              {purchaseKind === "ticket"
                ? "Choose a ticket"
                : "Choose a division"}
            </h2>
            {isDunaPlus && <Badge tone="positive">Duna+ fee waiver</Badge>}
          </div>

          {purchaseKind === "ticket" ? (
            <>
              <div className="checkout-ticket-grid">
                {event.tickets
                  ?.filter((ticketItem) => ticketItem.availableOnline)
                  .map((ticketItem) => (
                    <label
                      className={
                        ticketItem.id === selectedTicketId
                          ? "selected"
                          : undefined
                      }
                      key={ticketItem.id}
                    >
                      <input
                        checked={ticketItem.id === selectedTicketId}
                        name="ticket"
                        onChange={() => {
                          setSelectedTicketId(ticketItem.id);
                          setTicketQuantity(1);
                          idempotencyKey.current = crypto.randomUUID();
                        }}
                        type="radio"
                      />
                      <span>
                        <strong>{ticketItem.name}</strong>
                        <small>
                          {ticketItem.description ??
                            `${ticketItem.remaining ?? "Unlimited"} available`}
                          {ticketItem.approvalRequired
                            ? " · Host approval required"
                            : ""}
                        </small>
                      </span>
                      <Numeric>
                        {ticketItem.price.amountMinor === 0
                          ? "Free"
                          : formatMoney(
                              ticketItem.price.amountMinor,
                              ticketItem.price.currency,
                            )}
                      </Numeric>
                    </label>
                  ))}
              </div>
              <div className="checkout-quantity">
                <span>
                  <strong>Quantity</strong>
                  <small>Up to 10 per order</small>
                </span>
                <div>
                  <button
                    aria-label="Decrease ticket quantity"
                    disabled={ticketQuantity <= 1}
                    onClick={() => {
                      setTicketQuantity((value) => Math.max(1, value - 1));
                      idempotencyKey.current = crypto.randomUUID();
                    }}
                    type="button"
                  >
                    <Minus aria-hidden size={15} />
                  </button>
                  <Numeric>{ticketQuantity}</Numeric>
                  <button
                    aria-label="Increase ticket quantity"
                    disabled={
                      ticketQuantity >=
                      Math.min(10, selectedTicket?.remaining ?? 10)
                    }
                    onClick={() => {
                      setTicketQuantity((value) => Math.min(10, value + 1));
                      idempotencyKey.current = crypto.randomUUID();
                    }}
                    type="button"
                  >
                    <Plus aria-hidden size={15} />
                  </button>
                </div>
              </div>
            </>
          ) : event.divisions && event.divisions.length > 0 ? (
            <div className="checkout-division-grid">
              {event.divisions.map((division) => (
                <label
                  className={
                    division.id === selectedDivisionId ? "selected" : undefined
                  }
                  key={division.id}
                >
                  <input
                    checked={division.id === selectedDivisionId}
                    name="division"
                    onChange={() => {
                      setSelectedDivisionId(division.id);
                      idempotencyKey.current = crypto.randomUUID();
                    }}
                    type="radio"
                  />
                  <span>
                    <strong>{division.name}</strong>
                    <small>
                      {divisionMeta(division)} ·{" "}
                      <Numeric>{division.spotsRemaining}</Numeric> spots
                    </small>
                  </span>
                  <span>
                    <Numeric>
                      {division.price.amountMinor === 0
                        ? "Free"
                        : formatMoney(
                            division.price.amountMinor,
                            division.price.currency,
                          )}
                    </Numeric>
                    <small>
                      {division.priceBasis === "per-team"
                        ? "per team"
                        : "per player"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="checkout-player">
              <Check aria-hidden size={18} />
              <span>
                <strong>{event.kind.replaceAll("-", " ")}</strong>
                <small>
                  <Numeric>{event.spotsRemaining}</Numeric> of{" "}
                  <Numeric>{event.capacity}</Numeric> spots remain
                </small>
              </span>
              <Numeric>
                {price.amountMinor === 0
                  ? "Free"
                  : formatMoney(price.amountMinor, price.currency)}
              </Numeric>
            </div>
          )}
        </article>

        {purchaseKind === "entry" && (
          <article className="checkout-section">
            <div className="checkout-section__heading">
              <span>
                <Numeric>2</Numeric>
              </span>
              <h2>Who&apos;s playing</h2>
              <Badge>Guardian rules enforced</Badge>
            </div>
            <div className="checkout-player">
              <span className="avatar">
                {selectedParticipant?.person.initials ?? player.initials}
              </span>
              <span>
                <strong>
                  {selectedParticipant?.person.displayName ??
                    player.displayName}
                </strong>
                <small>
                  Sand Rating{" "}
                  {(
                    selectedParticipant?.person.rating.display ??
                    player.rating.display
                  ).toFixed(2)}{" "}
                  · eligibility checked on confirmation
                </small>
              </span>
              {participants.length > 1 ? (
                <select
                  aria-label="Participant"
                  onChange={(eventValue) => {
                    setSelectedParticipantId(eventValue.target.value);
                    idempotencyKey.current = crypto.randomUUID();
                  }}
                  value={selectedParticipantId}
                >
                  {participants.map((participant) => (
                    <option
                      disabled={!participant.available}
                      key={participant.person.id}
                      value={participant.person.id}
                    >
                      {participant.person.displayName} · {participant.label}
                      {participant.available ? "" : " · verification pending"}
                    </option>
                  ))}
                </select>
              ) : selectedParticipant?.available ? (
                <Check aria-hidden size={18} />
              ) : (
                <Badge tone="warning">Guardian required</Badge>
              )}
            </div>
            {!selectedParticipant?.available && (
              <p className="checkout-inline-warning">
                A verified adult guardian must complete this participant flow.
                Guardian review status is available in Settings.
              </p>
            )}
          </article>
        )}

        {teamEntry && (
          <article className="checkout-section checkout-team-section">
            <div className="checkout-section__heading">
              <span>
                <Numeric>3</Numeric>
              </span>
              <h2>Complete your team</h2>
              <Badge>
                {selectedTeamSize}{" "}
                {selectedTeamSize === 2 ? "players" : "people"}
              </Badge>
            </div>
            <p className="checkout-section-copy">
              Search Duna or enter a phone or email. Invitations activate after
              your checkout starts; the team confirms when every player joins
              and completes required agreements.
            </p>
            <div className="checkout-roster">
              <article className="checkout-roster__captain">
                <span className="avatar">
                  {selectedParticipant?.person.initials ?? player.initials}
                </span>
                <span>
                  <strong>
                    {selectedParticipant?.person.displayName ??
                      player.displayName}
                  </strong>
                  <small>Captain · ready</small>
                </span>
                <Check aria-hidden size={18} />
              </article>
              {teamSlots.map((slot) => {
                const selectedPerson = searchablePlayers.find(
                  (candidate) => candidate.id === slot.personId,
                );
                const usedIds = teamSlots
                  .map((candidate) => candidate.personId)
                  .filter(Boolean);
                return (
                  <article className="checkout-roster__slot" key={slot.index}>
                    <header>
                      <span>
                        {selectedPerson ? (
                          <span className="avatar">
                            {selectedPerson.initials}
                          </span>
                        ) : (
                          <UserPlus aria-hidden size={18} />
                        )}
                        <strong>Player {slot.index + 2}</strong>
                      </span>
                      <div>
                        <button
                          className={
                            slot.mode === "duna" ? "active" : undefined
                          }
                          onClick={() =>
                            updateTeamSlot(slot.index, {
                              mode: "duna",
                              inviteTarget: "",
                            })
                          }
                          type="button"
                        >
                          <Search aria-hidden size={14} /> Duna
                        </button>
                        <button
                          className={
                            slot.mode === "invite" ? "active" : undefined
                          }
                          onClick={() =>
                            updateTeamSlot(slot.index, {
                              mode: "invite",
                              personId: undefined,
                            })
                          }
                          type="button"
                        >
                          <Mail aria-hidden size={14} /> Invite
                        </button>
                      </div>
                    </header>
                    {slot.mode === "duna" ? (
                      <label>
                        <span>Search Duna players</span>
                        <select
                          onChange={(selection) =>
                            updateTeamSlot(slot.index, {
                              personId: selection.target.value || undefined,
                            })
                          }
                          value={slot.personId ?? ""}
                        >
                          <option value="">Choose a player</option>
                          {searchablePlayers
                            .filter(
                              (candidate) =>
                                candidate.id !== selectedParticipantId &&
                                (!usedIds.includes(candidate.id) ||
                                  candidate.id === slot.personId),
                            )
                            .map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.displayName} ·{" "}
                                {candidate.rating.display.toFixed(2)} ·{" "}
                                {candidate.homeMarket.split(",")[0]}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : (
                      <label>
                        <span>Phone or email</span>
                        <input
                          onChange={(entry) =>
                            updateTeamSlot(slot.index, {
                              inviteTarget: entry.target.value,
                            })
                          }
                          placeholder="teammate@example.com or +1 310…"
                          value={slot.inviteTarget}
                        />
                      </label>
                    )}
                  </article>
                );
              })}
            </div>

            {selectedDivision?.priceBasis === "per-person" ? (
              <div className="checkout-team-payment">
                <button
                  className={teamPaymentMode === "self" ? "active" : undefined}
                  onClick={() => {
                    setTeamPaymentMode("self");
                    idempotencyKey.current = crypto.randomUUID();
                  }}
                  type="button"
                >
                  <span>
                    <strong>Pay my entry</strong>
                    <small>Teammates pay when they claim</small>
                  </span>
                  <Numeric>
                    {formatMoney(price.amountMinor, price.currency)}
                  </Numeric>
                </button>
                <button
                  className={teamPaymentMode === "team" ? "active" : undefined}
                  onClick={() => {
                    setTeamPaymentMode("team");
                    idempotencyKey.current = crypto.randomUUID();
                  }}
                  type="button"
                >
                  <span>
                    <strong>Pay for the whole team</strong>
                    <small>Profiles and waivers are still individual</small>
                  </span>
                  <Numeric>
                    {formatMoney(
                      price.amountMinor * selectedTeamSize,
                      price.currency,
                    )}
                  </Numeric>
                </button>
              </div>
            ) : (
              <div className="checkout-team-price-note">
                <UsersRound aria-hidden size={18} />
                <span>
                  <strong>One team price</strong>
                  <small>
                    The captain pays the configured team entry. Every player
                    still claims their own Duna profile.
                  </small>
                </span>
                <Numeric>
                  {formatMoney(price.amountMinor, price.currency)}
                </Numeric>
              </div>
            )}
          </article>
        )}

        {applicablePolicies.length > 0 && (
          <article className="checkout-section checkout-agreements">
            <div className="checkout-section__heading">
              <span>
                <Numeric>
                  {teamEntry ? 4 : purchaseKind === "entry" ? 3 : 2}
                </Numeric>
              </span>
              <h2>Policies + waivers</h2>
              <Badge tone="warning">{requiredPolicies.length} required</Badge>
            </div>
            <p className="checkout-section-copy">
              Required waivers unlock after you reach the end. Duna records the
              exact document and acceptance state with your order.
            </p>
            <div className="checkout-agreement-list">
              {applicablePolicies.map((policy) => {
                const mustRead =
                  policy.kind === "waiver" || policy.requireFullScroll;
                const read = !mustRead || readPolicyIds.includes(policy.id);
                const accepted = acceptedPolicyIds.includes(policy.id);
                return (
                  <article key={policy.id}>
                    <header>
                      <span>
                        <ShieldCheck aria-hidden size={17} />
                        <strong>{policy.title}</strong>
                      </span>
                      <Badge
                        tone={policy.kind === "waiver" ? "warning" : "neutral"}
                      >
                        {policy.kind}
                      </Badge>
                    </header>
                    <div
                      className="checkout-agreement-scroll"
                      onScroll={(scrollArea) => {
                        const target = scrollArea.currentTarget;
                        if (
                          target.scrollTop + target.clientHeight >=
                          target.scrollHeight - 8
                        ) {
                          setReadPolicyIds((current) =>
                            current.includes(policy.id)
                              ? current
                              : [...current, policy.id],
                          );
                        }
                      }}
                      tabIndex={0}
                    >
                      {policy.markdown}
                      {mustRead && (
                        <span className="checkout-agreement-end">
                          End of {policy.kind}
                        </span>
                      )}
                    </div>
                    <label>
                      <input
                        checked={accepted}
                        disabled={!read}
                        onChange={(acceptance) =>
                          setAcceptedPolicyIds((current) =>
                            acceptance.target.checked
                              ? [...current, policy.id]
                              : current.filter((id) => id !== policy.id),
                          )
                        }
                        type="checkbox"
                      />
                      <span>
                        <strong>
                          {read
                            ? `I agree to ${policy.title}`
                            : "Scroll to the end to continue"}
                        </strong>
                        {policy.required
                          ? "Required for this purchase"
                          : "Optional acknowledgement"}
                      </span>
                    </label>
                  </article>
                );
              })}
            </div>
          </article>
        )}

        <article className="checkout-section">
          <div className="checkout-section__heading">
            <span>
              <Numeric>
                {applicablePolicies.length
                  ? teamEntry
                    ? 5
                    : purchaseKind === "entry"
                      ? 4
                      : 3
                  : teamEntry
                    ? 4
                    : purchaseKind === "entry"
                      ? 3
                      : 2}
              </Numeric>
            </span>
            <h2>Pay your way</h2>
          </div>
          <label className="payment-choice">
            <input checked={false} disabled readOnly type="checkbox" />
            <WalletCards aria-hidden size={21} />
            <span>
              <strong>Use Duna Wallet</strong>
              <small>
                <Numeric>
                  {formatMoney(walletAvailableMinor, price.currency)}
                </Numeric>{" "}
                available · split tender activates with production wallet rails
              </small>
            </span>
            <Numeric>{formatMoney(0, price.currency)}</Numeric>
          </label>
          {pricing.totalMinor > 0 && (
            <label className="payment-choice selected">
              <input defaultChecked name="payment" type="radio" />
              <CreditCard aria-hidden size={21} />
              <span>
                <strong>Secure checkout</strong>
                <small>Choose a saved card or another supported method</small>
              </span>
              <Numeric>
                {formatMoney(pricing.totalMinor, price.currency)}
              </Numeric>
            </label>
          )}
        </article>

        {!isDunaPlus &&
          event.kind !== "tournament" &&
          event.kind !== "league" && (
            <article className="checkout-plus">
              <div>
                <Badge tone="positive">Duna+</Badge>
                <h3>Make the platform fee disappear.</h3>
                <p>
                  Start at $7.99/month. Pause any time, up to four months each
                  year.
                </p>
              </div>
              <Link href="/app/settings">View Duna+</Link>
            </article>
          )}
      </section>

      <aside className="checkout-summary">
        <div className="checkout-summary__art">
          <Badge>
            {purchaseKind === "ticket"
              ? "Event ticket"
              : event.kind.replaceAll("-", " ")}
          </Badge>
        </div>
        <h2>{event.title}</h2>
        <p>{event.venueName}</p>
        <p className="checkout-summary__division">
          {purchaseKind === "ticket"
            ? selectedTicket?.name
            : selectedDivision
              ? `${selectedDivision.name} · ${divisionMeta(selectedDivision)}`
              : event.kind.replaceAll("-", " ")}
        </p>
        <div className="checkout-summary__math">
          <span>
            <small>
              {purchaseKind === "ticket"
                ? `${ticketQuantity} ticket${ticketQuantity === 1 ? "" : "s"}`
                : teamEntry &&
                    teamPaymentMode === "team" &&
                    selectedDivision?.priceBasis === "per-person"
                  ? `${selectedTeamSize} player entries`
                  : "Registration"}
            </small>
            <Numeric>
              {formatMoney(pricing.subtotalMinor, price.currency)}
            </Numeric>
          </span>
          {pricing.fees.map((fee) => (
            <span key={fee.id}>
              <small>{fee.label}</small>
              <Numeric>{formatMoney(fee.amountMinor, price.currency)}</Numeric>
            </span>
          ))}
          {isDunaPlus && (
            <span className="positive">
              <small>Duna+ platform-fee waiver</small>
              <Numeric>Included</Numeric>
            </span>
          )}
          <span className="checkout-summary__total">
            <strong>Total</strong>
            <Numeric>{formatMoney(pricing.totalMinor, price.currency)}</Numeric>
          </span>
        </div>
        {purchaseKind === "ticket" && selectedTicket?.approvalRequired && (
          <div className="checkout-summary__team">
            <ShieldCheck aria-hidden size={17} />
            <span>
              <strong>Host approval required</strong>
              <small>
                Payment reserves the ticket; scanning unlocks after approval.
              </small>
            </span>
          </div>
        )}
        {teamEntry && (
          <div className="checkout-summary__team">
            <UsersRound aria-hidden size={17} />
            <span>
              <strong>
                {1 +
                  teamSlots.filter((slot) => slot.personId || slot.inviteTarget)
                    .length}{" "}
                of {selectedTeamSize} players added
              </strong>
              <small>
                {rosterComplete
                  ? "Roster invitations are ready"
                  : "Complete every player slot"}
              </small>
            </span>
          </div>
        )}
        {requiredPolicies.length > 0 && (
          <div className="checkout-summary__team">
            <ShieldCheck aria-hidden size={17} />
            <span>
              <strong>
                {
                  requiredPolicies.filter((policy) =>
                    acceptedPolicyIds.includes(policy.id),
                  ).length
                }{" "}
                of {requiredPolicies.length} agreements
              </strong>
              <small>
                {policiesAccepted
                  ? "All required agreements accepted"
                  : "Review required documents"}
              </small>
            </span>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          className="checkout-summary__pay"
          disabled={isPending || !canCheckout}
          onClick={() => {
            setError(undefined);
            startTransition(async () => {
              const response = await startEventCheckoutAction({
                sessionId: event.id,
                slug: event.slug,
                divisionId:
                  purchaseKind === "entry" ? selectedDivision?.id : undefined,
                ticketTypeId:
                  purchaseKind === "ticket" ? selectedTicket?.id : undefined,
                ticketQuantity:
                  purchaseKind === "ticket" ? ticketQuantity : undefined,
                teamPaymentMode: teamEntry ? teamPaymentMode : undefined,
                teamRoster: teamEntry
                  ? teamSlots.map((slot) => {
                      const person = searchablePlayers.find(
                        (candidate) => candidate.id === slot.personId,
                      );
                      return {
                        personId:
                          slot.mode === "duna" ? slot.personId : undefined,
                        inviteTarget:
                          slot.mode === "invite"
                            ? slot.inviteTarget.trim()
                            : undefined,
                        displayName: person?.displayName,
                      };
                    })
                  : undefined,
                subjectPersonId:
                  purchaseKind === "entry"
                    ? selectedParticipant?.person.id
                    : undefined,
                acceptedPolicyIds: acceptedPolicyIds.filter((id) =>
                  applicablePolicies.some((policy) => policy.id === id),
                ),
                readPolicyIds: readPolicyIds.filter((id) =>
                  applicablePolicies.some((policy) => policy.id === id),
                ),
                isDunaPlus,
                idempotencyKey: idempotencyKey.current,
              });
              if (!response.ok) {
                setError(response.error);
                idempotencyKey.current = crypto.randomUUID();
                return;
              }
              const result = response.result;
              if (result.teamClaimToken) {
                setTeamClaimToken(result.teamClaimToken);
              }
              if (result.mode === "stripe" && result.checkoutUrl) {
                window.location.assign(result.checkoutUrl);
                return;
              }
              setCompletion(
                result.fulfillmentStatus === "pending-approval"
                  ? "pending-approval"
                  : result.mode === "waitlist"
                    ? "waitlisted"
                    : result.mode === "already-registered"
                      ? "already-registered"
                      : "confirmed",
              );
            });
          }}
        >
          <LockKeyhole aria-hidden size={17} />
          {isPending
            ? "Securing your purchase…"
            : !rosterComplete
              ? "Complete your team"
              : !policiesAccepted
                ? "Review required agreements"
                : pricing.totalMinor > 0
                  ? `Continue to payment · ${formatMoney(pricing.totalMinor, price.currency)}`
                  : purchaseKind === "ticket"
                    ? "Confirm free tickets"
                    : "Confirm free registration"}
        </button>
        <p className="checkout-summary__trust">
          <ShieldCheck aria-hidden size={16} />
          Payments are processed securely. Card details never touch Duna.
        </p>
      </aside>
    </div>
  );
}
