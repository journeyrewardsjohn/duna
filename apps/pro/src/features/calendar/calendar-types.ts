import { type ProRuntime } from "../../../runtime";

export type ProCalendarEntry = NonNullable<
  ProRuntime["workspace"]
>["calendar"]["entries"][number];

export type CalendarResourceFilter = "all" | "courts" | "coaches";

export type CalendarSheetMode = "session" | "block";
