"use client";

import {
  Button,
  ConfirmSlot,
  Dialog,
  DialogActions,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Field,
  IconButton,
  Icon,
  Input,
  ProposalCard,
  useConfirm,
} from "@duna/ui/tideline";
import { useState } from "react";
import { useLab } from "../../interactions";
import styles from "./kit.module.css";

const drillNames = [
  "Serve receive",
  "Side-out",
  "Transition defence",
  "Block footwork",
];

export function UndoTierDemo() {
  const lab = useLab();
  const confirm = useConfirm();
  const [drills, setDrills] = useState(drillNames);
  const archive = (name: string) =>
    confirm.run({
      tier: "undo",
      title: `${name} archived`,
      undoneMessage: `${name} restored`,
      optimistic: () => {
        const before = drills;
        setDrills((current) => current.filter((drill) => drill !== name));
        return () => setDrills(before);
      },
      perform: () => lab.request(() => name),
      reverse: () => lab.request(() => true),
      errorMessage: `Could not archive ${name}. It is still in the list.`,
    });
  return (
    <div className={styles.stack}>
      <ul className={styles.list} aria-label="Drills">
        {drills.map((drill) => (
          <li className={styles.item} key={drill}>
            <span>{drill}</span>
            <Button
              onClick={() => void archive(drill)}
              size="sm"
              variant="ghost"
            >
              Archive {drill}
            </Button>
          </li>
        ))}
      </ul>
      <p className="td-meta td-num" data-testid="drill-count">
        {drills.length} drills
      </p>
      <p className={styles.meta}>
        Tier 0: reversible, so it acts at once. Undo stays for 6 s (the line
        empties; it pauses while you hover or focus the toast).
      </p>
    </div>
  );
}

export function ConfirmTierDemo() {
  const lab = useLab();
  const confirm = useConfirm();
  const [practice, setPractice] = useState("Scheduled");
  const [site, setSite] = useState("Draft saved");
  return (
    <div className={styles.stack}>
      <div className={styles.row3}>
        <span>Tuesday practice, 6:00 PM · {practice}</span>
        <Button
          onClick={() =>
            void confirm
              .run({
                tier: "confirm",
                destructive: true,
                title: "Cancel Tuesday practice?",
                description: "The practice is removed from the calendar.",
                affected:
                  "The 14 players on the roster are emailed that it is off.",
                verb: "Cancel and notify 14 players",
                cancelLabel: "Keep practice",
                agentConfirm:
                  "Cancels Tuesday's 6:00 PM practice and emails 14 players",
                perform: () => lab.request(() => true),
                success: "Practice cancelled. 14 players were emailed.",
              })
              .then((outcome) => {
                if (outcome.status === "done") setPractice("Cancelled");
              })
          }
          size="sm"
          variant="secondary"
        >
          Cancel practice
        </Button>
      </div>
      <div className={styles.row3}>
        <span>Website: new opening hours · {site}</span>
        <Button
          onClick={() =>
            void confirm
              .run({
                tier: "confirm",
                title: "Publish the website change?",
                description:
                  "The new opening hours go live on your public site.",
                affected: "Anyone visiting the site sees them at once.",
                verb: "Publish opening hours",
                agentConfirm:
                  "Publishes the new opening hours to the public website",
                perform: () => lab.request(() => true),
                success: "Opening hours published",
              })
              .then((outcome) => {
                if (outcome.status === "done") setSite("Published");
              })
          }
          size="sm"
          variant="secondary"
        >
          Publish change
        </Button>
      </div>
      {confirm.dialog}
      <p className={styles.meta}>
        Tier 1: one dialog that says what happens and who is affected; the
        button names the verb. Destructive: focus starts on the safe answer.
      </p>
    </div>
  );
}

