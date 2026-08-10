import {
  auditLog,
  courts,
  divisions,
  eventTypes,
  getDatabase,
  matches,
  programs,
  rallyEvents,
  sessions,
  teams,
  ticketTypes,
  venueLayoutAssets,
  venueLayoutDivisionPriorities,
  venueLayoutEventSettings,
  venueLayouts,
  venues,
} from "@duna/db";
import { demoOrganization } from "@duna/core/demo";
import {
  foldScore,
  standardBeachFormat,
  type MatchFormat,
  type ScoreEvent,
} from "@duna/league-engine";
import { and, asc, desc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import { stableHash } from "./canonical";
import type {
  OperatorMutationResult,
  PublicVenueLayout,
  VenueLayout,
  VenueLayoutAsset,
  VenueLayoutCourtAssignmentPlan,
  VenueLayoutGeometry,
  VenueLayoutWorkspace,
} from "./contracts";
import type { ApiActor } from "./context";
import {
  loadDemoOperatorWorkspace,
  loadOperatorWorkspace,
  OperatorServiceError,
} from "./operator-service";

interface MutationContext {
  readonly actor: ApiActor;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}

interface LayoutAssetInput {
  readonly id: string;
  readonly kind: VenueLayoutAsset["kind"];
  readonly templateKey?: string;
  readonly courtId?: string;
  readonly ticketTypeId?: string;
  readonly label: string;
  readonly identifierCode?: string;
  readonly capacity?: number;
  readonly geometry: VenueLayoutGeometry;
  readonly appearance: VenueLayoutAsset["appearance"];
  readonly sortOrder: number;
  readonly locked: boolean;
  readonly divisionPriorities: VenueLayoutAsset["divisionPriorities"];
}

function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new OperatorServiceError(
      "DATABASE_REQUIRED",
      "Venue layouts require the connected Duna database.",
    );
  }
}

function requireOrganization(actor: ApiActor): string {
  if (!actor.organizationId) {
    throw new OperatorServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "An organization is required for venue layout management.",
    );
  }
  return actor.organizationId;
}

async function ownedVenue(organizationId: string, venueId: string) {
  const venue = await getDatabase().query.venues.findFirst({
    where: eq(venues.id, venueId),
  });
  if (!venue) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "Venue was not found.",
    );
  }
  if (venue.organizationId !== organizationId) {
    throw new OperatorServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "Venue belongs to another organization.",
    );
  }
  return venue;
}

async function ownedLayout(organizationId: string, layoutId: string) {
  const row = (
    await getDatabase()
      .select({
        layout: venueLayouts,
        venueOrganizationId: venues.organizationId,
      })
      .from(venueLayouts)
      .innerJoin(venues, eq(venueLayouts.venueId, venues.id))
      .where(eq(venueLayouts.id, layoutId))
      .limit(1)
  )[0];
  if (!row) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "Venue layout was not found.",
    );
  }
  if (row.venueOrganizationId !== organizationId) {
    throw new OperatorServiceError(
      "RESOURCE_WRONG_ORGANIZATION",
      "Venue layout belongs to another organization.",
    );
  }
  return row.layout;
}

function appearance(value: unknown): VenueLayoutAsset["appearance"] {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const palette =
    record.palette === "sand" ||
    record.palette === "ticketed" ||
    record.palette === "amenity" ||
    record.palette === "service" ||
    record.palette === "restricted"
      ? record.palette
      : "neutral";
  return {
    palette,
    ...(typeof record.icon === "string" ? { icon: record.icon } : {}),
  };
}

