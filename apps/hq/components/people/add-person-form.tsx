"use client";

import {
  Button,
  Field,
  Input,
  Notice,
  RadioGroup,
  RadioOption,
  useConfirm,
  useDebouncedValue,
} from "@duna/ui/tideline";
import Link from "next/link";
import { useMemo, useState } from "react";
import { addPersonAction } from "@/app/(next)/(hq)/people/actions";
import {
  type DuplicateCandidate,
  findDuplicates,
  firstName,
  normaliseEmail,
  normalisePhone,
} from "./people-model";
import { reportFailure, unwrap } from "./people-result";

export interface GuardianPrefill {
  readonly id: string;
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
}

/**
 * Add a person in one short form: name, adult or junior, and how to reach
 * them (a junior's guardian). Possible duplicates are found and explained
 * while typing, before anything is saved. Adding sends the club's
 * invitation after one confirmation: an adult claims their own profile; a
 * junior's invitation goes to the guardian, and the junior joins only once
 * the guardian accepts.
 */
export function AddPersonForm({
  people,
  initialKind = "adult",
  guardian,
}: {
  readonly people: readonly DuplicateCandidate[];
  readonly initialKind?: "adult" | "junior";
  readonly guardian?: GuardianPrefill;
}) {
  const confirm = useConfirm();
  const [kind, setKind] = useState<"adult" | "junior">(initialKind);
  const [relationship, setRelationship] = useState<"player" | "member">(
    "player",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [guardianName, setGuardianName] = useState(guardian?.name ?? "");
  const [guardianEmail, setGuardianEmail] = useState(guardian?.email ?? "");
  const [guardianPhone, setGuardianPhone] = useState(guardian?.phone ?? "");
  const [done, setDone] = useState<string>();
  const [touched, setTouched] = useState(false);
  const junior = kind === "junior";

  // Debounce a string: an object would be new on every render.
  const probeKey = useDebouncedValue(
    JSON.stringify({ name, email, phone, junior }),
  );
  const duplicates = useMemo(() => {
    const probe = JSON.parse(probeKey) as {
      name: string;
      email: string;
      phone: string;
      junior: boolean;
    };
    return probe.name.trim().length >= 3 || probe.email || probe.phone
      ? findDuplicates(
          {
            name: probe.name,
            email: probe.junior ? undefined : probe.email,
            phone: probe.junior ? undefined : probe.phone,
            isJunior: probe.junior,
          },
          people,
        ).slice(0, 3)
      : [];
  }, [probeKey, people]);

  const errors = {
    name: name.trim().length < 2 ? "Enter their full name." : undefined,
    contact:
      !junior && !normaliseEmail(email) && !normalisePhone(phone)
        ? "Enter an email or a mobile number with its country code."
        : !junior &&
            email.trim() &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
          ? "That email address isn't complete."
          : !junior && phone.trim() && !normalisePhone(phone)
            ? "Enter the mobile number with its country code, like +1 310 555 0121."
            : undefined,
    guardianName:
      junior && guardianName.trim().length < 2
        ? "Enter the guardian's name."
        : undefined,
    guardianContact:
      junior && !normaliseEmail(guardianEmail) && !normalisePhone(guardianPhone)
        ? "Enter the guardian's email or mobile number."
        : undefined,
  };
  const valid = Object.values(errors).every((error) => !error);
  const first = firstName(name.trim() || "them");
  const destination = junior
    ? normaliseEmail(guardianEmail)
      ? `by email to ${normaliseEmail(guardianEmail)}`
      : `by text to ${normalisePhone(guardianPhone)}`
    : normaliseEmail(email)
      ? `by email to ${normaliseEmail(email)}`
      : `by text to ${normalisePhone(phone)}`;

  const review = () => {
    setTouched(true);
    if (!valid) return;
    const strong = duplicates.filter(
      (match) => match.strength !== "similar-name",
    );
    void confirm
      .run({
        tier: "confirm",
        title: junior
          ? `Invite ${guardianName.trim()} to add ${first}?`
          : `Invite ${name.trim()}?`,
        description: junior
          ? `${guardianName.trim()} gets the club's invitation ${destination}. ${first} joins only once the guardian accepts; the club never contacts ${first} directly.`
          : `${name.trim()} gets the club's invitation ${destination} and claims their own profile.`,
        affected:
          strong.length > 0
            ? `Possible duplicate: ${strong.map((match) => match.reason).join(" ")}`
            : undefined,
        verb: junior
          ? `Send the invitation to ${firstName(guardianName.trim())}`
          : `Send the invitation to ${first}`,
        cancelLabel: "Go back",
        agentConfirm: junior
          ? `Sends ${guardianName.trim()} an invitation to add their junior ${name.trim()}`
          : `Sends ${name.trim()} an invitation to join the club`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await addPersonAction({
              name,
              kind,
              relationship,
              email: junior ? undefined : email,
              phone: junior ? undefined : phone,
              guardianName: junior ? guardianName : undefined,
              guardianEmail: junior ? guardianEmail : undefined,
              guardianPhone: junior ? guardianPhone : undefined,
              idempotencyKey,
            }),
          ),
        success: junior
          ? `Invitation sent to ${guardianName.trim()}`
          : `Invitation sent to ${name.trim()}`,
        report: reportFailure("hq.people.add_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") setDone(name.trim());
      });
  };

  if (done) {
    return (
      <Notice
        action={
          <span className="people-actions">
            <Button
              onClick={() => {
                setDone(undefined);
                setName("");
                setEmail("");
                setPhone("");
                setTouched(false);
              }}
              size="sm"
              variant="secondary"
            >
              Add another
            </Button>
            <Button href="/people" size="sm" variant="ghost">
              Back to People
            </Button>
          </span>
        }
        role="status"
        title={`${done} is invited`}
        tone="positive"
      >
        {junior
          ? "They appear in People once the guardian accepts."
          : "They appear in People as invited until they accept."}
      </Notice>
    );
  }

  return (
    <form
      aria-label="Add a person"
      className="people-form people-add"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        review();
      }}
    >
      <Field error={touched ? errors.name : undefined} label="Name">
        <Input
          autoComplete="off"
          maxLength={120}
          onChange={(event) => setName(event.currentTarget.value)}
          value={name}
        />
      </Field>
      <Field label="Who is this?">
        <RadioGroup
          inline
          onValueChange={(value) => setKind(value as "adult" | "junior")}
          value={kind}
        >
          <RadioOption label="An adult" value="adult" />
          <RadioOption label="A junior, under 18" value="junior" />
        </RadioGroup>
      </Field>
      {junior ? (
        <fieldset className="people-fieldset">
          <legend>Their guardian</legend>
          <p className="people-quiet">
            The invitation goes to the guardian. A junior has no contact of
            their own at the club.
          </p>
          <Field
            error={touched ? errors.guardianName : undefined}
            label="Guardian name"
          >
            <Input
              autoComplete="off"
              maxLength={120}
              onChange={(event) => setGuardianName(event.currentTarget.value)}
              value={guardianName}
            />
          </Field>
          <Field
            error={touched ? errors.guardianContact : undefined}
            label="Guardian email"
            optional
          >
            <Input
              autoComplete="off"
              onChange={(event) => setGuardianEmail(event.currentTarget.value)}
              type="email"
              value={guardianEmail}
            />
          </Field>
          <Field label="Guardian mobile" optional>
            <Input
              autoComplete="off"
              inputMode="tel"
              onChange={(event) => setGuardianPhone(event.currentTarget.value)}
              value={guardianPhone}
            />
          </Field>
        </fieldset>
      ) : (
        <>
          <Field
            error={touched ? errors.contact : undefined}
            hint="An email, a mobile number, or both."
            label="Email"
            optional
          >
            <Input
              autoComplete="off"
              onChange={(event) => setEmail(event.currentTarget.value)}
              type="email"
              value={email}
            />
          </Field>
          <Field
            hint="With the country code, like +1 310 555 0121."
            label="Mobile"
            optional
          >
            <Input
              autoComplete="off"
              inputMode="tel"
              onChange={(event) => setPhone(event.currentTarget.value)}
              value={phone}
            />
          </Field>
        </>
      )}
      <Field label="Joins as">
        <RadioGroup
          inline
          onValueChange={(value) =>
            setRelationship(value as "player" | "member")
          }
          value={relationship}
        >
          <RadioOption label="Player" value="player" />
          <RadioOption label="Member" value="member" />
        </RadioGroup>
      </Field>

      {duplicates.length > 0 ? (
        <section aria-label="Possible duplicates" className="people-dupes">
          <Notice title="Already at the club?" tone="info">
            <ul className="people-dupes__list">
              {duplicates.map((match) => (
                <li key={match.id}>
                  <span>{match.reason}</span>{" "}
                  <Link className="people-link" href={`/people/${match.id}`}>
                    {`Open ${match.name}`}
                  </Link>
                </li>
              ))}
            </ul>
          </Notice>
        </section>
      ) : null}

      <div className="people-actions">
        <Button type="submit" variant="primary">
          {duplicates.some((match) => match.strength === "same-contact")
            ? "Review anyway"
            : "Review invitation"}
        </Button>
        <Button href="/people" variant="ghost">
          Cancel
        </Button>
      </div>
      {confirm.dialog}
    </form>
  );
}
