import { NextResponse } from "next/server";
import { loadSiteNavigationQuickActions } from "@/lib/site-navigation-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const quickActions = await loadSiteNavigationQuickActions().catch(() => []);
  return NextResponse.json(
    { quickActions },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
