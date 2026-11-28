import { demoId } from "@duna/core/demo/ids";
import { cookies } from "next/headers";
import {
  templateConfiguration,
  templateCover,
  templateFor,
  type OfferingItem,
} from "./offering-model";

/**
 * Demo mode only (no Duna Database): the changes a person makes to the demo
 * club's offerings, kept in a cookie in their own browser so the screens can
 * be tried end to end. Nothing here is stored anywhere else, and the screens
 * say so. Small on purpose: a cookie holds about 4 KB.
 */
export const DEMO_OFFERINGS_COOKIE = "duna-demo-offerings";
const LIMIT = 3_800;

export interface DemoPatch {
  readonly title?: string;
  readonly shortSummary?: string;
  readonly description?: string;
  readonly visibility?: OfferingItem["visibility"];
  readonly status?: OfferingItem["status"];
  readonly allowCard?: boolean;
  readonly allowCash?: boolean;
  readonly allowCredits?: boolean;
  readonly taxable?: boolean;
  readonly membershipRequired?: boolean;
  readonly priceMinor?: number | null;
  readonly creditCost?: number | null;
  readonly configuration?: Record<string, unknown>;
  readonly media?: readonly {
    readonly kind: "image" | "video";
    readonly url: string;
    readonly alt?: string;
  }[];
}

export interface DemoCreated {
  readonly id: string;
  /** A template, or `copy` for a duplicate of `copyOf`. */
  readonly templateId: string;
  readonly copyOf?: string;
  readonly title: string;
  readonly priceMinor?: number;
}

export interface DemoSessionChange {
  readonly cancelled?: boolean;
  readonly lockAt?: string;
  readonly runAnyway?: boolean;
  readonly attendance?: Readonly<Record<string, "attended" | "absent">>;
}

export interface DemoStore {
  readonly created: readonly DemoCreated[];
  readonly patches: Readonly<Record<string, DemoPatch>>;
  readonly sessions: Readonly<Record<string, DemoSessionChange>>;
  readonly kept: readonly string[];
  readonly defaults?: {
    readonly rules: unknown;
    readonly appliesTo: readonly string[];
  };
}

const empty: DemoStore = { created: [], patches: {}, sessions: {}, kept: [] };

export function parseDemoStore(value: string | undefined): DemoStore {
  if (!value) return empty;
  try {
    const parsed = JSON.parse(value) as Partial<DemoStore>;
    return {
      created: Array.isArray(parsed.created) ? parsed.created : [],
      patches:
        parsed.patches && typeof parsed.patches === "object"
          ? parsed.patches
          : {},
      sessions:
        parsed.sessions && typeof parsed.sessions === "object"
          ? parsed.sessions
          : {},
      kept: Array.isArray(parsed.kept) ? parsed.kept : [],
      ...(parsed.defaults ? { defaults: parsed.defaults } : {}),
    };
  } catch {
    return empty;
  }
}

export async function readDemoStore(): Promise<DemoStore> {
  return parseDemoStore((await cookies()).get(DEMO_OFFERINGS_COOKIE)?.value);
}

export class DemoStoreFullError extends Error {
  constructor() {
    super(
      "The demo keeps only small changes in your browser, and it's full. Clear your cookies for this site to start again.",
    );
    this.name = "DemoStoreFullError";
  }
}

/** Saves the next state of the store (server actions only). */
export async function writeDemoStore(
  update: (store: DemoStore) => DemoStore,
): Promise<DemoStore> {
  const jar = await cookies();
  const next = update(parseDemoStore(jar.get(DEMO_OFFERINGS_COOKIE)?.value));
  const value = JSON.stringify(next);
  if (value.length > LIMIT) throw new DemoStoreFullError();
  jar.set(DEMO_OFFERINGS_COOKIE, value, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
  });
  return next;
}

/** A new demo offering id (in the demo id space, never a real record). */
export function newDemoOfferingId(store: DemoStore): string {
  return demoId("participation", 5_000 + store.created.length + 1);
}

