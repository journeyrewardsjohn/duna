"use client";

import { report } from "@duna/observability";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogClose,
  DialogContent,
  EmptyState,
  Input,
  Notice,
  Rise,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  riseClassName,
  rallyStyle,
  errorToast,
  useConfirm,
  type TidelineTone,
} from "@duna/ui/tideline";
import { useState } from "react";
import type { AppDependent } from "@/components/app-shell/session-types";
import { AppLink } from "@/components/app-shell/navigation";
import { unwrap } from "../action-result";
import { icsFor, type Agenda, type PlanItem } from "../agenda-model";
import { OfflineNotice } from "../states";
import {
  cancelHostedPickupAction,
  cancelPlanAction,
  createInviteAction,
  joinWaitlistAction,
} from "./actions";

const TONE: Readonly<Record<PlanItem["tone"], TidelineTone | "neutral">> = {
  positive: "positive",
  warning: "warning",
  attention: "attention",
  danger: "danger",
  info: "info",
};

function downloadCalendar(item: PlanItem) {
  const blob = new Blob([icsFor(item, new Date().toISOString())], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${item.title.replace(/[^\w]+/g, "-").toLowerCase() || "plan"}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function InviteDialog({
  open,
  onOpenChange,
  title,
  url,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly url: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const absolute = url
    ? new URL(
        url,
        typeof window === "undefined"
          ? "https://duna.coach"
          : window.location.origin,
      ).toString()
    : "";
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        description="Send it yourself, in your own words. Duna doesn’t send anything for you."
        title="Invite a friend"
      >
        <div className="pp-stack">
          <label className="pp-label" htmlFor="pp-invite-link">
            Link to {title}
          </label>
          <Input id="pp-invite-link" readOnly value={absolute} />
          <p aria-live="polite" className="td-meta">
            {copied
              ? "Link copied"
              : "Anyone with the link sees the session and can book a place."}
          </p>
        </div>
        <DialogActions>
          <DialogClose variant="secondary">Done</DialogClose>
          {canShare ? (
            <Button
              onClick={() =>
                void navigator
                  .share({ title, url: absolute })
                  .catch(() => undefined)
              }
              variant="secondary"
            >
              Share…
            </Button>
          ) : null}
          <Button
            onClick={() =>
              void navigator.clipboard
                ?.writeText(absolute)
                .then(() => setCopied(true))
                .catch(() => setCopied(false))
            }
            variant="primary"
          >
            Copy link
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

function PlanCard({
  item,
  index,
  onCancel,
  onLeaveWaitlist,
  onInvite,
  onCancelHosted,
  whose,
}: {
  readonly item: PlanItem;
  readonly index: number;
  readonly onCancel: (item: PlanItem) => void;
  readonly onLeaveWaitlist: (item: PlanItem) => void;
  readonly onInvite: (item: PlanItem) => void;
  readonly onCancelHosted: (item: PlanItem) => void;
  /** "my" or "Remy's". */
  readonly whose: string;
}) {
  const actions = item.actions;
  return (
    <li className={riseClassName()} style={rallyStyle(index)}>
      <Card className="pp-plan">
        <div className="pp-plan__top">
          <Chip kind="status" tone={TONE[item.tone]}>
            {item.waitlist?.position
              ? `${item.stateLabel} · number ${item.waitlist.position}`
              : item.stateLabel}
          </Chip>
          {item.forName ? (
            <Chip kind="identity" tone="neutral">
              For {item.forName}
            </Chip>
          ) : null}
          <span className="pp-plan__kind">{item.kindLabel}</span>
        </div>
        <h3 className="pp-plan__title">
          <a className="pp-plan__link" href={item.href}>
            {item.title}
          </a>
        </h3>
        <p className="pp-plan__when td-num">
          {item.timeRange}
          {item.yourTime ? (
            <span className="pp-plan__yours"> {item.yourTime}</span>
          ) : null}
        </p>
        {item.place ? <p className="pp-plan__where">{item.place}</p> : null}
        {item.participation ? (
          <p className="pp-plan__group">
            <Chip kind="status" tone="neutral">
              {item.participation.status}
            </Chip>
            {item.participation.line ? (
              <span className="td-meta">{item.participation.line}</span>
            ) : null}
          </p>
        ) : null}
        {item.people.length > 0 ? (
          <p className="td-meta">With {item.people.join(", ")}</p>
        ) : null}
        {item.priceLine || item.cancellationLine ? (
          <dl className="pp-plan__terms">
            {item.priceLine ? (
              <div>
                <dt>Price</dt>
                <dd>{item.priceLine}</dd>
              </div>
            ) : null}
            {item.cancellationLine ? (
              <div>
                <dt>Cancelling</dt>
                <dd>{item.cancellationLine}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        {item.past ? null : (
          <div className="pp-plan__actions">
            {actions.cancel ? (
              <Button
                onClick={() => onCancel(item)}
                size="sm"
                variant="secondary"
              >
                {whose === "my" ? "Cancel my place" : `Cancel ${whose} place`}
              </Button>
            ) : null}
            {actions.leaveWaitlist ? (
              <Button
                onClick={() => onLeaveWaitlist(item)}
                size="sm"
                variant="secondary"
              >
                Leave the waitlist
              </Button>
            ) : null}
            {actions.invite && !item.waitlist ? (
              <Button
                icon={<Icon name="user-plus" size="inline" />}
                onClick={() => onInvite(item)}
                size="sm"
                variant="secondary"
              >
                Invite a friend
              </Button>
            ) : null}
            {actions.edit ? (
              <Button href={actions.edit} size="sm" variant="secondary">
                Edit pickup
              </Button>
            ) : null}
            {actions.cancelHosted ? (
              <Button
                onClick={() => onCancelHosted(item)}
                size="sm"
                variant="ghost"
              >
                Call it off
              </Button>
            ) : null}
            <Button
              icon={<Icon name="calendar" size="inline" />}
              onClick={() => downloadCalendar(item)}
              size="sm"
              variant="ghost"
            >
              Add to calendar
            </Button>
          </div>
        )}
      </Card>
    </li>
  );
}

export interface PlayViewProps {
  readonly agenda: Agenda;
  readonly actingFor: AppDependent | null;
  readonly junior: boolean;
  readonly catalogMissing?: { readonly reference: string };
}

export function PlayView({
  agenda,
  actingFor,
  junior,
  catalogMissing,
}: PlayViewProps) {
  const confirm = useConfirm();
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [left, setLeft] = useState<readonly PlanItem[]>([]);
  const [invite, setInvite] = useState<{
    title: string;
    url: string | null;
  } | null>(null);
  const whoseFor = (item: PlanItem) =>
    item.forName ? `${item.forName}’s` : "my";

  const hide = (item: PlanItem) =>
    setGone((current) => new Set([...current, item.id]));

  const cancel = (item: PlanItem) => {
    const plan = item.actions.cancel;
    if (!plan) return;
    const whose = item.forName ? `${item.forName}’s` : "your";
    const late =
      plan.kind === "catalog" && !plan.free
        ? plan.lateCharge && plan.lateCharge > 0
          ? `Cancelling now costs ${plan.lateCharge} credit${plan.lateCharge === 1 ? "" : "s"}. You get them back if someone takes the place.`
          : "Cancelling now returns nothing."
        : null;
    const what =
      plan.kind === "catalog"
        ? plan.free
          ? `${plan.creditsReserved} credit${plan.creditsReserved === 1 ? "" : "s"} come back to the wallet at once.`
          : late!
        : plan.kind === "pickup"
          ? "The spot opens for someone else."
          : item.cancellationLine?.startsWith("Free")
            ? `${item.cancellationLine}. Duna shows exactly what comes back as soon as it is cancelled.`
            : "Duna shows exactly what comes back, and when, as soon as it is cancelled.";
    void confirm
      .run({
        tier: late ? "strong" : "confirm",
        destructive: true,
        title: `Cancel ${whose} place in ${item.title}?`,
        description: `${item.dayLabel} · ${item.timeRange}. ${what}`,
        ...(late
          ? {
              amount:
                plan.kind === "catalog" && plan.lateCharge
                  ? `${plan.lateCharge} credit${plan.lateCharge === 1 ? "" : "s"}`
                  : "Nothing comes back",
              consequence: late,
            }
          : {}),
        verb: item.forName
          ? `Cancel ${item.forName}’s place`
          : "Cancel my place",
        cancelLabel: "Keep the place",
        agentConfirm: `Cancels ${whose} place in ${item.title} on ${item.dayLabel}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await cancelPlanAction({
              plan,
              demoId: item.id.replace(/^(booking|catalog):/, ""),
              idempotencyKey,
            }),
          ),
        success: (answer) => answer.message,
        report: (error) => report(error, { event: "web.play.cancel_failed" }),
      })
      .then((outcome) => {
        if (outcome.status === "done") hide(item);
      });
  };

  const leaveWaitlist = (item: PlanItem) => {
    const plan = item.actions.leaveWaitlist;
    if (!plan) return;
    void confirm
      .run({
        tier: "confirm",
        destructive: true,
        title: "Leave the waitlist?",
        description: `You’ll lose your place in line for ${item.title}.`,
        verb: "Leave the waitlist",
        cancelLabel: "Stay",
        agentConfirm: `Leaves the waitlist for ${item.title}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await cancelPlanAction({
              plan,
              demoId: item.id.replace(/^(booking|catalog):/, ""),
              idempotencyKey,
            }),
          ),
        success: "You left the waitlist",
        report: (error) =>
          report(error, { event: "web.play.leave_waitlist_failed" }),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          hide(item);
          setLeft((current) => [...current, item]);
        }
      });
  };

  const rejoin = (item: PlanItem) => {
    const join = item.actions.joinWaitlist;
    if (!join) return;
    void confirm
      .run({
        tier: "confirm",
        title: `Join the waitlist for ${item.title}?`,
        description:
          "If a place opens, Duna holds it for you and tells you. Nothing is charged until you book it.",
        verb: "Join the waitlist",
        cancelLabel: "Not now",
        agentConfirm: `Joins the waitlist for ${item.title}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await joinWaitlistAction({
              ...join,
              demoId: item.id.replace(/^(booking|catalog):/, ""),
              idempotencyKey,
            }),
          ),
        success: (answer) =>
          answer.status === "offered"
            ? "A place is held for you"
            : `You’re number ${answer.position} on the waitlist`,
        report: (error) =>
          report(error, { event: "web.play.join_waitlist_failed" }),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setLeft((current) => current.filter((entry) => entry.id !== item.id));
          setGone((current) => {
            const next = new Set(current);
            next.delete(item.id);
            return next;
          });
        }
      });
  };

  const openInvite = async (item: PlanItem) => {
    const subject = item.actions.invite;
    if (!subject) return;
    setInvite({ title: item.title, url: null });
    try {
      const link = unwrap(await createInviteAction(subject));
      setInvite({ title: item.title, url: link.url });
    } catch (error) {
      setInvite(null);
      errorToast(
        error instanceof Error
          ? error.message
          : "Couldn’t make an invite link.",
      );
      report(error, { event: "web.play.invite_failed" });
    }
  };

  const cancelHosted = (item: PlanItem) => {
    const hosted = item.actions.cancelHosted;
    if (!hosted) return;
    void confirm
      .run({
        tier: "confirm",
        destructive: true,
        title: `Call off ${item.title}?`,
        description:
          "Nobody else has joined yet, so it simply comes off Duna. You can host it again any time.",
        verb: "Call off the pickup",
        cancelLabel: "Keep it",
        agentConfirm: `Cancels the pickup ${item.title}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await cancelHostedPickupAction({
              pickupSessionId: hosted.pickupSessionId,
              idempotencyKey,
            }),
          ),
        success: "Pickup called off",
        report: (error) =>
          report(error, { event: "web.play.cancel_pickup_failed" }),
      })
      .then((outcome) => {
        if (outcome.status === "done") hide(item);
      });
  };

  const days = agenda.upcoming
    .map((day) => ({
      ...day,
      items: day.items.filter((item) => !gone.has(item.id)),
    }))
    .filter((day) => day.items.length > 0);
  const firstName = actingFor?.firstName;
  let index = 0;

  return (
    <>
      <OfflineNotice />
      {actingFor ? (
        <Notice tone="info">
          These are {firstName}’s plans. You act for {firstName} as their
          guardian: anything you change is made by you and comes to you.
        </Notice>
      ) : null}
      {catalogMissing ? (
        <Notice tone="warning" title="Lessons and clinics didn’t load">
          Your other plans are here. Reload to try again. Reference{" "}
          <span className="td-num">{catalogMissing.reference}</span>
        </Notice>
      ) : null}
      <Tabs defaultValue="upcoming">
        <TabList aria-label="Which plans">
          <Tab value="upcoming">Coming up</Tab>
          <Tab value="past">Past</Tab>
        </TabList>
        <TabPanel value="upcoming">
          {days.length === 0 && left.length === 0 ? (
            <EmptyState
              actions={
                <>
                  <Button href="/app/discover" variant="primary">
                    Find a game
                  </Button>
                  {!junior && !actingFor ? (
                    <Button href="/app/pickup/new" variant="secondary">
                      Host a pickup
                    </Button>
                  ) : null}
                </>
              }
              description={
                actingFor
                  ? `When ${firstName} is booked into a session, lesson or event it shows here, with what it costs and until when you can cancel for free.`
                  : "Book a court, join a clinic or a pickup, and it shows here with what it costs and until when you can cancel for free."
              }
              icon="calendar"
              title={
                actingFor
                  ? `Nothing booked for ${firstName} yet`
                  : "Nothing planned yet"
              }
            />
          ) : (
            <div className="pp-agenda">
              {days.map((day) => (
                <section
                  aria-labelledby={`pp-day-${day.key}`}
                  className="pp-day"
                  key={day.key}
                >
                  <h2 className="pp-day__label" id={`pp-day-${day.key}`}>
                    {day.label}
                  </h2>
                  <ul className="pp-list">
                    {day.items.map((item) => (
                      <PlanCard
                        index={index++}
                        item={item}
                        key={item.id}
                        onCancel={cancel}
                        onCancelHosted={cancelHosted}
                        onInvite={(plan) => void openInvite(plan)}
                        onLeaveWaitlist={leaveWaitlist}
                        whose={whoseFor(item)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
              {left.map((item) => (
                <Rise key={`left:${item.id}`}>
                  <Card className="pp-plan">
                    <p className="pp-plan__title">
                      You left the waitlist for {item.title}
                    </p>
                    <p className="td-meta">
                      {item.dayLabel} · {item.timeRange}
                    </p>
                    {item.actions.joinWaitlist ? (
                      <div className="pp-plan__actions">
                        <Button
                          onClick={() => rejoin(item)}
                          size="sm"
                          variant="secondary"
                        >
                          Join the waitlist again
                        </Button>
                      </div>
                    ) : null}
                  </Card>
                </Rise>
              ))}
            </div>
          )}
        </TabPanel>
        <TabPanel value="past">
          {agenda.past.length === 0 ? (
            <EmptyState
              description="Sessions, lessons and games you have played show here."
              icon="schedule"
              title="Nothing played yet"
            />
          ) : (
            <ul className="pp-list pp-list--past">
              {agenda.past.map((item) => (
                <li className="pp-past" key={item.id}>
                  <span className="pp-past__day">{item.dayLabel}</span>
                  <span className="pp-past__title">
                    <a className="pp-plan__link" href={item.href}>
                      {item.title}
                    </a>
                    <span className="td-meta">
                      {[item.kindLabel, item.place].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Chip kind="status" tone={TONE[item.tone]}>
                    {item.stateLabel}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
          <p className="pp-more">
            <AppLink href="/app/matches">Your results and Sand Rating</AppLink>
          </p>
        </TabPanel>
      </Tabs>
      <InviteDialog
        onOpenChange={(open) => {
          if (!open) setInvite(null);
        }}
        open={invite !== null}
        title={invite?.title ?? ""}
        url={invite?.url ?? null}
      />
      {confirm.dialog}
    </>
  );
}
