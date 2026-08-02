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

export type DunaWatchScoringModuleEvents = {
  onScoreDraft: (payload: { readonly json: string }) => void;
};
