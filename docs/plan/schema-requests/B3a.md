# Schema request: B3a team availability (28 November 2026)

Status: **proposed, not applied.** The frozen W3-0 shapes work for B3a as
built; these three additions would let Duna store what the owner asked for and
the availability rule already understands. Each is additive. Nothing here is in
a migration until the orchestrator and owner agree.

| Need (owner's words)                    | Today                                                                 | Proposed addition                                                                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Club-wide blackout dates                | One `staff_blackouts` row per member (`staff_profile_id` is required) | `staff_blackouts.scope varchar(8) NOT NULL DEFAULT 'personal' CHECK IN ('personal','club')`, `staff_profile_id` nullable when `scope = 'club'` (CHECK), and an optional `staffProfileId` in the blackout contract |
| Blackouts that repeat every year        | Not stored                                                            | `staff_blackouts.recurrence varchar(8) NULL CHECK IN ('yearly')` and `staff_blackouts.timezone varchar(64) NULL` (local dates repeat in that zone); contract gains optional `recurrence`                          |
| "Not exceeding a stated weekly maximum" | Not stored                                                            | `organization_staff_profiles.weekly_max_minutes integer NULL CHECK (>= 0)`                                                                                                                                        |

`availabilityFor` in `packages/scheduling` already accepts `scope: "club"`,
`recurrence: "yearly"` and a timezone on a blackout, and `rankSubstitutes`
accepts `weeklyMaxMinutes`; the service would only need to read the columns.
