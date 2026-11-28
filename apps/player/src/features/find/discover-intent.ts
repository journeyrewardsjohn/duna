import type { HomeQuickAction } from "../home/home-quick-action";

export type DiscoverIntentKind = Exclude<
  HomeQuickAction,
  | "record-video"
  | "upload-score"
  | "score-match"
  | "create-match"
  | "find-coach"
  | "messages"
>;
