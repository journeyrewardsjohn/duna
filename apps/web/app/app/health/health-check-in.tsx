"use client";

import type { HealthCheckIn } from "@duna/api";
import { useActionState } from "react";
import {
  saveHealthCheckInAction,
  type HealthCheckInActionState,
} from "./actions";

const initialState: HealthCheckInActionState = { status: "idle" };

const questions = [
  {
    key: "perceivedRecovery",
    label: "How recovered do you feel?",
    low: "Not recovered",
    high: "Fully recovered",
  },
  { key: "energy", label: "Energy right now", low: "Flat", high: "High" },
  { key: "stress", label: "Stress today", low: "Low", high: "High" },
  { key: "soreness", label: "Body soreness", low: "None", high: "High" },
] as const;

export function HealthCheckInForm({
  date,
  latest,
}: {
  readonly date: string;
  readonly latest?: HealthCheckIn;
}) {
  const [state, action, pending] = useActionState(
    saveHealthCheckInAction,
    initialState,
  );
  return (
    <form action={action} className="health-checkin">
      <input name="date" type="hidden" value={date} />
      <div className="health-checkin__heading">
        <div>
          <span className="health-kicker">10-second check-in</span>
          <h2>Add the part sensors cannot know.</h2>
        </div>
        <span className="health-private-pill">Encrypted · private</span>
      </div>
      <p className="health-checkin__intro">
        These answers sharpen your personal pattern. Raw answers and notes are
        never included in a coach or organization summary.
      </p>
      <div className="health-checkin__questions">
        {questions.map((question) => (
          <fieldset key={question.key}>
            <legend>{question.label}</legend>
            <div className="health-rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value}>
                  <input
                    defaultChecked={(latest?.[question.key] ?? 3) === value}
                    name={question.key}
                    required
                    type="radio"
                    value={value}
                  />
                  <span>{value}</span>
                </label>
              ))}
            </div>
            <small>
              <span>{question.low}</span>
              <span>{question.high}</span>
            </small>
          </fieldset>
        ))}
      </div>
      <div className="health-checkin__practice">
        <label>
          Practice effort today
          <select defaultValue={latest?.practiceRpe ?? ""} name="practiceRpe">
            <option value="">No practice to add</option>
            <option value="3">Easy · RPE 3</option>
            <option value="6">Solid · RPE 6</option>
            <option value="9">Hard · RPE 9</option>
          </select>
        </label>
        <label>
          Practice length
          <select
            defaultValue={latest?.practiceMinutes ?? ""}
            name="practiceMinutes"
          >
            <option value="">None</option>
            <option value="45">45 minutes</option>
            <option value="75">75 minutes</option>
            <option value="105">105 minutes</option>
          </select>
        </label>
      </div>
      <label className="health-checkin__note">
        Anything worth remembering? <span>Optional</span>
        <textarea
          defaultValue={latest?.note}
          maxLength={280}
          name="note"
          placeholder="Travel, a late match, a stressful day, a great practice…"
          rows={3}
        />
      </label>
      <div className="health-checkin__footer">
        <button className="health-button" disabled={pending} type="submit">
          {pending ? "Saving securely…" : "Save private check-in"}
        </button>
        {state.message && (
          <p
            className={`health-form-message health-form-message--${state.status}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
