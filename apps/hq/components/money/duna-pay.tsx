import type { PayAccount } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import { Button, Chip, Notice } from "@duna/ui/tideline";
import type { ReactNode } from "react";
import { PageSection } from "../shell/page-header";
import { loadPublishGate, payProcessorConfigured } from "./money-data";
import {
  accountSentence,
  accountStatusCopy,
  bankStatusCopy,
  formatClubDate,
  readyUnlocks,
  verificationNote,
  whatYouNeed,
} from "./money-model";
import { StateChip } from "./money-parts";
import type { MoneyContext } from "./money-screen";
import {
  dunaPayPaths,
  setupNext,
  setupSteps,
  type SetupStepKey,
} from "./money-setup";
import { MoneySectionNav } from "./money-subnav";
import { StartVerificationButton } from "./start-verification";

/** The setup flow's steps beside the page (SectionNav with completion marks). */
export function DunaPaySteps({
  account,
  current,
}: {
  readonly account: PayAccount;
  readonly current?: SetupStepKey | "status";
}) {
  const steps = setupSteps(account);
  return (
    <MoneySectionNav
      current={current}
      groups={[
        {
          items: [
            {
              id: "status",
              label: "Where you stand",
              href: dunaPayPaths.home,
              description: accountStatusCopy(account.status).label,
            },
          ],
        },
        {
          label: "Steps",
          items: steps.map((step) => ({
            id: step.key,
            label: step.label,
            href: step.href,
            mark: step.mark,
            description: step.detail,
          })),
        },
      ]}
      label="Duna Pay setup"
      showProgress
    />
  );
}

/** The two-column frame of every Duna Pay page: steps on the left, the step on the right. */
export function DunaPayFrame({
  account,
  current,
  children,
}: {
  readonly account: PayAccount;
  readonly current?: SetupStepKey | "status";
  readonly children: ReactNode;
}) {
  return (
    <div className="money-setup">
      <aside className="money-setup__nav">
        <DunaPaySteps account={account} current={current} />
      </aside>
      <div className="money-setup__body">{children}</div>
    </div>
  );
}

