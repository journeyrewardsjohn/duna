"use client";

import { CircleAlert, Send } from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
} from "react";
import {
  createOrganizationConversation,
  sendOrganizationMessage,
  type MessagingActionState,
} from "./actions";
import styles from "./messaging.module.css";

const initialState: MessagingActionState = {
  status: "idle",
  message: "",
};

export function MessagingActionForm({
  buttonClassName,
  children,
  className,
  mode,
  pendingLabel,
  submitLabel,
}: {
  readonly buttonClassName?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly mode: "create" | "send";
  readonly pendingLabel: string;
  readonly submitLabel: string;
}) {
  const action =
    mode === "create"
      ? createOrganizationConversation
      : sendOrganizationMessage;
  const [state, formAction, pending] = useActionState(action, initialState);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const notice = state.status === "error" && (
    <p className={styles.actionNotice} role="alert">
      <CircleAlert aria-hidden size={16} />
      <span>{state.message}</span>
    </p>
  );
  const submitButton = (
    <button className={buttonClassName} disabled={pending} type="submit">
      {pending ? pendingLabel : submitLabel}
      <Send aria-hidden size={17} />
    </button>
  );

  return (
    <form aria-busy={pending} className={className} onSubmit={submit}>
      {mode === "create" ? (
        <>
          <div className={styles.composeFields}>{children}</div>
          <footer className={styles.composeActions}>
            {notice}
            {submitButton}
          </footer>
        </>
      ) : (
        <>
          {children}
          {notice}
          {submitButton}
        </>
      )}
    </form>
  );
}
