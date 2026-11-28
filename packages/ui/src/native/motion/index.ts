/** `@duna/ui/native/motion`: Rise, Rally, Cross, score changes and haptics. */
export { Cross, Rally, Rise, type RiseEdge, type RiseProps } from "./Rise";
export {
  MotionPreference,
  useReducedMotion,
  useSystemReducedMotion,
} from "./reduced-motion";
export {
  rallyDelay,
  staysInside,
  verbTiming,
  type MotionVerb,
  type VerbTiming,
} from "./timing";
export { tokenEasing } from "./easing";
export {
  runWithWatchdog,
  settleValues,
  WATCHDOG_SLACK_MS,
  type WatchdogOptions,
} from "./watchdog";
export {
  HapticsProvider,
  hapticsFor,
  useHaptics,
  type ConfirmationTier,
  type Haptics,
  type HapticsAdapter,
} from "./haptics";
export {
  ScoreNumerals,
  describeScoreParts,
  useScoreChange,
  type ScoreChange,
} from "./score";