function mapLayoutRows(input: {
  readonly layouts: readonly (typeof venueLayouts.$inferSelect)[];
  readonly assets: readonly (typeof venueLayoutAssets.$inferSelect)[];
  readonly priorities: readonly (typeof venueLayoutDivisionPriorities.$inferSelect)[];
}): readonly VenueLayout[] {
  return input.layouts.map((layout) => ({
    id: layout.id,
    venueId: layout.venueId,
    eventSessionId: layout.eventSessionId ?? undefined,
    name: layout.name,
    version: layout.version,
    status:
      layout.status === "published" || layout.status === "archived"
        ? layout.status
        : "draft",
    sourceType: layout.sourceType === "floorplan" ? "floorplan" : "satellite",
    isPrimary: layout.isPrimary,
    floorplanImageUrl: layout.floorplanImageUrl ?? undefined,
    floorplanAnalysis: layout.floorplanAnalysis ?? undefined,
    mapCenterLatitude: layout.mapCenterLatitude ?? undefined,
    mapCenterLongitude: layout.mapCenterLongitude ?? undefined,
    mapZoom: layout.mapZoom,
    mapBearing: layout.mapBearing,
    mapPitch: layout.mapPitch,
    publishedAt: layout.publishedAt?.toISOString(),
    updatedAt: layout.updatedAt.toISOString(),
    assets: input.assets
      .filter((asset) => asset.layoutId === layout.id)
      .map((asset) => ({
        id: asset.id,
        layoutId: asset.layoutId,
        kind: asset.kind as VenueLayoutAsset["kind"],
        templateKey: asset.templateKey ?? undefined,
        courtId: asset.courtId ?? undefined,
        ticketTypeId: asset.ticketTypeId ?? undefined,
        label: asset.label,
        identifierCode: asset.identifierCode ?? undefined,
        capacity: asset.capacity ?? undefined,
        geometry: asset.geometry as VenueLayoutGeometry,
        appearance: appearance(asset.appearance),
        sortOrder: asset.sortOrder,
        locked: asset.locked,
        divisionPriorities: input.priorities
          .filter((priority) => priority.layoutAssetId === asset.id)
          .map((priority) => ({
            divisionId: priority.divisionId,
            priority: priority.priority,
            startsHere: priority.startsHere,
            allowWhenFree: priority.allowWhenFree,
          })),
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder),
  }));
}

function demoVenueLayoutWorkspace(venueId: string): VenueLayoutWorkspace {
  const workspace = loadDemoOperatorWorkspace(demoOrganization.id);
  const venue = workspace.venues.find((item) => item.id === venueId);
  if (!venue) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "Venue was not found.",
    );
  }
  const layoutId = "10000000-0000-4000-8000-000000000901";
  const draftLayoutId = "10000000-0000-4000-8000-000000000909";
  const eventId = "10000000-0000-4000-8000-000000000904";
  const divisionIds = {
    open: "10000000-0000-4000-8000-000000000905",
    pro: "10000000-0000-4000-8000-000000000906",
  } as const;
  const centers = [
    { latitude: 33.88473, longitude: -118.41094 },
    { latitude: 33.88483, longitude: -118.41078 },
  ] as const;
  const courtAssets: VenueLayoutAsset[] = venue.courts.map((court, index) => ({
    id: `10000000-0000-4000-8000-00000000090${index + 2}`,
    layoutId,
    kind: "court",
    templateKey: index === 0 ? "fivb-short-court" : "duna-short-court",
    courtId: court.id,
    label: court.name,
    identifierCode: `C${index + 1}`,
    capacity: court.capacity,
    geometry: {
      coordinateSpace: "geo",
      shape: "rectangle",
      center: centers[index]!,
      widthMeters: 8,
      heightMeters: 16,
      rotationDegrees: 35,
      bufferMeters: index === 0 ? 6 : 3,
    },
    appearance: { palette: "sand" },
    sortOrder: index,
    locked: false,
    divisionPriorities: [
      {
        divisionId: index === 0 ? divisionIds.pro : divisionIds.open,
        priority: 1,
        startsHere: true,
        allowWhenFree: true,
      },
      {
        divisionId: index === 0 ? divisionIds.open : divisionIds.pro,
        priority: 2,
        startsHere: false,
        allowWhenFree: true,
      },
    ],
  }));
  const vipAsset: VenueLayoutAsset = {
    id: "10000000-0000-4000-8000-000000000907",
    layoutId,
    kind: "ticketed-space",
    templateKey: "ticketed-space",
    label: "VIP Sunset Deck",
    identifierCode: "VIP1",
    capacity: 32,
    geometry: {
      coordinateSpace: "geo",
      shape: "rectangle",
      center: { latitude: 33.88461, longitude: -118.41066 },
      widthMeters: 12,
      heightMeters: 8,
      rotationDegrees: 35,
      bufferMeters: 0,
    },
    appearance: { palette: "ticketed", icon: "ticket" },
    sortOrder: 2,
    locked: false,
    divisionPriorities: [],
  };
  return {
    venue,
    layouts: [
      {
        id: draftLayoutId,
        venueId,
        eventSessionId: eventId,
        name: "Summer Open · event layout",
        version: 4,
        status: "draft",
        sourceType: "satellite",
        isPrimary: false,
        mapCenterLatitude: venue.latitude,
        mapCenterLongitude: venue.longitude,
        mapZoom: 19.6,
        mapBearing: 0,
        mapPitch: 0,
        updatedAt: new Date().toISOString(),
        assets: [...courtAssets, vipAsset].map((asset, index) => ({
          ...asset,
          id: `10000000-0000-4000-8000-00000000091${index}`,
          layoutId: draftLayoutId,
        })),
      },
      {
        id: layoutId,
        venueId,
        name: "Championship setup",
        version: 3,
        status: "published",
        sourceType: "satellite",
        isPrimary: true,
        mapCenterLatitude: venue.latitude,
        mapCenterLongitude: venue.longitude,
        mapZoom: 19.6,
        mapBearing: 0,
        mapPitch: 0,
        publishedAt: new Date(Date.now() - 86_400_000).toISOString(),
        updatedAt: new Date().toISOString(),
        assets: [...courtAssets, vipAsset],
      },
    ],
    events: [
      {
        id: eventId,
        title: "Duna Summer Open",
        startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        endsAt: new Date(
          Date.now() + 7 * 86_400_000 + 10 * 3_600_000,
        ).toISOString(),
        status: "published",
        divisions: [
          { id: divisionIds.open, name: "Open", teamSize: 2, maximumTeams: 24 },
          { id: divisionIds.pro, name: "Pro", teamSize: 2, maximumTeams: 16 },
        ],
        ticketTypes: [
          {
            id: "10000000-0000-4000-8000-000000000908",
            name: "VIP Sunset Deck",
            quantity: 40,
          },
        ],
        settings: {
          sessionId: eventId,
          layoutId,
          aiCourtAssignmentEnabled: true,
          averageMatchMinutes: 42,
          releaseCourtWhenFree: true,
        },
      },
    ],
    liveMatches: [],
  };
}

