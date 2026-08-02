import { getServerCaller } from "@/lib/api";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function subjectPersonIdFrom(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const subjectPersonId = Reflect.get(value, "subjectPersonId");
  if (subjectPersonId === undefined) return undefined;
  if (
    typeof subjectPersonId !== "string" ||
    !uuidPattern.test(subjectPersonId)
  ) {
    throw new Error("Invalid player selection.");
  }
  return subjectPersonId;
}

export async function POST(request: Request) {
  const liveKitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!liveKitUrl || !apiKey || !apiSecret) {
    return NextResponse.json(
      {
        error:
          "Voice onboarding is ready but the LiveKit project is not connected yet.",
      },
      { status: 503 },
    );
  }

  try {
    const session = await withAuth();
    if (!session.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const requestedSubjectPersonId = subjectPersonIdFrom(await request.json());
    const caller = await getServerCaller();
    const settings = await caller.player.settings();
    const subjectPersonId =
      requestedSubjectPersonId ?? settings.profile.person.id;
    const subject =
      subjectPersonId === settings.profile.person.id
        ? settings.profile.person
        : settings.household.find(
            (member) =>
              member.role === "dependent" &&
              member.person.id === subjectPersonId,
          )?.person;
    if (!subject) {
      return NextResponse.json(
        { error: "This player is not connected to your household." },
        { status: 403 },
      );
    }

    const roomName = `duna-profile-${crypto.randomUUID()}`;
    const token = new AccessToken(apiKey, apiSecret, {
      identity: `duna-${session.user.id}-${crypto.randomUUID()}`,
      name: settings.profile.person.displayName,
      ttl: "10m",
      metadata: JSON.stringify({
        purpose: "profile-onboarding",
        subjectPersonId: subject.id,
      }),
      attributes: {
        "duna.purpose": "profile-onboarding",
        "duna.subject": subject.id,
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
          agentName: "duna-profile-guide",
          metadata: JSON.stringify({
            subjectPersonId: subject.id,
            subjectDisplayName: subject.displayName,
            answeredForChild: subject.id !== settings.profile.person.id,
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
  } catch {
    return NextResponse.json(
      { error: "Voice onboarding could not be started." },
      { status: 400 },
    );
  }
}
