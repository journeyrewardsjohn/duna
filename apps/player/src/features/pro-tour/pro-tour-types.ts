import type { DunaApiClient } from "../../../mobile-api";
import type { PlayerRuntime } from "../../../runtime";

export type ProEventDetail = Awaited<
  ReturnType<DunaApiClient["public"]["proEvent"]["query"]>
>;

export type ProCoverageEvent = NonNullable<
  PlayerRuntime["proCoverage"]
>["events"][number];
export type ResolvedProEvent = NonNullable<ProEventDetail>;
export type ProMatch = ResolvedProEvent["matches"][number];
