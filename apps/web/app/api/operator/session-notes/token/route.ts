import { createApiContextFromRequest, createCaller } from "@duna/api";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(error: unknown, status = 400) {
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Voice notes could not be started.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const serverUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!serverUrl || !apiKey || !apiSecret) {
    return errorResponse(
      new Error(
        "Voice notes are ready, but this environment has not connected LiveKit yet.",
      ),
      503,
    );
  }

  try {
    const body = (await request.json()) as { readonly sessionId?: unknown };
    if (
      typeof body.sessionId !== "string" ||
      !uuidPattern.test(body.sessionId)
    ) {
      throw new Error("Choose a valid session.");
    }
    const forwardedFor = request.headers.get("x-forwarded-for");
    const context = await createApiContextFromRequest(request, {
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
      ipAddress: forwardedFor?.split(",")[0]?.trim(),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    const caller = createCaller(context);
    const detail = await caller.operator.sessionDetail({
      sessionId: body.sessionId,
    });
    const roomName = `duna-session-note-${crypto.randomUUID()}`;
    const token = new AccessToken(apiKey, apiSecret, {
      identity: `duna-pro-coach-${crypto.randomUUID()}`,
      name: "Duna Pro coach",
      ttl: "15m",
      metadata: JSON.stringify({
        purpose: "session-notes",
        sessionId: body.sessionId,
      }),
      attributes: {
        "duna.purpose": "session-notes",
        "duna.session": body.sessionId,
      },
    });
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    });
    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: "duna-session-notes",
          metadata: JSON.stringify({
            sessionId: body.sessionId,
            sessionTitle: detail.session.title,
            playerNames: detail.attendees.map(
              (attendee) => attendee.displayName,
            ),
          }),
        }),
      ],
      emptyTimeout: 60,
      departureTimeout: 30,
      maxParticipants: 2,
    });
    return NextResponse.json(
      {
        participantToken: await token.toJwt(),
        serverUrl,
        roomName,
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized.";
    const status =
      /unauthorized|forbidden|organization context|required scope/i.test(
        message,
      )
        ? 401
        : 400;
    return errorResponse(error, status);
  }
}
