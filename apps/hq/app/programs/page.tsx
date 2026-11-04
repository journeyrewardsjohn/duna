import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";
import styles from "../activities/workspace.module.css";

export const metadata = { title: "Programs & camps" };
export default async function ProgramsPage() {
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  const programs = workspace.catalog.filter(
    (item) => item.type === "service" && item.subtype === "program",
  );
  return (
    <OperatorShell active="activities" organization={dashboard.organization}>
      <main className={`hq-page ${styles.workspace}`}>
        <Link href="/activities" className="hq-button hq-button--ghost">
          <ArrowLeft size={16} aria-hidden /> Activities
        </Link>
        <header className={styles.heading}>
          <div>
            <h1>Programs & camps</h1>
            <p>Manage enrollment, pricing and scheduled sessions.</p>
          </div>
          <Link
            href="/products/create"
            className="hq-button hq-button--primary"
          >
            <Plus size={18} aria-hidden /> Create an offering
          </Link>
        </header>
        <section className={styles.list} aria-label="Program offerings">
          {programs.length ? (
            programs.map((program) => (
              <Link
                href={`/products/${program.id}`}
                className={styles.row}
                key={program.id}
              >
                <div>
                  <h2>{program.title}</h2>
                  <p>
                    {program.status} · Manage pricing, enrollment and
                    availability
                  </p>
                </div>
                <ArrowRight size={18} aria-hidden />
              </Link>
            ))
          ) : (
            <div className={styles.empty}>
              Your programs will appear here. Create a service offering and
              choose Program to start enrollment.
            </div>
          )}
        </section>
        <section className={styles.footer}>
          <div>
            <h2>Program operations</h2>
            <p>Training plans, attendance and player records.</p>
          </div>
          <nav aria-label="Program operations">
            <Link href="/training/programs/create">
              Design a training program
            </Link>
            <Link href="/training">Training plans</Link>
            <Link href="/calendar">Sessions & attendance</Link>
            <Link href="/members">Players & families</Link>
          </nav>
        </section>
      </main>
    </OperatorShell>
  );
}