export async function loadVenueLayoutWorkspace(input: {
  readonly organizationId: string;
  readonly venueId: string;
  readonly demo?: boolean;
}): Promise<VenueLayoutWorkspace> {
  if (input.demo) return demoVenueLayoutWorkspace(input.venueId);
  requireDatabase();
  await ownedVenue(input.organizationId, input.venueId);
  const database = getDatabase();
  const workspacePromise = loadOperatorWorkspace(input.organizationId);
  const [layoutRows, sessionRows] = await Promise.all([
    database
      .select()
      .from(venueLayouts)
      .where(eq(venueLayouts.venueId, input.venueId))
      .orderBy(desc(venueLayouts.version)),
    database
      .select({
        id: sessions.id,
        title: sessions.title,
        startsAt: sessions.startsAt,
        endsAt: sessions.endsAt,
        status: sessions.status,
        kindFromProgram: programs.kind,
        kindFromEventType: eventTypes.kind,
      })
      .from(sessions)
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .where(eq(sessions.venueId, input.venueId))
      .orderBy(desc(sessions.startsAt)),
  ]);
  const layoutIds = layoutRows.map((layout) => layout.id);
  const sessionIds = sessionRows.map((session) => session.id);
  const [assetRows, eventSettingRows, divisionRows, ticketTypeRows, matchRows] =
    await Promise.all([
      layoutIds.length
        ? database
            .select()
            .from(venueLayoutAssets)
            .where(inArray(venueLayoutAssets.layoutId, layoutIds))
            .orderBy(asc(venueLayoutAssets.sortOrder))
        : Promise.resolve([]),
      sessionIds.length
        ? database
            .select()
            .from(venueLayoutEventSettings)
            .where(inArray(venueLayoutEventSettings.sessionId, sessionIds))
        : Promise.resolve([]),
      sessionIds.length
        ? database
            .select()
            .from(divisions)
            .where(inArray(divisions.sessionId, sessionIds))
            .orderBy(asc(divisions.name))
        : Promise.resolve([]),
      sessionIds.length
        ? database
            .select()
            .from(ticketTypes)
            .where(inArray(ticketTypes.sessionId, sessionIds))
            .orderBy(asc(ticketTypes.name))
        : Promise.resolve([]),
      database
        .select({ match: matches, divisionName: divisions.name })
        .from(matches)
        .innerJoin(divisions, eq(matches.divisionId, divisions.id))
        .innerJoin(sessions, eq(divisions.sessionId, sessions.id))
        .where(
          and(
            eq(sessions.venueId, input.venueId),
            inArray(matches.status, ["scheduled", "warmup", "live"]),
            isNotNull(matches.courtId),
          ),
        ),
    ]);
  const assetIds = assetRows.map((asset) => asset.id);
  const matchIds = matchRows.map((row) => row.match.id);
  const teamIds = [
    ...new Set(
      matchRows.flatMap((row) =>
        [row.match.teamAId, row.match.teamBId].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ),
  ];
  const [priorityRows, teamRows, eventRows] = await Promise.all([
    assetIds.length
      ? database
          .select()
          .from(venueLayoutDivisionPriorities)
          .where(inArray(venueLayoutDivisionPriorities.layoutAssetId, assetIds))
      : Promise.resolve([]),
    teamIds.length
      ? database.select().from(teams).where(inArray(teams.id, teamIds))
      : Promise.resolve([]),
    matchIds.length
      ? database
          .select()
          .from(rallyEvents)
          .where(inArray(rallyEvents.matchId, matchIds))
          .orderBy(asc(rallyEvents.matchId), asc(rallyEvents.sequence))
      : Promise.resolve([]),
  ]);
  const workspace = await workspacePromise;
  const venue = workspace.venues.find((item) => item.id === input.venueId);
  if (!venue) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "Venue was not found.",
    );
  }
  const teamNames = new Map(
    teamRows.map((team) => [team.id, team.name] as const),
  );
  return {
    venue,
    layouts: mapLayoutRows({
      layouts: layoutRows,
      assets: assetRows,
      priorities: priorityRows,
    }),
    events: sessionRows
      .filter((session) => {
        const kind = session.kindFromProgram ?? session.kindFromEventType;
        return kind === "tournament" || kind === "league";
      })
      .map((session) => {
        const setting = eventSettingRows.find(
          (row) => row.sessionId === session.id,
        );
        return {
          id: session.id,
          title: session.title,
          startsAt: session.startsAt.toISOString(),
          endsAt: session.endsAt.toISOString(),
          status: session.status,
          divisions: divisionRows
            .filter((division) => division.sessionId === session.id)
            .map((division) => ({
              id: division.id,
              name: division.name,
              teamSize: division.teamSize,
              maximumTeams: division.maximumTeams ?? undefined,
            })),
          ticketTypes: ticketTypeRows
            .filter((ticketType) => ticketType.sessionId === session.id)
            .map((ticketType) => ({
              id: ticketType.id,
              name: ticketType.name,
              quantity: ticketType.quantity ?? undefined,
            })),
          settings: setting
            ? {
                sessionId: setting.sessionId,
                layoutId: setting.layoutId,
                aiCourtAssignmentEnabled: setting.aiCourtAssignmentEnabled,
                averageMatchMinutes: setting.averageMatchMinutes,
                releaseCourtWhenFree: setting.releaseCourtWhenFree,
              }
            : undefined,
        };
      }),
    liveMatches: matchRows.flatMap(({ match, divisionName }) => {
      if (!match.courtId) return [];
      let score: VenueLayoutWorkspace["liveMatches"][number]["score"];
      if (match.status === "live") {
        try {
          const scoreEvents = eventRows
            .filter((row) => row.matchId === match.id)
            .map((row) => row.payload as unknown as ScoreEvent);
          const format = {
            ...standardBeachFormat,
            ...(match.format as Partial<MatchFormat>),
          };
          const folded = foldScore(scoreEvents, format);
          const current = folded.sets[folded.setIndex] ?? folded.sets.at(-1);
          score = {
            setsA: folded.setsWon.A,
            setsB: folded.setsWon.B,
            pointsA: current?.a ?? 0,
            pointsB: current?.b ?? 0,
          };
        } catch {
          score = undefined;
        }
      }
      return [
        {
          id: match.id,
          courtId: match.courtId,
          divisionId: match.divisionId ?? undefined,
          divisionName,
          status: match.status,
          teamAName: match.teamAId
            ? (teamNames.get(match.teamAId) ?? "Team A")
            : "Team A",
          teamBName: match.teamBId
            ? (teamNames.get(match.teamBId) ?? "Team B")
            : "Team B",
          score,
        },
      ];
    }),
  };
}

