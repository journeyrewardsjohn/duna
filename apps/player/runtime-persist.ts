/**
 * What the Player runtime may keep in AsyncStorage (plain, unencrypted).
 * The Duna member credential (`memberCard`: the check-in payload and the
 * Apple Wallet download path) never goes there: the wallet keeps its own
 * copy in the Keychain (`src/features/wallet/pass-cache.ts`). Pure.
 */
export function persistableSnapshot<
  T extends { readonly memberCard?: unknown },
>(snapshot: T): Omit<T, "memberCard"> {
  const { memberCard: _credential, ...rest } = snapshot;
  return rest;
}

/** A stored snapshot from before this rule still holds the credential. */
export function storedSnapshotHoldsCredential(parsed: unknown): boolean {
  return (
    typeof parsed === "object" && parsed !== null && "memberCard" in parsed
  );
}
