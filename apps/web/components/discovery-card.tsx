import type { DiscoveryMapItem } from "@duna/api/discovery-search";
import {
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Gauge,
  MapPin,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

const labels: Record<DiscoveryMapItem["entityType"], string> = {
  event: "Play",
  venue: "Court",
  coach: "Coach",
  match: "Match",
  organization: "Club",
  "pro-tour": "Pro tour",
};

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatPrice(item: DiscoveryMapItem): string | undefined {
  if (!item.price) return undefined;
  if (item.price.amountMinor === 0) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: item.price.currency,
    maximumFractionDigits: 0,
  }).format(item.price.amountMinor / 100);
}

function kindLabel(value: string) {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function DiscoveryCard({
  item,
  compact = false,
}: {
  readonly item: DiscoveryMapItem;
  readonly compact?: boolean;
}) {
  const date = formatDate(item.startsAt);
  const price = formatPrice(item);
  return (
    <Link
      className={`discover-v2-card discover-v2-card--${item.entityType}${compact ? " discover-v2-card--compact" : ""}`}
      href={item.href}
    >
      <div
        className="discover-v2-card__visual"
        data-image-fit={item.imageFit ?? "cover"}
      >
        {item.imageUrl ? <img alt="" src={item.imageUrl} /> : null}
        <div className="discover-v2-card__wash" />
        <span className="discover-v2-card__type">
          {item.live ? <i /> : null}
          {item.live ? "Live · " : null}
          {labels[item.entityType]}
        </span>
        <ArrowUpRight
          aria-hidden
          className="discover-v2-card__arrow"
          size={18}
        />
      </div>
      <div className="discover-v2-card__body">
        <h3>{item.title}</h3>
        <p>
          <MapPin aria-hidden size={14} /> {item.subtitle}
        </p>
        <div className="discover-v2-card__meta">
          {date ? (
            <span>
              <CalendarDays aria-hidden size={13} /> {date}
            </span>
          ) : null}
          {item.courtCount !== undefined ? (
            <span>{item.courtCount} courts</span>
          ) : null}
          {item.level ? (
            <span>
              <Gauge aria-hidden size={13} /> Level {item.level}
            </span>
          ) : null}
          {item.spotsRemaining !== undefined ? (
            <span className={item.spotsRemaining > 0 ? "is-open" : undefined}>
              <UsersRound aria-hidden size={13} />
              {item.spotsRemaining > 0
                ? `${item.spotsRemaining} spots`
                : "Waitlist"}
            </span>
          ) : null}
          {price ? (
            <span>
              <CircleDollarSign aria-hidden size={13} /> {price}
            </span>
          ) : null}
          {item.openNow ? <span className="is-open">Open now</span> : null}
          {!date &&
          item.courtCount === undefined &&
          !item.level &&
          item.spotsRemaining === undefined &&
          !price &&
          !item.openNow ? (
            <span>{kindLabel(item.kind)}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
