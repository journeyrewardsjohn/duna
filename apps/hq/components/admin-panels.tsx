"use client";

import { Badge, Numeric } from "@duna/ui";
import {
  Activity,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eye,
  Flag,
  Gauge,
  HeartPulse,
  LockKeyhole,
  MoreHorizontal,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import type { AdminModule } from "./navigation";

const networkMetrics = [
  {
    label: "Organizations",
    value: "128",
    detail: "+11 this month",
    icon: Building2,
  },
  {
    label: "Active players",
    value: "84,219",
    detail: "+7.8% this month",
    icon: UsersRound,
  },
  {
    label: "Monthly volume",
    value: "$4.84m",
    detail: "+18.2% vs June",
    icon: WalletCards,
  },
  {
    label: "Verified matches",
    value: "61,884",
    detail: "98.7% clean",
    icon: Activity,
  },
] as const;

export function AdminOverview() {
  return (
    <main className="hq-page admin-page">
      <header className="hq-page-heading">
        <div>
          <span className="hq-eyebrow">Duna network control plane</span>
          <h1>Everything healthy.</h1>
          <p>
            One governed platform across clubs, coaches, facilities, players,
            and families.
          </p>
        </div>
        <div>
          <Badge tone="positive">
            <Check size={12} /> All systems operational
          </Badge>
          <button className="hq-button hq-button--secondary">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </header>
      <section className="metric-grid admin-metrics">
        {networkMetrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label}>
              <span>
                <small>{metric.label}</small>
                <Icon size={17} />
              </span>
              <Numeric>{metric.value}</Numeric>
              <p>
                <strong>{metric.detail}</strong>
              </p>
              <div className="admin-sparkline">
                {[30, 42, 37, 53, 49, 64, 59, 70, 68, 82, 78, 90].map(
                  (value, index) => (
                    <i key={index} style={{ height: `${value}%` }} />
                  ),
                )}
              </div>
            </article>
          );
        })}
      </section>
      <section className="admin-overview-grid">
        <article className="hq-card network-map">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Live footprint</span>
              <h2>Network activity</h2>
            </div>
            <Badge>United States</Badge>
          </header>
          <div className="network-map__canvas">
            <div className="network-coast network-coast--west" />
            <div className="network-coast network-coast--east" />
            {[
              [14, 62, 28, "Los Angeles"],
              [21, 68, 17, "San Diego"],
              [20, 38, 9, "Seattle"],
              [42, 52, 12, "Denver"],
              [65, 70, 14, "Austin"],
              [76, 56, 16, "Chicago"],
              [89, 42, 19, "New York"],
              [86, 78, 11, "Miami"],
            ].map(([left, top, size, label]) => (
              <span
                className="network-node"
                key={String(label)}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                }}
                title={String(label)}
              />
            ))}
            <div className="network-map__legend">
              <span>
                <i /> Live volume
              </span>
              <span>
                <Numeric>3,482</Numeric> transactions today
              </span>
            </div>
          </div>
        </article>
        <article className="hq-card admin-queue">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Governance queue</span>
              <h2>Needs review</h2>
            </div>
            <Badge tone="warning">7</Badge>
          </header>
          {[
            {
              icon: ShieldCheck,
              title: "3 safety reports",
              note: "Oldest open 47m",
              tone: "danger" as const,
            },
            {
              icon: Activity,
              title: "2 rating anomalies",
              note: "Automated hold applied",
              tone: "warning" as const,
            },
            {
              icon: WalletCards,
              title: "1 payout verification",
              note: "Additional KYC required",
              tone: "warning" as const,
            },
            {
              icon: Flag,
              title: "1 flag rollout paused",
              note: "Error budget threshold",
              tone: "neutral" as const,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title}>
                <span>
                  <Icon size={17} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.note}</small>
                </div>
                <Badge tone={item.tone}>Open</Badge>
                <ChevronRight size={15} />
              </article>
            );
          })}
        </article>
      </section>
      <section className="admin-lower-grid">
        <article className="hq-card service-health">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Core services</span>
              <h2>30-day health</h2>
            </div>
            <a href="/admin/health">
              Full status <ArrowRight size={15} />
            </a>
          </header>
          {[
            ["API + tRPC", "99.99%", "118 ms", "Operational"],
            ["Postgres + ledger", "100.00%", "23 ms", "Operational"],
            ["Stripe webhooks", "99.98%", "1.8 s", "Operational"],
            ["Realtime + scoring", "99.96%", "84 ms", "Operational"],
            ["AI gateway", "99.91%", "2.1 s", "Operational"],
          ].map((row) => (
            <div key={row[0]}>
              <span>
                <i />
                <strong>{row[0]}</strong>
              </span>
              <Numeric>{row[1]}</Numeric>
              <Numeric>{row[2]}</Numeric>
              <Badge tone="positive">{row[3]}</Badge>
            </div>
          ))}
        </article>
        <article className="hq-card audit-stream">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Immutable record</span>
              <h2>Recent admin actions</h2>
            </div>
            <a href="/admin/audit">
              Audit log <ArrowRight size={15} />
            </a>
          </header>
          {(
            [
              [
                "Feature flag updated",
                "rating-v3-explanations · 12% → 25%",
                "JS",
                "3m",
              ],
              [
                "Organization verified",
                "Pacific Beach Volleyball",
                "AM",
                "18m",
              ],
              [
                "Safety case assigned",
                "SAFE-10842 · response due 1h",
                "JS",
                "24m",
              ],
              [
                "Rating event held",
                "RTE-88418 · anomaly threshold",
                "SYSTEM",
                "41m",
              ],
            ] as const
          ).map((event) => (
            <article key={event[0] + event[3]}>
              <span>{event[2]}</span>
              <div>
                <strong>{event[0]}</strong>
                <small>{event[1]}</small>
              </div>
              <time>{event[3]}</time>
            </article>
          ))}
        </article>
      </section>
    </main>
  );
}

