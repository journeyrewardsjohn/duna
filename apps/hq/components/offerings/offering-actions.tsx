"use client";

import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import { report } from "@duna/observability";
import {
  Button,
  ConfirmSlot,
  Dialog,
  DialogActions,
  DialogClose,
  DialogContent,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Notice,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  duplicateOfferingAction,
  setOfferingStatusAction,
} from "@/app/(next)/(hq)/offerings/actions";
import { unwrap } from "../money/money-action-result";
import type { ChecklistItem, OfferingStatus } from "./offering-model";

/**
 * The offering's actions: one Publish (Draft → Live) with a checklist of
 * what is missing, each item fixed in place; Take offline; Duplicate;
 * Archive (Undo for 6 seconds) and Restore. Publishing is the confirm tier:
 * a person confirms, and players can book it from then on.
 */
export function OfferingActions({
  itemId,
  title,
  status,
  checklist,
  canWrite,
}: {
  readonly itemId: string;
  readonly title: string;
  readonly status: OfferingStatus;
  readonly checklist: readonly ChecklistItem[];
  readonly canWrite: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const inline = useConfirm({ presentation: "inline" });
  const [open, setOpen] = useState(false);
  const blocking = checklist.filter((item) => item.blocking && !item.done);
  const failed = (error: unknown) =>
    void report(error, { event: "hq.offerings.status_failed" });

  const duplicate = useAction(
    async ({ idempotencyKey }) =>
      unwrap(await duplicateOfferingAction({ itemId, idempotencyKey })),
    {
      messages: {
        success: `A draft copy of ${title} is ready`,
        error: "The copy wasn't made.",
      },
      report: failed,
      onSuccess: (result) =>
        router.push(hqHref("offering", { itemId: result.id })),
    },
  );

  const setStatus = (next: OfferingStatus) =>
    setOfferingStatusAction({
      itemId,
      status: next,
      idempotencyKey: crypto.randomUUID(),
    });

  if (!canWrite) return null;

  const archive = () =>
    void confirm
      .run({
        tier: "undo",
        title: `${title} archived`,
        undoneMessage: `${title} is back as a draft`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await setOfferingStatusAction({
              itemId,
              status: "archived",
              idempotencyKey,
            }),
          ),
        reverse: async () => unwrap(await setStatus("draft")),
        onUndone: () => router.refresh(),
        report: failed,
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });

  return (
    <>
      {status === "draft" ? (
        <Button onClick={() => setOpen(true)} variant="primary">
          Publish
        </Button>
      ) : null}
      {status === "active" ? (
        <Button
          onClick={() =>
            void confirm
              .run({
                tier: "confirm",
                title: `Take ${title} offline?`,
                description:
                  "Players can't book it until you publish it again. Bookings already made stay.",
                verb: `Take ${title} offline`,
                cancelLabel: "Keep it live",
                agentConfirm: `Takes ${title} offline so new players can't book it`,
                perform: async ({ idempotencyKey }) =>
                  unwrap(
                    await setOfferingStatusAction({
                      itemId,
                      status: "draft",
                      idempotencyKey,
                    }),
                  ),
                success: `${title} is offline`,
                report: failed,
              })
              .then((outcome) => {
                if (outcome.status === "done") router.refresh();
              })
          }
          variant="secondary"
        >
          Take offline
        </Button>
      ) : null}
      {status === "archived" ? (
        <Button
          onClick={() =>
            void setStatus("draft").then((result) => {
              if (result.ok) router.refresh();
            })
          }
          variant="secondary"
        >
          Restore as a draft
        </Button>
      ) : null}
      <Menu
        onAction={(value) => {
          if (value === "duplicate") void duplicate.run();
          if (value === "archive") archive();
        }}
      >
        <MenuTrigger aria-label={`More for ${title}`} iconOnly variant="ghost">
          <Icon name="more" />
        </MenuTrigger>
        <MenuContent>
          <MenuItem value="duplicate">Duplicate</MenuItem>
          {status !== "archived" ? (
            <MenuItem value="archive">Archive</MenuItem>
          ) : null}
        </MenuContent>
      </Menu>
      {confirm.dialog}
      <Dialog {...inline.hostProps} onOpenChange={setOpen} open={open}>
        <DialogContent
          description={
            blocking.length === 0
              ? "Everything players need is here."
              : `${blocking.length} thing${blocking.length === 1 ? "" : "s"} to do first.`
          }
          title={`Publish ${title}`}
        >
          <ConfirmSlot confirm={inline}>
            <ul aria-label="Before it goes live" className="of-checklist">
              {checklist.map((item) => (
                <li data-done={item.done || undefined} key={item.id}>
                  <Icon
                    name={
                      item.done ? "check" : item.blocking ? "alert" : "info"
                    }
                    size="inline"
                  />
                  <span className="of-checklist__text">
                    <span>
                      {item.label}
                      {!item.done && !item.blocking ? " (optional)" : ""}
                    </span>
                    {item.detail ? (
                      <span className="pt-quiet">{item.detail}</span>
                    ) : null}
                  </span>
                  {!item.done && item.href ? (
                    <Link
                      className="of-inline-link"
                      href={item.href}
                      onClick={() => setOpen(false)}
                    >
                      {item.fixLabel ?? "Fix"}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
            {blocking.length > 0 ? (
              <Notice tone="info" title="It stays a draft until these are done">
                Nothing is lost: fix each one, then publish from here.
              </Notice>
            ) : null}
            <DialogActions>
              <DialogClose>Not yet</DialogClose>
              <Button
                disabled={blocking.length > 0}
                onClick={() =>
                  void inline
                    .run({
                      tier: "confirm",
                      title: `Publish ${title}?`,
                      description:
                        "It appears on your club's page and players can book it.",
                      verb: `Publish ${title}`,
                      cancelLabel: "Not yet",
                      agentConfirm: `Publishes ${title} so players can book it`,
                      perform: async ({ idempotencyKey }) =>
                        unwrap(
                          await setOfferingStatusAction({
                            itemId,
                            status: "active",
                            idempotencyKey,
                          }),
                        ),
                      success: `${title} is live`,
                      report: failed,
                    })
                    .then((outcome) => {
                      if (outcome.status === "done") {
                        setOpen(false);
                        router.refresh();
                      }
                    })
                }
                variant="primary"
              >
                Publish now
              </Button>
            </DialogActions>
          </ConfirmSlot>
        </DialogContent>
      </Dialog>
    </>
  );
}