export async function createVenueLayout(
  input: MutationContext & {
    readonly venueId: string;
    readonly name: string;
    readonly sourceType: "satellite" | "floorplan";
    readonly eventSessionId?: string;
    readonly duplicateFromLayoutId?: string;
    readonly floorplanImageUrl?: string;
    readonly mapCenterLatitude?: number;
    readonly mapCenterLongitude?: number;
    readonly mapZoom?: number;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const venue = await ownedVenue(organizationId, input.venueId);
  if (input.eventSessionId) {
    const event = await getDatabase().query.sessions.findFirst({
      where: eq(sessions.id, input.eventSessionId),
    });
    if (!event || event.venueId !== venue.id) {
      throw new OperatorServiceError(
        "INVALID_CONFIGURATION",
        "Event-specific layouts must use an event at this venue.",
      );
    }
  }
  const source = input.duplicateFromLayoutId
    ? await ownedLayout(organizationId, input.duplicateFromLayoutId)
    : undefined;
  if (source && source.venueId !== venue.id) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "A layout can only be duplicated within the same venue.",
    );
  }
  const database = getDatabase();
  const highest = (
    await database
      .select({ version: max(venueLayouts.version) })
      .from(venueLayouts)
      .where(eq(venueLayouts.venueId, venue.id))
  )[0]?.version;
  const version = (highest ?? 0) + 1;
  const id = crypto.randomUUID();
  const existingCount = highest ?? 0;
  await database.transaction(async (transaction) => {
    await transaction.insert(venueLayouts).values({
      id,
      venueId: venue.id,
      eventSessionId: input.eventSessionId,
      createdByPersonId: input.actor.personId,
      name: input.name.trim(),
      version,
      sourceType: input.sourceType,
      isPrimary: existingCount === 0,
      floorplanImageUrl: input.floorplanImageUrl ?? source?.floorplanImageUrl,
      floorplanAnalysis: source?.floorplanAnalysis,
      mapCenterLatitude:
        input.mapCenterLatitude ?? source?.mapCenterLatitude ?? venue.latitude,
      mapCenterLongitude:
        input.mapCenterLongitude ??
        source?.mapCenterLongitude ??
        venue.longitude,
      mapZoom: input.mapZoom ?? source?.mapZoom ?? 19,
      mapBearing: source?.mapBearing ?? 0,
      mapPitch: source?.mapPitch ?? 0,
      createdAt: input.now,
      updatedAt: input.now,
    });
    if (source) {
      const sourceAssets = await transaction
        .select()
        .from(venueLayoutAssets)
        .where(eq(venueLayoutAssets.layoutId, source.id));
      const sourceAssetIds = sourceAssets.map((asset) => asset.id);
      const sourcePriorities = sourceAssetIds.length
        ? await transaction
            .select()
            .from(venueLayoutDivisionPriorities)
            .where(
              inArray(
                venueLayoutDivisionPriorities.layoutAssetId,
                sourceAssetIds,
              ),
            )
        : [];
      const preserveDivisionPriorities =
        Boolean(input.eventSessionId) &&
        input.eventSessionId === source.eventSessionId;
      const replacementIds = new Map<string, string>();
      for (const asset of sourceAssets) {
        const replacementId = crypto.randomUUID();
        replacementIds.set(asset.id, replacementId);
        await transaction.insert(venueLayoutAssets).values({
          ...asset,
          id: replacementId,
          layoutId: id,
          ticketTypeId: undefined,
          createdAt: input.now,
          updatedAt: input.now,
        });
      }
      for (const priority of preserveDivisionPriorities
        ? sourcePriorities
        : []) {
        const replacementId = replacementIds.get(priority.layoutAssetId);
        if (!replacementId) continue;
        await transaction.insert(venueLayoutDivisionPriorities).values({
          ...priority,
          layoutAssetId: replacementId,
          createdAt: input.now,
          updatedAt: input.now,
        });
      }
    }
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: source ? "venue-layout.version_created" : "venue-layout.created",
      entityType: "venue-layout",
      entityId: id,
      afterHash: stableHash({
        venueId: venue.id,
        version,
        sourceType: input.sourceType,
      }),
      reason: source
        ? "Operator created an editable venue layout version."
        : "Operator created a venue layout draft.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id, entity: "venue-layout", status: "draft" };
}

export async function saveVenueLayout(
  input: MutationContext & {
    readonly layoutId: string;
    readonly name: string;
    readonly floorplanImageUrl?: string;
    readonly floorplanAnalysis?: Record<string, unknown>;
    readonly mapCenterLatitude?: number;
    readonly mapCenterLongitude?: number;
    readonly mapZoom: number;
    readonly mapBearing: number;
    readonly mapPitch: number;
    readonly assets: readonly LayoutAssetInput[];
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const layout = await ownedLayout(organizationId, input.layoutId);
  if (layout.status !== "draft") {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Published layouts are immutable. Create a new version to edit them.",
    );
  }
  const database = getDatabase();
  const expectedCoordinateSpace =
    layout.sourceType === "floorplan" ? "floorplan" : "geo";
  if (
    input.assets.some(
      (asset) =>
        asset.geometry.coordinateSpace !== expectedCoordinateSpace ||
        (asset.kind === "court" && !asset.courtId),
    )
  ) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Every element must use this layout's coordinate system, and court elements must link to a real court.",
    );
  }
  const courtIds = input.assets.flatMap((asset) =>
    asset.courtId ? [asset.courtId] : [],
  );
  if (courtIds.length) {
    const courtRows = await database
      .select({ id: courts.id, venueId: courts.venueId })
      .from(courts)
      .where(inArray(courts.id, courtIds));
    if (
      courtRows.length !== new Set(courtIds).size ||
      courtRows.some((court) => court.venueId !== layout.venueId)
    ) {
      throw new OperatorServiceError(
        "INVALID_CONFIGURATION",
        "Every placed court must belong to this venue.",
      );
    }
  }
  const divisionIds = [
    ...new Set(
      input.assets.flatMap((asset) =>
        asset.divisionPriorities.map((priority) => priority.divisionId),
      ),
    ),
  ];
  if (divisionIds.length) {
    const divisionRows = await database
      .select({ id: divisions.id, sessionId: divisions.sessionId })
      .from(divisions)
      .where(inArray(divisions.id, divisionIds));
    if (
      !layout.eventSessionId ||
      divisionRows.length !== divisionIds.length ||
      divisionRows.some(
        (division) => division.sessionId !== layout.eventSessionId,
      )
    ) {
      throw new OperatorServiceError(
        "INVALID_CONFIGURATION",
        "Court priorities must reference divisions from this layout's event.",
      );
    }
  }
  const ticketTypeIds = [
    ...new Set(
      input.assets.flatMap((asset) =>
        asset.ticketTypeId ? [asset.ticketTypeId] : [],
      ),
    ),
  ];
  if (ticketTypeIds.length) {
    const ticketTypeRows = await database
      .select({ id: ticketTypes.id, sessionId: ticketTypes.sessionId })
      .from(ticketTypes)
      .where(inArray(ticketTypes.id, ticketTypeIds));
    if (
      !layout.eventSessionId ||
      ticketTypeRows.length !== ticketTypeIds.length ||
      ticketTypeRows.some(
        (ticketType) => ticketType.sessionId !== layout.eventSessionId,
      )
    ) {
      throw new OperatorServiceError(
        "INVALID_CONFIGURATION",
        "Ticketed spaces can only link ticket types from this layout's event.",
      );
    }
  }
  const assetIds = input.assets.map((asset) => asset.id);
  await database.transaction(async (transaction) => {
    const existingAssets = await transaction
      .select({ id: venueLayoutAssets.id })
      .from(venueLayoutAssets)
      .where(eq(venueLayoutAssets.layoutId, layout.id));
    const existingIds = existingAssets.map((asset) => asset.id);
    if (existingIds.length) {
      await transaction
        .delete(venueLayoutDivisionPriorities)
        .where(
          inArray(venueLayoutDivisionPriorities.layoutAssetId, existingIds),
        );
      await transaction
        .delete(venueLayoutAssets)
        .where(eq(venueLayoutAssets.layoutId, layout.id));
    }
    if (input.assets.length) {
      await transaction.insert(venueLayoutAssets).values(
        input.assets.map((asset) => ({
          id: asset.id,
          layoutId: layout.id,
          kind: asset.kind,
          templateKey: asset.templateKey,
          courtId: asset.courtId,
          ticketTypeId: asset.ticketTypeId,
          label: asset.label.trim(),
          identifierCode: asset.identifierCode?.trim() || undefined,
          capacity: asset.capacity,
          geometry: asset.geometry,
          appearance: asset.appearance,
          sortOrder: asset.sortOrder,
          locked: asset.locked,
          createdAt: input.now,
          updatedAt: input.now,
        })),
      );
      const priorities = input.assets.flatMap((asset) =>
        asset.divisionPriorities.map((priority) => ({
          layoutAssetId: asset.id,
          divisionId: priority.divisionId,
          priority: priority.priority,
          startsHere: priority.startsHere,
          allowWhenFree: priority.allowWhenFree,
          createdAt: input.now,
          updatedAt: input.now,
        })),
      );
      if (priorities.length) {
        await transaction
          .insert(venueLayoutDivisionPriorities)
          .values(priorities);
      }
    }
    await transaction
      .update(venueLayouts)
      .set({
        name: input.name.trim(),
        floorplanImageUrl: input.floorplanImageUrl ?? null,
        floorplanAnalysis: input.floorplanAnalysis,
        mapCenterLatitude: input.mapCenterLatitude ?? null,
        mapCenterLongitude: input.mapCenterLongitude ?? null,
        mapZoom: input.mapZoom,
        mapBearing: input.mapBearing,
        mapPitch: input.mapPitch,
        updatedAt: input.now,
      })
      .where(eq(venueLayouts.id, layout.id));
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "venue-layout.saved",
      entityType: "venue-layout",
      entityId: layout.id,
      beforeHash: stableHash({ updatedAt: layout.updatedAt }),
      afterHash: stableHash({ name: input.name, assetIds }),
      reason: "Operator saved venue layout geometry and linked resources.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: layout.id, entity: "venue-layout-assets", status: "saved" };
}

export async function createCourtFromVenueLayout(
  input: MutationContext & {
    readonly layoutId: string;
    readonly assetId: string;
    readonly name: string;
    readonly identifierCode?: string;
    readonly surface: string;
    readonly capacity: number;
    readonly bookingPolicy: "public" | "members" | "tiers" | "staff" | "none";
    readonly templateKey: string;
    readonly geometry: VenueLayoutGeometry;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const layout = await ownedLayout(organizationId, input.layoutId);
  if (layout.status !== "draft") {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Create a new layout version before adding a court.",
    );
  }
  if (
    input.geometry.coordinateSpace !==
    (layout.sourceType === "floorplan" ? "floorplan" : "geo")
  ) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Court geometry must match the layout's coordinate system.",
    );
  }
  const courtId = crypto.randomUUID();
  const database = getDatabase();
  const highestSortOrder = (
    await database
      .select({ value: max(venueLayoutAssets.sortOrder) })
      .from(venueLayoutAssets)
      .where(eq(venueLayoutAssets.layoutId, layout.id))
  )[0]?.value;
  await database.transaction(async (transaction) => {
    await transaction.insert(courts).values({
      id: courtId,
      venueId: layout.venueId,
      name: input.name.trim(),
      surface: input.surface,
      capacity: input.capacity,
      status: "draft",
      lit: false,
      bookingPolicy: input.bookingPolicy,
      minimumDurationMinutes: 60,
      maximumDurationMinutes: 120,
      durationOptionsMinutes: [60, 90, 120],
      bookingIncrementMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 15,
      minimumNoticeMinutes: 120,
      maximumAdvanceDays: 90,
      cancellationPolicy: {},
      qrToken: crypto.randomUUID(),
      createdAt: input.now,
      updatedAt: input.now,
    });
    await transaction.insert(venueLayoutAssets).values({
      id: input.assetId,
      layoutId: layout.id,
      kind: "court",
      templateKey: input.templateKey,
      courtId,
      label: input.name.trim(),
      identifierCode: input.identifierCode?.trim() || undefined,
      capacity: input.capacity,
      geometry: input.geometry,
      appearance: { palette: "sand" },
      sortOrder: (highestSortOrder ?? -1) + 1,
      locked: false,
      createdAt: input.now,
      updatedAt: input.now,
    });
    await transaction
      .update(venueLayouts)
      .set({ updatedAt: input.now })
      .where(eq(venueLayouts.id, layout.id));
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "venue-layout.court_created",
      entityType: "court",
      entityId: courtId,
      afterHash: stableHash({
        layoutId: layout.id,
        name: input.name,
        geometry: input.geometry,
      }),
      reason: "Operator created a real court from the visual venue layout.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: input.assetId, entity: "venue-layout-assets", status: "saved" };
}

export async function publishVenueLayout(
  input: MutationContext & {
    readonly layoutId: string;
    readonly makePrimary: boolean;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const layout = await ownedLayout(organizationId, input.layoutId);
  const database = getDatabase();
  const assets = await database
    .select({ id: venueLayoutAssets.id })
    .from(venueLayoutAssets)
    .where(eq(venueLayoutAssets.layoutId, layout.id));
  if (!assets.length) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Add at least one court or venue space before publishing this layout.",
    );
  }
  await database.transaction(async (transaction) => {
    if (input.makePrimary) {
      await transaction
        .update(venueLayouts)
        .set({ isPrimary: false, updatedAt: input.now })
        .where(eq(venueLayouts.venueId, layout.venueId));
    }
    await transaction
      .update(venueLayouts)
      .set({
        status: "published",
        isPrimary: input.makePrimary || layout.isPrimary,
        publishedAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(venueLayouts.id, layout.id));
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: input.makePrimary
        ? "venue-layout.published_primary"
        : "venue-layout.published",
      entityType: "venue-layout",
      entityId: layout.id,
      beforeHash: stableHash({
        status: layout.status,
        isPrimary: layout.isPrimary,
      }),
      afterHash: stableHash({
        status: "published",
        isPrimary: input.makePrimary,
      }),
      reason: "Operator published a player-visible venue layout version.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: layout.id, entity: "venue-layout", status: "published" };
}

export async function saveVenueLayoutEventSettings(
  input: MutationContext & {
    readonly sessionId: string;
    readonly layoutId: string;
    readonly aiCourtAssignmentEnabled: boolean;
    readonly averageMatchMinutes: number;
    readonly releaseCourtWhenFree: boolean;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  const organizationId = requireOrganization(input.actor);
  const layout = await ownedLayout(organizationId, input.layoutId);
  const session = await getDatabase().query.sessions.findFirst({
    where: eq(sessions.id, input.sessionId),
  });
  if (!session || session.venueId !== layout.venueId) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Court assignment settings must use an event at the layout's venue.",
    );
  }
  const database = getDatabase();
  await database.transaction(async (transaction) => {
    await transaction
      .insert(venueLayoutEventSettings)
      .values({
        sessionId: input.sessionId,
        layoutId: input.layoutId,
        aiCourtAssignmentEnabled: input.aiCourtAssignmentEnabled,
        averageMatchMinutes: input.averageMatchMinutes,
        releaseCourtWhenFree: input.releaseCourtWhenFree,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: venueLayoutEventSettings.sessionId,
        set: {
          layoutId: input.layoutId,
          aiCourtAssignmentEnabled: input.aiCourtAssignmentEnabled,
          averageMatchMinutes: input.averageMatchMinutes,
          releaseCourtWhenFree: input.releaseCourtWhenFree,
          updatedAt: input.now,
        },
      });
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "venue-layout.event_settings_saved",
      entityType: "session",
      entityId: input.sessionId,
      afterHash: stableHash({
        layoutId: input.layoutId,
        aiCourtAssignmentEnabled: input.aiCourtAssignmentEnabled,
        averageMatchMinutes: input.averageMatchMinutes,
      }),
      reason: "Operator configured event court assignment behavior.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return { id: input.sessionId, entity: "venue-layout-event", status: "saved" };
}

function estimatedMatchMinutes(
  averageMatchMinutes: number,
  format: Record<string, unknown>,
): number {
  const setsToWin = typeof format.setsToWin === "number" ? format.setsToWin : 2;
  const pointsToWin =
    typeof format.pointsToWin === "number" ? format.pointsToWin : 21;
  const multiplier = Math.max(
    0.65,
    Math.min(1.35, (setsToWin / 2) * (pointsToWin / 21)),
  );
  return Math.max(10, Math.round(averageMatchMinutes * multiplier));
}

export async function planVenueLayoutCourtAssignments(input: {
  readonly organizationId: string;
  readonly sessionId: string;
  readonly now: Date;
  readonly demo?: boolean;
}): Promise<VenueLayoutCourtAssignmentPlan> {
  if (input.demo) {
    return {
      sessionId: input.sessionId,
      generatedAt: input.now.toISOString(),
      assignments: [],
      unassignedMatchIds: [],
      assumptions: [
        "Demo mode shows court priorities without changing scheduled matches.",
        "Connected events use match format, expected duration, and court release time.",
      ],
    };
  }
  requireDatabase();
  const database = getDatabase();
  const setting = await database.query.venueLayoutEventSettings.findFirst({
    where: eq(venueLayoutEventSettings.sessionId, input.sessionId),
  });
  if (!setting) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Save event court assignment settings before generating a plan.",
    );
  }
  const layout = await ownedLayout(input.organizationId, setting.layoutId);
  const session = await database.query.sessions.findFirst({
    where: eq(sessions.id, input.sessionId),
  });
  if (!session || session.venueId !== layout.venueId) {
    throw new OperatorServiceError(
      "RESOURCE_NOT_FOUND",
      "Event was not found.",
    );
  }
  const [assetRows, priorityRows, matchRows, courtRows, divisionRows] =
    await Promise.all([
      database
        .select()
        .from(venueLayoutAssets)
        .where(
          and(
            eq(venueLayoutAssets.layoutId, layout.id),
            eq(venueLayoutAssets.kind, "court"),
            isNotNull(venueLayoutAssets.courtId),
          ),
        ),
      database
        .select({
          priority: venueLayoutDivisionPriorities,
          layoutId: venueLayoutAssets.layoutId,
        })
        .from(venueLayoutDivisionPriorities)
        .innerJoin(
          venueLayoutAssets,
          eq(venueLayoutDivisionPriorities.layoutAssetId, venueLayoutAssets.id),
        )
        .where(eq(venueLayoutAssets.layoutId, layout.id)),
      database
        .select()
        .from(matches)
        .innerJoin(divisions, eq(matches.divisionId, divisions.id))
        .where(
          and(
            eq(divisions.sessionId, input.sessionId),
            inArray(matches.status, ["scheduled", "warmup", "live"]),
          ),
        )
        .orderBy(asc(matches.scheduledAt), asc(matches.createdAt)),
      database.select().from(courts).where(eq(courts.venueId, layout.venueId)),
      database
        .select()
        .from(divisions)
        .where(eq(divisions.sessionId, input.sessionId)),
    ]);
  const activeCourtIds = new Set(
    courtRows
      .filter((court) => court.status === "active")
      .map((court) => court.id),
  );
  const courtNames = new Map(
    courtRows.map((court) => [court.id, court.name] as const),
  );
  const divisionNames = new Map(
    divisionRows.map((division) => [division.id, division.name] as const),
  );
  const assets = assetRows.filter(
    (asset): asset is typeof asset & { courtId: string } =>
      Boolean(asset.courtId && activeCourtIds.has(asset.courtId)),
  );
  const readyAt = new Map(
    assets.map(
      (asset) =>
        [
          asset.courtId,
          Math.max(session.startsAt.getTime(), input.now.getTime()),
        ] as const,
    ),
  );
  for (const row of matchRows) {
    const match = row.matches;
    if (!match.courtId || !readyAt.has(match.courtId)) continue;
    const duration = estimatedMatchMinutes(
      setting.averageMatchMinutes,
      match.format,
    );
    const starts = match.startedAt ?? match.scheduledAt ?? input.now;
    readyAt.set(
      match.courtId,
      Math.max(
        readyAt.get(match.courtId)!,
        starts.getTime() + duration * 60_000,
      ),
    );
  }
  const firstDivisionMatch = new Set(
    matchRows.flatMap(({ matches: match }) =>
      match.courtId && match.divisionId ? [match.divisionId] : [],
    ),
  );
  const assignments: Array<
    VenueLayoutCourtAssignmentPlan["assignments"][number]
  > = [];
  const unassignedMatchIds: string[] = [];
  for (const row of matchRows) {
    const match = row.matches;
    if (match.courtId || match.status !== "scheduled" || !match.divisionId)
      continue;
    const divisionId = match.divisionId;
    const candidates = assets
      .map((asset) => {
        const priorities = priorityRows
          .filter((item) => item.priority.layoutAssetId === asset.id)
          .map((item) => item.priority);
        const direct = priorities.find(
          (priority) => priority.divisionId === divisionId,
        );
        const fallbackAllowed =
          priorities.length === 0 ||
          priorities.some((priority) => priority.allowWhenFree);
        if (!direct && !fallbackAllowed) return undefined;
        const startsHereBoost =
          !firstDivisionMatch.has(divisionId) && direct?.startsHere
            ? -1_000
            : 0;
        return {
          asset,
          direct,
          sort:
            (direct?.priority ?? 50) * 10_000 +
            readyAt.get(asset.courtId)! / 60_000 +
            startsHereBoost,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> =>
        Boolean(candidate),
      )
      .sort((left, right) => left.sort - right.sort);
    const selected = candidates[0];
    if (!selected) {
      unassignedMatchIds.push(match.id);
      continue;
    }
    const duration = estimatedMatchMinutes(
      setting.averageMatchMinutes,
      match.format,
    );
    const scheduledAt = new Date(
      Math.max(
        match.scheduledAt?.getTime() ?? session.startsAt.getTime(),
        readyAt.get(selected.asset.courtId)!,
      ),
    );
    readyAt.set(
      selected.asset.courtId,
      scheduledAt.getTime() + duration * 60_000,
    );
    firstDivisionMatch.add(divisionId);
    assignments.push({
      matchId: match.id,
      divisionId,
      divisionName: divisionNames.get(divisionId) ?? "Division",
      courtId: selected.asset.courtId,
      courtName: courtNames.get(selected.asset.courtId) ?? selected.asset.label,
      scheduledAt: scheduledAt.toISOString(),
      estimatedMinutes: duration,
      reason: selected.direct
        ? `Division priority ${selected.direct.priority}${selected.direct.startsHere ? " · designated start court" : ""}`
        : "Available overflow court after higher-priority play",
    });
  }
  return {
    sessionId: input.sessionId,
    generatedAt: input.now.toISOString(),
    assignments,
    unassignedMatchIds,
    assumptions: [
      `Average match baseline: ${setting.averageMatchMinutes} minutes, adjusted by match format.`,
      setting.releaseCourtWhenFree
        ? "Courts return to the assignment pool as soon as the expected match window ends."
        : "Existing court reservations remain protected for their scheduled windows.",
      "Live and warmup matches always keep their current courts.",
    ],
  };
}

export async function applyVenueLayoutCourtAssignments(
  input: MutationContext & {
    readonly sessionId: string;
    readonly confirmed: boolean;
  },
): Promise<OperatorMutationResult> {
  requireDatabase();
  if (!input.confirmed) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Confirm the court assignment plan before applying it.",
    );
  }
  const organizationId = requireOrganization(input.actor);
  const setting = await getDatabase().query.venueLayoutEventSettings.findFirst({
    where: eq(venueLayoutEventSettings.sessionId, input.sessionId),
  });
  if (!setting?.aiCourtAssignmentEnabled) {
    throw new OperatorServiceError(
      "INVALID_CONFIGURATION",
      "Turn on AI Court Assignment before applying a generated plan.",
    );
  }
  const plan = await planVenueLayoutCourtAssignments({
    organizationId,
    sessionId: input.sessionId,
    now: input.now,
  });
  const layout = await ownedLayout(organizationId, setting.layoutId);
  const database = getDatabase();
  const appliedAssignments: Array<(typeof plan.assignments)[number]> = [];
  await database.transaction(async (transaction) => {
    for (const assignment of plan.assignments) {
      const updated = await transaction
        .update(matches)
        .set({
          venueId: layout.venueId,
          courtId: assignment.courtId,
          scheduledAt: new Date(assignment.scheduledAt),
          updatedAt: input.now,
        })
        .where(
          and(
            eq(matches.id, assignment.matchId),
            sql`${matches.courtId} IS NULL`,
          ),
        )
        .returning({ id: matches.id });
      if (updated.length) appliedAssignments.push(assignment);
    }
    await transaction.insert(auditLog).values({
      organizationId,
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: "venue-layout.ai_court_assignments_applied",
      entityType: "session",
      entityId: input.sessionId,
      afterHash: stableHash(appliedAssignments),
      reason: "Operator confirmed AI-assisted tournament court assignments.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
  });
  return {
    id: input.sessionId,
    entity: "venue-layout-event",
    status: `assigned-${appliedAssignments.length}`,
  };
}

export async function loadPublicVenueLayout(
  venueId: string,
): Promise<PublicVenueLayout | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const database = getDatabase();
  const layout = (
    await database
      .select()
      .from(venueLayouts)
      .innerJoin(venues, eq(venueLayouts.venueId, venues.id))
      .where(
        and(
          eq(venueLayouts.venueId, venueId),
          eq(venueLayouts.status, "published"),
          eq(venueLayouts.isPrimary, true),
          eq(venues.status, "active"),
        ),
      )
      .limit(1)
  )[0]?.venue_layouts;
  if (!layout) return undefined;
  const assetRows = await database
    .select()
    .from(venueLayoutAssets)
    .where(eq(venueLayoutAssets.layoutId, layout.id))
    .orderBy(asc(venueLayoutAssets.sortOrder));
  const courtIds = assetRows.flatMap((asset) =>
    asset.courtId ? [asset.courtId] : [],
  );
  const publicMatchRows = courtIds.length
    ? await database
        .select({ match: matches, divisionName: divisions.name })
        .from(matches)
        .leftJoin(divisions, eq(matches.divisionId, divisions.id))
        .where(
          and(
            inArray(matches.courtId, courtIds),
            inArray(matches.status, ["warmup", "live"]),
          ),
        )
    : [];
  const publicTeamIds = [
    ...new Set(
      publicMatchRows.flatMap((row) =>
        [row.match.teamAId, row.match.teamBId].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ),
  ];
  const publicMatchIds = publicMatchRows.map((row) => row.match.id);
  const [publicTeamRows, publicScoreEventRows] = await Promise.all([
    publicTeamIds.length
      ? database.select().from(teams).where(inArray(teams.id, publicTeamIds))
      : Promise.resolve([]),
    publicMatchIds.length
      ? database
          .select()
          .from(rallyEvents)
          .where(inArray(rallyEvents.matchId, publicMatchIds))
          .orderBy(asc(rallyEvents.matchId), asc(rallyEvents.sequence))
      : Promise.resolve([]),
  ]);
  const publicTeamNames = new Map(
    publicTeamRows.map((team) => [team.id, team.name] as const),
  );
  const liveMatches: PublicVenueLayout["liveMatches"] = publicMatchRows.flatMap(
    ({ match, divisionName }) => {
      if (!match.courtId) return [];
      let score: PublicVenueLayout["liveMatches"][number]["score"];
      if (match.status === "live") {
        try {
          const folded = foldScore(
            publicScoreEventRows
              .filter((row) => row.matchId === match.id)
              .map((row) => row.payload as unknown as ScoreEvent),
            {
              ...standardBeachFormat,
              ...(match.format as Partial<MatchFormat>),
            },
          );
          const current = folded.sets[folded.setIndex] ?? folded.sets.at(-1);
          score = {
            setsA: folded.setsWon.A,
            setsB: folded.setsWon.B,
            pointsA: current?.a ?? 0,
            pointsB: current?.b ?? 0,
          };
        } catch {
          score = undefined;
        }
      }
      return [
        {
          id: match.id,
          courtId: match.courtId,
          divisionId: match.divisionId ?? undefined,
          divisionName: divisionName ?? undefined,
          status: match.status,
          teamAName: match.teamAId
            ? (publicTeamNames.get(match.teamAId) ?? "Team A")
            : "Team A",
          teamBName: match.teamBId
            ? (publicTeamNames.get(match.teamBId) ?? "Team B")
            : "Team B",
          score,
        },
      ];
    },
  );
  const mapped = mapLayoutRows({
    layouts: [layout],
    assets: assetRows,
    priorities: [],
  })[0];
  if (!mapped) return undefined;
  return {
    id: mapped.id,
    venueId: mapped.venueId,
    name: mapped.name,
    version: mapped.version,
    sourceType: mapped.sourceType,
    floorplanImageUrl: mapped.floorplanImageUrl,
    mapCenterLatitude: mapped.mapCenterLatitude,
    mapCenterLongitude: mapped.mapCenterLongitude,
    mapZoom: mapped.mapZoom,
    mapBearing: mapped.mapBearing,
    mapPitch: mapped.mapPitch,
    assets: mapped.assets.map((asset) => ({
      ...asset,
      divisionPriorities: [],
    })),
    liveMatches,
  };
}