const adminCopy: Record<
  Exclude<AdminModule, "overview">,
  { eyebrow: string; title: string; description: string }
> = {
  organizations: {
    eyebrow: "Tenants + capabilities",
    title: "Organizations",
    description:
      "Onboarding, verification, configuration, plans, and account health.",
  },
  trust: {
    eyebrow: "Human-first safeguards",
    title: "Trust + safety",
    description:
      "Reports, minor protections, identity, sanctions, and incident response.",
  },
  ratings: {
    eyebrow: "Deterministic integrity",
    title: "Ratings",
    description:
      "Network health, anomaly review, calibration, snapshots, and event explanations.",
  },
  payments: {
    eyebrow: "Platform financial operations",
    title: "Payments",
    description:
      "Connected accounts, disputes, reserves, webhooks, payouts, and reconciliation.",
  },
  audit: {
    eyebrow: "Append-only governance",
    title: "Audit log",
    description:
      "Every privileged action, before-and-after state, actor, reason, and request.",
  },
  flags: {
    eyebrow: "Controlled delivery",
    title: "Feature flags",
    description:
      "Scoped rollouts, kill switches, experiment ownership, and error budgets.",
  },
  health: {
    eyebrow: "Operational reliability",
    title: "System health",
    description:
      "Services, jobs, queues, webhooks, latency, incidents, and data freshness.",
  },
};

export function AdminPanel({ module }: { readonly module: AdminModule }) {
  if (module === "overview") return null;
  const copy = adminCopy[module];
  return (
    <main className="hq-page admin-page module-page">
      <header className="hq-page-heading">
        <div>
          <span className="hq-eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}.</h1>
          <p>{copy.description}</p>
        </div>
        <div>
          <button className="hq-button hq-button--secondary">
            <SlidersHorizontal size={16} /> Filters
          </button>
          <button className="hq-button hq-button--primary">Admin action</button>
        </div>
      </header>
      {module === "organizations" && <OrganizationsPanel />}
      {module === "trust" && <TrustPanel />}
      {module === "ratings" && <RatingsPanel />}
      {module === "payments" && <AdminPaymentsPanel />}
      {module === "audit" && <AuditPanel />}
      {module === "flags" && <FlagsPanel />}
      {module === "health" && <HealthPanel />}
    </main>
  );
}

