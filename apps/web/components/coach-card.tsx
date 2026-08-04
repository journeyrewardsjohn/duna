import type { PublicCoach } from "@duna/api";
import { Badge } from "@duna/ui";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function CoachCard({
  coach,
  preferred = false,
}: {
  readonly coach: PublicCoach;
  readonly preferred?: boolean;
}) {
  const href = `/coaches/${coach.handle}?organization=${coach.organizationSlug}`;
  return (
    <Link className="coach-card" href={href}>
      <div className="coach-card__portrait">
        {coach.avatarUrl ? (
          <img alt="" src={coach.avatarUrl} />
        ) : (
          <span>{initials(coach.displayName)}</span>
        )}
        <span className="coach-card__arrow">
          <ArrowUpRight aria-hidden size={18} />
        </span>
      </div>
      <div className="coach-card__body">
        <div className="coach-card__badges">
          {preferred && <Badge tone="positive">Your club</Badge>}
          <Badge>Coach</Badge>
        </div>
        <h3>{coach.displayName}</h3>
        <p>{coach.bio ?? `Train with ${coach.displayName} on Duna.`}</p>
        <div className="coach-card__meta">
          <span>
            <MapPin aria-hidden size={14} />
            {coach.organizationName}
          </span>
          <span>
            <CalendarDays aria-hidden size={14} />
            {coach.services.length}{" "}
            {coach.services.length === 1 ? "offering" : "offerings"}
          </span>
        </div>
      </div>
    </Link>
  );
}
