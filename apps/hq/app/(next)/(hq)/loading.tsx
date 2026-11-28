import { TodayLoading } from "@/components/today/today-states";

/**
 * Route-level loading inside the shell. Today is the only screen in this
 * group so far; a screen with another layout adds its own `loading.tsx`.
 */
export default function Loading() {
  return <TodayLoading />;
}