function OrganizationsPanel() {
  const organizations = [
    [
      "SB",
      "South Bay Volleyball Club",
      "Beach Elite LLC",
      "Club",
      "918",
      "$84.3k",
      "Healthy",
    ],
    [
      "PB",
      "Pacific Beach Volleyball",
      "PBV Inc.",
      "Facility",
      "1,284",
      "$118.8k",
      "Review",
    ],
    [
      "SG",
      "Sand & Grit Academy",
      "Sand Grit LLC",
      "Coach",
      "416",
      "$38.2k",
      "Healthy",
    ],
    [
      "DH",
      "Duna House",
      "Beach Elite LLC",
      "Facility",
      "2,106",
      "$142.1k",
      "Healthy",
    ],
    [
      "OC",
      "Orange Coast Juniors",
      "OCJ Foundation",
      "Club",
      "744",
      "$61.7k",
      "Onboarding",
    ],
    [
      "NV",
      "North Volley Project",
      "NVP LLC",
      "Coach",
      "284",
      "$19.4k",
      "Healthy",
    ],
  ];
  return (
    <>
      <section className="entity-toolbar">
        <label>
          <Search size={16} />
          <input placeholder="Search 128 organizations…" />
        </label>
        <div className="segmented">
          <button className="active">All</button>
          <button>Club</button>
          <button>Coach</button>
          <button>Facility</button>
        </div>
        <button>Export</button>
      </section>
      <section className="table-card organization-table">
        <header>
          <span>Organization</span>
          <span>Type</span>
          <span>People</span>
          <span>30d volume</span>
          <span>Health</span>
          <span />
        </header>
        {organizations.map((row) => (
          <article key={row[1]}>
            <div>
              <span className="table-avatar">{row[0]}</span>
              <span>
                <strong>{row[1]}</strong>
                <small>{row[2]}</small>
              </span>
            </div>
            <span>{row[3]}</span>
            <Numeric>{row[4]}</Numeric>
            <Numeric>{row[5]}</Numeric>
            <Badge
              tone={
                row[6] === "Healthy"
                  ? "positive"
                  : row[6] === "Review"
                    ? "warning"
                    : "neutral"
              }
            >
              {row[6]}
            </Badge>
            <button>
              <MoreHorizontal size={17} />
            </button>
          </article>
        ))}
      </section>
      <section className="capability-note">
        <Network size={20} />
        <div>
          <strong>Shared platform, typed capabilities.</strong>
          <span>
            Every organization varies through configuration, roles, and
            capabilities—not bespoke routes or code forks.
          </span>
        </div>
        <button>View capability matrix</button>
      </section>
    </>
  );
}

