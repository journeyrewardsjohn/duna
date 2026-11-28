"use client";

import type { TeamPayLine, TeamPayRun } from "@duna/api";
import { formatMoney } from "@duna/core";
import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  Chip,
  ConfirmSlot,
  Dialog,
  DialogContent,
  Field,
  Input,
  MoneyInput,
  Notice,
  RadioGroup,
  RadioOption,
  RallyOnChange,
  Rise,
  Select,
  useConfirm,
} from "@duna/ui/tideline";
import Link from "next/link";
import { useState } from "react";
import {
  adjustLineAction,
  approvePayRunAction,
  cancelPayRunAction,
  exportPayRunAction,
  reloadPayRunAction,
} from "@/app/(next)/(hq)/team/actions";
import { unwrap } from "../money/money-action-result";
import {
  classificationLabel,
  dateSpanWords,
  firstName,
  hoursWords,
  lineMethodWords,
  payRunStatusCopy,
  runCanExport,
  runIsOpen,
} from "./team-model";

type Format = "csv" | "gusto" | "adp" | "quickbooks";
const formats: readonly { value: Format; label: string }[] = [
  { value: "csv", label: "Payroll file (CSV)" },
  { value: "gusto", label: "Gusto layout" },
  { value: "adp", label: "ADP layout" },
  { value: "quickbooks", label: "QuickBooks layout" },
];

function money(value: { amountMinor: number; currency: string }): string {
  return formatMoney(value.amountMinor, value.currency);
}

function signed(value: { amountMinor: number; currency: string }): string {
  const text = formatMoney(Math.abs(value.amountMinor), value.currency);
  return value.amountMinor < 0 ? `−${text}` : `+${text}`;
}

