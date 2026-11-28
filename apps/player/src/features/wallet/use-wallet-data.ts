/**
 * Everything the wallet shows, from procedures that already exist: the
 * club summaries, a guardian's juniors' club credits, the Duna member
 * credential and club bookings (read here, so a failure carries its own
 * reference), plus money, payment schedules, Duna Plus and prediction
 * credits from the runtime's synced snapshot. Offline, the last snapshot
 * and the pass saved on this phone stand in. Preview builds read the
 * fictional demo clubs instead.
 */
import { report } from "@duna/observability";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlayerRuntime } from "../../../runtime";
import { demoCount, demoWallet } from "./wallet-demo";
import { readSavedPass, savePass } from "./pass-cache";
import {
  buildWalletModel,
  credentialPass,
  type ClubBooking,
  type ClubSummary,
  type FamilyRow,
  type Loaded,
  type MemberCredential,
  type WalletModel,
} from "./wallet-model";
import type { MembershipPassData } from "@duna/tideline-core";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

interface Sources {
  readonly clubs: Loaded<readonly ClubSummary[]>;
  readonly family: Loaded<readonly FamilyRow[]>;
  readonly credential: Loaded<MemberCredential>;
  readonly upcoming: Loaded<readonly ClubBooking[]>;
  readonly past: Loaded<readonly ClubBooking[]>;
}

async function load<T>(
  read: () => Promise<T>,
  source: string,
): Promise<Loaded<T>> {
  try {
    return { state: "ok", data: await read() };
  } catch (error) {
    const code = (error as { data?: { code?: unknown } })?.data?.code;
    if (code === "NOT_IMPLEMENTED") return { state: "not-configured" };
    return {
      state: "error",
      reference: report(error, {
        event: "player.wallet.source_failed",
        tags: { source },
      }),
    };
  }
}

export interface WalletData {
  readonly model: WalletModel | null;
  readonly loading: boolean;
  readonly offline: boolean;
  readonly lastFreshAt: Date | null;
  readonly preview: boolean;
  readonly personId: string | null;
  readonly memberName: string;
  readonly reload: () => Promise<void>;
}

export function useWalletData(target: string | undefined): WalletData {
  const runtime = usePlayerRuntime();
  const {
    client,
    dashboard,
    mode,
    isOffline,
    lastSuccessfulSyncAt,
    organizationWallets,
    memberCard,
    wallet,
    paymentSchedules,
    predictionWallet,
    settings,
  } = runtime;
  const preview = mode === "preview";
  const personId0 = dashboard?.player.id;
  const personName = dashboard?.player.displayName;
  const person = useMemo(
    () =>
      personId0 && personName
        ? { id: personId0, displayName: personName }
        : null,
    [personId0, personName],
  );
  const [sources, setSources] = useState<Sources | null>(null);
  const [savedPass, setSavedPass] = useState<MembershipPassData | null>(null);
  const [loading, setLoading] = useState(!preview);

  const reload = useCallback(async () => {
    if (!client || preview) return;
    setLoading(true);
    const [clubs, family, credential, upcoming, past] = await Promise.all([
      load(() => client.player.organizationWallets.query(), "club-wallets"),
      load(() => client.player.familyWallets.query(), "family-wallets"),
      load(() => client.player.memberCard.query(), "member-card"),
      load(
        () =>
          client.player.catalogSessionBookings.query({
            scope: "upcoming",
            includeDependents: true,
            limit: 50,
          }),
        "upcoming-bookings",
      ),
      load(
        () =>
          client.player.catalogSessionBookings.query({
            scope: "past",
            includeDependents: true,
            limit: 50,
          }),
        "past-bookings",
      ),
    ]);
    setSources({ clubs, family, credential, upcoming, past });
    setLoading(false);
  }, [client, preview]);

  // Reads again whenever the runtime syncs (pull to refresh, back online).
  useEffect(() => {
    void reload();
  }, [reload, lastSuccessfulSyncAt]);

  const personId = person?.id ?? null;
  useEffect(() => {
    if (!personId || preview) return;
    void readSavedPass(personId).then(setSavedPass);
  }, [personId, preview]);

  // Keep the credential on this phone (Keychain) for the next offline open.
  const freshCredential =
    sources?.credential.state === "ok" ? sources.credential : null;
  useEffect(() => {
    if (!personId || !freshCredential) return;
    const pass = credentialPass(freshCredential);
    if (pass) void savePass(personId, pass);
  }, [freshCredential, personId]);

  const model = useMemo((): WalletModel | null => {
    if (preview) {
      const sample = demoWallet(demoCount(target), new Date());
      const demoPerson = { id: "preview-person", displayName: "Noa Williams" };
      return buildWalletModel({
        person: demoPerson,
        junior: false,
        clubs: { state: "ok", data: sample.clubs },
        family: null,
        credential: { state: "not-configured" },
        upcoming: { state: "ok", data: sample.upcoming(demoPerson.id) },
        past: { state: "ok", data: sample.past(demoPerson.id) },
        money: {
          state: "ok",
          data: {
            availableMinor: 0,
            pendingMinor: 0,
            currency: "USD",
            entries: [],
          },
        },
        predictions: { state: "ok", data: { availableCredits: 250 } },
        timeZone,
        passOverride: sample.pass,
        ...(target && !target.startsWith("demo-") ? { card: target } : {}),
      });
    }
    if (!person) return null;
    // Offline (or before the first read), the synced snapshot stands in.
    const snapshot: Loaded<readonly ClubSummary[]> = organizationWallets
      ? { state: "ok", data: organizationWallets }
      : { state: "ok", data: [] };
    const clubs: Loaded<readonly ClubSummary[]> =
      !sources || (sources.clubs.state === "error" && isOffline)
        ? snapshot
        : sources.clubs;
    // Offline, the pass saved on this phone is the one shown (and says so).
    const credential: Loaded<MemberCredential> =
      isOffline && savedPass
        ? { state: "not-configured" }
        : (sources?.credential ??
          (memberCard
            ? { state: "ok", data: memberCard }
            : { state: "not-configured" }));
    return buildWalletModel({
      person,
      junior: false,
      clubs,
      family: sources?.family ?? null,
      credential,
      upcoming: sources?.upcoming ?? { state: "ok", data: [] },
      past: sources?.past ?? { state: "ok", data: [] },
      money: wallet ? { state: "ok", data: wallet } : null,
      schedules: paymentSchedules ?? [],
      dunaPlus: settings?.membership ?? null,
      predictions: predictionWallet
        ? { state: "ok", data: predictionWallet }
        : null,
      timeZone,
      savedPass,
      ...(target ? { card: target } : {}),
    });
  }, [
    isOffline,
    memberCard,
    organizationWallets,
    paymentSchedules,
    person,
    predictionWallet,
    preview,
    savedPass,
    settings,
    sources,
    target,
    wallet,
  ]);

  return {
    model,
    loading: !preview && loading && !sources && !organizationWallets,
    offline: Boolean(isOffline),
    lastFreshAt: lastSuccessfulSyncAt ? new Date(lastSuccessfulSyncAt) : null,
    preview,
    personId,
    memberName: person?.displayName ?? "Noa Williams",
    reload,
  };
}
