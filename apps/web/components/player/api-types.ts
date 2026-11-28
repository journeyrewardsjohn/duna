/**
 * The shapes the Player web pages read, from the API's own server caller
 * (the same types the server-side reads return; no copies of the contracts).
 * Type-only: nothing here runs in the browser.
 */
import type { createCaller } from "@duna/api";

type Caller = ReturnType<typeof createCaller>;
type Player = Caller["player"];
type Public = Caller["public"];
type Out<F> = F extends (...args: never[]) => Promise<infer R> ? R : never;
type In<F> = F extends (input: infer I, ...rest: never[]) => unknown
  ? I
  : never;

export type PlayerDashboardData = Out<Player["dashboard"]>;
export type CatalogBooking = Out<Player["catalogSessionBookings"]>[number];
export type PlayerSettingsData = Out<Player["settings"]>;
export type DeletionReadiness = Out<Player["accountDeletionReadiness"]>;
export type FamilyWallet = Out<Player["familyWallets"]>[number];
export type MediaStudio = Out<Player["playerMediaStudio"]>;
export type CourtInvite = Out<Public["courtBookingInvite"]>;
export type TeamClaim = Out<Player["teamClaim"]>;
export type CreatePickupInput = In<Player["createPickup"]>;
export type UpdatePickupInput = In<Player["updatePickup"]>;
