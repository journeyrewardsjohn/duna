"use client";

import {
  CharacterCounter,
  Field,
  FormStatus,
  Input,
  MoneyInput,
  SubmitBar,
  Textarea,
  useAutosave,
  useFormBehaviour,
  type FormValues,
} from "@duna/ui/tideline";
import { useState } from "react";
import { useLab } from "../../interactions";
import styles from "./kit.module.css";

const NOTE_MAX = 160;

/** Stands in for the API's validation error on one field. */
const takenError = () =>
  Object.assign(new Error("Invalid input"), {
    data: {
      requestId: "req_2b9d41c07e5a3f8812c6d4ab",
      zodError: {
        fieldErrors: { email: ["That email already belongs to a member."] },
      },
    },
  });

export function FormBehaviourDemo() {
  const lab = useLab();
  const [price, setPrice] = useState<number | null>(4800);
  const [note, setNote] = useState("");
  const [submits, setSubmits] = useState(0);
  const draft = useAutosave(
    { price, note },
    { save: () => lab.request(() => true) },
  );
  const form = useFormBehaviour({
    validate: (values: FormValues) => ({
      name: values.name?.trim() ? undefined : "Enter the coach's name.",
      email: !values.email?.trim()
        ? "Enter an email address."
        : /^\S+@\S+\.\S+$/.test(values.email)
          ? undefined
          : "Enter an email like name@club.com.",
      price: values.price ? undefined : "Enter a lesson price.",
      note:
        [...(values.note ?? "")].length > NOTE_MAX
          ? "Keep the note to 160 characters."
          : undefined,
    }),
    submit: (values) => {
      setSubmits((count) => count + 1);
      return lab.request(() => {
        if (values.email?.includes("taken")) throw takenError();
        return true;
      });
    },
    messages: {
      success: "Coach invited",
      error: "Could not invite the coach. Nothing was sent.",
    },
  });
  return (
    <form {...form.formProps} className={styles.form}>
      <FormStatus form={form} />
      <Field error={form.errors.name} label="Coach name" name="name">
        <Input autoComplete="off" />
      </Field>
      <Field
        error={form.errors.email}
        hint="Type an address with “taken” in it to see a server error on this field."
        label="Email"
        name="email"
      >
        <Input autoComplete="off" type="email" />
      </Field>
      <Field error={form.errors.price} label="Lesson price">
        <MoneyInput
          currency="USD"
          name="price"
          onValueChange={setPrice}
          value={price}
        />
      </Field>
      <Field
        error={form.errors.note}
        hint={<CharacterCounter max={NOTE_MAX} value={note} />}
        label="Note to the coach"
        name="note"
        optional
      >
        <Textarea
          onValueChange={(value) => setNote(String(value ?? ""))}
          value={note}
        />
      </Field>
      <p className="td-meta td-num" data-testid="form-submits">
        Submits sent: {submits}
      </p>
      <SubmitBar
        agentConfirm="Emails an invitation to the coach"
        autosave={draft}
        form={form}
        label="Invite coach"
        sticky
      />
    </form>
  );
}