export function StrongTierDemo() {
  const lab = useLab();
  const confirm = useConfirm();
  const [refunded, setRefunded] = useState(false);
  const [members, setMembers] = useState(12);
  const [drill, setDrill] = useState(true);
  return (
    <div className={styles.stack}>
      <div className={styles.row3}>
        <span>
          Booking BK-2041 · Jane Doe · $48.00 {refunded ? "· Refunded" : ""}
        </span>
        <Button
          disabled={refunded}
          onClick={() =>
            void confirm
              .run({
                tier: "strong",
                destructive: true,
                title: "Refund this booking?",
                description:
                  "The booking is cancelled and the court slot opens again.",
                amount: "$48.00 (USD)",
                recipients: "Jane Doe, to the card she paid with",
                reference: "BK-2041",
                consequence: "Jane is emailed. A refund cannot be undone.",
                verb: "Refund $48.00",
                cancelLabel: "Keep booking",
                agentConfirm: "Refunds $48.00 to Jane Doe for booking BK-2041",
                perform: () => lab.request(() => true),
                success: "Refunded $48.00 to Jane Doe",
              })
              .then((outcome) => {
                if (outcome.status === "done") setRefunded(true);
              })
          }
          size="sm"
          variant="secondary"
        >
          Refund booking
        </Button>
      </div>
      <div className={styles.row3}>
        <span>Juniors group · {members} members selected</span>
        <Button
          disabled={members === 0}
          onClick={() =>
            void confirm
              .run({
                tier: "strong",
                destructive: true,
                title: `Remove ${members} members from Juniors?`,
                description: "They leave the group and its schedule.",
                scope: `${members} members of Juniors`,
                consequence:
                  "Their upcoming bookings with the group are cancelled.",
                verb: `Remove ${members} members`,
                agentConfirm: `Removes ${members} members from Juniors and cancels their group bookings`,
                bulk: {
                  count: members,
                  noun: "members",
                  typeToConfirm: `remove ${members} members`,
                },
                perform: () => lab.request(() => true),
                success: `${members} members removed from Juniors`,
              })
              .then((outcome) => {
                if (outcome.status === "done") setMembers(0);
              })
          }
          size="sm"
          variant="secondary"
        >
          Remove from group
        </Button>
      </div>
      <div className={styles.row3}>
        <span>Drill: Serve receive {drill ? "" : "· Deleted"}</span>
        <Button
          disabled={!drill}
          onClick={() =>
            void confirm
              .run({
                tier: "confirm",
                destructive: true,
                title: "Delete the Serve receive drill?",
                description:
                  "It is removed from your library and from 3 practice plans.",
                verb: "Delete drill",
                agentConfirm:
                  "Deletes the Serve receive drill from the library",
                perform: () => lab.request(() => true),
                success: "Drill deleted",
              })
              .then((outcome) => {
                if (outcome.status === "done") setDrill(false);
              })
          }
          size="sm"
          variant="secondary"
        >
          Delete
        </Button>
      </div>
      <Button
        onClick={() => {
          setRefunded(false);
          setMembers(12);
          setDrill(true);
        }}
        size="sm"
        variant="ghost"
      >
        Reset examples
      </Button>
      {confirm.dialog}
      <p className={styles.meta}>
        Tier 2 restates the amount, recipients or scope and the reference.
        Typing a phrase is asked only for destructive bulk actions.
      </p>
    </div>
  );
}

export function InlineConfirmDemo() {
  const lab = useLab();
  const confirm = useConfirm({ presentation: "inline" });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Tuesday practice");
  const [deleted, setDeleted] = useState(false);
  return (
    <div className={styles.stack}>
      <Dialog {...confirm.hostProps} onOpenChange={setOpen} open={open}>
        <DialogTrigger variant="secondary">Edit practice</DialogTrigger>
        <DialogContent title="Edit practice">
          <ConfirmSlot confirm={confirm}>
            <Field label="Practice name">
              <Input
                onValueChange={(value) => setName(String(value ?? ""))}
                value={name}
              />
            </Field>
            <DialogActions>
              <Button
                onClick={() =>
                  void confirm
                    .run({
                      tier: "confirm",
                      destructive: true,
                      title: "Delete this practice?",
                      description:
                        "It is removed from the calendar for everyone.",
                      affected: "The 14 players on the roster are emailed.",
                      verb: "Delete and notify 14",
                      cancelLabel: "Keep it",
                      agentConfirm:
                        "Deletes Tuesday practice and emails 14 players",
                      perform: () => lab.request(() => true),
                      success: "Practice deleted",
                    })
                    .then((outcome) => {
                      if (outcome.status === "done") {
                        setDeleted(true);
                        setOpen(false);
                      }
                    })
                }
                variant="danger"
              >
                Delete practice
              </Button>
              <DialogClose>Done</DialogClose>
            </DialogActions>
          </ConfirmSlot>
        </DialogContent>
      </Dialog>
      <p className="td-meta" data-testid="inline-result">
        {deleted ? "Practice deleted" : `Practice: ${name}`}
      </p>
      <p className={styles.meta}>
        Never two dialogs deep: inside a dialog the question replaces its
        content. Escape answers no and keeps the dialog.
      </p>
    </div>
  );
}

export function ProposalDemo() {
  const lab = useLab();
  const confirm = useConfirm();
  const [status, setStatus] = useState<"proposed" | "applied" | "dismissed">(
    "proposed",
  );
  return (
    <div className={styles.stack}>
      <ProposalCard
        actions={
          <>
            <Button
              onClick={() => setStatus("dismissed")}
              size="sm"
              variant="ghost"
            >
              Dismiss
            </Button>
            <Button
              onClick={() =>
                void confirm
                  .run({
                    tier: "confirm",
                    title: "Apply this change?",
                    description:
                      "Tuesday practice moves to Court 3 at 6:30 PM.",
                    affected: "14 players are emailed the new time.",
                    verb: "Apply and notify 14",
                    agentConfirm:
                      "Moves Tuesday practice to Court 3, 6:30 PM, and emails 14 players",
                    perform: () => lab.request(() => true),
                    success: "Practice moved. 14 players were emailed.",
                  })
                  .then((outcome) => {
                    if (outcome.status === "done") setStatus("applied");
                  })
              }
              size="sm"
              variant="primary"
            >
              Review and apply
            </Button>
          </>
        }
        affected="Applying it emails the 14 players on the roster."
        changes={[
          { label: "Court", before: "Court 1", after: "Court 3" },
          { label: "Start", before: "6:00 PM", after: "6:30 PM" },
          { label: "Coach note", after: "Court 1 is being resurfaced" },
        ]}
        reason="Court 1 is closed on Tuesday for resurfacing."
        reference="PR-2041"
        status={status}
        title="Move Tuesday practice to Court 3"
      />
      {status !== "proposed" ? (
        <IconButton
          label="Show the proposal again"
          onClick={() => setStatus("proposed")}
          size="sm"
        >
          <Icon name="refresh" />
        </IconButton>
      ) : null}
      {confirm.dialog}
    </div>
  );
}
