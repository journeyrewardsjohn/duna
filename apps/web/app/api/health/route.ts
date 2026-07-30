import { isStripeConfigured } from "@duna/api/payments";
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "duna-web",
    database: process.env.DATABASE_URL ? "configured" : "demo",
    stripe: isStripeConfigured() ? "configured" : "demo",
    time: new Date().toISOString(),
  });
}
