"use client";

import { CircleAlert, Send } from "lucide-react";
import { type ReactNode, useActionState } from "react";
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

  return (
    <form action={formAction} aria-busy={pending} className={className}>
      {children}
      {state.status === "error" && (
        <p className={styles.actionNotice} role="alert">
          <CircleAlert aria-hidden size={16} />
          <span>{state.message}</span>
        </p>
      )}
      <button className={buttonClassName} disabled={pending} type="submit">
        {pending ? pendingLabel : submitLabel}
        <Send aria-hidden size={17} />
      </button>
    </form>
  );
}
