import { ListFilter, Map, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

export function DiscoveryPageHeader({
  locationLabel,
  resultSummary,
  title,
  view,
  viewHref,
  whatLabel,
  whenLabel,
}: {
  readonly locationLabel: string;
  readonly resultSummary: string;
  readonly title: string;
  readonly view: "list" | "map";
  readonly viewHref: string;
  readonly whatLabel: string;
  readonly whenLabel: string;
}) {
  const ViewIcon = view === "map" ? ListFilter : Map;
  const viewLabel = view === "map" ? "List view" : "Map view";

  return (
    <header className="discover-results-header">
      <div className="discover-results-header__copy">
        <span>
          {view === "map" ? "Map" : "Results"} · {resultSummary}
        </span>
        <h1>{title}</h1>
        <p aria-label="Current search">
          <strong>{locationLabel}</strong>
          <span>{whenLabel}</span>
          <span>{whatLabel}</span>
        </p>
      </div>
      <nav aria-label="Discovery view controls">
        <Link href="/discover">
          <SlidersHorizontal aria-hidden size={17} /> Change search
        </Link>
        <Link className="discover-v2-map-button" href={viewHref}>
          <ViewIcon aria-hidden size={17} /> {viewLabel}
        </Link>
      </nav>
    </header>
  );
}
