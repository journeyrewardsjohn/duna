import type { Metadata } from "next";
import { getHqSession } from "@/components/shell/hq-session";
import { TodayScreen } from "@/components/today/today-screen";

export const metadata: Metadata = { title: "Today" };

/** HQ's landing screen: Today (docs/design/tideline-4.1.1/ia-hq.md). */
export default async function TodayPage() {
  const session = await getHqSession();
  // The shell shows "You need access" instead; never load club data for them.
  if (session.access !== "operator") return null;
  return <TodayScreen session={session} />;
}
