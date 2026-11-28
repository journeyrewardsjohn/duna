/**
 * The club profile by hand: the no-website path is first-class. The same
 * facts the website read proposes (phone, email, website, tagline, about,
 * hours, socials) are edited here directly; a person's value is marked
 * `source: person, confirmed`, and `confirmFields` clears "From your
 * website" on values a person has checked.
 */
import { organizationProfiles, organizations } from "@duna/db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import type {
  SetupProfile,
  setupUpdateProfileInputSchema,
} from "../../contracts/setup";
import { setupDatabase } from "./records";
import { normaliseSetupUrl } from "./url-safety";

type ProfileRow = typeof organizationProfiles.$inferSelect;

function toContract(
  organization: { id: string; name: string; updatedAt: Date },
  profile: ProfileRow | undefined,
): SetupProfile {
  const socials = Object.fromEntries(
    Object.entries(profile?.socials ?? {}).filter(([, url]) => {
      try {
        return Boolean(new URL(url));
      } catch {
        return false;
      }
    }),
  );
  return {
    organizationId: organization.id,
    name: organization.name,
    ...(profile?.phoneE164 ? { phoneE164: profile.phoneE164 } : {}),
    ...(profile?.email ? { email: profile.email } : {}),
    ...(profile?.websiteUrl ? { websiteUrl: profile.websiteUrl } : {}),
    ...(profile?.tagline ? { tagline: profile.tagline.slice(0, 160) } : {}),
    ...(profile?.about ? { about: profile.about.slice(0, 4_000) } : {}),
    hours: {
      weekly: [...(profile?.hours.weekly ?? [])],
      ...(profile?.hours.exceptions
        ? { exceptions: [...profile.hours.exceptions] }
        : {}),
    },
    socials,
    fieldSources: profile?.fieldSources ?? {},
    ...(profile?.websiteLastReadAt
      ? { websiteLastReadAt: profile.websiteLastReadAt.toISOString() }
      : {}),
    updatedAt: (profile?.updatedAt ?? organization.updatedAt).toISOString(),
  };
}

export async function loadSetupProfile(
  organizationId: string,
): Promise<SetupProfile> {
  const database = setupDatabase();
  const [[organization], [profile]] = await Promise.all([
    database
      .select({
        id: organizations.id,
        name: organizations.name,
        updatedAt: organizations.updatedAt,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1),
    database
      .select()
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, organizationId))
      .limit(1),
  ]);
  if (!organization)
    throw new TRPCError({ code: "NOT_FOUND", message: "Club not found." });
  return toContract(organization, profile);
}

const editableFields = [
  "phoneE164",
  "email",
  "websiteUrl",
  "tagline",
  "about",
  "hours",
  "socials",
] as const;

export async function updateSetupProfile(input: {
  readonly organizationId: string;
  readonly personId: string;
  readonly update: z.infer<typeof setupUpdateProfileInputSchema>;
  readonly now: Date;
}): Promise<SetupProfile> {
  const { confirmFields, ...fields } = input.update;
  const values: Partial<typeof organizationProfiles.$inferInsert> = {};
  if (fields.websiteUrl !== undefined) {
    const checked = normaliseSetupUrl(fields.websiteUrl);
    if (!checked.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Use a public website address.",
      });
    }
    values.websiteUrl = checked.url;
  }
  if (fields.hours) {
    const days = new Set<number>();
    for (const window of fields.hours.weekly) {
      if (window.opens >= window.closes) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Closing time must be after opening time.",
        });
      }
      if (days.has(window.weekday)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One opening window per day.",
        });
      }
      days.add(window.weekday);
    }
    values.hours = fields.hours;
  }
  if (fields.phoneE164 !== undefined) values.phoneE164 = fields.phoneE164;
  if (fields.email !== undefined) values.email = fields.email.toLowerCase();
  if (fields.tagline !== undefined) values.tagline = fields.tagline.trim();
  if (fields.about !== undefined) values.about = fields.about.trim();
  if (fields.socials !== undefined) {
    const socials: Record<string, string> = {};
    for (const [network, url] of Object.entries(fields.socials)) {
      const checked = normaliseSetupUrl(url);
      if (!checked.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use a public link for each social profile.",
        });
      }
      socials[network.toLowerCase().slice(0, 32)] = checked.url;
    }
    values.socials = socials;
  }

  await setupDatabase().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, input.organizationId))
      .for("update");
    const fieldSources = { ...(existing?.fieldSources ?? {}) };
    for (const field of editableFields) {
      if (fields[field] !== undefined)
        fieldSources[field] = { source: "person", confirmed: true };
    }
    for (const field of confirmFields ?? []) {
      const source = fieldSources[field];
      if (source) fieldSources[field] = { ...source, confirmed: true };
    }
    const row = {
      ...values,
      fieldSources,
      updatedByPersonId: input.personId,
      updatedAt: input.now,
    };
    if (existing) {
      await tx
        .update(organizationProfiles)
        .set(row)
        .where(eq(organizationProfiles.organizationId, input.organizationId));
    } else {
      await tx.insert(organizationProfiles).values({
        organizationId: input.organizationId,
        ...row,
        createdAt: input.now,
      });
    }
  });
  return loadSetupProfile(input.organizationId);
}
