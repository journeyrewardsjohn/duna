import { Badge, Numeric } from "@duna/ui";
import {
  Bell,
  Check,
  ChevronRight,
  CreditCard,
  Globe2,
  Pause,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="standard-page settings-page">
      <section className="page-heading-row">
        <div>
          <span className="page-eyebrow">Account + preferences</span>
          <h1>Settings.</h1>
          <p>
            Identity, family, communication, payments, privacy, and membership.
          </p>
        </div>
      </section>

      <section className="settings-layout">
        <nav aria-label="Settings sections">
          <a className="active" href="#membership">
            <CreditCard size={17} /> Membership
          </a>
          <a href="#profile">
            <UserRound size={17} /> Profile
          </a>
          <a href="#household">
            <Users size={17} /> Household
          </a>
          <a href="#notifications">
            <Bell size={17} /> Notifications
          </a>
          <a href="#privacy">
            <ShieldCheck size={17} /> Privacy + safety
          </a>
          <a href="#display">
            <Globe2 size={17} /> Language + units
          </a>
        </nav>

        <div className="settings-content">
          <section id="membership">
            <div className="settings-section__heading">
              <div>
                <span className="page-eyebrow">Membership</span>
                <h2>Duna+</h2>
              </div>
              <Badge tone="positive">Active</Badge>
            </div>
            <article className="membership-card">
              <div>
                <span>DUNA+</span>
                <Badge>Annual</Badge>
              </div>
              <Numeric>$59.00</Numeric>
              <p>Renews July 12, 2027 · Visa •••• 4242</p>
              <div className="membership-card__savings">
                <span>
                  <small>Fees saved</small>
                  <Numeric>$18.72</Numeric>
                </span>
                <span>
                  <small>Guest passes</small>
                  <Numeric>2</Numeric>
                </span>
                <span>
                  <small>Months paused</small>
                  <Numeric>0 / 4</Numeric>
                </span>
              </div>
              <ul>
                <li>
                  <Check size={15} /> No platform fees
                </li>
                <li>
                  <Check size={15} /> All-time rating history
                </li>
                <li>
                  <Check size={15} /> Deep partner chemistry
                </li>
                <li>
                  <Check size={15} /> Personal analytics
                </li>
              </ul>
            </article>
            <div className="membership-actions">
              <button>
                <Pause aria-hidden size={17} /> Pause membership
              </button>
              <button className="danger-link">Cancel membership</button>
              <p>
                Cancellation takes one screen and keeps Duna+ active through
                your paid period. Your profile, rating, matches, safety
                features, and network access always remain free.
              </p>
            </div>
          </section>

          <section id="household">
            <div className="settings-section__heading">
              <div>
                <span className="page-eyebrow">Family</span>
                <h2>Household + guardians</h2>
              </div>
            </div>
            <button className="settings-row">
              <span className="avatar">PL</span>
              <span>
                <strong>Priya Lewis</strong>
                <small>Verified guardian · emergency contact</small>
              </span>
              <Badge tone="positive">Verified</Badge>
              <ChevronRight size={17} />
            </button>
          </section>

          <section id="privacy">
            <div className="settings-section__heading">
              <div>
                <span className="page-eyebrow">Your data</span>
                <h2>Privacy + ownership</h2>
              </div>
            </div>
            <button className="settings-row">
              <span>
                <strong>Export your Duna data</strong>
                <small>
                  Profile, rating events, matches, bookings, and wallet
                  activity.
                </small>
              </span>
              <ChevronRight size={17} />
            </button>
            <button className="settings-row">
              <span>
                <strong>Delete your account</strong>
                <small>
                  Review what Duna must retain for tax, safety, and audit
                  duties.
                </small>
              </span>
              <ChevronRight size={17} />
            </button>
          </section>
        </div>
      </section>
    </main>
  );
}
