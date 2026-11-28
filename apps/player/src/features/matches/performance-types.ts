import type { DunaApiClient } from "../../../mobile-api";

export type MobilePlayerIntelligence = Awaited<
  ReturnType<DunaApiClient["public"]["playerIntelligence"]["query"]>
>;
export type MobilePlayerPerformance = Awaited<
  ReturnType<DunaApiClient["public"]["playerPerformance"]["query"]>
>;
export type MobilePerformanceMatch = MobilePlayerPerformance["history"][number];
export type MobilePerformanceParticipantProfile =
  MobilePlayerPerformance["participantProfiles"][number];
