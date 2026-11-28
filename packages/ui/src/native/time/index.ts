/**
 * `@duna/ui/native/time`: day strip, start-time chips and length choice for
 * React Native (the web `tideline/time` parts' twins, same props). Rules come
 * from `@duna/tideline-core`; this folder picks words, sizes and layout.
 */
export { DayStrip, dayCellLabel, type DayStripProps } from "./DayStrip";
export { TimeSlots, slotChipLook, type TimeSlotsProps } from "./TimeSlots";
export {
  DEFAULT_CREST_OPTIONS,
  DurationCrests,
  durationOptionLabel,
  durationStacks,
  type DurationCrestsProps,
} from "./DurationCrests";
export {
  MIN_HIT,
  SLOT_CHIP_FONT_SIZE,
  SLOT_MAX_COLUMNS,
  chipFontScale,
  chipMinWidth,
  dateNames,
  dayCells,
  inRange,
  minuteLabel,
  slotGridColumns,
  type DayCell,
  type DayStripDay,
  type SlotGrid,
} from "./layout";
export {
  longestChipChars,
  slotChipLabel,
  slotNote,
  timeSlotGroups,
  type SlotChipModel,
  type SlotGroupModel,
  type TimeSlotItem,
} from "./slot-chips";
export type { SlotReason, SunTimes } from "@duna/tideline-core";
