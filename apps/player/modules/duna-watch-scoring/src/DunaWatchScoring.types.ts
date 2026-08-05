export type WatchSetScore = {
  readonly a: number;
  readonly b: number;
};

export type WatchScoreDraft = {
  readonly type: "duna.scoreDraft";
  readonly draftId: string;
  readonly source: "apple-watch";
  readonly matchId?: string;
  readonly teamA: string;
  readonly teamB: string;
  readonly sets: readonly WatchSetScore[];
  readonly capturedAt: string;
};

export type WatchMatchContext = {
  readonly matchId?: string;
  readonly teamA: string;
  readonly teamB: string;
};

export type WatchScoreSnapshot = {
  readonly setIndex: number;
  readonly sets: readonly WatchSetScore[];
  readonly serving?: "A" | "B";
  readonly status: "not-started" | "live" | "complete" | "forfeit";
};

export type WatchMatchFormat = {
  readonly setsToWin: number;
  readonly maximumSets: number;
  readonly pointTargets: readonly number[];
  readonly winBy: 1 | 2;
  /** A zero value means that set has no hard cap. */
  readonly hardCaps: readonly number[];
  readonly sideSwitchIntervals: readonly number[];
};

export type WatchVisionEvent = {
  readonly type: "duna.visionEvent";
  readonly eventId: string;
  readonly sessionId: string;
  readonly source: "apple-watch";
  readonly eventType:
    "rally-won" | "favorite" | "undo" | "side-change" | "set-ended";
  readonly matchId?: string;
  readonly winnerSide?: "A" | "B";
  readonly targetEventId?: string;
  readonly elapsedMs: number;
  readonly occurredAt: string;
  readonly score: WatchScoreSnapshot;
  readonly label?: string;
};

export type WatchVisionContext = {
  readonly sessionId: string;
  readonly videoId?: string;
  readonly matchId?: string;
  readonly teamA: string;
  readonly teamB: string;
  readonly recordingStartedAt?: string;
  readonly status: "setup" | "ready" | "recording" | "ended";
  readonly score?: WatchScoreSnapshot;
  readonly format?: WatchMatchFormat;
};

export type DunaWatchScoringModuleEvents = {
  onScoreDraft: (payload: { readonly json: string }) => void;
  onVisionEvent: (payload: { readonly json: string }) => void;
};