/** What is wrong, in the backend's own words, with the deadline. */
export function Requirements({
  account,
  context,
}: {
  readonly account: PayAccount;
  readonly context: MoneyContext;
}) {
  if (account.requirementsDue.length === 0) return null;
  const due = formatClubDate(account.requirementsDueBy, context.timeZone);
  return (
    <div className="money-requirements">
      <p className="money-requirements__lead">
        {account.status === "restricted"
          ? "These are overdue, so payments or payouts are paused:"
          : due
            ? `Fix these by ${due}:`
            : "Still needed:"}
      </p>
      <ul className="money-requirements__list">
        {account.requirementsDue.map((requirement) => (
          <li key={requirement.code}>
            <Icon name="alert" size="inline" />
            <span>{requirement.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The status, one sentence, and the ONE next thing to do. */
export function DunaPayStatus({
  account,
  context,
}: {
  readonly account: PayAccount;
  readonly context: MoneyContext;
}) {
  const copy = accountStatusCopy(account.status);
  const next = setupNext(account);
  const configured = payProcessorConfigured();
  const verifyNext = next.kind === "step" && next.step.key === "verify";
  return (
    <section
      aria-labelledby="duna-pay-status-title"
      className="money-statuscard"
      data-status={account.status}
    >
      <div className="money-statuscard__head">
        <h2 className="money-statuscard__title" id="duna-pay-status-title">
          Where you stand
        </h2>
        <StateChip copy={copy} />
      </div>
      <p className="money-statuscard__sentence">
        {accountSentence(account, context.timeZone)}
      </p>
      <Requirements account={account} context={context} />
      {account.salesSuspendedAt ? (
        <Notice title="Sales are paused" tone="danger">
          {`Duna paused new sales on ${formatClubDate(account.salesSuspendedAt, context.timeZone)}. Contact Duna support to find out why and what to do.`}
        </Notice>
      ) : null}
      {!context.canWrite ? (
        <p className="money-quiet">
          {`Only an owner of ${context.organization} can change Duna Pay.`}
        </p>
      ) : next.kind === "done" ? (
        <div className="money-statuscard__actions">
          <Button href={hqHref("money")} variant="secondary">
            Open Money
          </Button>
        </div>
      ) : next.kind === "wait" ? (
        <p className="money-quiet">
          Nothing to do now. This page shows the result as soon as the check
          finishes.
        </p>
      ) : verifyNext && configured ? (
        <div className="money-statuscard__actions">
          <StartVerificationButton
            label={copy.next ?? "Continue verification"}
          />
        </div>
      ) : (
        <div className="money-statuscard__actions">
          <Button href={next.step.href} variant="primary">
            {verifyNext
              ? "See what verification needs"
              : copy.next && account.status !== "not-started"
                ? copy.next
                : next.step.label}
          </Button>
        </div>
      )}
    </section>
  );
}

/** Payout bank in one line. */
export function BankLine({ account }: { readonly account: PayAccount }) {
  const copy = bankStatusCopy(account.bank.status);
  return (
    <div className="money-bankline">
      <Icon name="wallet" size="control" />
      <span className="money-bankline__text">
        <strong>
          {account.bank.last4
            ? `${account.bank.name ?? "Bank account"} ending ${account.bank.last4}`
            : "No payout bank yet"}
        </strong>
        <span className="td-meta">{copy.sentence}</span>
      </span>
      <StateChip copy={copy} />
    </div>
  );
}

/** What "ready" unlocks. */
export function ReadyUnlocks({ ready }: { readonly ready: boolean }) {
  return (
    <PageSection
      id="duna-pay-unlocks"
      title={ready ? "What Duna Pay does for you" : "What ready unlocks"}
    >
      <ul className="money-checklist">
        {readyUnlocks.map((line) => (
          <li data-done={ready || undefined} key={line}>
            <Icon name={ready ? "success" : "check"} size="inline" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}

const gateLabels: Record<SetupStepKey, string> = {
  business: "Confirm your business details",
  verify: "Verify your identity",
  payouts: "Add a verified payout bank",
};

/** Why something can't go live yet: the backend's publish gate, explained. */
export async function PublishGateExplainer({
  context,
}: {
  readonly context: MoneyContext;
}) {
  const gate = await loadPublishGate();
  if (gate.state !== "ok" || gate.data.ready) return null;
  return (
    <PageSection id="duna-pay-gate" title="Publishing paid offerings">
      <p className="money-body">
        {`Paid offerings and events stay as drafts until ${context.organization} can take payments. Free ones can go live now.`}
      </p>
      <ol className="money-gate">
        {gate.data.steps.map((step) => (
          <li data-state={step.state} key={step.key}>
            <Icon
              name={step.state === "done" ? "success" : "clock"}
              size="inline"
            />
            <span>{gateLabels[step.key]}</span>
            <Chip tone={step.state === "done" ? "positive" : "neutral"}>
              {step.state === "done" ? "Done" : "To do"}
            </Chip>
          </li>
        ))}
      </ol>
      {gate.data.resumeHref ? (
        <Button href={gate.data.resumeHref} size="sm" variant="ghost">
          Back to the draft you were publishing
        </Button>
      ) : null}
    </PageSection>
  );
}

/**
 * The honest "not set up here yet" state: what Duna Pay is, what to have
 * ready, and how payouts work. Shown when this environment has no payment
 * keys (demo, and production until the owner sets live keys).
 */
export function DunaPayExplainer({
  account,
  context,
}: {
  readonly account: PayAccount;
  readonly context: MoneyContext;
}) {
  const firstPayout = formatClubDate(
    account.firstPayoutNotBefore,
    context.timeZone,
  );
  return (
    <>
      <Notice
        title="Duna Pay can't connect in this environment yet"
        tone="info"
      >
        {context.canWrite
          ? "Verification and payouts open once Duna Pay is switched on here. You can still confirm your business details now; nothing is charged and nothing is sent."
          : `Ask an owner of ${context.organization} about Duna Pay.`}
      </Notice>
      <PageSection id="duna-pay-what" title="What Duna Pay is">
        <p className="money-body">
          Duna Pay is how players pay your club inside Duna, and how that money
          reaches your bank. Players see every fee before they pay. You see
          every sale, what you're owed, and when it arrives, here in Money.
        </p>
      </PageSection>
      <PageSection id="duna-pay-need" title="What to have ready">
        <ul className="money-checklist">
          {whatYouNeed.map((line) => (
            <li key={line}>
              <Icon name="check" size="inline" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="money-quiet">{verificationNote}</p>
      </PageSection>
      <PageSection id="duna-pay-policy" title="How payouts work">
        <ul className="money-policy">
          <li>
            <strong>Paid once it's yours.</strong> Money from a sale is paid out
            once the payment has settled and the session, booking or event has
            taken place. Programs pay out session by session.
          </li>
          <li>
            <strong>Your first payout waits a little.</strong>{" "}
            {firstPayout
              ? `${context.organization}'s first payout can go out from ${firstPayout}.`
              : "A new club's first payout goes out a short time after its first payment; the date shows here once you take one."}
          </li>
          <li>
            <strong>Disputes are held.</strong> If a buyer disputes a payment
            with their bank, that amount is held until it's decided. You can
            send your side from Disputes.
          </li>
          <li>
            <strong>Refunds come from the sale first.</strong> A refund is taken
            from the sale's money not yet paid out, then from your balance.
          </li>
        </ul>
        <p className="money-quiet">
          The exact number of days is set in your Duna Pay terms and shown on
          each sale once payments start.
        </p>
      </PageSection>
    </>
  );
}
