export type SandDataSource =
  "volleyball-life" | "bvbinfo" | "fivb-12ndr" | "volleyball-world";

export interface ExternalPlayerRecord {
  readonly externalPersonId: string;
  readonly displayName: string;
  readonly profileUrl?: string;
  readonly hometown?: string;
  readonly countryCode?: string;
  readonly birthDate?: string;
  readonly avatarUrl?: string;
  readonly isProfessional?: boolean;
  readonly externalRating?: number;
  readonly externalRatingConfidence?: number;
  readonly externalMatchCount?: number;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface ExternalMatchParticipant {
  readonly externalPersonId: string;
  readonly name: string;
  readonly side: "A" | "B";
}

export interface ExternalMatchRecord {
  readonly externalMatchId: string;
  readonly externalEventId?: string;
  readonly sourceUrl?: string;
  readonly title: string;
  readonly roundLabel?: string;
  readonly location?: string;
  readonly genderCategory?: "men" | "women" | "coed";
  readonly playedAt?: string;
  readonly participants: readonly ExternalMatchParticipant[];
  readonly sets: readonly { a: number; b: number }[];
  readonly winnerSide?: "A" | "B";
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface ProfessionalEventRecord {
  readonly externalEventId: string;
  readonly sourceUrl: string;
  readonly name: string;
  readonly location?: string;
  readonly countryCode?: string;
  readonly category?: string;
  readonly genderCategory: "men" | "women";
  readonly startsOn?: string;
  readonly endsOn?: string;
  readonly status: "upcoming" | "live" | "completed";
  readonly live: boolean;
  readonly teamCount: number;
  readonly matchCount: number;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface WorldRankingRecord {
  readonly rankingDate: string;
  readonly genderCategory: "men" | "women";
  readonly rank: number;
  readonly points: number;
  readonly externalPersonId: string;
  readonly displayName: string;
  readonly countryCode?: string;
  readonly previousRank?: number;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface SourceImportResult {
  readonly source: SandDataSource;
  readonly requestedUrl?: string;
  readonly players: readonly ExternalPlayerRecord[];
  readonly matches: readonly ExternalMatchRecord[];
  readonly events?: readonly ProfessionalEventRecord[];
  readonly rankings?: readonly WorldRankingRecord[];
  readonly checkpoint?: Readonly<Record<string, unknown>>;
}

export class SandDataUpstreamError extends Error {
  constructor(
    readonly source: SandDataSource,
    readonly kind:
      | "not-configured"
      | "unavailable"
      | "blocked"
      | "invalid-response"
      | "not-found",
    message: string,
  ) {
    super(message);
    this.name = "SandDataUpstreamError";
  }
}