function TrustPanel() {
  const [caseId, setCaseId] = useState("SAFE-10842");
  const cases = [
    {
      id: "SAFE-10842",
      severity: "High",
      subject: "Adult-to-minor direct contact",
      org: "Pacific Beach Volleyball",
      age: "47m",
      status: "New",
    },
    {
      id: "SAFE-10841",
      severity: "Medium",
      subject: "Sideline conduct report",
      org: "South Bay Volleyball",
      age: "2h",
      status: "Assigned",
    },
    {
      id: "SAFE-10839",
      severity: "Low",
      subject: "Profile impersonation",
      org: "Open network",
      age: "5h",
      status: "Investigating",
    },
  ];
  const active = cases.find((item) => item.id === caseId) ?? cases[0]!;
  return (
    <section className="trust-layout">
      <aside>
        <header>
          <strong>Open cases</strong>
          <Badge tone="danger">3</Badge>
        </header>
        {cases.map((item) => (
          <button
            className={caseId === item.id ? "active" : undefined}
            key={item.id}
            onClick={() => setCaseId(item.id)}
          >
            <span>
              <Badge
                tone={
                  item.severity === "High"
                    ? "danger"
                    : item.severity === "Medium"
                      ? "warning"
                      : "neutral"
                }
              >
                {item.severity}
              </Badge>
              <time>{item.age}</time>
            </span>
            <strong>{item.subject}</strong>
            <small>
              {item.org} · {item.id}
            </small>
          </button>
        ))}
      </aside>
      <article className="trust-case">
        <header>
          <div>
            <Badge tone="danger">{active.severity} severity</Badge>
            <h2>{active.subject}</h2>
            <p>
              {active.org} · opened {active.age} ago
            </p>
          </div>
          <button>
            <LockKeyhole size={16} /> Assign to me
          </button>
        </header>
        <div className="trust-safeguard">
          <ShieldCheck size={19} />
          <div>
            <strong>Protective hold applied automatically</strong>
            <p>
              Direct messaging is disabled between the involved accounts.
              Guardian visibility remains intact. No finding has been made.
            </p>
          </div>
          <Badge tone="positive">Active</Badge>
        </div>
        <section>
          <span className="hq-eyebrow">Evidence timeline</span>
          {(
            [
              [
                "10:12 AM",
                "Report submitted",
                "Guardian reported a direct contact attempt outside the guardian-visible group thread.",
              ],
              [
                "10:12 AM",
                "Automated safeguard",
                "Messaging restriction and immutable evidence snapshot created.",
              ],
              [
                "10:16 AM",
                "Organization notified",
                "Designated safety lead acknowledged the case.",
              ],
            ] as const
          ).map((row) => (
            <article key={row[0] + row[1]}>
              <Numeric>{row[0]}</Numeric>
              <i />
              <div>
                <strong>{row[1]}</strong>
                <p>{row[2]}</p>
              </div>
            </article>
          ))}
        </section>
        <footer>
          <button>Request information</button>
          <button>Record assessment</button>
          <button className="danger">Escalate</button>
        </footer>
      </article>
      <aside className="trust-policy">
        <span className="hq-eyebrow">Policy guidance</span>
        <h3>Minor communication</h3>
        <p>
          Messages involving a minor require a verified guardian in the same
          thread. Attempts to move the conversation outside the protected
          channel are reviewable.
        </p>
        <a>
          Open policy version 3.2 <ArrowRight size={14} />
        </a>
        <div>
          <strong>Response SLA</strong>
          <Numeric>01:12:44</Numeric>
          <small>until first assessment due</small>
        </div>
      </aside>
    </section>
  );
}

function RatingsPanel() {
  return (
    <>
      <section className="rating-health">
        <article>
          <small>Rating profiles</small>
          <Numeric>64,218</Numeric>
          <span className="positive">+4,382 this month</span>
        </article>
        <article>
          <small>Reliable or Locked</small>
          <Numeric>71.4%</Numeric>
          <span>network confidence</span>
        </article>
        <article>
          <small>Events held</small>
          <Numeric>19</Numeric>
          <span className="negative">0.03% of 61,884</span>
        </article>
        <article>
          <small>Calibration error</small>
          <Numeric>2.8%</Numeric>
          <span className="positive">within 4% target</span>
        </article>
      </section>
      <section className="ratings-admin-grid">
        <article className="hq-card rating-distribution">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Beach 2s</span>
              <h2>Network distribution</h2>
            </div>
            <Badge>Updated 6m ago</Badge>
          </header>
          <div>
            {[2, 4, 8, 16, 28, 48, 74, 96, 88, 70, 51, 32, 19, 10, 5, 2].map(
              (height, index) => (
                <i key={index} style={{ height: `${height}%` }} />
              ),
            )}
          </div>
          <footer>
            <span>1.0</span>
            <span>2.0</span>
            <span>3.0</span>
            <span>4.0</span>
            <span>5.0</span>
            <span>6.0</span>
            <span>7.0</span>
          </footer>
        </article>
        <article className="hq-card rating-integrity">
          <span className="hq-eyebrow">Integrity signals</span>
          <h2>Healthy model behavior.</h2>
          {[
            ["Expected vs actual", "97.2%", "Target ≥ 95%"],
            ["Weak-link responsibility", "2.4%", "Stable"],
            ["Repeat-match decay", "8.1%", "Expected 6–10%"],
            ["Weekly cap activated", "0.7%", "Expected < 1%"],
          ].map((row) => (
            <div key={row[0]}>
              <span>
                <strong>{row[0]}</strong>
                <small>{row[2]}</small>
              </span>
              <Numeric>{row[1]}</Numeric>
              <Check size={15} />
            </div>
          ))}
        </article>
      </section>
      <section className="table-card anomaly-table">
        <header>
          <span>Held event</span>
          <span>Reason</span>
          <span>Impact</span>
          <span>Evidence</span>
          <span>Status</span>
          <span />
        </header>
        {[
          [
            "RTE-88418",
            "Repeated closed cohort",
            "±0.18",
            "12 matches",
            "Held",
          ],
          [
            "RTE-88401",
            "Score pattern anomaly",
            "±0.11",
            "6 matches",
            "Review",
          ],
          [
            "RTE-88372",
            "Identity merge pending",
            "±0.07",
            "2 profiles",
            "Held",
          ],
        ].map((row) => (
          <article key={row[0]}>
            <Numeric>{row[0]}</Numeric>
            <span>{row[1]}</span>
            <Numeric>{row[2]}</Numeric>
            <span>{row[3]}</span>
            <Badge tone="warning">{row[4]}</Badge>
            <button>
              <Eye size={16} />
            </button>
          </article>
        ))}
      </section>
    </>
  );
}

