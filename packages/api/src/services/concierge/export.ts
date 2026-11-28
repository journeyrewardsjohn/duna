/**
 * A person's Concierge data for their personal-data export (B7,
 * docs/legal/README.md): connected destinations, preferences, club mutes and
 * the deliveries made to them. Verification codes are never exported (only a
 * hash is stored). Account deletion removes destinations, preferences and
 * mutes (account-deletion.ts); delivery records keep ids only.
 */
import {
  conciergeDeliveries,
  conciergeOrganizationMutes,
  getDatabase,
  personChannelEndpoints,
  personChannelPreferences,
} from "@duna/db";
import { desc, eq } from "drizzle-orm";

export async function exportConciergePersonData(personId: string) {
  const database = getDatabase();
  const [endpoints, preference, mutes, deliveries] = await Promise.all([
    database
      .select({
        channel: personChannelEndpoints.channel,
        destination: personChannelEndpoints.destination,
        status: personChannelEndpoints.status,
        verifiedAt: personChannelEndpoints.verifiedAt,
        revokedAt: personChannelEndpoints.revokedAt,
        revokedReason: personChannelEndpoints.revokedReason,
        createdAt: personChannelEndpoints.createdAt,
      })
      .from(personChannelEndpoints)
      .where(eq(personChannelEndpoints.personId, personId))
      .orderBy(desc(personChannelEndpoints.createdAt)),
    database.query.personChannelPreferences.findFirst({
      where: eq(personChannelPreferences.personId, personId),
    }),
    database
      .select({
        organizationId: conciergeOrganizationMutes.organizationId,
        createdAt: conciergeOrganizationMutes.createdAt,
      })
      .from(conciergeOrganizationMutes)
      .where(eq(conciergeOrganizationMutes.personId, personId)),
    database
      .select({
        proposalId: conciergeDeliveries.proposalId,
        messageId: conciergeDeliveries.messageId,
        channel: conciergeDeliveries.channel,
        status: conciergeDeliveries.status,
        sentAt: conciergeDeliveries.sentAt,
        deliveredAt: conciergeDeliveries.deliveredAt,
        readAt: conciergeDeliveries.readAt,
        createdAt: conciergeDeliveries.createdAt,
      })
      .from(conciergeDeliveries)
      .where(eq(conciergeDeliveries.personId, personId))
      .orderBy(desc(conciergeDeliveries.createdAt))
      .limit(5000),
  ]);
  return {
    channels: endpoints,
    preference: preference ?? null,
    mutedClubs: mutes,
    deliveries,
  };
}