function priced(
  item: OfferingItem,
  patch: DemoPatch,
  currency: "USD",
): OfferingItem["variants"] {
  if (patch.priceMinor === undefined && patch.creditCost === undefined) {
    return item.variants;
  }
  return item.variants.map((variant, index) => {
    const existingMoney = variant.prices.find(
      (price) => price.paymentKind === "card" || price.paymentKind === "cash",
    );
    const existingCredit = variant.prices.find(
      (price) => price.paymentKind === "credit",
    );
    const money =
      patch.priceMinor === undefined
        ? existingMoney?.amountMinor
        : (patch.priceMinor ?? undefined);
    const credits =
      patch.creditCost === undefined
        ? existingCredit?.creditAmount
        : (patch.creditCost ?? undefined);
    const allowCard = patch.allowCard ?? item.allowCard;
    const allowCash = patch.allowCash ?? item.allowCash;
    const allowCredits = patch.allowCredits ?? item.allowCredits;
    const prices: OfferingItem["variants"][number]["prices"][number][] = [];
    if (money !== undefined && (allowCard || allowCash)) {
      prices.push({
        id: demoId("participation", 6_000 + index * 3),
        audience: "everyone",
        paymentKind: allowCard ? "card" : "cash",
        amountMinor: money,
        currency,
        ...(existingMoney?.recurringInterval
          ? {
              recurringInterval: existingMoney.recurringInterval,
              recurringIntervalCount: existingMoney.recurringIntervalCount ?? 1,
            }
          : {}),
        active: true,
      });
    }
    if (credits !== undefined && allowCredits) {
      prices.push({
        id: demoId("participation", 6_001 + index * 3),
        audience: "everyone",
        paymentKind: "credit",
        creditAmount: credits,
        active: true,
      });
    }
    return { ...variant, prices };
  });
}

function patched(
  item: OfferingItem,
  patch: DemoPatch | undefined,
): OfferingItem {
  if (!patch) return item;
  const {
    configuration,
    priceMinor: _p,
    creditCost: _c,
    media,
    ...fields
  } = patch;
  void _p;
  void _c;
  return {
    ...item,
    ...fields,
    configuration: { ...item.configuration, ...(configuration ?? {}) },
    variants: priced(item, patch, "USD"),
    ...(media
      ? {
          media: media.map((entry, index) => ({
            id: demoId("participation", 6_800 + index),
            ...entry,
          })),
        }
      : {}),
    ...(patch.status === "active" && !item.publishedAt
      ? { publishedAt: item.updatedAt }
      : {}),
  };
}

function created(entry: DemoCreated, now: Date): OfferingItem | undefined {
  const template = templateFor(entry.templateId);
  if (!template) return undefined;
  const cover = templateCover(template);
  const prices: OfferingItem["variants"][number]["prices"] =
    entry.priceMinor !== undefined
      ? [
          {
            id: demoId("participation", 6_500),
            audience: "everyone",
            paymentKind: "card",
            amountMinor: entry.priceMinor,
            currency: "USD",
            ...(template.recurring
              ? {
                  recurringInterval: template.recurring,
                  recurringIntervalCount: 1,
                }
              : {}),
            active: true,
          },
        ]
      : [];
  return {
    id: entry.id,
    type: template.type,
    subtype: template.subtype,
    slug: entry.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title: entry.title,
    status: "draft",
    visibility: "public",
    taxable: template.type === "good",
    allowCard: entry.priceMinor !== undefined,
    allowCash: false,
    allowCredits: false,
    membershipRequired: false,
    defaultFulfillment: template.type === "good" ? "pickup" : "session",
    configuration: templateConfiguration(template, {
      now,
      timeZone: "America/Los_Angeles",
    }),
    variants: [
      {
        id: demoId("participation", 6_600 + Number(entry.id.slice(-3))),
        title: entry.title,
        optionCoordinates: {},
        status: "active",
        prices,
      },
    ],
    // Shown from HQ's own copy of the library in the demo.
    media: cover
      ? [
          {
            id: demoId("participation", 6_700),
            ...cover,
            url: cover.url.replace("https://duna.coach", ""),
          },
        ]
      : [],
    inventoryOnHand: 0,
    inventoryReserved: 0,
    updatedAt: now.toISOString(),
  };
}

/** The demo catalog with this browser's changes. */
export function applyDemoStore(
  base: readonly OfferingItem[],
  store: DemoStore,
  now: Date,
): OfferingItem[] {
  const made = store.created
    .map((entry) => {
      if (entry.copyOf) {
        const source = base.find((item) => item.id === entry.copyOf);
        return source
          ? {
              ...patched(source, store.patches[source.id]),
              id: entry.id,
              title: entry.title,
              slug: `${source.slug}-copy`,
              status: "draft" as const,
              publishedAt: undefined,
            }
          : undefined;
      }
      return created(entry, now);
    })
    .filter((item): item is OfferingItem => Boolean(item));
  return [...made, ...base].map((item) =>
    patched(item, store.patches[item.id]),
  );
}
