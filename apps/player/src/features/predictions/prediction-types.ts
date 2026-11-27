import type { DunaApiClient } from "../../../mobile-api";
import type { PlayerRuntime } from "../../../runtime";

export type MobilePredictionDiscoveryItem = NonNullable<
  PlayerRuntime["predictionDiscovery"]
>["items"][number];
export type MobilePredictionPosition = NonNullable<
  PlayerRuntime["predictionWallet"]
>["positions"][number];

export type MobilePredictionMarket = Awaited<
  ReturnType<DunaApiClient["public"]["proMatchPredictionMarket"]["query"]>
>;
export type MobilePredictionTarget =
  | {
      readonly kind: "pro-match";
      readonly eventSlug: string;
      readonly matchId: string;
    }
  | {
      readonly kind: "pro-event-team";
      readonly eventSlug: string;
      readonly externalTeamId: string;
    };