function stamp(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** Add a labelled adjustment to one line (a bonus or a deduction). */
function AdjustDialog({
  line,
  open,
  onOpenChange,
  onDone,
}: {
  readonly line: TeamPayLine;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDone: (line: TeamPayLine) => void;
}) {
  const confirm = useConfirm({ presentation: "inline" });
  const [direction, setDirection] = useState<"add" | "take">("add");
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const currency = line.earnings.currency;
  const name = line.staff.displayName;
  const problem =
    amount === null || amount <= 0
      ? "Enter the amount."
      : reason.trim().length < 3
        ? "Say why, in a few words. It shows on the line and in the payroll file."
        : undefined;
  return (
    <Dialog onOpenChange={onOpenChange} open={open} {...confirm.hostProps}>
      <DialogContent
        description={`${name}'s line is ${money(line.total)} now.`}
        title={`Adjust ${firstName(name)}'s pay`}
      >
        <ConfirmSlot confirm={confirm}>
          <form
            className="team-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              setTouched(true);
              if (problem || amount === null) return;
              const value = {
                amountMinor: direction === "add" ? amount : -amount,
                currency,
              };
              void confirm
                .run({
                  tier: "strong",
                  title: `${direction === "add" ? "Add" : "Take off"} ${money({ amountMinor: amount, currency })} for ${firstName(name)}?`,
                  description: `“${reason.trim()}” is added to ${firstName(name)}'s line. A line can't go below zero.`,
                  amount: `${signed(value)} (${currency})`,
                  recipients: name,
                  consequence:
                    "You can change it again until the run is approved.",
                  verb:
                    direction === "add"
                      ? "Add to the line"
                      : "Take off the line",
                  cancelLabel: "Don't adjust",
                  agentConfirm: `Adjusts ${name}'s pay-run line by ${signed(value)}: ${reason.trim()}`,
                  perform: async () =>
                    unwrap(
                      await adjustLineAction({
                        lineId: line.id,
                        adjustments: [
                          ...line.adjustments,
                          { label: reason.trim(), amount: value },
                        ],
                      }),
                    ),
                  success: `${firstName(name)}'s line adjusted`,
                })
                .then((outcome) => {
                  if (outcome.status === "done") {
                    onDone(outcome.result as TeamPayLine);
                    onOpenChange(false);
                    setAmount(null);
                    setReason("");
                    setTouched(false);
                  }
                });
            }}
          >
            <RadioGroup
              aria-label="Add or take off"
              inline
              onValueChange={(value) => setDirection(value as "add" | "take")}
              value={direction}
            >
              <RadioOption label="Add (a bonus)" value="add" />
              <RadioOption label="Take off (a deduction)" value="take" />
            </RadioGroup>
            <Field label="Amount">
              <MoneyInput
                currency={currency}
                onValueChange={setAmount}
                value={amount}
              />
            </Field>
            <Field
              error={touched ? problem : undefined}
              hint="Shown on the line and in the payroll file."
              label="Why"
            >
              <Input
                maxLength={120}
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder="Covered the Saturday clinic"
                value={reason}
              />
            </Field>
            <div className="team-form__actions">
              <Button onClick={() => onOpenChange(false)} variant="ghost">
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Review the adjustment
              </Button>
            </div>
          </form>
        </ConfirmSlot>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A pay run as an open object (TM-PayRun): every line with its sessions,
 * hours, earnings, adjustments and total; adjust a line with a reason;
 * approve (strong: the totals, the people, approval is final); export the
 * payroll file (a signed link that lasts 15 minutes, with who exported it
 * and when). Nothing here sends money.
 */
export function PayRunView({
  initial,
  canWrite,
  timeZone,
  viewerName,
}: {
  readonly initial: TeamPayRun;
  readonly canWrite: boolean;
  readonly timeZone: string;
  readonly viewerName: string;
}) {
  const confirm = useConfirm();
  const [run, setRun] = useState<TeamPayRun>(initial);
  const [adjusting, setAdjusting] = useState<TeamPayLine>();
  const [format, setFormat] = useState<Format>("csv");
  const [download, setDownload] = useState<{
    url: string;
    at: string;
    rows: number;
  }>();
  const status = payRunStatusCopy(run.status);
  const open = runIsOpen(run.status);
  const people = run.lines.map((line) => line.staff.displayName);
  const span = dateSpanWords(run.payPeriod.startsOn, run.payPeriod.endsOn);
  const totals = `Contractors ${money(run.contractorTotal)} and employees ${money(run.employeeTotal)}`;

  const lineDone = async (line: TeamPayLine) => {
    setRun((current) => ({
      ...current,
      lines: current.lines.map((row) => (row.id === line.id ? line : row)),
    }));
    const fresh = await reloadPayRunAction({ payRunId: run.id });
    if (fresh.ok && fresh.data.id === run.id) {
      setRun((current) => ({
        ...current,
        contractorTotal: fresh.data.contractorTotal,
        employeeTotal: fresh.data.employeeTotal,
      }));
    }
  };

  const approve = () =>
    void confirm
      .run({
        tier: "strong",
        title: `Approve pay for ${span}?`,
        description: `${people.length} ${people.length === 1 ? "person" : "people"} at the amounts below. Then export the file for your payroll.`,
        amount: totals,
        recipients: people.join(", "),
        consequence:
          "Approval is final: an approved run never changes. A correction is a new run that pays only what is new. Duna doesn't pay anyone.",
        reference: `Pay run ${run.revision}, ${span}`,
        verb: "Approve the pay run",
        cancelLabel: "Keep reviewing",
        agentConfirm: `Approves the team pay run for ${span}: ${totals}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await approvePayRunAction({ payRunId: run.id, idempotencyKey }),
          ),
        success: "Pay run approved. Export it for your payroll.",
      })
      .then((outcome) => {
        if (outcome.status === "done") setRun(outcome.result as TeamPayRun);
      });

  const cancel = () =>
    void confirm
      .run({
        tier: "confirm",
        destructive: true,
        title: `Cancel this pay run for ${span}?`,
        description:
          "It won't be approved or exported. You can work out pay for the period again.",
        verb: "Cancel the pay run",
        cancelLabel: "Keep it",
        agentConfirm: `Cancels the team pay run for ${span}`,
        perform: async () =>
          unwrap(await cancelPayRunAction({ payRunId: run.id })),
        success: "Pay run cancelled",
      })
      .then((outcome) => {
        if (outcome.status === "done") setRun(outcome.result as TeamPayRun);
      });

  const exportRun = () => {
    const label =
      formats.find((item) => item.value === format)?.label ?? format;
    void confirm
      .run({
        tier: "confirm",
        title: `Create the ${label.toLocaleLowerCase()}?`,
        description: `A file of every line in this run, for your own payroll provider or accountant. Nothing is sent and no one is paid.`,
        affected:
          "Duna records that you exported it, and when. The download link lasts 15 minutes.",
        verb: "Create the file",
        cancelLabel: "Not now",
        agentConfirm: `Creates the payroll export (${format}) for the team pay run ${span}`,
        perform: async () =>
          unwrap(await exportPayRunAction({ payRunId: run.id, format })),
        success: "Payroll file ready to download",
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          const made = outcome.result as {
            downloadUrl: string;
            createdAt: string;
            rowCount: number;
          };
          setDownload({
            url: made.downloadUrl,
            at: made.createdAt,
            rows: made.rowCount,
          });
          if (run.status === "approved")
            setRun((current) => ({ ...current, status: "exported" }));
        }
      });
  };

  return (
    <div className="team-run">
      <dl aria-label="Totals" className="team-figures">
        <div className="team-figure">
          <dt>Status</dt>
          <dd>
            <RallyOnChange value={run.status}>
              <Chip tone={status.tone}>{status.label}</Chip>
            </RallyOnChange>
          </dd>
        </div>
        <div className="team-figure">
          <dt>Contractors (1099)</dt>
          <dd className="team-num">{money(run.contractorTotal)}</dd>
        </div>
        <div className="team-figure">
          <dt>Employees (W-2)</dt>
          <dd className="team-num">{money(run.employeeTotal)}</dd>
        </div>
        <div className="team-figure">
          <dt>People</dt>
          <dd className="team-num">{run.lines.length}</dd>
        </div>
      </dl>

      {run.status === "draft" || run.status === "computing" ? (
        <Notice role="status" tone="info">
          Duna is still working this run out. Reload in a moment.
        </Notice>
      ) : null}
      {run.status === "approved" || run.status === "exported" ? (
        <Notice role="status" tone="positive" title="Approved">
          {run.approvedBy
            ? `Approved by ${run.approvedBy.displayName}${run.approvedAt ? ` on ${stamp(run.approvedAt, timeZone)}` : ""}. It can't change now.`
            : "This run is approved and can't change now."}
        </Notice>
      ) : null}

      <section
        aria-labelledby="run-lines-title"
        className="hqs-section"
        data-flush
      >
        <div className="hqs-section__head">
          <h2 className="hqs-section__title" id="run-lines-title">
            Every line
          </h2>
        </div>
        <div className="hqs-section__body">
          {run.lines.length === 0 ? (
            <p className="team-quiet">
              Nobody delivered a paid session in this period.
            </p>
          ) : (
            <ul aria-label="Pay run lines" className="team-lines">
              {run.lines.map((line) => (
                <li className="team-line" key={line.id}>
                  <div className="team-row__who">
                    <Link
                      className="team-row__name"
                      href={hqHref("teamMemberPay", {
                        personId: line.staff.personId,
                      })}
                    >
                      {line.staff.displayName}
                    </Link>
                    <span className="team-quiet">
                      {`${classificationLabel(line.classification)} · ${lineMethodWords(line.method)}`}
                    </span>
                  </div>
                  <dl className="team-line__figures">
                    <div>
                      <dt>Sessions</dt>
                      <dd className="team-num">{line.sessionsCount}</dd>
                    </div>
                    <div>
                      <dt>Time</dt>
                      <dd className="team-num">
                        {hoursWords(line.minutesWorked)}
                      </dd>
                    </div>
                    <div>
                      <dt>Earned</dt>
                      <dd className="team-num">{money(line.earnings)}</dd>
                    </div>
                    <div>
                      <dt>Total</dt>
                      <dd className="team-num team-line__total">
                        <RallyOnChange value={line.total.amountMinor}>
                          {money(line.total)}
                        </RallyOnChange>
                      </dd>
                    </div>
                  </dl>
                  {line.adjustments.length > 0 ? (
                    <ul
                      aria-label="Adjustments"
                      className="team-line__adjustments"
                    >
                      {line.adjustments.map((adjustment, index) => (
                        <li key={`${adjustment.label}-${index}`}>
                          <span>{adjustment.label}</span>
                          <span className="team-num">
                            {signed(adjustment.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {canWrite && open ? (
                    <div className="team-row__actions">
                      <Button
                        onClick={() => setAdjusting(line)}
                        size="sm"
                        variant="ghost"
                      >
                        {`Adjust ${firstName(line.staff.displayName)}'s pay`}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="team-quiet">
            Each line pays the sessions the person delivered in the period
            (ended, not cancelled), at the pay they had on each day.
          </p>
        </div>
      </section>

      {canWrite && open ? (
        <div className="team-form__actions team-form__actions--start">
          <Button onClick={approve} variant="primary">
            Approve the pay run
          </Button>
          <Button onClick={cancel} variant="ghost">
            Cancel the run
          </Button>
        </div>
      ) : null}

      {runCanExport(run.status) ? (
        <section aria-labelledby="run-export-title" className="hqs-section">
          <div className="hqs-section__head">
            <h2 className="hqs-section__title" id="run-export-title">
              Export for payroll
            </h2>
          </div>
          <div className="hqs-section__body">
            <p className="team-body">
              The file is for your own payroll provider or accountant. Duna
              doesn&apos;t send it anywhere or pay anyone.
            </p>
            {canWrite ? (
              <div className="team-inline-form">
                <Field label="Layout">
                  <Select
                    onValueChange={(value) =>
                      value && setFormat(value as Format)
                    }
                    options={formats.map((item) => ({
                      value: item.value,
                      label: item.label,
                    }))}
                    value={format}
                  />
                </Field>
                <Button onClick={exportRun} variant="secondary">
                  Create the file
                </Button>
              </div>
            ) : null}
            {download ? (
              <Rise from="top">
                <p className="team-download">
                  <Icon name="success" size="inline" />
                  <a
                    className="team-link"
                    download
                    href={download.url}
                    rel="noreferrer"
                  >
                    {`Download the file (${download.rows} ${download.rows === 1 ? "row" : "rows"})`}
                  </a>
                  <span className="team-quiet">
                    {`Exported by ${viewerName}, ${stamp(download.at, timeZone)}. The link lasts 15 minutes.`}
                  </span>
                </p>
              </Rise>
            ) : null}
            {run.exports.length > 0 ? (
              <ul aria-label="Earlier exports" className="team-list">
                {run.exports.map((row) => (
                  <li className="team-schedule" key={row.id}>
                    <div className="team-row__who">
                      <span className="team-row__name">
                        {formats.find((item) => item.value === row.format)
                          ?.label ?? row.format}
                      </span>
                      <span className="team-quiet">
                        {`Exported by ${row.createdBy.displayName}, ${stamp(row.createdAt, timeZone)} · ${row.rowCount} rows`}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}

      {adjusting ? (
        <AdjustDialog
          line={adjusting}
          onDone={(line) => void lineDone(line)}
          onOpenChange={(value) => {
            if (!value) setAdjusting(undefined);
          }}
          open
        />
      ) : null}
      {confirm.dialog}
    </div>
  );
}
