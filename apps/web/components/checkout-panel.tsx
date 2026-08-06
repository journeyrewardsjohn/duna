"use client";

import type { TeammateSearchResult } from "@duna/api";
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
  searchTeammatesAction,
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

function participantEligibility(
  participant: {
    readonly person: PersonSummary;
    readonly available: boolean;
    readonly unavailableReason?: string;
    readonly birthDate?: string;
    readonly genderCategory?: string;
  },
  division?: EventDivisionSummary,
  eligibilityDate?: string,
) {
  if (!participant.available) {
    return {
      eligible: false,
      reason: participant.unavailableReason ?? "Guardian verification required",
    };
  }
  if (
    division?.ratingMinimum !== undefined &&
    participant.person.rating.display < division.ratingMinimum
  ) {
    return {
      eligible: false,
      reason: `Rating must be ${division.ratingMinimum.toFixed(2)}+`,
    };
  }
  if (
    division?.ratingMaximum !== undefined &&
    participant.person.rating.display > division.ratingMaximum
  ) {
    return {
      eligible: false,
      reason: `Rating must be ${division.ratingMaximum.toFixed(2)} or below`,
    };
  }
  const age = participant.birthDate
    ? Math.floor(
        (new Date(eligibilityDate ?? Date.now()).getTime() -
          new Date(`${participant.birthDate}T00:00:00Z`).getTime()) /
          (365.2425 * 24 * 60 * 60_000),
      )
    : undefined;
  if (
    division?.ageMinimum !== undefined &&
    (age === undefined || age < division.ageMinimum)
  ) {
    return {
      eligible: false,
      reason:
        age === undefined
          ? "Age verification is required"
          : `Must be ${division.ageMinimum}+`,
    };
  }
  if (
    division?.ageMaximum !== undefined &&
    (age === undefined || age > division.ageMaximum)
  ) {
    return {
      eligible: false,
      reason:
        age === undefined
          ? "Age verification is required"
          : `Must be ${division.ageMaximum} or younger`,
    };
  }
  const requiredGender = division?.gender?.toLowerCase() ?? "";
  const participantGender = participant.genderCategory?.toLowerCase() ?? "";
  const womenOnly = /women|woman|female|girls?/.test(requiredGender);
  const menOnly =
    !womenOnly && /(^|\W)(men|man|male|boys?)(\W|$)/.test(requiredGender);
  if (womenOnly || menOnly) {
    const matches = womenOnly
      ? /women|woman|female|girls?/.test(participantGender)
      : /(^|\W)(men|man|male|boys?)(\W|$)/.test(participantGender);
    if (!matches) {
      return {
        eligible: false,
        reason: participantGender
          ? `Not eligible for this ${division?.gender} division`
          : "Gender eligibility is not verified",
      };
    }
  }
  return { eligible: true, reason: "Eligible for this division" };
}

function participantAgeLabel(
  birthDate: string | undefined,
  ageBand: "unknown" | "under-13" | "teen" | "adult" | undefined,
  eligibilityDate: string,
) {
  if (birthDate) {
    const age = Math.floor(
      (new Date(eligibilityDate).getTime() -
        new Date(`${birthDate}T00:00:00Z`).getTime()) /
        (365.2425 * 24 * 60 * 60_000),
    );
    return `Age ${Math.max(0, age)}`;
  }
  return ageBand && ageBand !== "unknown"
    ? ageBand.replace("under-13", "Under 13")
    : "Age not set";
}

