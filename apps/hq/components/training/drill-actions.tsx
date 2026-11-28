"use client";

import type { TrainingDrillsDetail, TrainingDrillsListing } from "@duna/api";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  Chip,
  Field,
  MoneyInput,
  Notice,
  RallyOnChange,
  Segmented,
  Textarea,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  delistAction,
  saveListingAction,
  setDrillScopeAction,
  submitDrillAction,
} from "@/app/(next)/(hq)/training/actions";
import { MoneyActionError, unwrap } from "../money/money-action-result";
import { reportFailure } from "../team/team-report";
import {
  checkWords,
  listingStateCopy,
  moneyWords,
  reviewStateCopy,
  scopeLabels,
} from "./drill-model";

/** Private → shared with the club (DL-Share); the author can take it back. */
export function ShareWithClub({
  drill,
  isAuthor,
}: {
  readonly drill: Pick<TrainingDrillsDetail, "id" | "title" | "scope">;
  readonly isAuthor: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [scope, setScope] = useState(drill.scope);
  if (scope === "duna") return null;
  const toClub = scope === "personal";
  if (!toClub && !isAuthor) return null;
  return (
    <>
      <RallyOnChange value={scope}>
        <p className="tr-body">{scopeLabels[scope]}</p>
      </RallyOnChange>
      <span className="tr-actions">
        <Button
          onClick={() =>
            void confirm
              .run({
                tier: "confirm",
                title: toClub
                  ? `Share ${drill.title} with your club?`
                  : `Make ${drill.title} private again?`,
                description: toClub
                  ? "Every coach in the club can see it and use it in their plans. You stay its author."
                  : "Only you will see it. Plans that already use it keep their version.",
                verb: toClub ? "Share with my club" : "Make it private",
                cancelLabel: "Not now",
                agentConfirm: toClub
                  ? `Shares the drill ${drill.title} with the club`
                  : `Makes the drill ${drill.title} private`,
                perform: async () =>
                  unwrap(
                    await setDrillScopeAction({
                      drillId: drill.id,
                      scope: toClub ? "club" : "personal",
                    }),
                  ),
                success: toClub
                  ? "Shared with your club"
                  : "Private to you again",
                report: reportFailure("hq.training.share_failed"),
              })
              .then((outcome) => {
                if (outcome.status === "done") {
                  setScope((outcome.result as TrainingDrillsDetail).scope);
                  router.refresh();
                }
              })
          }
          size="sm"
          variant="secondary"
        >
          {toClub ? "Share with my club" : "Make it private"}
        </Button>
      </span>
      {confirm.dialog}
    </>
  );
}

/**
 * Submit the latest version for the store. Two automatic checks run at
 * once (the drawing, and no personal details); a failure is explained with
 * what to fix. Duna's own review has no decision yet: it says so.
 */
export function SubmitForStore({
  drill,
}: {
  readonly drill: Pick<
    TrainingDrillsDetail,
    | "id"
    | "title"
    | "currentVersionId"
    | "version"
    | "reviewState"
    | "reviewChecks"
  >;
}) {
  const [state, setState] = useState(drill.reviewState);
  const [checks, setChecks] = useState(drill.reviewChecks);
  const submit = useAction(
    async () =>
      unwrap(
        await submitDrillAction({
          drillId: drill.id,
          drillVersionId: drill.currentVersionId,
        }),
      ),
    {
      report: reportFailure("hq.training.submit_failed"),
      onSuccess: (result) => {
        setState(result.reviewState);
        setChecks(result.reviewChecks);
      },
    },
  );
  const review = reviewStateCopy(state);
  const failed = checks.some((check) => check.status === "failed");
  return (
    <div className="tr-stack">
      <p className="tr-chips">
        <RallyOnChange value={state}>
          <Chip tone={review.tone}>{review.label}</Chip>
        </RallyOnChange>
      </p>
      {checks.length > 0 ? (
        <ul aria-label="Store checks" className="tr-checks">
          {checks.map((check) => {
            const words = checkWords(check);
            return (
              <li
                className="tr-check"
                data-status={check.status}
                key={check.kind}
              >
                <Icon
                  name={
                    check.status === "ok"
                      ? "success"
                      : check.status === "failed"
                        ? "alert"
                        : "clock"
                  }
                  size="inline"
                />
                <div>
                  <b>{words.title}</b>
                  <p className="tr-quiet">{words.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {failed ? (
        <Notice title="Fix what failed, then submit again" tone="attention">
          Save a new version with the fix; the checks run on the latest version.
        </Notice>
      ) : null}
      {state === "not-submitted" ||
      state === "changes-requested" ||
      state === "rejected" ? (
        <div className="tr-actions">
          <Button
            loading={submit.showPending}
            onClick={() => void submit.run()}
            size="sm"
            variant="secondary"
          >
            {`Submit version ${drill.version} to the store`}
          </Button>
        </div>
      ) : null}
      {submit.status === "error" ? (
        <p className="tr-problem" role="alert">
          <Icon name="alert" size="inline" />
          {submit.error instanceof Error
            ? submit.error.message
            : "Not submitted."}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The store listing: free, or a price. Paid listings answer "not set up
 * yet" until Duna sets its store fee; a listing waits for approval before
 * it is in the store. Never a fake sale.
 */
export function ListingPanel({
  drill,
  listing: initial,
  clubName,
  authorName,
  canListForClub,
}: {
  readonly drill: Pick<
    TrainingDrillsDetail,
    "id" | "title" | "currentVersionId" | "scope"
  >;
  readonly listing?: TrainingDrillsListing;
  readonly clubName: string;
  readonly authorName?: string;
  readonly canListForClub: boolean;
}) {
  const confirm = useConfirm();
  const [listing, setListing] = useState(initial);
  const [pricing, setPricing] = useState<"free" | "paid">(
    initial?.pricing ?? "free",
  );
  const [amount, setAmount] = useState<number | null>(
    initial && initial.price.amountMinor > 0 ? initial.price.amountMinor : 500,
  );
  const [terms, setTerms] = useState(
    initial?.licenseTerms ??
      "Use in your club's own practices. Don't resell or republish.",
  );
  const sellAs: "organization" | "person" =
    drill.scope === "club" && canListForClub ? "organization" : "person";
  const listedAs =
    sellAs === "organization" ? clubName : (authorName ?? clubName);
  const save = useAction(
    async () =>
      unwrap(
        await saveListingAction({
          drillId: drill.id,
          drillVersionId: drill.currentVersionId,
          pricing,
          price: {
            amountMinor: pricing === "free" ? 0 : (amount ?? 0),
            currency: "USD",
          },
          licenseTerms: terms.trim(),
          listedAs,
          sellAs,
        }),
      ),
    {
      report: reportFailure("hq.training.listing_failed"),
      messages: {
        success: (result) =>
          result.status === "listed"
            ? "Listed in the store"
            : "Listing saved: it is listed once Duna approves the drill",
      },
      onSuccess: (result) => setListing(result),
    },
  );
  const notConfigured =
    save.status === "error" &&
    save.error instanceof MoneyActionError &&
    save.error.code === "not-configured";
  const state = listing ? listingStateCopy(listing.status) : undefined;
  const live =
    listing &&
    (listing.status === "listed" || listing.status === "pending-review");
  return (
    <div className="tr-stack">
      {listing && state ? (
        <p className="tr-chips">
          <RallyOnChange value={listing.status}>
            <Chip tone={state.tone}>{state.label}</Chip>
          </RallyOnChange>
          <Chip kind="metric">{moneyWords(listing.price)}</Chip>
          <span className="tr-quiet">{`Sold as ${listing.listedAs}`}</span>
        </p>
      ) : (
        <p className="tr-quiet">Not in the store.</p>
      )}
      {listing && listing.pricing === "paid" ? (
        <p className="tr-quiet">
          {`Duna's store fee on paid drills: ${(listing.marketplaceFeeBps / 100).toFixed(1)}%. Buyers can't pay yet: paid purchases wait as pending until payment is available.`}
        </p>
      ) : null}
      <form
        aria-label="Store listing"
        className="tr-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void save.run();
        }}
      >
        <Segmented
          aria-label="Price"
          onValueChange={(value) => setPricing(value as "free" | "paid")}
          options={[
            { value: "free", label: "Free" },
            { value: "paid", label: "For sale" },
          ]}
          value={pricing}
        />
        {pricing === "paid" ? (
          <Field hint="What another club pays for a licence" label="Price">
            <MoneyInput
              currency="USD"
              onValueChange={setAmount}
              value={amount}
            />
          </Field>
        ) : null}
        <Field label="Licence terms">
          <Textarea
            autoResize
            maxLength={4000}
            onChange={(event) => setTerms(event.currentTarget.value)}
            rows={2}
            value={terms}
          />
        </Field>
        <p className="tr-quiet">{`Listed as ${listedAs}. It appears in the store only after Duna approves the drill.`}</p>
        <div className="tr-actions">
          <Button
            disabled={
              !terms.trim() || (pricing === "paid" && !(amount && amount > 0))
            }
            loading={save.showPending}
            type="submit"
            variant="secondary"
          >
            {listing ? "Save the listing" : "List in the store"}
          </Button>
          {live ? (
            <Button
              onClick={() =>
                void confirm
                  .run({
                    tier: "confirm",
                    destructive: true,
                    title: `Take ${drill.title} out of the store?`,
                    description:
                      "Clubs can't find or buy it any more. Clubs that already have it keep it.",
                    verb: "Take it out of the store",
                    cancelLabel: "Keep it listed",
                    agentConfirm: `Delists the drill ${drill.title}`,
                    perform: async () => unwrap(await delistAction(listing.id)),
                    success: "Taken out of the store",
                    report: reportFailure("hq.training.delist_failed"),
                  })
                  .then((outcome) => {
                    if (outcome.status === "done")
                      setListing(outcome.result as TrainingDrillsListing);
                  })
              }
              size="sm"
              variant="ghost"
            >
              Take it out of the store
            </Button>
          ) : null}
        </div>
        {notConfigured ? (
          <Notice title="Paid listings aren't set up yet" tone="info">
            Duna hasn&apos;t set its store fee yet, so drills can&apos;t be
            listed for sale. Nothing was listed. A free listing works today.
          </Notice>
        ) : save.status === "error" ? (
          <p className="tr-problem" role="alert">
            <Icon name="alert" size="inline" />
            {save.error instanceof Error ? save.error.message : "Not saved."}
          </p>
        ) : null}
      </form>
      {confirm.dialog}
    </div>
  );
}
