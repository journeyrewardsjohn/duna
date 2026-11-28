import { ScheduleLoading } from "@/components/schedule/schedule-states";

/** The calendar's frame while the day loads: same geometry, so nothing shifts. */
export default function Loading() {
  return <ScheduleLoading />;
}
