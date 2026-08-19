import {
  auditLog,
  catalogFulfillments,
  catalogItems,
  catalogSessionOccurrences,
  getDatabase,
  organizations,
  people,
  virtualSessionArtifacts,
  virtualSessionMeetingParticipants,
  virtualSessionMeetings,
} from "@duna/db";
import { SignJWT, importPKCS8 } from "jose";
import { and, asc, eq, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";
import { stableHash } from "./canonical";
import { parseSessionDeliveryConfiguration } from "./session-delivery";
import {
  isR2VideoConfigured,
  presignR2VideoPlayback,
  storePrivateR2Response,
} from "./video-providers";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const MEET_API = "https://meet.googleapis.com/v2";
const AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/responses";
const DEFAULT_SUMMARY_MODEL = "openai/gpt-5.6-luna";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/meetings.space.created",
  "https://www.googleapis.com/auth/meetings.space.readonly",
  "https://www.googleapis.com/auth/meetings.space.settings",
] as const;

type GoogleConfiguration = {
  readonly clientEmail: string;
  readonly privateKey: string;
  readonly organizerEmail: string;
  readonly calendarId: string;
};

type GoogleCalendarEvent = {
  readonly id?: string;
  readonly htmlLink?: string;
  readonly hangoutLink?: string;
  readonly conferenceData?: {
    readonly conferenceId?: string;
    readonly createRequest?: {
      readonly status?: { readonly statusCode?: string };
    };
    readonly entryPoints?: readonly {
      readonly entryPointType?: string;
      readonly uri?: string;
    }[];
  };
};

type GoogleConferenceRecord = {
  readonly name: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly space?: string;
};

type GoogleParticipant = {
  readonly name: string;
  readonly signedinUser?: {
    readonly user?: string;
    readonly displayName?: string;
  };
  readonly anonymousUser?: { readonly displayName?: string };
  readonly phoneUser?: { readonly displayName?: string };
};

type VirtualSessionStatus =
  | "provisioning"
  | "scheduled"
  | "in-progress"
  | "awaiting-artifacts"
  | "complete"
  | "failed"
  | "cancelled";

const summarySchema = z.object({
  summary: z.string().trim().min(1).max(4_000),
  actionItems: z
    .array(
      z.object({
        ownerRole: z.enum(["coach", "player", "shared"]),
        text: z.string().trim().min(1).max(500),
      }),
    )
    .max(20),
});

const summaryJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 4000 },
    actionItems: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ownerRole: {
            type: "string",
            enum: ["coach", "player", "shared"],
          },
          text: { type: "string", minLength: 1, maxLength: 500 },
        },
        required: ["ownerRole", "text"],
      },
    },
  },
  required: ["summary", "actionItems"],
} as const;

function googleConfiguration(): GoogleConfiguration | undefined {
  const clientEmail =
    process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey =
    process.env.GOOGLE_WORKSPACE_PRIVATE_KEY?.trim().replaceAll("\\n", "\n");
  const organizerEmail =
    process.env.GOOGLE_WORKSPACE_MEET_ORGANIZER_EMAIL?.trim();
  if (!clientEmail || !privateKey || !organizerEmail) return undefined;
  return {
    clientEmail,
    privateKey,
    organizerEmail,
    calendarId:
      process.env.GOOGLE_WORKSPACE_MEET_CALENDAR_ID?.trim() || organizerEmail,
  };
}

export function googleWorkspaceVirtualSessionsConfigured(): boolean {
  return Boolean(googleConfiguration());
}