function AdminPaymentsPanel() {
  return (
    <>
      <section className="admin-payment-hero">
        <div>
          <Badge tone="positive">Stripe platform healthy</Badge>
          <span className="hq-eyebrow">30-day gross volume</span>
          <Numeric>$4,842,118.24</Numeric>
          <p>Across 128 connected organizations · no Duna-custodied funds</p>
        </div>
        <div>
          {[
            ["Available to connected accounts", "$1.28m"],
            ["In transit", "$418.2k"],
            ["Refunds", "$112.8k"],
            ["Disputes", "$14.2k"],
          ].map((row) => (
            <span key={row[0]}>
              <small>{row[0]}</small>
              <Numeric>{row[1]}</Numeric>
            </span>
          ))}
        </div>
      </section>
      <section className="payments-ops-grid">
        <article className="hq-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Webhook delivery</span>
              <h2>Stripe events</h2>
            </div>
            <Badge tone="positive">99.98%</Badge>
          </header>
          {[
            ["payment_intent.succeeded", "18,428", "1.4s"],
            ["charge.refunded", "1,284", "1.8s"],
            ["account.updated", "428", "2.1s"],
            ["payout.paid", "314", "1.6s"],
            ["invoice.payment_failed", "184", "2.4s"],
          ].map((row) => (
            <div className="service-row" key={row[0]}>
              <span>
                <i />
                <strong>{row[0]}</strong>
              </span>
              <Numeric>{row[1]}</Numeric>
              <Numeric>{row[2]}</Numeric>
            </div>
          ))}
        </article>
        <article className="hq-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Risk + operations</span>
              <h2>Exception queue</h2>
            </div>
            <Badge tone="warning">4</Badge>
          </header>
          {[
            [
              "KYC information due",
              "Pacific Beach Volleyball",
              "Due in 5 days",
            ],
            ["Dispute response due", "TXN-91842 · $480.00", "Due tomorrow"],
            ["Payout verification", "Orange Coast Juniors", "Manual review"],
            ["Tax nexus review", "Duna House · CA", "Threshold reached"],
          ].map((row, index) => (
            <article className="exception-row" key={row[0]}>
              <span>
                {index === 0 ? (
                  <UserCheck size={16} />
                ) : (
                  <CircleAlert size={16} />
                )}
              </span>
              <div>
                <strong>{row[0]}</strong>
                <small>{row[1]}</small>
              </div>
              <Badge tone={index === 1 ? "danger" : "warning"}>{row[2]}</Badge>
            </article>
          ))}
        </article>
      </section>
      <section className="funds-boundary">
        <ShieldCheck size={20} />
        <div>
          <strong>Funds boundary enforced.</strong>
          <p>
            Duna stores ledger events and Stripe references. Player and operator
            funds remain in Stripe-managed accounts; Duna never represents
            itself as a bank.
          </p>
        </div>
        <Badge tone="positive">Invariant passing</Badge>
      </section>
    </>
  );
}

