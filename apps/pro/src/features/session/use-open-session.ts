import { useCallback } from "react";
import { useShell } from "../../app/ShellContext";
import { useDay } from "../today/use-day";

/**
 * Opens an agenda entry where it belongs: sessions, bookings and pickups on
 * the session screen (M-R2); blocked time in the calendar.
 */
export function useOpenSession(): (entryId: string) => void {
  const shell = useShell();
  const day = useDay();
  return useCallback(
    (entryId: string) => {
      const entry = day.entries.find((candidate) => candidate.id === entryId);
      if (
        entry?.sourceType === "busy-block" ||
        entry?.sourceType === "operator-block"
      ) {
        shell.open("calendar", { entryId });
        return;
      }
      shell.open("session", { entryId });
    },
    [day.entries, shell],
  );
}
