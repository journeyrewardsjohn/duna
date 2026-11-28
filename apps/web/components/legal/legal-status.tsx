import { Chip, Notice } from "@duna/ui/tideline";
import Link from "next/link";
import type { LegalStatus } from "./legal-library";

export const DRAFT_NOTICE = "Draft for review. Not yet in effect.";

export function LegalStatusChip({ status }: { readonly status: LegalStatus }) {
  return status === "in-effect" ? (
    <Chip tone="positive">In effect</Chip>
  ) : (
    <Chip tone="info">Draft for review</Chip>
  );
}

/** The calm notice at the top of a draft. */
export function DraftNotice({
  inEffectPath,
}: {
  readonly inEffectPath?: string;
}) {
  return (
    <Notice className="lc-draft-notice" title={DRAFT_NOTICE} tone="info">
      It is waiting for legal review and decisions from Duna, so it does not
      apply to you yet. Anything marked “To be confirmed” is not final.
      {inEffectPath ? (
        <>
          {" "}
          <Link href={inEffectPath}>Read the version in effect today</Link>.
        </>
      ) : null}
    </Notice>
  );
}

/** On a document in effect whose revision is being reviewed. */
export function RevisionNotice({ draftPath }: { readonly draftPath: string }) {
  return (
    <Notice className="lc-revision-notice" tone="info">
      This is the version in effect today. A revised version is being reviewed
      and is not yet in effect:{" "}
      <Link href={draftPath}>read the draft revision</Link>.
    </Notice>
  );
}
