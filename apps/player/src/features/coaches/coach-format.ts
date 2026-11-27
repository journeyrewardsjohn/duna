import { formatMoney } from "@duna/core";
import type { PlayerRuntime } from "../../../runtime";

export type MobileCoach = NonNullable<PlayerRuntime["coaches"]>[number];

export function coachInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function coachExperienceLabel(
  value?: MobileCoach["playingExperience"],
): string {
  if (!value || value === "not-set") return "Experience not listed";
  if (value === "high-school") return "High school experience";
  if (value === "collegiate") return "College experience";
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)} experience`;
}

export function coachServicePrice(
  service: MobileCoach["services"][number],
): string | undefined {
  const cardPrices = service.variants.flatMap((variant) =>
    variant.prices.flatMap((price) =>
      price.paymentKind === "card" && price.amountMinor !== undefined
        ? [
            {
              amountMinor: price.amountMinor,
              currency: price.currency ?? "USD",
            },
          ]
        : [],
    ),
  );
  const least = cardPrices.sort(
    (left, right) => left.amountMinor - right.amountMinor,
  )[0];
  if (least) return `From ${formatMoney(least.amountMinor, least.currency)}`;
  const credits = service.variants
    .flatMap((variant) => variant.prices)
    .find((price) => price.paymentKind === "credit" && price.creditAmount);
  return credits?.creditAmount
    ? `${credits.creditAmount} ${credits.creditAmount === 1 ? "credit" : "credits"}`
    : undefined;
}

export function coachSupportsVirtual(coach: MobileCoach): boolean {
  return coach.services.some((service) => {
    const searchable =
      `${service.subtype} ${service.defaultFulfillment} ${JSON.stringify(service.configuration)}`.toLowerCase();
    return ["virtual", "online", "remote", "google meet"].some((term) =>
      searchable.includes(term),
    );
  });
}
