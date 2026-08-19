"use client";

import { History, RotateCcw } from "lucide-react";
import { useActionState } from "react";
import {
  revertCatalogItemVersionAction,
  type OperatorActionState,
} from "@/app/actions";

const initialState: OperatorActionState = { status: "idle", message: "" };

function formatVersionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved version";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

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
    <section className="hq-card product-detail-card product-version-history">
      <header className="product-detail-card__header">
        <span className="product-detail-card__icon" aria-hidden>
          <History size={19} />
        </span>
        <div>
          <span className="hq-eyebrow">Version history</span>
          <h2>Every saved offer stays recoverable.</h2>
          <p>
            Purchases remain tied to their original version. Restoring a prior
            version creates a new private draft instead of rewriting history.
          </p>
        </div>
      </header>
      {versions.length === 0 ? (
        <div className="product-version-history__empty">
          <span aria-hidden>
            <History size={18} />
          </span>
          <div>
            <strong>No saved revisions yet.</strong>
            <p>
              The first published or updated offer version will appear here for
              safe recovery later.
            </p>
          </div>
        </div>
      ) : (
        <ol className="product-version-history__list">
          {versions.map((version) => (
            <li
              className="product-version-history__entry"
              data-current={version.current || undefined}
              key={version.id}
            >
              <span className="product-version-history__number">
                V{version.version}
              </span>
              <div className="product-version-history__summary">
                <strong>{version.title}</strong>
                <time dateTime={version.createdAt}>
                  {formatVersionDate(version.createdAt)}
                </time>
              </div>
              {version.current ? (
                <span className="product-version-history__current">
                  Current version
                </span>
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
            </li>
          ))}
        </ol>
      )}
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
