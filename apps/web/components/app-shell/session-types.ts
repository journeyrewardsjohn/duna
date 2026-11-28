/**
 * What the Player web shell knows about the person, serialisable so the
 * server layout can hand it to the client frame. Built by `getAppSession()`
 * (`session.ts`).
 */

export type AgeBand = "unknown" | "under-13" | "teen" | "adult";

export interface AppPerson {
  readonly id: string;
  readonly displayName: string;
  readonly firstName: string;
  readonly handle: string;
  readonly initials: string;
  readonly avatarUrl?: string;
  readonly homeMarket: string;
  /** The Sand Rating to two places, or null while it is provisional. */
  readonly rating: number | null;
}

/** A junior the signed-in guardian manages (from the guardianship links). */
export interface AppDependent {
  readonly personId: string;
  readonly displayName: string;
  readonly firstName: string;
  readonly ageBand: AgeBand;
  readonly relationship?: string;
}

/** A club the person belongs to (the organisation switcher). */
export interface AppClub {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  /** "Player", "Coach · Player", "Admin". */
  readonly roleLabel: string;
  readonly isActive: boolean;
  readonly canManage: boolean;
}

export interface AppSession {
  readonly state: "signed-in" | "signed-out";
  /** Sign-in is set up on this server (false in demo and local builds). */
  readonly authConfigured: boolean;
  /** Demo mode: sample data, nothing is sent or charged. */
  readonly demo: boolean;
  readonly person: AppPerson | null;
  readonly ageBand: AgeBand;
  /** Under 18: adult-only actions (hosting, predictions) are hidden. */
  readonly junior: boolean;
  /** The juniors this person is a guardian of. */
  readonly dependents: readonly AppDependent[];
  /** Whose account the rebuilt screens show; null means the person's own. */
  readonly actingFor: AppDependent | null;
  readonly clubs: readonly AppClub[];
  /** Unread messages, or null when the inbox could not be read. */
  readonly unreadMessages: number | null;
  /** Where Duna HQ lives (for "Manage" and "Create new organisation"). */
  readonly hqUrl: string;
}

export const signedOutSession = (
  authConfigured: boolean,
  hqUrl: string,
): AppSession => ({
  state: "signed-out",
  authConfigured,
  demo: false,
  person: null,
  ageBand: "unknown",
  junior: false,
  dependents: [],
  actingFor: null,
  clubs: [],
  unreadMessages: null,
  hqUrl,
});