function AuditPanel() {
  const events = [
    [
      "2026-07-30 10:46:18",
      "JS",
      "feature_flag.updated",
      "rating-v3-explanations",
      "12% → 25%",
      "Console",
    ],
    [
      "2026-07-30 10:31:04",
      "AM",
      "organization.verified",
      "org_pb_volleyball",
      "pending → verified",
      "Console",
    ],
    [
      "2026-07-30 10:24:51",
      "SYSTEM",
      "rating_event.held",
      "RTE-88418",
      "active → held",
      "Risk worker",
    ],
    [
      "2026-07-30 10:12:07",
      "SYSTEM",
      "safety_hold.created",
      "SAFE-10842",
      "none → active",
      "Safety worker",
    ],
    [
      "2026-07-30 09:58:42",
      "SR",
      "policy.published",
      "weather-credit-v4",
      "draft → current",
      "HQ",
    ],
    [
      "2026-07-30 09:42:11",
      "SYSTEM",
      "payout.reconciled",
      "po_1TyxUL",
      "pending → matched",
      "Stripe webhook",
    ],
  ];
  return (
    <>
      <section className="audit-assurance">
        <LockKeyhole size={19} />
        <div>
          <strong>Append-only and tamper-evident.</strong>
          <span>
            Privileged actions capture actor, role, IP class, request ID,
            reason, before/after values, and source.
          </span>
        </div>
        <Badge tone="positive">Chain verified</Badge>
        <Numeric>8,418,224 events</Numeric>
      </section>
      <section className="entity-toolbar">
        <label>
          <Search size={16} />
          <input placeholder="Search action, actor, resource, request ID…" />
        </label>
        <div className="segmented">
          <button className="active">All</button>
          <button>Human</button>
          <button>System</button>
          <button>High risk</button>
        </div>
        <button>Export evidence</button>
      </section>
      <section className="table-card audit-table">
        <header>
          <span>Timestamp</span>
          <span>Actor</span>
          <span>Action</span>
          <span>Resource</span>
          <span>Change</span>
          <span>Source</span>
        </header>
        {events.map((row) => (
          <article key={row[0]}>
            <Numeric>{row[0]}</Numeric>
            <span className="actor-pill">{row[1]}</span>
            <Numeric>{row[2]}</Numeric>
            <span>{row[3]}</span>
            <span>{row[4]}</span>
            <Badge>{row[5]}</Badge>
          </article>
        ))}
      </section>
    </>
  );
}

function FlagsPanel() {
  const [flags, setFlags] = useState([
    {
      name: "rating-v3-explanations",
      description:
        "Player-facing expected result and responsibility breakdown.",
      scope: "25% · players",
      owner: "Ratings",
      active: true,
      risk: "Medium",
    },
    {
      name: "ai-league-scheduler",
      description: "AI schedule proposals behind fresh-confirmation gate.",
      scope: "12 orgs",
      owner: "AI Platform",
      active: true,
      risk: "High",
    },
    {
      name: "wallet-original-method",
      description: "Offer original-method refund alongside wallet credit.",
      scope: "100% · US",
      owner: "Money",
      active: true,
      risk: "Medium",
    },
    {
      name: "guardian-messaging-v2",
      description: "New household context and protected-thread UX.",
      scope: "Staging",
      owner: "Trust",
      active: false,
      risk: "High",
    },
    {
      name: "terminal-offline-mode",
      description: "Queue eligible in-person payments during brief outages.",
      scope: "4 facilities",
      owner: "Money",
      active: false,
      risk: "High",
    },
  ]);
  return (
    <>
      <section className="flag-safety">
        <Flag size={19} />
        <div>
          <strong>Every rollout has an owner and a kill switch.</strong>
          <span>
            High-risk capabilities require staging evidence, scoped exposure,
            live monitors, and a rollback path.
          </span>
        </div>
        <Badge tone="positive">No breached budgets</Badge>
      </section>
      <section className="flag-list">
        {flags.map((flag, index) => (
          <article key={flag.name}>
            <button
              aria-label={`Toggle ${flag.name}`}
              className={flag.active ? "toggle active" : "toggle"}
              onClick={() =>
                setFlags((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, active: !item.active }
                      : item,
                  ),
                )
              }
            >
              <i />
            </button>
            <div>
              <Numeric>{flag.name}</Numeric>
              <p>{flag.description}</p>
              <span>
                <Badge tone={flag.risk === "High" ? "warning" : "neutral"}>
                  {flag.risk} risk
                </Badge>
                <small>{flag.scope}</small>
                <small>Owner: {flag.owner}</small>
              </span>
            </div>
            <button>
              <MoreHorizontal size={17} />
            </button>
          </article>
        ))}
      </section>
    </>
  );
}