async function googleAccessToken(
  configuration: GoogleConfiguration,
): Promise<string> {
  const key = await importPKCS8(configuration.privateKey, "RS256");
  const assertion = await new SignJWT({
    scope: GOOGLE_SCOPES.join(" "),
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(configuration.clientEmail)
    .setSubject(configuration.organizerEmail)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const value = (await response.json()) as {
    readonly access_token?: string;
    readonly error_description?: string;
  };
  if (!response.ok || !value.access_token) {
    throw new Error(
      value.error_description ||
        `Google Workspace authorization failed (HTTP ${response.status}).`,
    );
  }
  return value.access_token;
}

async function googleJson<T>(input: {
  readonly token: string;
  readonly url: string;
  readonly method?: "GET" | "POST" | "PATCH";
  readonly body?: unknown;
}): Promise<T> {
  const response = await fetch(input.url, {
    method: input.method ?? "GET",
    headers: {
      Authorization: `Bearer ${input.token}`,
      ...(input.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });
  const text = await response.text();
  let value: unknown;
  try {
    value = text ? JSON.parse(text) : {};
  } catch {
    value = {};
  }
  if (!response.ok) {
    const providerMessage =
      value && typeof value === "object" && "error" in value
        ? JSON.stringify((value as { readonly error?: unknown }).error)
        : undefined;
    throw new Error(
      providerMessage
        ? `Google Workspace request failed: ${providerMessage}`
        : `Google Workspace request failed (HTTP ${response.status}).`,
    );
  }
  return value as T;
}

function calendarEventId(occurrenceId: string): string {
  return `duna${occurrenceId.replaceAll("-", "")}`;
}

function meetingCode(joinUrl: string | undefined): string | undefined {
  if (!joinUrl) return undefined;
  try {
    const code = new URL(joinUrl).pathname.split("/").filter(Boolean)[0];
    return code || undefined;
  } catch {
    return undefined;
  }
}

function joinUrl(event: GoogleCalendarEvent): string | undefined {
  return (
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find(
      (entry) => entry.entryPointType === "video",
    )?.uri
  );
}

function outputText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const response = value as {
    readonly output_text?: unknown;
    readonly output?: readonly {
      readonly content?: readonly {
        readonly type?: unknown;
        readonly text?: unknown;
      }[];
    }[];
  };
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return undefined;
}

async function summarizeTranscript(input: {
  readonly title: string;
  readonly transcript: string;
}): Promise<
  (z.infer<typeof summarySchema> & { readonly model: string }) | undefined
> {
  const credential =
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!credential) return undefined;
  const model =
    process.env.AI_GATEWAY_VIRTUAL_COACHING_MODEL?.trim() ||
    DEFAULT_SUMMARY_MODEL;
  const response = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 2_500,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You summarize consented beach-volleyball coaching sessions for the coach and player. Use only the supplied role-labeled transcript. Produce a concise, factual recap and clear action items. Attribute an action to coach, player, or shared only when the transcript supports it. Do not evaluate employment performance, diagnose health conditions, infer sensitive traits, or invent advice that was not discussed.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                title: input.title,
                transcript: input.transcript,
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "coaching_session_recap",
          strict: true,
          schema: summaryJsonSchema,
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Duna AI summary failed (HTTP ${response.status}).`);
  }
  const text = outputText(await response.json());
  if (!text) throw new Error("Duna AI returned no coaching summary.");
  return { ...summarySchema.parse(JSON.parse(text)), model };
}

export async function queueVirtualSessionDelivery(input: {
  readonly fulfillmentId: string;
  readonly now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const database = getDatabase();
  const fulfillment = await database.query.catalogFulfillments.findFirst({
    where: eq(catalogFulfillments.id, input.fulfillmentId),
  });
  if (!fulfillment?.catalogSessionOccurrenceId) return;
  const [item, occurrence, buyer] = await Promise.all([
    database.query.catalogItems.findFirst({
      where: eq(catalogItems.id, fulfillment.catalogItemId),
    }),
    database.query.catalogSessionOccurrences.findFirst({
      where: eq(
        catalogSessionOccurrences.id,
        fulfillment.catalogSessionOccurrenceId,
      ),
    }),
    database.query.people.findFirst({
      where: eq(people.id, fulfillment.personId),
    }),
  ]);
  if (!item || !occurrence || !buyer) return;
  const configuration = parseSessionDeliveryConfiguration(item.configuration);
  if (
    configuration?.deliveryMode !== "online" ||
    !configuration.virtualDelivery
  ) {
    return;
  }
  const coaches =
    occurrence.coachPersonIds.length > 0
      ? await database
          .select()
          .from(people)
          .where(inArray(people.id, occurrence.coachPersonIds))
      : [];
  let meeting = await database.query.virtualSessionMeetings.findFirst({
    where: eq(virtualSessionMeetings.catalogSessionOccurrenceId, occurrence.id),
  });
  if (!meeting) {
    const id = crypto.randomUUID();
    await database.insert(virtualSessionMeetings).values({
      id,
      organizationId: fulfillment.organizationId,
      catalogItemId: item.id,
      catalogSessionOccurrenceId: occurrence.id,
      coachPersonIds: occurrence.coachPersonIds,
      participantSnapshot: [],
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      timezone: occurrence.timezone,
      autoRecord: configuration.virtualDelivery.autoRecord,
      autoTranscribe: configuration.virtualDelivery.autoTranscribe,
      generateAiSummary: configuration.virtualDelivery.generateAiSummary,
      recordingConsentRequired: true,
      status: "provisioning",
      createdAt: now,
      updatedAt: now,
    });
    meeting = await database.query.virtualSessionMeetings.findFirst({
      where: eq(virtualSessionMeetings.id, id),
    });
  }
  if (!meeting)
    throw new Error("The virtual session record could not be created.");
  const participantValues = [
    {
      organizationId: fulfillment.organizationId,
      virtualSessionMeetingId: meeting.id,
      fulfillmentId: fulfillment.id,
      personId: buyer.id,
      role: "player" as const,
      emailSnapshot: buyer.email ?? undefined,
      displayNameSnapshot: buyer.displayName,
      createdAt: now,
      updatedAt: now,
    },
    ...coaches.map((coach) => ({
      organizationId: fulfillment.organizationId,
      virtualSessionMeetingId: meeting!.id,
      fulfillmentId: undefined,
      personId: coach.id,
      role: "coach" as const,
      emailSnapshot: coach.email ?? undefined,
      displayNameSnapshot: coach.displayName,
      createdAt: now,
      updatedAt: now,
    })),
  ];
  for (const participant of participantValues) {
    await database
      .insert(virtualSessionMeetingParticipants)
      .values(participant)
      .onConflictDoUpdate({
        target: [
          virtualSessionMeetingParticipants.virtualSessionMeetingId,
          virtualSessionMeetingParticipants.personId,
          virtualSessionMeetingParticipants.role,
        ],
        set: {
          fulfillmentId: participant.fulfillmentId,
          emailSnapshot: participant.emailSnapshot,
          displayNameSnapshot: participant.displayNameSnapshot,
          updatedAt: now,
        },
      });
  }
  const allParticipants = await database
    .select()
    .from(virtualSessionMeetingParticipants)
    .where(
      eq(virtualSessionMeetingParticipants.virtualSessionMeetingId, meeting.id),
    );
  const snapshots = allParticipants
    .filter((participant) => participant.emailSnapshot)
    .map((participant) => ({
      personId: participant.personId,
      role: participant.role as "coach" | "player",
      displayName: participant.displayNameSnapshot,
      email: participant.emailSnapshot!,
    }));
  await database
    .update(virtualSessionMeetings)
    .set({
      participantSnapshot: snapshots,
      status: "provisioning",
      lastError: null,
      updatedAt: now,
    })
    .where(eq(virtualSessionMeetings.id, meeting.id));
}

async function provisionMeeting(
  meeting: typeof virtualSessionMeetings.$inferSelect,
  token: string,
  configuration: GoogleConfiguration,
  now: Date,
): Promise<void> {
  const database = getDatabase();
  const [item, organization, participants] = await Promise.all([
    database.query.catalogItems.findFirst({
      where: eq(catalogItems.id, meeting.catalogItemId),
    }),
    database.query.organizations.findFirst({
      where: eq(organizations.id, meeting.organizationId),
    }),
    database
      .select()
      .from(virtualSessionMeetingParticipants)
      .where(
        eq(
          virtualSessionMeetingParticipants.virtualSessionMeetingId,
          meeting.id,
        ),
      ),
  ]);
  if (!item || !organization)
    throw new Error("Virtual session owner was not found.");
  const attendeeEmails = [
    ...new Set(
      participants
        .map((participant) => participant.emailSnapshot?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    ),
  ];
  if (attendeeEmails.length === 0) {
    throw new Error(
      "The player and coach need email addresses for Calendar delivery.",
    );
  }
  const eventId =
    meeting.calendarEventId ||
    calendarEventId(meeting.catalogSessionOccurrenceId);
  const calendarCollectionUrl = `${CALENDAR_API}/calendars/${encodeURIComponent(
    configuration.calendarId,
  )}/events?conferenceDataVersion=1&sendUpdates=all`;
  const calendarEventUrl = `${CALENDAR_API}/calendars/${encodeURIComponent(
    configuration.calendarId,
  )}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`;
  const eventBody = {
    id: eventId,
    summary: item.title,
    description: [
      item.shortSummary || item.description || `${item.title} on Duna.`,
      "",
      meeting.autoRecord || meeting.autoTranscribe
        ? "Recording/transcription notice: this coaching session is configured to create the selected Meet artifacts. Google Meet displays its own in-call notice and controls."
        : undefined,
      "The recording, transcript, AI summary, and action items are stored with the Duna session only when enabled and successfully produced.",
    ]
      .filter(Boolean)
      .join("\n"),
    start: {
      dateTime: meeting.startsAt.toISOString(),
      timeZone: meeting.timezone,
    },
    end: { dateTime: meeting.endsAt.toISOString(), timeZone: meeting.timezone },
    attendees: attendeeEmails.map((email) => ({ email })),
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    guestsCanSeeOtherGuests: true,
    conferenceData: {
      createRequest: {
        requestId: meeting.catalogSessionOccurrenceId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    extendedProperties: {
      private: {
        dunaVirtualSessionMeetingId: meeting.id,
        dunaCatalogItemId: meeting.catalogItemId,
      },
    },
  };
  let event: GoogleCalendarEvent;
  try {
    if (meeting.calendarEventId) {
      event = await googleJson<GoogleCalendarEvent>({
        token,
        url: calendarEventUrl,
        method: "PATCH",
        body: {
          attendees: attendeeEmails.map((email) => ({ email })),
          description: eventBody.description,
        },
      });
    } else {
      event = await googleJson<GoogleCalendarEvent>({
        token,
        url: calendarCollectionUrl,
        method: "POST",
        body: eventBody,
      });
    }
  } catch (error) {
    // A deterministic event ID makes retries safe. If insertion already won,
    // update attendees and read the provider-generated conference state.
    if (!String(error).includes("409")) throw error;
    event = await googleJson<GoogleCalendarEvent>({
      token,
      url: calendarEventUrl,
      method: "PATCH",
      body: {
        attendees: attendeeEmails.map((email) => ({ email })),
        description: eventBody.description,
      },
    });
  }
  const url = joinUrl(event);
  const code = meetingCode(url);
  if (!url || !code) {
    await database
      .update(virtualSessionMeetings)
      .set({
        calendarEventId: event.id ?? eventId,
        calendarHtmlUrl: event.htmlLink,
        organizerEmail: configuration.organizerEmail,
        attempts: meeting.attempts + 1,
        lastAttemptAt: now,
        lastError: "Google Calendar is still generating the Meet link.",
        updatedAt: now,
      })
      .where(eq(virtualSessionMeetings.id, meeting.id));
    return;
  }
  const space = await googleJson<{
    readonly name?: string;
    readonly meetingCode?: string;
    readonly meetingUri?: string;
  }>({ token, url: `${MEET_API}/spaces/${encodeURIComponent(code)}` });
  if (space.name) {
    await googleJson({
      token,
      url: `${MEET_API}/${space.name}?updateMask=config.artifactConfig,config.accessType`,
      method: "PATCH",
      body: {
        config: {
          accessType: "RESTRICTED",
          artifactConfig: {
            recordingConfig: {
              autoRecordingGeneration: meeting.autoRecord ? "ON" : "OFF",
            },
            transcriptionConfig: {
              autoTranscriptionGeneration: meeting.autoTranscribe
                ? "ON"
                : "OFF",
            },
          },
        },
      },
    });
  }
  await database.batch([
    database
      .update(virtualSessionMeetings)
      .set({
        organizerEmail: configuration.organizerEmail,
        calendarEventId: event.id ?? eventId,
        calendarHtmlUrl: event.htmlLink,
        meetSpaceName: space.name,
        meetingCode: space.meetingCode ?? code,
        joinUrl: space.meetingUri ?? url,
        status: "scheduled",
        attempts: meeting.attempts + 1,
        lastAttemptAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(virtualSessionMeetings.id, meeting.id)),
    database.insert(auditLog).values({
      organizationId: meeting.organizationId,
      actorType: "system",
      action: "virtual-session.google-meet_scheduled",
      entityType: "virtual-session-meeting",
      entityId: meeting.id,
      afterHash: stableHash({ eventId, code, attendeeEmails }),
      reason: "Paid online session projected to the Duna Workspace calendar.",
      traceId: meeting.id,
      createdAt: now,
    }),
  ]);
}

function participantDisplayName(participant: GoogleParticipant): string {
  return (
    participant.signedinUser?.displayName ||
    participant.anonymousUser?.displayName ||
    participant.phoneUser?.displayName ||
    "Unknown participant"
  );
}

function normalizedName(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim();
}

async function syncArtifacts(
  meeting: typeof virtualSessionMeetings.$inferSelect,
  token: string,
  now: Date,
): Promise<boolean> {
  if (!meeting.meetingCode) return false;
  const database = getDatabase();
  const records = await googleJson<{
    readonly conferenceRecords?: readonly GoogleConferenceRecord[];
  }>({
    token,
    url: `${MEET_API}/conferenceRecords?filter=${encodeURIComponent(
      `space.meeting_code = "${meeting.meetingCode}"`,
    )}`,
  });
  const record = records.conferenceRecords?.[0];
  if (!record) return false;
  if (!record.endTime) {
    await database
      .update(virtualSessionMeetings)
      .set({
        conferenceRecordName: record.name,
        status: "in-progress",
        lastAttemptAt: now,
        attempts: meeting.attempts + 1,
        updatedAt: now,
      })
      .where(eq(virtualSessionMeetings.id, meeting.id));
    return false;
  }

  const [recordings, transcripts, participants, item] = await Promise.all([
    googleJson<{
      readonly recordings?: readonly {
        readonly name: string;
        readonly state?: string;
        readonly driveDestination?: {
          readonly file?: string;
          readonly exportUri?: string;
        };
      }[];
    }>({ token, url: `${MEET_API}/${record.name}/recordings` }),
    googleJson<{
      readonly transcripts?: readonly {
        readonly name: string;
        readonly state?: string;
        readonly docsDestination?: {
          readonly file?: string;
          readonly exportUri?: string;
        };
      }[];
    }>({ token, url: `${MEET_API}/${record.name}/transcripts` }),
    googleJson<{ readonly participants?: readonly GoogleParticipant[] }>({
      token,
      url: `${MEET_API}/${record.name}/participants?pageSize=250`,
    }),
    database.query.catalogItems.findFirst({
      where: eq(catalogItems.id, meeting.catalogItemId),
    }),
  ]);
  const invited = meeting.participantSnapshot;
  const roleByParticipant = new Map<string, "coach" | "player" | "unknown">();
  const participantRoles = (participants.participants ?? []).map(
    (participant) => {
      const displayName = participantDisplayName(participant);
      const matching = invited.find(
        (candidate) =>
          normalizedName(candidate.displayName) === normalizedName(displayName),
      );
      const role: "coach" | "player" | "unknown" = matching?.role ?? "unknown";
      roleByParticipant.set(participant.name, role);
      return {
        providerParticipantName: participant.name,
        displayName,
        role,
      };
    },
  );
  let aiSummaryReady = true;
  let recordingsStored = 0;

  for (const recording of recordings.recordings ?? []) {
    let storageObjectKey: string | undefined;
    const fileId = recording.driveDestination?.file;
    if (
      fileId &&
      recording.state === "FILE_GENERATED" &&
      isR2VideoConfigured()
    ) {
      const source = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!source.ok) {
        throw new Error(
          `Google Drive recording download failed (HTTP ${source.status}).`,
        );
      }
      storageObjectKey = `virtual-sessions/${meeting.organizationId}/${meeting.id}/${fileId}.mp4`;
      await storePrivateR2Response({
        objectKey: storageObjectKey,
        response: source,
        contentType: source.headers.get("content-type") || "video/mp4",
        metadata: {
          "duna-virtual-session-id": meeting.id,
          "duna-catalog-item-id": meeting.catalogItemId,
        },
      });
      recordingsStored += 1;
    }
    await database
      .insert(virtualSessionArtifacts)
      .values({
        organizationId: meeting.organizationId,
        virtualSessionMeetingId: meeting.id,
        kind: "recording",
        providerArtifactName: recording.name,
        providerFileId: fileId,
        providerExportUri: recording.driveDestination?.exportUri,
        storageObjectKey,
        state: storageObjectKey ? "stored" : "available",
        participantRoles,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          virtualSessionArtifacts.virtualSessionMeetingId,
          virtualSessionArtifacts.providerArtifactName,
        ],
        set: {
          providerFileId: fileId,
          providerExportUri: recording.driveDestination?.exportUri,
          storageObjectKey,
          state: storageObjectKey ? "stored" : "available",
          participantRoles,
          updatedAt: now,
        },
      });
  }

  for (const transcript of transcripts.transcripts ?? []) {
    const entries = await googleJson<{
      readonly transcriptEntries?: readonly {
        readonly participant?: string;
        readonly text?: string;
        readonly startTime?: string;
      }[];
    }>({ token, url: `${MEET_API}/${transcript.name}/entries?pageSize=1000` });
    const transcriptText = (entries.transcriptEntries ?? [])
      .filter((entry) => entry.text?.trim())
      .map((entry) => {
        const role = entry.participant
          ? (roleByParticipant.get(entry.participant) ?? "unknown")
          : "unknown";
        return `[${role}] ${entry.text!.trim()}`;
      })
      .join("\n");
    const recap =
      meeting.generateAiSummary && transcriptText
        ? await summarizeTranscript({
            title: item?.title ?? "Virtual coaching session",
            transcript: transcriptText,
          })
        : undefined;
    if (meeting.generateAiSummary && transcriptText && !recap) {
      aiSummaryReady = false;
    }
    await database
      .insert(virtualSessionArtifacts)
      .values({
        organizationId: meeting.organizationId,
        virtualSessionMeetingId: meeting.id,
        kind: "transcript",
        providerArtifactName: transcript.name,
        providerFileId: transcript.docsDestination?.file,
        providerExportUri: transcript.docsDestination?.exportUri,
        state: recap ? "summarized" : "available",
        transcriptText,
        aiSummary: recap?.summary,
        actionItems: recap?.actionItems ?? [],
        participantRoles,
        aiModel: recap?.model,
        generatedAt: recap ? now : undefined,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          virtualSessionArtifacts.virtualSessionMeetingId,
          virtualSessionArtifacts.providerArtifactName,
        ],
        set: {
          providerFileId: transcript.docsDestination?.file,
          providerExportUri: transcript.docsDestination?.exportUri,
          state: recap ? "summarized" : "available",
          transcriptText,
          aiSummary: recap?.summary,
          actionItems: recap?.actionItems ?? [],
          participantRoles,
          aiModel: recap?.model,
          generatedAt: recap ? now : undefined,
          updatedAt: now,
        },
      });
  }
  const recordingReady =
    !meeting.autoRecord ||
    (Boolean(recordings.recordings?.length) &&
      recordingsStored === recordings.recordings?.length);
  const transcriptReady =
    !meeting.autoTranscribe || Boolean(transcripts.transcripts?.length);
  if (!recordingReady || !transcriptReady || !aiSummaryReady) return false;
  await database.batch([
    database
      .update(virtualSessionMeetings)
      .set({
        conferenceRecordName: record.name,
        status: "complete",
        artifactsSyncedAt: now,
        completedAt: now,
        attempts: meeting.attempts + 1,
        lastAttemptAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(virtualSessionMeetings.id, meeting.id)),
    database.insert(auditLog).values({
      organizationId: meeting.organizationId,
      actorType: "system",
      action: "virtual-session.artifacts_ingested",
      entityType: "virtual-session-meeting",
      entityId: meeting.id,
      afterHash: stableHash({
        conferenceRecordName: record.name,
        recordingCount: recordings.recordings?.length ?? 0,
        transcriptCount: transcripts.transcripts?.length ?? 0,
      }),
      reason: "Google Meet artifacts were attached to the Duna session record.",
      traceId: meeting.id,
      createdAt: now,
    }),
  ]);
  return true;
}

export async function processVirtualSessionDeliveries(
  input: {
    readonly limit?: number;
    readonly now?: Date;
  } = {},
): Promise<{
  readonly processed: number;
  readonly scheduled: number;
  readonly completed: number;
  readonly failed: number;
}> {
  const configuration = googleConfiguration();
  if (!configuration) {
    return { processed: 0, scheduled: 0, completed: 0, failed: 0 };
  }
  const now = input.now ?? new Date();
  const limit = Math.min(50, Math.max(1, input.limit ?? 12));
  const database = getDatabase();
  const meetings = await database
    .select()
    .from(virtualSessionMeetings)
    .where(
      or(
        eq(virtualSessionMeetings.status, "provisioning"),
        eq(virtualSessionMeetings.status, "in-progress"),
        eq(virtualSessionMeetings.status, "awaiting-artifacts"),
        and(
          eq(virtualSessionMeetings.status, "scheduled"),
          lt(virtualSessionMeetings.endsAt, now),
        ),
      ),
    )
    .orderBy(asc(virtualSessionMeetings.startsAt))
    .limit(limit);
  const token = await googleAccessToken(configuration);
  let scheduled = 0;
  let completed = 0;
  let failed = 0;
  for (const meeting of meetings) {
    try {
      if (meeting.status === "provisioning") {
        await provisionMeeting(meeting, token, configuration, now);
        scheduled += 1;
      } else if (await syncArtifacts(meeting, token, now)) {
        completed += 1;
      } else {
        await database
          .update(virtualSessionMeetings)
          .set({
            status: "awaiting-artifacts",
            attempts: meeting.attempts + 1,
            lastAttemptAt: now,
            updatedAt: now,
          })
          .where(eq(virtualSessionMeetings.id, meeting.id));
      }
    } catch (error) {
      failed += 1;
      await database
        .update(virtualSessionMeetings)
        .set({
          status: meeting.attempts >= 20 ? "failed" : meeting.status,
          attempts: meeting.attempts + 1,
          lastAttemptAt: now,
          lastError:
            error instanceof Error
              ? error.message.slice(0, 2_000)
              : "Unknown error",
          updatedAt: now,
        })
        .where(eq(virtualSessionMeetings.id, meeting.id));
    }
  }
  return { processed: meetings.length, scheduled, completed, failed };
}

export async function loadPlayerVirtualSessionRecords(personId: string) {
  const database = getDatabase();
  const rows = await database
    .select({ meeting: virtualSessionMeetings })
    .from(virtualSessionMeetingParticipants)
    .innerJoin(
      virtualSessionMeetings,
      eq(
        virtualSessionMeetingParticipants.virtualSessionMeetingId,
        virtualSessionMeetings.id,
      ),
    )
    .where(
      and(
        eq(virtualSessionMeetingParticipants.personId, personId),
        eq(virtualSessionMeetingParticipants.role, "player"),
      ),
    )
    .orderBy(asc(virtualSessionMeetings.startsAt));
  return Promise.all(
    rows.map(async ({ meeting }) => {
      const [item, artifacts] = await Promise.all([
        database.query.catalogItems.findFirst({
          where: eq(catalogItems.id, meeting.catalogItemId),
        }),
        database
          .select()
          .from(virtualSessionArtifacts)
          .where(
            eq(virtualSessionArtifacts.virtualSessionMeetingId, meeting.id),
          ),
      ]);
      const recordingArtifact = artifacts.find(
        (artifact) => artifact.kind === "recording",
      );
      const playback = recordingArtifact?.storageObjectKey
        ? await presignR2VideoPlayback({
            objectKey: recordingArtifact.storageObjectKey,
            title: item?.title ?? "Virtual coaching session",
            expiresInSeconds: 60 * 60,
          })
        : undefined;
      return {
        id: meeting.id,
        title: item?.title ?? "Virtual coaching session",
        startsAt: meeting.startsAt.toISOString(),
        endsAt: meeting.endsAt.toISOString(),
        timezone: meeting.timezone,
        status: meeting.status as VirtualSessionStatus,
        joinUrl:
          meeting.status === "scheduled" || meeting.status === "in-progress"
            ? (meeting.joinUrl ?? undefined)
            : undefined,
        recording: recordingArtifact
          ? {
              stored: Boolean(recordingArtifact.storageObjectKey),
              url: playback?.url,
              expiresAt: playback?.expiresAt.toISOString(),
            }
          : undefined,
        summary:
          artifacts.find((artifact) => artifact.kind === "transcript")
            ?.aiSummary ?? undefined,
        actionItems:
          artifacts.find((artifact) => artifact.kind === "transcript")
            ?.actionItems ?? [],
      };
    }),
  );
}
