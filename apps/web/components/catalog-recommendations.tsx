import type { PublicCatalogRecommendations } from "@duna/api";
import { ArrowUpRight, Sparkles } from "lucide-react";
import Link from "next/link";
import styles from "./catalog-recommendations.module.css";

type RecommendationCard =
  PublicCatalogRecommendations["sameOrganization"][number];

function money(card: RecommendationCard): string | undefined {
  if (card.priceMinor === undefined) return undefined;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: card.currency,
    maximumFractionDigits: card.priceMinor % 100 === 0 ? 0 : 2,
  }).format(card.priceMinor / 100);
}

export function CatalogRecommendations({
  cards,
  eyebrow,
  title,
  description,
}: {
  readonly cards: readonly RecommendationCard[];
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
}) {
  if (cards.length === 0) return null;
  return (
    <section className={styles.section}>
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className={styles.grid}>
        {cards.map((card) => {
          const price = money(card);
          const location = [card.locality, card.administrativeArea]
            .filter(Boolean)
            .join(", ");
          return (
            <Link
              className={styles.card}
              href={card.href}
              key={card.catalogItemId}
            >
              <div className={styles.media}>
                {card.mediaUrl ? (
                  <img alt="" src={card.mediaUrl} />
                ) : (
                  <span>{card.title.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className={styles.body}>
                <div className={styles.meta}>
                  <span>{card.subtype.replaceAll("-", " ")}</span>
                  <i aria-hidden />
                  <span>{card.organizationName}</span>
                </div>
                <h3>{card.title}</h3>
                {card.shortSummary && <p>{card.shortSummary}</p>}
                {price && <span className={styles.price}>From {price}</span>}
                <span className={styles.reason}>
                  <Sparkles aria-hidden size={14} />
                  {card.distanceMiles !== undefined
                    ? `${card.distanceMiles} miles away${location ? ` · ${location}` : ""}`
                    : card.reason}
                  <ArrowUpRight aria-hidden size={14} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
