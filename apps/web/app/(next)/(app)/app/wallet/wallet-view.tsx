"use client";

import { Icon } from "@duna/ui/icons";
import {
  Button,
  Card,
  ClubMark,
  EmptyState,
  ErrorState,
  MembershipCard,
  NotConfigured,
  Notice,
  Wallet,
  WalletActions,
  useConfirm,
  type TidelineTone,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { APP_ROUTES } from "@/lib/app-routes";
import { changeMembership } from "./actions";
import type {
  ClubSheet,
  MembershipManage,
  SheetRow,
  WalletModel,
} from "./wallet-model";

const BANNER_TONE: Record<
  NonNullable<ClubSheet["banner"]>["tone"],
  TidelineTone
> = {
  paused: "warning",
  pending: "info",
  expired: "danger",
  ending: "attention",
  held: "info",
};

/**
 * Add to Apple Wallet / Google Wallet. Needs API: a per-club store card
 * (PassKit web service) and a Google Wallet issuer (docs/design/wallet.md,
 * WALLET-4). No endpoint exists for a club card yet, so this renders
 * nothing; it is the one place the buttons go when it does.
 */
function AddToPhoneWallet(_: { readonly cardId: string }) {
  return null;
}

function Rows({
  rows,
  empty,
  icon,
}: {
  readonly rows: readonly SheetRow[];
  readonly empty: string;
  readonly icon: "calendar" | "check";
}) {
  if (rows.length === 0) return <p className="td-meta apw-quiet">{empty}</p>;
  return (
    <ul className="apw-rows">
      {rows.map((row) => (
        <li className="apw-row" key={row.id}>
          <Icon name={icon} size="inline" />
          <span className="apw-row__text">
            <span className="apw-row__title">{row.title}</span>
            <span className="td-meta">{row.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ManageMembership({
  manage,
  clubName,
}: {
  readonly manage: MembershipManage;
  readonly clubName: string;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const perform = async (
    action: "cancel" | "resume",
    idempotencyKey: string,
  ) => {
    const result = await changeMembership({
      membershipId: manage.membershipId,
      action,
      idempotencyKey,
    });
    if (!result.ok)
      throw Object.assign(new Error(result.message), {
        reference: result.reference,
      });
    router.refresh();
    return result;
  };
  const refundLine =
    manage.refundBehavior === "prorated"
      ? "The unused part of this paid period is refunded to the card you paid with."
      : manage.refundBehavior === "full-within-window"
        ? `The latest payment is refunded only if it was made in the last ${manage.refundWindowDays ?? 7} days.`
        : "Payments already made are not refunded, except where the law requires.";
  const cancel = () =>
    manage.cancellationTiming === "immediate"
      ? confirm.run({
          tier: manage.refundBehavior === "none" ? "confirm" : "strong",
          destructive: true,
          title: `Cancel your ${clubName} membership now?`,
          description: "Your membership and its pass end today.",
          consequence: refundLine,
          scope: `Your membership at ${clubName}`,
          verb: "Cancel membership now",
          cancelLabel: "Keep membership",
          agentConfirm: `Cancels the membership at ${clubName} immediately`,
          perform: ({ idempotencyKey }) => perform("cancel", idempotencyKey),
          success: (result) =>
            result.refundAmountMinor
              ? `Cancelled. A refund of ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(result.refundAmountMinor / 100)} was sent.`
              : "Membership cancelled",
        })
      : confirm.run({
          tier: "confirm",
          destructive: true,
          title: `End your ${clubName} membership?`,
          description: manage.periodEnd
            ? `It stays active until ${manage.periodEnd}, then it does not renew.`
            : "It stays active until the end of the paid period, then it does not renew.",
          affected: refundLine,
          verb: "End membership at renewal",
          cancelLabel: "Keep membership",
          agentConfirm: `Schedules the end of the membership at ${clubName}`,
          perform: ({ idempotencyKey }) => perform("cancel", idempotencyKey),
          success: manage.periodEnd
            ? `Your membership ends ${manage.periodEnd}`
            : "Your membership will not renew",
        });
  const resume = () =>
    confirm.run({
      tier: "confirm",
      title: `Keep your ${clubName} membership?`,
      description: "It renews automatically again at the end of this period.",
      verb: "Resume renewal",
      agentConfirm: `Resumes automatic renewal of the membership at ${clubName}`,
      perform: ({ idempotencyKey }) => perform("resume", idempotencyKey),
      success: "Automatic renewal resumed",
    });
  return (
    <>
      {manage.ending ? (
        <Button onClick={resume} size="sm" variant="secondary">
          Resume membership
        </Button>
      ) : (
        <Button onClick={cancel} size="sm" variant="secondary">
          {manage.cancellationTiming === "immediate"
            ? "Cancel membership"
            : "End membership"}
        </Button>
      )}
      {confirm.dialog}
    </>
  );
}

function Sheet({
  sheet,
  cardId,
  flipped,
  status,
}: {
  readonly sheet: ClubSheet;
  readonly cardId: string;
  readonly flipped: boolean;
  readonly status: string;
}) {
  return (
    <div className="apw-sheet">
      <header className="apw-sheet__head">
        <ClubMark decorative name={sheet.clubName} size="md" />
        <span className="apw-sheet__heading">
          <h2 className="td-title">{sheet.clubName}</h2>
          <span className="td-meta">{sheet.planLine}</span>
        </span>
      </header>
      {flipped && status !== "pending" && status !== "expired" ? (
        <Notice title="Show this at the front desk" tone="info">
          The desk scans the code on the back of your card. It is your Duna
          member credential today; a code that changes every 30 seconds comes
          with club passes.
          <AddToPhoneWallet cardId={cardId} />
        </Notice>
      ) : null}
      {sheet.banner ? (
        <Notice
          action={
            sheet.banner.action ? (
              <Button href={sheet.banner.action.href} size="sm">
                {sheet.banner.action.label}
              </Button>
            ) : undefined
          }
          tone={BANNER_TONE[sheet.banner.tone]}
        >
          {sheet.banner.text}
        </Notice>
      ) : null}
      {sheet.credits ? (
        <section aria-labelledby="apw-credits" className="apw-section">
          <h3 className="apw-label" id="apw-credits">
            Credits here
          </h3>
          <p className="apw-credits">
            <span className="apw-credits__count td-num">
              {sheet.credits.count}
            </span>
            <span className="td-meta">
              credit{sheet.credits.count === 1 ? "" : "s"}
              {sheet.credits.expiry ? ` · ${sheet.credits.expiry}` : ""}
            </span>
          </p>
        </section>
      ) : null}
      <section aria-labelledby="apw-next" className="apw-section">
        <h3 className="apw-label" id="apw-next">
          Up next here
        </h3>
        <Rows
          empty="Nothing booked here yet."
          icon="calendar"
          rows={sheet.upcoming}
        />
      </section>
      <section
        aria-labelledby="apw-benefits"
        className="apw-section"
        id="wallet-benefits"
      >
        <h3 className="apw-label" id="apw-benefits">
          Member benefits
        </h3>
        <p className="td-meta apw-quiet">
          Your plan&rsquo;s benefits are on {sheet.clubName}&rsquo;s page.{" "}
          <a href={sheet.clubHref}>See benefits</a>
        </p>
      </section>
      <section
        aria-labelledby="apw-activity"
        className="apw-section"
        id="wallet-activity"
      >
        <h3 className="apw-label" id="apw-activity">
          Activity
        </h3>
        <Rows empty="No sessions here yet." icon="check" rows={sheet.recent} />
      </section>
      <div className="apw-links">
        {sheet.manage ? (
          <ManageMembership clubName={sheet.clubName} manage={sheet.manage} />
        ) : null}
        <Button href={sheet.clubHref} size="sm" variant="secondary">
          Club page
        </Button>
      </div>
    </div>
  );
}

function Balance({ model }: { readonly model: WalletModel }) {
  if (!model.money && !model.predictions) return null;
  return (
    <section aria-labelledby="apw-money" className="apw-money">
      <h2 className="td-title" id="apw-money">
        Your Duna balance
      </h2>
      <div className="apw-money__grid">
        {model.money ? (
          <Card className="apw-money__card">
            {model.money.state === "ok" ? (
              <>
                <span className="apw-label">Available</span>
                <span className="apw-money__value td-num">
                  {model.money.data.available}
                </span>
                <span className="td-meta">
                  {model.money.data.pending} pending · the payment provider
                  holds and moves it; Duna never holds your money
                </span>
                {model.money.data.entries.length ? (
                  <ul className="apw-rows">
                    {model.money.data.entries.map((entry) => (
                      <li className="apw-row" key={entry.id}>
                        <span className="apw-row__text">
                          <span className="apw-row__title">{entry.title}</span>
                          <span className="td-meta">{entry.detail}</span>
                        </span>
                        <span className="td-num apw-row__amount">
                          {entry.amount}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="td-meta apw-quiet">No money movement yet.</p>
                )}
              </>
            ) : model.money.state === "error" ? (
              <ErrorState
                compact
                message="Your balance didn't load. Your money is safe."
                reference={model.money.reference}
                title="Balance didn't load"
              />
            ) : (
              <NotConfigured compact feature="Your Duna balance" />
            )}
          </Card>
        ) : null}
        {model.predictions ? (
          <Card className="apw-money__card">
            {model.predictions.state === "ok" ? (
              <>
                <span className="apw-label">Prediction credits</span>
                <span className="apw-money__value td-num">
                  {model.predictions.data.credits}
                </span>
                <a href={APP_ROUTES.predictions.path}>
                  Open your picks and markets
                </a>
              </>
            ) : model.predictions.state === "error" ? (
              <ErrorState
                compact
                message="Your prediction credits didn't load."
                reference={model.predictions.reference}
                title="Predictions didn't load"
              />
            ) : (
              <NotConfigured compact feature="Prediction credits" />
            )}
          </Card>
        ) : null}
      </div>
    </section>
  );
}

/** The wallet page: the wallet at the top, the selected card's sheet, then money. */
export function WalletView({
  model,
  memberName,
  demo,
}: {
  readonly model: WalletModel;
  readonly memberName: string;
  readonly demo: boolean;
}) {
  const [value, setValue] = useState(model.initial ?? model.cards[0]?.id);
  const [flipped, setFlipped] = useState(false);
  const selected =
    model.cards.find((card) => card.id === value) ?? model.cards[0];
  const sheet = selected ? model.sheets[selected.id] : undefined;
  const ended = selected?.status === "expired";

  const notice = model.passError ? (
    <>
      Your pass didn&rsquo;t load, so the back of each card shows no code.
      Reference: <span className="td-num">{model.passError}</span>
    </>
  ) : demo ? (
    "Demo mode: these are example clubs, and the pass is a sample."
  ) : model.actingFor ? (
    `${model.actingFor}'s club cards. You hold them as their guardian.`
  ) : undefined;

  return (
    <div className="apw">
      <Wallet
        actions={
          selected ? (
            <WalletActions
              items={[
                {
                  key: "pass",
                  label: flipped ? "Hide pass" : "Show pass",
                  icon: "pass",
                  pressed: flipped,
                  onClick: () => setFlipped(!flipped),
                },
                {
                  key: "book",
                  label: "Book",
                  icon: "calendar",
                  ...(sheet ? { href: sheet.clubHref } : {}),
                  disabled: ended || !sheet,
                  reason: "This membership has ended",
                },
                {
                  key: "benefits",
                  label: "Benefits",
                  icon: "verified",
                  href: "#wallet-benefits",
                },
                {
                  key: "activity",
                  label: "Activity",
                  icon: "timer",
                  href: "#wallet-activity",
                },
              ]}
              label={`Actions for ${selected.club.name}`}
            />
          ) : undefined
        }
        cards={model.cards}
        empty={
          model.cardsError ? (
            <ErrorState
              message="Your club cards didn't load. Your memberships and credits are safe."
              reference={model.cardsError}
              title="Cards didn't load"
            />
          ) : (
            <div className="apw-empty">
              <MembershipCard
                art={{ source: "set", key: "golden-dune" }}
                chip="Example"
                club={{ name: "Your club", color: "#1F4E5A" }}
                fact={{ kind: "credits", text: "8 credits" }}
                label="An example club card"
                member={memberName}
                motion="still"
                status="active"
              />
              <EmptyState
                actions={
                  <Button href={APP_ROUTES.search.path} variant="primary">
                    Find a club
                  </Button>
                }
                description={
                  model.actingFor
                    ? `When ${model.actingFor} has credits or a membership at a club, the card shows here.`
                    : "Join a club and its card lands here: swipe between your clubs and tap a card to show your pass at the front desk."
                }
                icon="member-card"
                title="Your club cards live here"
              />
            </div>
          )
        }
        flipped={flipped}
        label={
          model.actingFor
            ? `${model.actingFor}'s club cards`
            : "Your club cards"
        }
        notice={notice}
        onChange={(id) => {
          setValue(id);
          setFlipped(false);
        }}
        onFlip={setFlipped}
        title={<h1 className="td-display">{model.title}</h1>}
        toolbar={
          <a
            aria-label="Find a club"
            className="td-walletv__icon"
            href={APP_ROUTES.search.path}
            title="Find a club"
          >
            <Icon name="plus" size="control" />
          </a>
        }
        value={selected?.id}
      >
        {selected && sheet ? (
          <Sheet
            cardId={selected.id}
            flipped={flipped}
            sheet={sheet}
            status={selected.status}
          />
        ) : null}
      </Wallet>
      <Balance model={model} />
    </div>
  );
}
