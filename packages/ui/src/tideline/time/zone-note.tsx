import { timeZoneNote } from "@duna/tideline-core";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";

export interface TimeZoneNoteProps {
  /** An instant on the day shown (epoch ms): the zone's name depends on it. */
  at: number;
  /** The venue's IANA zone. */
  timeZone: string;
  /** The viewer's IANA zone. Nothing renders when the clocks agree. */
  viewerTimeZone: string;
  locale?: string;
  className?: string;
}

/**
 * "Times in PST": shown only when the venue's clock differs from the
 * viewer's, so a person travelling never books the wrong hour.
 */
export function TimeZoneNote({
  at,
  timeZone,
  viewerTimeZone,
  locale = "en-US",
  className,
}: TimeZoneNoteProps) {
  const note = timeZoneNote({ at, timeZone, viewerTimeZone, locale });
  if (!note.differs) return null;
  return (
    <span className={cx("td-zonenote", className)}>
      <Icon name="clock" size="chip" />
      Times in {note.label}
    </span>
  );
}
