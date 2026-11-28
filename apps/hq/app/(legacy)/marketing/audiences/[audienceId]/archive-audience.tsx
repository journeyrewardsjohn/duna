"use client";

import { useState, useTransition } from "react";
import { archiveAudienceAction } from "../actions";

export function ArchiveAudience({
  audienceId,
}: {
  readonly audienceId: string;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const [archiveKey, setArchiveKey] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  return (
    <section className="module-card">
      <h2>Archive audience</h2>
      <p>
        Archiving preserves every revision and stops this audience from being
        selected for new work.
      </p>
      <label>
        <input
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          type="checkbox"
        />{" "}
        I understand this audience will be archived.
      </label>
      <button
        disabled={!confirmed || pending}
        type="button"
        onClick={() =>
          startTransition(async () => {
            const archived = await archiveAudienceAction(
              audienceId,
              archiveKey,
            );
            setNotice(`${archived.name} is archived.`);
            setArchiveKey(crypto.randomUUID());
          })
        }
      >
        Archive audience
      </button>
      <p role="status">{notice}</p>
    </section>
  );
}
