import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";
import styles from "./workspace.module.css";

export const metadata = { title: "Activities" };
const activities = [
  {
    title: "Programs & camps",
    description: "Enrollment, training plans and recurring sessions.",
    href: "/programs",
    action: "Open programs",
  },
  {
    title: "Tournaments",
    description: "Registration, divisions, brackets and scoring.",
    href: "/events/types/tournaments",
    action: "Manage tournaments",
  },
  {
    title: "Leagues",
    description: "Teams, fixtures, standings and playoffs.",
    href: "/leagues",
    action: "Manage leagues",
  },
  {
    title: "Courts & rentals",
    description: "Court availability, reservations and rentals.",
    href: "/calendar",
    action: "Open schedule",
  },
  {
    title: "Lessons & coaching",
    description:
      "Group and private sessions, coach availability and bookable services.",
    href: "/products/types/services",
    action: "Manage lessons",
  },
  {
    title: "Open play & clinics",
    description: "Registration, rosters and check-in.",
    href: "/events",
    action: "Open events",
  },
  {
    title: "Memberships & packs",
    description: "Memberships, session packs and credits.",
    href: "/products/types/plans",
    action: "Manage memberships",
  },
  {
    title: "Shop & equipment",
    description:
      "Manage merchandise, equipment, inventory and rental products.",
    href: "/products/types/goods",
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
            <h1>Activities</h1>
            <p>Manage programs, competitions, bookings and products.</p>
          </div>
          <Link className="hq-button hq-button--secondary" href="/calendar">
            View schedule
          </Link>
        </header>
        <div
          className="hq-data-scroll"
          tabIndex={0}
          role="region"
          aria-label="Activity workspaces"
        >
          <table className="hq-data-table">
            <caption className="sr-only">Activity workspaces</caption>
            <thead>
              <tr>
                <th scope="col">Activity</th>
                <th scope="col">Manage</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {activities.map(({ title, description, href, action }) => (
                <tr key={title}>
                  <th scope="row">
                    <Link href={href}>{title}</Link>
                  </th>
                  <td>{description}</td>
                  <td>
                    <Link href={href}>{action}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className={styles.footer}>
          <div>
            <h2>Related tools</h2>
            <p>Staff, venues, training plans and the full catalog.</p>
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
