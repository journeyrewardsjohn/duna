import { getServerCaller } from "@/lib/api";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sessionIdFrom(value: unknown): string {
  if (!value || typeof value !== "object") throw new Error("Choose a session.");
  const sessionId = Reflect.get(value, "sessionId");
  if (typeof sessionId !== "string" || !uuidPattern.test(sessionId)) {
    throw new Error("Choose a valid session.");
  }
  return sessionId;
}

export async function POST(request: Request) {
  const liveKitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!liveKitUrl || !apiKey || !apiSecret) {
    return NextResponse.json(
      {
        error:
          "Voice notes are ready, but this environment has not connected LiveKit yet.",
      },
      { status: 503 },
    );
  }

  try {
    const auth = await withAuth();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const sessionId = sessionIdFrom(await request.json());
    const caller = await getServerCaller();
    const detail = await caller.operator.sessionDetail({ sessionId });
    const roomName = `duna-session-note-${crypto.randomUUID()}`;
    const token = new AccessToken(apiKey, apiSecret, {
      identity: `duna-coach-${auth.user.id}-${crypto.randomUUID()}`,
      name: auth.user.firstName || auth.user.email,
      ttl: "15m",
      metadata: JSON.stringify({
        purpose: "session-notes",
        sessionId,
      }),
      attributes: {
        "duna.purpose": "session-notes",
        "duna.session": sessionId,
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
            sessionId,
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
        serverUrl: liveKitUrl,
        roomName,
      },
      { headers: { "cache-control": "no-store, private" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Voice notes could not be started.",
      },
      { status: 400 },
    );
  }
}
