"use client";

import type {
  TrainingDrillsListing,
  TrainingDrillsPurchase,
  TrainingDrillsSummary,
} from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  Chip,
  EmptyResults,
  Field,
  FeatureOff,
  rallyStyle,
  riseClassName,
  SearchField,
  Select,
  useConfirm,
  useDebouncedValue,
  useLatest,
} from "@duna/ui/tideline";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  purchaseAction,
  searchLibraryAction,
} from "@/app/(next)/(hq)/training/actions";
import { unwrap } from "../money/money-action-result";
import { reportFailure } from "../team/team-report";
import {
  drillFacts,
  type LibraryTab,
  libraryTabs,
  moneyWords,
  purchaseWords,
  reviewStateCopy,
  scopeLabels,
} from "./drill-model";

type StoreItem = {
  listing: TrainingDrillsListing;
  drill: TrainingDrillsSummary;
};

const levels = ["Beginner", "Intermediate", "Advanced", "All levels"];
const minuteOptions = [
  { value: "", label: "Any length" },
  { value: "10", label: "10 min or less" },
  { value: "15", label: "15 min or less" },
  { value: "20", label: "20 min or less" },
  { value: "30", label: "30 min or less" },
];
const playerOptions = [
  { value: "", label: "Any number" },
  ...[2, 4, 6, 8, 12].map((n) => ({ value: String(n), label: `${n} players` })),
];

/**
 * The drill library (DL-Library, DL-Store): Mine, My club, Duna,
 * Purchased and the Store, with a debounced search and filters. Cards show
 * purpose, level, players and minutes; the drawing is on the drill's page.
 */
