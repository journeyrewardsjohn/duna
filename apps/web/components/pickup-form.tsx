"use client";

import { Badge, Numeric } from "@duna/ui";
import { Check, ChevronRight, Clock3, Eye, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function PickupForm() {
  const [step, setStep] = useState(1);
  const [created, setCreated] = useState(false);

  if (created) {
    return (
      <section className="pickup-created">
        <span className="pickup-created__check">
          <Check aria-hidden size={28} />
        </span>
        <Badge tone="positive">Published</Badge>
        <h1>Golden Hour 4s is live.</h1>
        <p>
          Matching 4.0–5.0 players within 10 miles are being invited now. Your
          game thread is ready.
        </p>
        <div>
          <Link className="primary-action" href="/events/golden-hour-fours">
            Open pickup <ChevronRight aria-hidden size={17} />
          </Link>
          <Link className="secondary-action" href="/app/play">
            Back to Play
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="pickup-builder">
      <header>
        <div>
          <span className="page-eyebrow">Create in under 20 seconds</span>
          <h1>Host pickup.</h1>
          <p>Set the shape. Duna finds the right nearby players.</p>
        </div>
        <div className="pickup-builder__progress">
          {[1, 2, 3].map((value) => (
            <span className={value <= step ? "active" : undefined} key={value}>
              {value}
            </span>
          ))}
        </div>
      </header>

      <section className="pickup-builder__form">
        <div className="pickup-builder__main">
          {step === 1 && (
            <>
              <div className="field-group">
                <label htmlFor="pickup-title">Name your run</label>
                <input
                  defaultValue="Golden Hour 4s"
                  id="pickup-title"
                  maxLength={80}
                />
              </div>
              <div className="form-grid form-grid--2">
                <div className="field-group">
                  <label htmlFor="pickup-format">Format</label>
                  <select defaultValue="4s" id="pickup-format">
                    <option>2s</option>
                    <option>4s</option>
                    <option>6s</option>
                    <option>King / Queen</option>
                  </select>
                </div>
                <div className="field-group">
                  <label htmlFor="pickup-spots">Total spots</label>
                  <select defaultValue="8" id="pickup-spots">
                    <option value="4">4</option>
                    <option value="8">8</option>
                    <option value="12">12</option>
                    <option value="16">16</option>
                  </select>
                </div>
              </div>
              <div className="field-group">
                <label>Level</label>
                <div className="range-control">
                  <span>
                    <Numeric>4.0</Numeric>
                  </span>
                  <div>
                    <i />
                  </div>
                  <span>
                    <Numeric>5.0</Numeric>
                  </span>
                </div>
                <small>About 312 nearby players match this band.</small>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="field-group field-group--icon">
                <label htmlFor="pickup-venue">Where</label>
                <MapPin aria-hidden size={18} />
                <input
                  defaultValue="Hermosa Beach — Pier Courts"
                  id="pickup-venue"
                />
              </div>
              <div className="form-grid form-grid--2">
                <div className="field-group">
                  <label htmlFor="pickup-date">Date</label>
                  <input
                    defaultValue="2026-07-31"
                    id="pickup-date"
                    type="date"
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="pickup-time">Start time</label>
                  <input defaultValue="18:00" id="pickup-time" type="time" />
                </div>
              </div>
              <div className="form-grid form-grid--2">
                <div className="field-group">
                  <label htmlFor="pickup-duration">Duration</label>
                  <select defaultValue="90" id="pickup-duration">
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                  </select>
                </div>
                <div className="field-group">
                  <label htmlFor="pickup-cost">Cost per player</label>
                  <select defaultValue="free" id="pickup-cost">
                    <option value="free">Free</option>
                    <option value="split">Split court cost</option>
                    <option value="fixed">Fixed amount</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="field-group">
                <label>Who can see it</label>
                <div className="choice-list">
                  <label className="selected">
                    <input defaultChecked name="visibility" type="radio" />
                    <Eye aria-hidden size={20} />
                    <span>
                      <strong>Nearby matches</strong>
                      <small>Public to players in your level and area.</small>
                    </span>
                  </label>
                  <label>
                    <input name="visibility" type="radio" />
                    <Users aria-hidden size={20} />
                    <span>
                      <strong>People I invite</strong>
                      <small>Only via your private link.</small>
                    </span>
                  </label>
                </div>
              </div>
              <div className="field-group">
                <label htmlFor="pickup-note">A note for the group</label>
                <textarea
                  defaultValue="Good energy, competitive games, easy rotation. Bring your own water."
                  id="pickup-note"
                  rows={4}
                />
              </div>
              <label className="toggle-row">
                <span>
                  <strong>Record matches inside this pickup</strong>
                  <small>
                    Group-confirmed results carry 0.60 rating weight.
                  </small>
                </span>
                <input defaultChecked type="checkbox" />
              </label>
            </>
          )}

          <footer>
            {step > 1 ? (
              <button
                className="secondary-action"
                onClick={() => setStep(step - 1)}
              >
                Back
              </button>
            ) : (
              <Link className="secondary-action" href="/app/play">
                Cancel
              </Link>
            )}
            {step < 3 ? (
              <button
                className="primary-action"
                onClick={() => setStep(step + 1)}
              >
                Continue <ChevronRight aria-hidden size={17} />
              </button>
            ) : (
              <button
                className="primary-action"
                onClick={() => setCreated(true)}
              >
                Publish pickup <Check aria-hidden size={17} />
              </button>
            )}
          </footer>
        </div>

        <aside className="pickup-preview">
          <span className="page-eyebrow">Preview</span>
          <div className="pickup-preview__art">
            <div />
            <Badge>Pickup</Badge>
          </div>
          <h2>Golden Hour 4s</h2>
          <p>
            <MapPin aria-hidden size={14} /> Hermosa Beach — Pier Courts
          </p>
          <div>
            <span>
              <Clock3 aria-hidden size={15} /> Fri · 6:00 PM
            </span>
            <span>
              <Users aria-hidden size={15} /> 8 spots
            </span>
          </div>
          <Badge tone="positive">4.0–5.0</Badge>
        </aside>
      </section>
    </div>
  );
}
