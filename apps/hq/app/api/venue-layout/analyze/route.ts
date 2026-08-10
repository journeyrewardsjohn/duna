import { NextResponse } from "next/server";
import { analyzeFloorplanSchematic } from "@/lib/floorplan-analysis";
import { getServerCaller } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      readonly venueId?: unknown;
      readonly imageUrl?: unknown;
    };
    if (typeof body.venueId !== "string" || typeof body.imageUrl !== "string") {
      return NextResponse.json(
        { error: "Venue and schematic image are required." },
        { status: 400 },
      );
    }
    const imageUrl = new URL(body.imageUrl);
    if (imageUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "Schematic image must use HTTPS." },
        { status: 400 },
      );
    }
    const caller = await getServerCaller();
    await caller.operator.venueLayoutWorkspace({ venueId: body.venueId });
    const proposal = await analyzeFloorplanSchematic(imageUrl.toString());
    return NextResponse.json(proposal);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Floorplan analysis could not be completed.",
      },
      { status: 500 },
    );
  }
}
