import { Chip, type TidelineTone } from "@duna/ui/tideline";
import type { ParticipationTone } from "@duna/core";

/** The shared display's tone as a chip tone. Never the live colour here. */
export function chipTone(tone: ParticipationTone): TidelineTone | undefined {
  switch (tone) {
    case "caution":
      return "warning";
    case "critical":
      return "danger";
    case "positive":
      return "positive";
    default:
      return undefined;
  }
}

/**
 * A session's state in the shared words: the chip ("Needs 2 more") and,
 * when there is one, the line under it ("Confirms Thu 6:00 PM if 2 more
 * join"). The live colour is only for a session actually running.
 */
export function GroupStatus({
  status,
  line,
  tone,
  running = false,
  compact = false,
}: {
  readonly status: string;
  readonly line?: string;
  readonly tone: ParticipationTone;
  /** The session is in progress right now. */
  readonly running?: boolean;
  readonly compact?: boolean;
}) {
  return (
    <span className="pt-status" data-compact={compact || undefined}>
      <Chip tone={running ? "live" : chipTone(tone)}>{status}</Chip>
      {line && !compact ? (
        <span className="pt-status__line">{line}</span>
      ) : null}
    </span>
  );
}
