import { type ProCalendarEntry } from "./calendar-types";

export function entryLabel(entry: ProCalendarEntry): string {
  if (entry.sourceType === "operator-block")
    return entry.status === "maintenance" ? "Maintenance" : "Blocked time";
  if (entry.sourceType === "busy-block") return "External busy time";
  return (entry.kind ?? "session").replaceAll("-", " ");
}

export function personInitials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