function HealthPanel() {
  const services = [
    ["Public web + HQ", "Operational", "99.99%", "118 ms", "5m ago"],
    ["tRPC API", "Operational", "99.99%", "96 ms", "now"],
    ["Neon Postgres", "Operational", "100.00%", "23 ms", "now"],
    ["Inngest workers", "Operational", "99.97%", "1.2 s", "12s ago"],
    ["Ably realtime", "Operational", "99.96%", "84 ms", "now"],
    ["Stripe webhooks", "Operational", "99.98%", "1.8 s", "3s ago"],
    ["AI Gateway", "Operational", "99.91%", "2.1 s", "8s ago"],
    ["Email + SMS", "Operational", "99.94%", "3.4 s", "14s ago"],
  ];
  return (
    <>
      <section className="health-banner">
        <HeartPulse size={24} />
        <div>
          <h2>All systems operational</h2>
          <p>
            No active incidents. All critical data sources are within freshness
            targets.
          </p>
        </div>
        <Badge tone="positive">Global</Badge>
        <Numeric>99.98%</Numeric>
      </section>
      <section className="health-grid">
        <article className="hq-card uptime-chart">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">30 days</span>
              <h2>Availability</h2>
            </div>
            <Badge tone="positive">Within SLO</Badge>
          </header>
          <div>
            {Array.from({ length: 90 }, (_, index) => (
              <i
                className={index === 46 ? "degraded" : undefined}
                key={index}
              />
            ))}
          </div>
          <footer>
            <span>Jul 1</span>
            <span>Today</span>
          </footer>
        </article>
        <article className="hq-card freshness-card">
          <span className="hq-eyebrow">Data completeness</span>
          <h2>Fresh and accounted for.</h2>
          {[
            ["Ledger projection", "3s"],
            ["Rating snapshots", "6m"],
            ["Analytics events", "41s"],
            ["Search index", "2m"],
          ].map((row) => (
            <div key={row[0]}>
              <span>
                <i />
                <strong>{row[0]}</strong>
              </span>
              <Numeric>{row[1]}</Numeric>
            </div>
          ))}
        </article>
      </section>
      <section className="table-card health-table">
        <header>
          <span>Service</span>
          <span>Status</span>
          <span>30d uptime</span>
          <span>p95 latency</span>
          <span>Last check</span>
          <span />
        </header>
        {services.map((row) => (
          <article key={row[0]}>
            <span className="service-name">
              <i />
              {row[0]}
            </span>
            <Badge tone="positive">{row[1]}</Badge>
            <Numeric>{row[2]}</Numeric>
            <Numeric>{row[3]}</Numeric>
            <span>{row[4]}</span>
            <button>
              <Gauge size={16} />
            </button>
          </article>
        ))}
      </section>
      <section className="incident-note">
        <Clock3 size={18} />
        <div>
          <strong>Last incident: July 18 · delayed SMS delivery</strong>
          <span>
            Resolved in 18 minutes. No safety, money, or score events were lost.
            Postmortem complete.
          </span>
        </div>
        <button>Read postmortem</button>
      </section>
    </>
  );
}
