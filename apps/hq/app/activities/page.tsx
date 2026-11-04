import {
  ArrowRight,
  CalendarDays,
  Dumbbell,
  Flag,
  Network,
  Package,
  Ticket,
  Trophy,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";
import styles from "./workspace.module.css";

export const metadata = { title: "Activities" };
const activities = [
  {
    title: "Programs & camps",
    description:
      "Build a season of progress. Manage offers, training plans and recurring sessions.",
    href: "/programs",
    icon: Flag,
    action: "Open programs",
  },
  {
    title: "Tournaments",
    description:
      "From registration to the final point. Divisions, brackets, courts and scoring.",
    href: "/events/types/tournaments",
    icon: Trophy,
    action: "Manage tournaments",
  },
  {
    title: "Leagues",
    description:
      "Run the whole season. Teams, fixtures, standings and playoffs.",
    href: "/leagues",
    icon: Network,
    action: "Manage leagues",
  },
  {
    title: "Courts & rentals",
    description:
      "See available courts, manage bookings and keep your facilities moving.",
    href: "/calendar",
    icon: CalendarDays,
    action: "Open schedule",
  },
  {
    title: "Lessons & coaching",
    description:
      "Group and private sessions, coach availability and bookable services.",
    href: "/products/types/services",
    icon: Dumbbell,
    action: "Manage lessons",
  },
  {
    title: "Open play & clinics",
    description:
      "Bring players together with simple registration, rosters and check-in.",
    href: "/events",
    icon: UsersRound,
    action: "Open events",
  },
  {
    title: "Memberships & packs",
    description:
      "Give players a reason to return with memberships and session credits.",
    href: "/products/types/plans",
    icon: Ticket,
    action: "Manage memberships",
  },
  {
    title: "Shop & equipment",
    description:
      "Manage merchandise, equipment, inventory and rental products.",
    href: "/products/types/goods",
    icon: Package,
    action: "Open shop",
  },
] as const;
export default async function ActivitiesPage() {
  const caller = await getServerCaller();
  const dashboard = await caller.operator.dashboard();
  return (
    <OperatorShell active="activities" organization={dashboard.organization}>
      <main className={`hq-page ${styles.workspace}`}>
        <header className={styles.heading}>
          <div>
            <span className="hq-eyebrow">Run your club</span>
            <h1>Make more happen.</h1>
            <p>One place for everything your players come here to do.</p>
          </div>
          <Link className="hq-button hq-button--secondary" href="/calendar">
            <CalendarDays size={18} aria-hidden /> View schedule
          </Link>
        </header>
        <section className={styles.grid} aria-label="Activity workspaces">
          {activities.map(
            ({ title, description, href, icon: Icon, action }) => (
              <Link href={href} className={styles.card} key={title}>
                <Icon size={24} aria-hidden />
                <h2>{title}</h2>
                <p>{description}</p>
                <span>
                  {action}
                  <ArrowRight size={18} aria-hidden />
                </span>
              </Link>
            ),
          )}
        </section>
        <section className={styles.footer}>
          <div>
            <h2>Your team, ready to go.</h2>
            <p>
              Manage coaches and facilities, or build the practice behind your
              next session.
            </p>
          </div>
          <nav aria-label="Supporting activity tools">
            <Link href="/team">Staff</Link>
            <Link href="/locations">Venues & courts</Link>
            <Link href="/training">Training studio</Link>
            <Link href="/products">All offerings</Link>
          </nav>
        </section>
      </main>
    </OperatorShell>
  );
}