export function CheckoutPanel({
  event,
  initialDivisionId,
  initialTicketTypeId,
  initialTicketQuantity,
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
  readonly initialTicketQuantity?: number;
  readonly initialTeamClaimToken?: string;
  readonly initialCheckoutSessionId?: string;
  readonly initialNotice?: string;
  readonly isDunaPlus: boolean;
  readonly participants: readonly {
    readonly person: PersonSummary;
    readonly label: string;
    readonly available: boolean;
    readonly unavailableReason?: string;
    readonly birthDate?: string;
    readonly ageBand?: "unknown" | "under-13" | "teen" | "adult";
    readonly genderCategory?: string;
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
  const [ticketQuantity, setTicketQuantity] = useState(
    Math.max(1, Math.min(10, initialTicketQuantity ?? 1)),
  );
  const [showDivisionChoices, setShowDivisionChoices] =
    useState(!initialDivisionId);
  const firstAvailableParticipant =
    participants.find((participant) => participant.available) ??
    participants[0];
  const [selectedParticipantId, setSelectedParticipantId] = useState(
    firstAvailableParticipant?.person.id ?? player.id,
  );
  const [teamPaymentMode, setTeamPaymentMode] = useState<"self" | "team">(
    "self",
  );
  const [teamSlots, setTeamSlots] = useState<readonly TeamSlot[]>(() => {
    const initialDivision =
      event.divisions?.find((division) => division.id === initialDivisionId) ??
      event.divisions?.[0];
    return Array.from(
      { length: Math.max(0, teamSize(initialDivision) - 1) },
      (_, index) => ({
        index,
        mode: "duna" as const,
        inviteTarget: "",
      }),
    );
  });
  const [teamSearch, setTeamSearch] = useState("");
  const [remoteTeammates, setRemoteTeammates] =
    useState<readonly TeammateSearchResult[]>();
  const [searchingTeammates, setSearchingTeammates] = useState(false);
  const [inviteTarget, setInviteTarget] = useState("");
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
  const selectedParticipantEligibility = selectedParticipant
    ? participantEligibility(
        selectedParticipant,
        selectedDivision,
        event.startsAt,
      )
    : { eligible: false, reason: "Choose a player" };
  const selectedTeamSize =
    purchaseKind === "entry" ? teamSize(selectedDivision) : 1;
  const teamEntry = purchaseKind === "entry" && selectedTeamSize > 1;
  const organizingTeam = teamEntry && !initialTeamClaimToken;
  const price =
    purchaseKind === "ticket"
      ? (selectedTicket?.price ?? event.price)
      : teamEntry && teamPaymentMode === "team"
        ? (selectedDivision?.teamPrice ??
          selectedDivision?.price ??
          event.price)
        : (selectedDivision?.playerPrice ??
          selectedDivision?.price ??
          event.price);
  const purchaseQuantity = purchaseKind === "ticket" ? ticketQuantity : 1;
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
    !organizingTeam ||
    teamSlots.every(
      (slot) =>
        (slot.mode === "duna" && Boolean(slot.personId)) ||
        (slot.mode === "invite" && slot.inviteTarget.trim().length >= 3),
    );
  const canCheckout =
    Boolean(
      purchaseKind === "ticket"
        ? selectedTicket
        : selectedParticipantEligibility.eligible,
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
    setTeamPaymentMode("self");
    setTeamSearch("");
    setInviteTarget("");
    idempotencyKey.current = crypto.randomUUID();
  }, [selectedDivision?.id, selectedTeamSize]);

  useEffect(() => {
    setAcceptedPolicyIds([]);
    setReadPolicyIds([]);
    idempotencyKey.current = crypto.randomUUID();
  }, [purchaseKind]);

  useEffect(() => {
    if (!organizingTeam) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      setSearchingTeammates(true);
      void searchTeammatesAction({
        query: teamSearch.trim() || undefined,
        divisionId: selectedDivision?.id,
      }).then((result) => {
        if (cancelled) return;
        if (result.ok) setRemoteTeammates(result.results);
        setSearchingTeammates(false);
      });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [organizingTeam, selectedDivision?.id, teamSearch]);

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

  const usedTeamPersonIds = teamSlots
    .map((slot) => slot.personId)
    .filter((personId): personId is string => Boolean(personId));
  const normalizedTeamSearch = teamSearch.trim().toLowerCase();
  const remotePeople = remoteTeammates?.map((result) => result.person);
  const suggestedPlayers = (
    remotePeople && remotePeople.length > 0 ? remotePeople : searchablePlayers
  )
    .filter(
      (candidate) =>
        candidate.id !== selectedParticipantId &&
        !usedTeamPersonIds.includes(candidate.id) &&
        (normalizedTeamSearch.length === 0 ||
          `${candidate.displayName} ${candidate.handle} ${candidate.homeMarket}`
            .toLowerCase()
            .includes(normalizedTeamSearch)),
    )
    .sort((left, right) => {
      const selectedMarket = selectedParticipant?.person.homeMarket;
      const leftLocal = left.homeMarket === selectedMarket ? 0 : 1;
      const rightLocal = right.homeMarket === selectedMarket ? 0 : 1;
      return (
        leftLocal - rightLocal ||
        left.displayName.localeCompare(right.displayName)
      );
    })
    .slice(0, normalizedTeamSearch ? 8 : 6);
  const searchMetadata = new Map(
    remoteTeammates?.map((result) => [result.person.id, result] as const),
  );

  const addTeamPerson = (personId: string) => {
    const openSlot = teamSlots.find(
      (slot) => !slot.personId && slot.inviteTarget.trim().length === 0,
    );
    if (!openSlot) return;
    updateTeamSlot(openSlot.index, {
      mode: "duna",
      personId,
      inviteTarget: "",
    });
    setTeamSearch("");
  };

  const addTeamInvite = () => {
    const target = inviteTarget.trim();
    const openSlot = teamSlots.find(
      (slot) => !slot.personId && slot.inviteTarget.trim().length === 0,
    );
    if (!openSlot || target.length < 3) return;
    updateTeamSlot(openSlot.index, {
      mode: "invite",
      personId: undefined,
      inviteTarget: target,
    });
    setInviteTarget("");
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
                : selectedDivision && !showDivisionChoices
                  ? "Your division"
                  : "Choose a division"}
            </h2>
            {isDunaPlus && <Badge tone="positive">Premium fee waiver</Badge>}
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
          ) : event.divisions &&
            event.divisions.length > 0 &&
            selectedDivision &&
            !showDivisionChoices ? (
            <div className="checkout-division-current">
              <span>
                <Check aria-hidden size={18} />
              </span>
              <div>
                <strong>{selectedDivision.name}</strong>
                <small>
                  {divisionMeta(selectedDivision)} ·{" "}
                  <Numeric>{selectedDivision.spotsRemaining}</Numeric> spots
                </small>
              </div>
              <div className="checkout-division-current__prices">
                <span>
                  <small>Team</small>
                  <Numeric>
                    {formatMoney(
                      selectedDivision.teamPrice.amountMinor,
                      selectedDivision.teamPrice.currency,
                    )}
                  </Numeric>
                </span>
                <span>
                  <small>Player</small>
                  <Numeric>
                    {formatMoney(
                      selectedDivision.playerPrice.amountMinor,
                      selectedDivision.playerPrice.currency,
                    )}
                  </Numeric>
                </span>
              </div>
              {event.divisions.length > 1 && (
                <button
                  onClick={() => setShowDivisionChoices(true)}
                  type="button"
                >
                  Change
                </button>
              )}
            </div>
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
                      setShowDivisionChoices(false);
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
                      {division.playerPrice.amountMinor === 0
                        ? "Free"
                        : formatMoney(
                            division.playerPrice.amountMinor,
                            division.playerPrice.currency,
                          )}
                    </Numeric>
                    <small>
                      per player ·{" "}
                      {formatMoney(
                        division.teamPrice.amountMinor,
                        division.teamPrice.currency,
                      )}{" "}
                      team
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
            <div
              aria-label="Choose the player registering"
              className="checkout-participant-grid"
              role="radiogroup"
            >
              {participants.map((participant) => {
                const eligibility = participantEligibility(
                  participant,
                  selectedDivision,
                  event.startsAt,
                );
                const selected =
                  participant.person.id === selectedParticipantId;
                return (
                  <button
                    aria-checked={selected}
                    className={`${selected ? "selected" : ""} ${eligibility.eligible ? "" : "ineligible"}`}
                    disabled={!eligibility.eligible}
                    key={participant.person.id}
                    onClick={() => {
                      setSelectedParticipantId(participant.person.id);
                      idempotencyKey.current = crypto.randomUUID();
                    }}
                    role="radio"
                    type="button"
                  >
                    <span className="avatar">
                      {participant.person.avatarUrl ? (
                        <img alt="" src={participant.person.avatarUrl} />
                      ) : (
                        participant.person.initials
                      )}
                    </span>
                    <span>
                      <strong>{participant.person.displayName}</strong>
                      <small>
                        {participant.label} ·{" "}
                        {participantAgeLabel(
                          participant.birthDate,
                          participant.ageBand,
                          event.startsAt,
                        )}{" "}
                        ·{" "}
                        <Numeric>
                          {participant.person.rating.display.toFixed(2)}
                        </Numeric>
                      </small>
                      <em>{eligibility.reason}</em>
                    </span>
                    {selected && eligibility.eligible && (
                      <Check aria-hidden size={17} />
                    )}
                  </button>
                );
              })}
            </div>
            {!selectedParticipantEligibility.eligible && (
              <p className="checkout-inline-warning">
                {selectedParticipantEligibility.reason}. Choose another profile
                or return to the event page for a matching division.
              </p>
            )}
            {initialTeamClaimToken && (
              <div className="checkout-invited-team-note">
                <Link2 aria-hidden size={18} />
                <span>
                  <strong>Your team spot is already claimed</strong>
                  <small>
                    This checkout covers only your player registration. The
                    captain&apos;s roster remains connected automatically.
                  </small>
                </span>
              </div>
            )}
          </article>
        )}

        {organizingTeam && (
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
                return (
                  <article
                    className={`checkout-roster__member ${selectedPerson || slot.inviteTarget ? "filled" : "open"}`}
                    key={slot.index}
                  >
                    <span className="avatar">
                      {selectedPerson?.avatarUrl ? (
                        <img alt="" src={selectedPerson.avatarUrl} />
                      ) : selectedPerson ? (
                        selectedPerson.initials
                      ) : slot.inviteTarget ? (
                        <Mail aria-hidden size={18} />
                      ) : (
                        <UserPlus aria-hidden size={18} />
                      )}
                    </span>
                    <span>
                      <strong>
                        {selectedPerson?.displayName ??
                          (slot.inviteTarget || `Player ${slot.index + 2}`)}
                      </strong>
                      <small>
                        {selectedPerson
                          ? `${selectedPerson.homeMarket} · ${selectedPerson.rating.display.toFixed(2)}`
                          : slot.inviteTarget
                            ? "Invitation sends after checkout starts"
                            : "Open teammate spot"}
                      </small>
                    </span>
                    {(selectedPerson || slot.inviteTarget) && (
                      <button
                        aria-label={`Remove player ${slot.index + 2}`}
                        onClick={() =>
                          updateTeamSlot(slot.index, {
                            mode: "duna",
                            personId: undefined,
                            inviteTarget: "",
                          })
                        }
                        type="button"
                      >
                        <Minus aria-hidden size={16} />
                      </button>
                    )}
                  </article>
                );
              })}
            </div>

            {teamSlots.some(
              (slot) => !slot.personId && slot.inviteTarget.trim().length === 0,
            ) && (
              <div className="checkout-team-finder">
                <label>
                  <Search aria-hidden size={19} />
                  <input
                    aria-label="Search Duna players"
                    onChange={(entry) => setTeamSearch(entry.target.value)}
                    placeholder="Search by player, location, or rating"
                    value={teamSearch}
                  />
                  {searchingTeammates && <small>Searching…</small>}
                </label>
                <div className="checkout-team-suggestions">
                  {suggestedPlayers.map((candidate) => {
                    const metadata = searchMetadata.get(candidate.id);
                    const localEligibility = participantEligibility(
                      { person: candidate, available: true },
                      selectedDivision,
                    );
                    const eligibility = metadata
                      ? {
                          eligible: metadata.eligible,
                          reason:
                            metadata.eligibilityReasons[0] ??
                            (metadata.relationship === "recent-partner"
                              ? `${metadata.sharedTeams} shared ${metadata.sharedTeams === 1 ? "team" : "teams"}`
                              : metadata.relationship === "nearby"
                                ? "Plays near you"
                                : "Eligible for this division"),
                        }
                      : localEligibility;
                    return (
                      <article
                        className={
                          eligibility.eligible ? undefined : "ineligible"
                        }
                        key={candidate.id}
                      >
                        <span className="avatar">
                          {candidate.avatarUrl ? (
                            <img alt="" src={candidate.avatarUrl} />
                          ) : (
                            candidate.initials
                          )}
                        </span>
                        <strong>{candidate.displayName}</strong>
                        <small>
                          {candidate.homeMarket}
                          {metadata
                            ? ` · ${metadata.gender.replaceAll("-", " ")}`
                            : ""}
                        </small>
                        <span>
                          <em>{eligibility.reason}</em>
                          <Numeric>
                            {candidate.rating.display.toFixed(2)}
                          </Numeric>
                        </span>
                        <button
                          disabled={!eligibility.eligible}
                          onClick={() => addTeamPerson(candidate.id)}
                          type="button"
                        >
                          <Plus aria-hidden size={15} /> Add
                        </button>
                      </article>
                    );
                  })}
                </div>
                <div className="checkout-team-invite-row">
                  <Mail aria-hidden size={18} />
                  <input
                    onChange={(entry) => setInviteTarget(entry.target.value)}
                    placeholder="Invite with email or mobile number"
                    value={inviteTarget}
                  />
                  <button
                    disabled={inviteTarget.trim().length < 3}
                    onClick={addTeamInvite}
                    type="button"
                  >
                    Send after payment
                  </button>
                </div>
              </div>
            )}

            <div className="checkout-team-completion">
              <span>
                <strong>
                  {1 +
                    teamSlots.filter(
                      (slot) => slot.personId || slot.inviteTarget,
                    ).length}{" "}
                  of {selectedTeamSize} players added
                </strong>
                <small>
                  Registration becomes complete when at least {selectedTeamSize}{" "}
                  players have claimed and paid their required share.
                </small>
              </span>
              <div>
                <i
                  style={{
                    width: `${((1 + teamSlots.filter((slot) => slot.personId || slot.inviteTarget).length) / selectedTeamSize) * 100}%`,
                  }}
                />
              </div>
            </div>

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
                  <strong>Pay my registration</strong>
                  <small>Each teammate gets a link to claim and pay</small>
                </span>
                <Numeric>
                  {formatMoney(
                    selectedDivision?.playerPrice.amountMinor ??
                      price.amountMinor,
                    selectedDivision?.playerPrice.currency ?? price.currency,
                  )}
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
                  <small>
                    You can edit invitations until registration closes
                  </small>
                </span>
                <Numeric>
                  {formatMoney(
                    selectedDivision?.teamPrice.amountMinor ??
                      price.amountMinor,
                    selectedDivision?.teamPrice.currency ?? price.currency,
                  )}
                </Numeric>
              </button>
            </div>
          </article>
        )}

        {applicablePolicies.length > 0 && (
          <article className="checkout-section checkout-agreements">
            <div className="checkout-section__heading">
              <span>
                <Numeric>
                  {organizingTeam ? 4 : purchaseKind === "entry" ? 3 : 2}
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
                  ? organizingTeam
                    ? 5
                    : purchaseKind === "entry"
                      ? 4
                      : 3
                  : organizingTeam
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
                <Badge tone="positive">Premium</Badge>
                <h3>Make the Duna service fee disappear.</h3>
                <p>
                  Start at $9.99/month. Pause any time, up to four months each
                  year.
                </p>
              </div>
              <Link href="/app/settings">View Premium</Link>
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
                : organizingTeam && teamPaymentMode === "team"
                  ? `Full ${selectedTeamSize}-player team entry`
                  : organizingTeam
                    ? "Your player registration"
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
              <small>Premium service-fee waiver</small>
              <span>Included</span>
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
        {organizingTeam && (
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
                  ? teamPaymentMode === "team"
                    ? "You are covering the team; every player still claims their profile"
                    : "Invited teammates must claim and pay before the team is complete"
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
                teamPaymentMode: organizingTeam ? teamPaymentMode : undefined,
                teamClaimToken: initialTeamClaimToken,
                teamRoster: organizingTeam
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
