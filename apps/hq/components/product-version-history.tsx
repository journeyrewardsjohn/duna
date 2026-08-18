"use client";

import { History, RotateCcw } from "lucide-react";
import { useActionState } from "react";
import {
  revertCatalogItemVersionAction,
  type OperatorActionState,
} from "@/app/actions";

const initialState: OperatorActionState = { status: "idle", message: "" };

export function ProductVersionHistory({
  catalogItemId,
  versions,
}: {
  readonly catalogItemId: string;
  readonly versions: readonly {
    readonly id: string;
    readonly version: number;
    readonly title: string;
    readonly createdAt: string;
    readonly current: boolean;
  }[];
}) {
  const [state, action, pending] = useActionState(
    revertCatalogItemVersionAction,
    initialState,
  );
  return (
    <section className="hq-card operator-control-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Version history</span>
          <h2>Every saved offer stays recoverable.</h2>
          <p>
            Purchases remain tied to their original version. Restoring a prior
            version creates a new private draft instead of rewriting history.
          </p>
        </div>
        <History aria-hidden size={24} />
      </header>
      <div className="catalog-status-list">
        {versions.map((version) => (
          <article className="catalog-status-row" key={version.id}>
            <div>
              <strong>
                V{version.version} · {version.title}
              </strong>
              <small>{new Date(version.createdAt).toLocaleString()}</small>
            </div>
            {version.current ? (
              <span className="hq-chip">Current</span>
            ) : (
              <form action={action}>
                <input
                  name="catalogItemId"
                  type="hidden"
                  value={catalogItemId}
                />
                <input name="versionId" type="hidden" value={version.id} />
                <input name="confirmed" type="hidden" value="true" />
                <button
                  className="hq-button hq-button--secondary"
                  disabled={pending}
                  type="submit"
                >
                  <RotateCcw aria-hidden size={15} /> Restore as draft
                </button>
              </form>
            )}
          </article>
        ))}
      </div>
      {state.status !== "idle" && (
        <p
          className={`operator-action-notice operator-action-notice--${state.status}`}
        >
          {state.message}
        </p>
      )}
    </section>
  );
}
