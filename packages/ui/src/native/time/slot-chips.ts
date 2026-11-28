/**
 * The chips a `TimeSlots` draws, pure: the state of each start from
 * `slotChip`, its light mark, its daypart group and the words it says.
 */
import {
  DAYPART_LABELS,
  LIGHT_MARK_GLYPH,
  dayLightMinutes,
  daypartGlyph,
  groupByDaypart,
  lightMarkAtMinute,
  parseIsoDate,
  slotChip,
  type Daypart,
  type LightGlyph,
  type SlotChipState,
  type SlotReason,
  type SunTimes,
} from "@duna/tideline-core";
import { minuteLabel } from "./layout";

/** One start time. `Slot` from `timeSlots()` fits as is. */
export interface TimeSlotItem {
  /** Wall-clock minutes after the venue's midnight (1350 is 10:30 PM). */
  readonly startMinute: number;
  readonly available: boolean;
  readonly reason?: SlotReason | null;
  /** Places left; a few left says so. Omit for a single booking. */
  readonly remaining?: number | null;
  /** Taken while the person was looking. */
  readonly stale?: boolean;
}

export interface SlotChipModel {
  readonly startMinute: number;
  readonly text: string;
  readonly state: SlotChipState;
  readonly selectable: boolean;
  readonly words: string | null;
  /** The light mark drawn in the chip (only the ones that change the game). */
  readonly glyph: "golden-hour" | "under-lights" | "too-dark" | null;
  /** The visible line under the time ("Just taken", "2 left"). */
  readonly note: string | null;
}

export interface SlotGroupModel {
  readonly daypart: Daypart | null;
  readonly label: string;
  readonly glyph: LightGlyph | null;
  readonly chips: ReadonlyArray<SlotChipModel>;
}

/** The visible note under a chip's time. Pure. */
export function slotNote(
  state: SlotChipState,
  words: string | null,
): string | null {
  if (state === "stale") return "Just taken";
  if (state === "few-left") return words;
  return null;
}

/** The chip's accessible name: time, daypart, light, then the state words. */
export function slotChipLabel(
  chip: SlotChipModel,
  daypart: Daypart | null,
): string {
  return [
    chip.text,
    daypart ? DAYPART_LABELS[daypart].toLowerCase() : null,
    chip.glyph === "under-lights"
      ? "under lights"
      : chip.glyph === "golden-hour" && daypart !== "golden-hour"
        ? "golden hour"
        : null,
    chip.words,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Every chip and its daypart group for a day. `justTaken` are starts the
 * component saw taken while the person was looking.
 */
export function timeSlotGroups(input: {
  readonly slots: ReadonlyArray<TimeSlotItem>;
  readonly selected: number | null;
  readonly justTaken: ReadonlySet<number>;
  readonly date: string;
  readonly timeZone: string;
  readonly locale: string;
  readonly sun?: SunTimes | null;
  readonly courtIsLit: boolean;
  readonly groupByDaypart?: boolean;
  readonly fewLeftAt?: number;
}): ReadonlyArray<SlotGroupModel> {
  const civil = parseIsoDate(input.date);
  const sun = civil ? (input.sun ?? null) : null;
  const chips: SlotChipModel[] = [...input.slots]
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((slot) => {
      const mark =
        sun && civil
          ? lightMarkAtMinute(slot.startMinute, {
              date: civil,
              timeZone: input.timeZone,
              sun,
              courtIsLit: input.courtIsLit,
            })
          : null;
      const chip = slotChip({
        available: slot.available,
        reason: slot.reason ?? null,
        remaining: slot.remaining ?? null,
        stale: Boolean(slot.stale) || input.justTaken.has(slot.startMinute),
        selected: input.selected === slot.startMinute,
        light: mark,
        fewLeftAt: input.fewLeftAt,
      });
      const glyph = mark ? LIGHT_MARK_GLYPH[mark] : null;
      return {
        startMinute: slot.startMinute,
        text: minuteLabel(slot.startMinute, input.locale),
        ...chip,
        glyph:
          glyph === "golden-hour" ||
          glyph === "under-lights" ||
          glyph === "too-dark"
            ? glyph
            : null,
        note: slotNote(chip.state, chip.words),
      };
    });

  const light =
    sun && civil ? dayLightMinutes(sun, civil, input.timeZone) : null;
  if (!light || input.groupByDaypart === false) {
    return [{ daypart: null, label: "", glyph: null, chips }];
  }
  return groupByDaypart(chips, light).map((group) => ({
    daypart: group.daypart,
    label: group.label,
    glyph: daypartGlyph(group.daypart, input.courtIsLit),
    chips: group.items,
  }));
}

/** The longest thing a chip must hold, in characters of the 14 pt label. */
export function longestChipChars(
  groups: ReadonlyArray<SlotGroupModel>,
): number {
  let longest = 0;
  for (const group of groups) {
    for (const chip of group.chips) {
      longest = Math.max(longest, chip.text.length);
      // The note is 13 pt under the 14 pt time.
      if (chip.note)
        longest = Math.max(longest, Math.ceil((chip.note.length * 13) / 14));
    }
  }
  return longest;
}