export function DrillLibrary({
  tab,
  initial,
  store,
  purchases,
  canBuyForClub,
}: {
  readonly tab: LibraryTab;
  readonly initial: readonly TrainingDrillsSummary[];
  readonly store?: {
    readonly enabled: boolean;
    readonly items: readonly StoreItem[];
  };
  readonly purchases: readonly TrainingDrillsPurchase[];
  readonly canBuyForClub: boolean;
}) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [players, setPlayers] = useState("");
  const [minutes, setMinutes] = useState("");
  const [items, setItems] = useState<readonly TrainingDrillsSummary[]>(initial);
  const [storeItems, setStoreItems] = useState<readonly StoreItem[]>(
    store?.items ?? [],
  );
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const debounced = useDebouncedValue(query);
  const latest = useLatest();
  const first = useRef(true);
  const filtered = Boolean(debounced.trim() || level || players || minutes);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus("loading");
    void latest
      .run(async () =>
        unwrap(
          await searchLibraryAction({
            scope: tab,
            ...(debounced.trim() ? { query: debounced.trim() } : {}),
            ...(level ? { level } : {}),
            ...(players ? { players: Number(players) } : {}),
            ...(minutes ? { maxMinutes: Number(minutes) } : {}),
          }),
        ),
      )
      .then((outcome) => {
        if (outcome.status === "stale") return;
        if (outcome.status === "error") {
          setStatus("error");
          return;
        }
        const result = outcome.value;
        if (result.kind === "store") setStoreItems(result.items);
        else setItems(result.items);
        setStatus("idle");
      });
  }, [debounced, level, players, minutes, tab]);

  const clear = () => {
    setQuery("");
    setLevel("");
    setPlayers("");
    setMinutes("");
  };
  const meta = libraryTabs.find((row) => row.id === tab)!;
  const pending = purchases.filter((row) => row.status === "pending");

  return (
    <div className="tr-stack">
      <div className="tr-library__filters">
        <SearchField
          label="Search drills"
          onValueChange={setQuery}
          placeholder="Name, focus or tag"
          resultCount={tab === "store" ? storeItems.length : items.length}
          status={
            status === "loading"
              ? "loading"
              : status === "error"
                ? "error"
                : debounced.trim()
                  ? "success"
                  : "idle"
          }
          value={query}
        />
        <Field label="Level">
          <Select
            onValueChange={(value) => setLevel(value ?? "")}
            options={[
              { value: "", label: "Any level" },
              ...levels.map((value) => ({ value, label: value })),
            ]}
            value={level}
          />
        </Field>
        <Field label="Players">
          <Select
            onValueChange={(value) => setPlayers(value ?? "")}
            options={playerOptions}
            value={players}
          />
        </Field>
        <Field label="Minutes">
          <Select
            onValueChange={(value) => setMinutes(value ?? "")}
            options={minuteOptions}
            value={minutes}
          />
        </Field>
      </div>

      {tab === "purchased" && pending.length > 0 ? (
        <ul aria-label="Purchases waiting" className="tr-rows">
          {pending.map((purchase) => {
            const words = purchaseWords(purchase);
            return (
              <li className="tr-row" key={purchase.id}>
                <div className="tr-row__main">
                  <span className="tr-row__name">{`A store drill, ${moneyWords(purchase.price)}`}</span>
                  <span className="tr-quiet">{words.detail}</span>
                </div>
                <Chip tone={words.tone}>{words.label}</Chip>
              </li>
            );
          })}
        </ul>
      ) : null}

      {tab === "store" ? (
        store && !store.enabled ? (
          <FeatureOff
            feature="The drill store"
            reason="It's switched off for now. Your own, your club's and Duna's drills still work."
          />
        ) : storeItems.length === 0 ? (
          filtered ? (
            <EmptyResults onClear={clear} query={debounced} />
          ) : (
            <p className="tr-quiet">{meta.empty}</p>
          )
        ) : (
          <StoreGrid canBuyForClub={canBuyForClub} items={storeItems} />
        )
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyResults onClear={clear} query={debounced} />
        ) : (
          <div className="tr-first-use">
            <Icon name="ball" size="nav" />
            <p className="tr-body">{meta.empty}</p>
            <div className="tr-actions">
              {tab === "personal" || tab === "club" ? (
                <Button href={hqHref("trainingDrillCreate")} variant="primary">
                  New drill
                </Button>
              ) : null}
              <Button
                href={`${hqHref("trainingDrills")}?tab=duna`}
                variant="secondary"
              >
                Browse Duna drills
              </Button>
            </div>
          </div>
        )
      ) : (
        <ul aria-label={`${meta.label} drills`} className="tr-cards">
          {items.map((drill, index) => (
            <li
              className={`tr-drill ${riseClassName()}`}
              key={drill.id}
              style={rallyStyle(index)}
            >
              <DrillCard drill={drill} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DrillCard({
  drill,
  price,
}: {
  readonly drill: TrainingDrillsSummary;
  readonly price?: string;
}) {
  const review = reviewStateCopy(drill.reviewState);
  return (
    <>
      <div className="tr-drill__tile" aria-hidden="true">
        <Icon name="court" size="nav" />
        <span>{drill.focus}</span>
      </div>
      <Link
        className="tr-drill__name"
        href={hqHref("trainingDrill", { drillId: drill.id })}
      >
        {drill.title}
      </Link>
      <span className="tr-quiet">{drillFacts(drill)}</span>
      <dl className="tr-drill__figures">
        <div>
          <dt>Load*</dt>
          <dd>{drill.load}</dd>
        </div>
        <div>
          <dt>Contacts*</dt>
          <dd>{drill.touches}</dd>
        </div>
        <div>
          <dt>Jumps*</dt>
          <dd>{drill.jumps}</dd>
        </div>
      </dl>
      <span className="tr-chips">
        <Chip kind="taxonomy">
          {drill.sourceLabel ?? scopeLabels[drill.scope]}
        </Chip>
        {price ? <Chip kind="metric">{price}</Chip> : null}
        {drill.reviewState !== "not-submitted" && drill.scope !== "duna" ? (
          <Chip tone={review.tone}>{review.label}</Chip>
        ) : null}
        {drill.usedInPlans > 0 ? (
          <span className="tr-quiet">{`Used in ${drill.usedInPlans} ${drill.usedInPlans === 1 ? "plan" : "plans"}`}</span>
        ) : null}
      </span>
    </>
  );
}

/** Other clubs' listed drills: free ones are added at once; paid ones honestly wait. */
function StoreGrid({
  items,
  canBuyForClub,
}: {
  readonly items: readonly StoreItem[];
  readonly canBuyForClub: boolean;
}) {
  const confirm = useConfirm();
  const [bought, setBought] = useState<Record<string, TrainingDrillsPurchase>>(
    {},
  );
  const buy = (item: StoreItem) => {
    const paid = item.listing.price.amountMinor > 0;
    const price = moneyWords(item.listing.price);
    void confirm
      .run({
        tier: paid ? "strong" : "confirm",
        title: paid
          ? `Buy ${item.drill.title} for ${price}?`
          : `Add ${item.drill.title} to your library?`,
        description: paid
          ? "Paying for store drills isn't available yet. The purchase is recorded as pending, nothing is charged, and the drill isn't added until payment is possible."
          : "It's free: it's added to Purchased at once, for every coach in the club.",
        ...(paid
          ? {
              amount: price,
              recipients: item.listing.listedAs,
              consequence: "Nothing is charged today.",
            }
          : {}),
        affected: `Licence: ${item.listing.licenseTerms}`,
        verb: paid ? "Record the purchase" : "Add it free",
        cancelLabel: "Not now",
        agentConfirm: `${paid ? "Records a pending purchase of" : "Adds"} ${item.drill.title} from ${item.listing.listedAs}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await purchaseAction({
              listingId: item.listing.id,
              buyAs: canBuyForClub ? "organization" : "person",
              idempotencyKey,
            }),
          ),
        success: (result) =>
          (result as TrainingDrillsPurchase).status === "complete"
            ? `${item.drill.title} is in Purchased`
            : "Purchase recorded as pending. Nothing was charged.",
        report: reportFailure("hq.training.purchase_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setBought((current) => ({
            ...current,
            [item.listing.id]: outcome.result as TrainingDrillsPurchase,
          }));
        }
      });
  };
  return (
    <>
      <ul aria-label="Store drills" className="tr-cards">
        {items.map((item, index) => {
          const purchase = bought[item.listing.id];
          const words = purchase ? purchaseWords(purchase) : undefined;
          return (
            <li
              className={`tr-drill ${riseClassName()}`}
              key={item.listing.id}
              style={rallyStyle(index)}
            >
              <DrillCard
                drill={item.drill}
                price={moneyWords(item.listing.price)}
              />
              <span className="tr-quiet">{`From ${item.listing.listedAs}`}</span>
              {words ? (
                <p className="tr-quiet">
                  <Chip tone={words.tone}>{words.label}</Chip> {words.detail}
                </p>
              ) : (
                <Button onClick={() => buy(item)} size="sm" variant="secondary">
                  {item.listing.price.amountMinor > 0
                    ? `Buy for ${moneyWords(item.listing.price)}`
                    : "Add it free"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {confirm.dialog}
    </>
  );
}
