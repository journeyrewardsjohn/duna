"use client";

import type { PlayerSettings } from "@duna/api";
import { Badge } from "@duna/ui";
import { Plus, ShieldCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { addDependentAction } from "@/app/app/settings/actions";

type Household = PlayerSettings["household"];

export function HouseholdSettings({
  ageBand,
  consentDisclosure,
  household,
}: {
  readonly ageBand: PlayerSettings["profile"]["ageBand"];
  readonly consentDisclosure: string;
  readonly household: Household;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [form, setForm] = useState({
    displayName: "",
    birthDate: "",
    relationship: "Parent",
    emergencyContact: true,
    canApproveSpending: true,
    consentConfirmed: false,
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    if (!form.consentConfirmed) {
      setError("Confirm parental or legal-guardian authorization to continue.");
      return;
    }
    startTransition(async () => {
      const response = await addDependentAction({
        ...form,
        consentConfirmed: true,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setAdding(false);
      setForm({
        displayName: "",
        birthDate: "",
        relationship: "Parent",
        emergencyContact: true,
        canApproveSpending: true,
        consentConfirmed: false,
      });
      setNotice(
        `${response.result.ageBand === "under-13" ? "Child" : "Teen"} profile created privately. Parental consent is recorded; relationship verification is still pending.`,
      );
      router.refresh();
    });
  };

  return (
    <section id="household">
      <div className="settings-section__heading">
        <div>
          <span className="page-eyebrow">Family</span>
          <h2>Household + guardians</h2>
        </div>
        {ageBand === "adult" && (
          <button
            className="settings-heading-action"
            onClick={() => setAdding((current) => !current)}
            type="button"
          >
            <Plus aria-hidden size={16} /> Add dependent
          </button>
        )}
      </div>

      {(notice || error) && (
        <p className={error ? "form-error" : "form-notice"} aria-live="polite">
          {error ?? notice}
        </p>
      )}

      {household.map((member) => (
        <div className="settings-row" key={member.person.id}>
          <span className="avatar">{member.person.initials}</span>
          <span>
            <strong>{member.person.displayName}</strong>
            <small>
              {member.role} · {member.relationship}
              {member.emergencyContact ? " · emergency contact" : ""}
              {member.canApproveSpending ? " · spending authority" : ""}
            </small>
          </span>
          <Badge tone={member.verified ? "positive" : "warning"}>
            {member.verified ? "Verified" : "Pending review"}
          </Badge>
        </div>
      ))}

      {household.length === 0 && !adding && (
        <article className="empty-state">
          <Users aria-hidden size={22} />
          <h3>No household links.</h3>
          <p>
            Adults can create a private dependent profile. A minor account must
            be linked to a verified guardian before payments or consent.
          </p>
        </article>
      )}

      {adding && ageBand === "adult" && (
        <form className="settings-form" onSubmit={submit}>
          <div className="settings-form__title">
            <ShieldCheck aria-hidden size={20} />
            <span>
              <strong>Create a dependent profile</strong>
              <small>
                The profile stays private. Relationship verification must
                complete before you can pay or sign for this child.
              </small>
            </span>
          </div>
          <div className="form-grid form-grid--2">
            <label>
              Child&apos;s display name
              <input
                autoComplete="off"
                maxLength={80}
                minLength={2}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
                required
                value={form.displayName}
              />
            </label>
            <label>
              Date of birth
              <input
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    birthDate: event.target.value,
                  }))
                }
                required
                type="date"
                value={form.birthDate}
              />
            </label>
            <label>
              Relationship
              <select
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    relationship: event.target.value,
                  }))
                }
                value={form.relationship}
              >
                <option>Parent</option>
                <option>Legal guardian</option>
                <option>Grandparent</option>
                <option>Other guardian</option>
              </select>
            </label>
            <div className="settings-checks">
              <label>
                <input
                  checked={form.emergencyContact}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      emergencyContact: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                <span>
                  <strong>Emergency contact</strong>
                  <small>
                    This organization may contact you about an urgent health or
                    safety issue involving this child.
                  </small>
                </span>
              </label>
              <label>
                <input
                  checked={form.canApproveSpending}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      canApproveSpending: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                <span>
                  <strong>May approve spending</strong>
                  <small>
                    You may approve this child&apos;s bookings and purchases
                    using your authorized wallet or payment method.
                  </small>
                </span>
              </label>
            </div>
          </div>
          <label className="consent-confirmation">
            <input
              checked={form.consentConfirmed}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  consentConfirmed: event.target.checked,
                }))
              }
              required
              type="checkbox"
            />
            <span>
              <strong>Guardian authorization and dependent waivers</strong>
              <small>{consentDisclosure}</small>
            </span>
          </label>
          <div className="settings-form__actions">
            <button
              className="primary-action"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Creating…" : "Create private profile"}
            </button>
            <button
              disabled={isPending}
              onClick={() => setAdding(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {ageBand !== "adult" && (
        <article className="settings-safety-note">
          <ShieldCheck aria-hidden size={20} />
          <span>
            <strong>Guardian-managed safety</strong>
            <small>
              Payments, waivers, wallet controls, and coach messages stay
              guardian-gated for minor accounts.
            </small>
          </span>
        </article>
      )}
    </section>
  );
}
