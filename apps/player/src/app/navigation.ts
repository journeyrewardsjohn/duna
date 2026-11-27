import { createContext } from "react";

export const MessagingNavigationContext = createContext<{
  readonly open: (support: boolean) => void;
  readonly openProfile: () => void;
  readonly unreadCount: number;
}>({
  open: () => undefined,
  openProfile: () => undefined,
  unreadCount: 0,
});

export type Tab =
  | "home"
  | "discover"
  | "score"
  | "play"
  | "plans"
  | "training"
  | "video"
  | "wallet"
  | "predictions"
  | "you"
  | "health"
  | "performance"
  | "coaches"
  | "messages"
  | "ai";
