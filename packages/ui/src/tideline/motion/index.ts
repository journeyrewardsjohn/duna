/**
 * Motion: Rise, Rally and Cross as parts a screen applies without writing
 * keyframes, page and pane transitions, an animated list, number changes,
 * the view-transition Cross and the first-open sequence.
 */
export {
  Rally,
  rallyStyle,
  Rise,
  riseClassName,
  type MotionClassOptions,
  type RallyProps,
  type RiseFrom,
  type RiseProps,
} from "./verbs";
export {
  AnimatedList,
  FirstOpen,
  NumberChange,
  RallyOnChange,
  type AnimatedListProps,
  type FirstOpenProps,
  type NumberChangeProps,
  type RallyOnChangeProps,
} from "./motion";
export {
  Cross,
  PageTransition,
  PaneTransition,
  type CrossProps,
  type PageTransitionProps,
  type PaneTransitionProps,
} from "./cross";
export {
  changedCharacters,
  crossViewTransition,
  diffKeys,
  FIRST_OPEN,
  firstOpenPhase,
  firstOpenTurnAt,
  mergeExiting,
  RALLY_MAX_STAGGERED,
  rallyIndex,
  readMotionTiming,
  type CrossViewTransitionOptions,
  type FirstOpenPhase,
  type ListEntry,
  type MotionTiming,
} from "./motion-core";
export {
  CREST_ASPECT,
  CrestMark,
  Wordmark,
  type CrestMarkProps,
} from "./crest";
