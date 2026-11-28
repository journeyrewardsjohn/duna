"use client";

/**
 * One API for the three confirmation tiers (see `confirm-core.ts`):
 *
 *   const confirm = useConfirm();
 *   …
 *   await confirm.run({ tier: "confirm", title: "Cancel Tuesday practice?", … });
 *   {confirm.dialog}
 *
 * Inside an open Dialog or Sheet, never open a second one: create it with
 * `useConfirm({ presentation: "inline" })`, wrap the dialog's body in
 * `<ConfirmSlot confirm={confirm}>`, and spread `confirm.hostProps` on the
 * outer `Dialog`. The question then replaces the dialog's content.
 */
import {
  AlertDialog as UiAlertDialog,
  AlertDialogBackdrop as UiAlertDialogBackdrop,
  AlertDialogClose as UiAlertDialogClose,
  AlertDialogContent as UiAlertDialogContent,
  AlertDialogDescription as UiAlertDialogDescription,
  AlertDialogTitle as UiAlertDialogTitle,
} from "@ui-sdk/react/alert-dialog";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { riseClassName } from "../motion/verbs";
import { Button } from "../button/button";
import { buttonClassName } from "../button/button-style";
import { Field, Input } from "../field/field";
import {
  createIdempotencyKey,
  errorMessage,
  errorReference,
} from "../interactions/errors";
import { preventKeyRepeat } from "../interactions/kit-hooks";
import {
  type ActionContext,
  createAction,
  type SingleFlightAction,
} from "../interactions/submit-core";
import { errorToast, successToast, undoToast } from "../toast/notify";
import { Checkbox } from "../toggles/toggles";
import {
  type BulkScope,
  confirmProblems,
  initialFocusFor,
  type SecondStep,
  secondStepFor,
  typedMatches,
} from "./confirm-core";

export interface UndoRequest<Result> {
  tier: "undo";
  /** The toast's title, naming what happened: "Drill archived". */
  title: string;
  description?: string;
  /** Makes the change. */
  perform: (context: ActionContext) => Promise<Result>;
  /** Reverses it, on the server, when the person presses Undo. */
  reverse: (result: Result, context: ActionContext) => Promise<unknown>;
  /**
   * Shows the change before the server answers; returns how to put it back.
   * Rolled back if `perform` fails, and when Undo is pressed.
   */
  optimistic?: () => () => void;
  /** How long Undo is on offer (6 s by default; at least 5). */
  windowMs?: number;
  /** Said after Undo: "Drill restored". */
  undoneMessage?: string;
  /** Said if the change fails, in plain words. */
  errorMessage?: string;
  onUndone?: () => void;
  /** Hands unexpected failures to the error reporter. */
  report?: (error: unknown) => void;
}

export interface DialogConfirmRequest<Result> {
  tier: "confirm" | "strong";
  /** The question: "Cancel Tuesday practice?" */
  title: string;
  /** What will happen, in plain words. */
  description: ReactNode;
  /** Who is affected: "14 players on the roster are emailed." */
  affected?: ReactNode;
  /**
   * The confirming button: the verb and its object, never "OK" ("Cancel
   * practice and notify 14"). Make it differ from the button that opened
   * the question, so an agent's press cannot match both.
   */
  verb: string;
  /**
   * What the confirming button does, for the agent bridge
   * (`data-agent-confirm`), written from app state: "Cancels Tuesday's
   * practice and emails 14 players". The agent stops here for a person.
   */
  agentConfirm: string;
  /** Deletes, cancels or takes money back: Cancel gets focus, the button is red. */
  destructive?: boolean;
  /** The safe answer: "Keep practice". */
  cancelLabel?: string;
  /** Tier 2: the amount with its currency, "$48.00". */
  amount?: string;
  /** Tier 2: who receives it or is affected, "Jane Doe". */
  recipients?: ReactNode;
  /** Tier 2: what it covers, "12 members of Juniors". */
  scope?: ReactNode;
  /** Tier 2: what cannot be taken back, "This cannot be undone." */
  consequence?: ReactNode;
  /** The reference of what is acted on, "Booking BK-2041". */
  reference?: string;
  /** Tier 2, destructive bulk only: how many, and the second step. */
  bulk?: BulkScope;
  /** Runs when the person confirms; the dialog stays open, busy, until it settles. */
  perform: (context: ActionContext) => Promise<Result>;
  /** Toast once done: "Practice cancelled. 14 players were emailed." */
  success?: string | ((result: Result) => string);
  /** Said in the dialog if it fails, in plain words. */
  errorMessage?: string;
  report?: (error: unknown) => void;
}

export type ConfirmRequest<Result> =
  UndoRequest<Result> | DialogConfirmRequest<Result>;

export type ConfirmOutcome<Result> =
  | { status: "done"; result: Result }
  | { status: "cancelled" }
  | { status: "failed"; error: unknown };

interface Asking {
  request: DialogConfirmRequest<unknown>;
  /** The control that asked, to take focus back after an inline question. */
  returnFocus: HTMLElement | null;
  resolve: (outcome: ConfirmOutcome<unknown>) => void;
  flight: SingleFlightAction<[], unknown>;
  key: number;
}

export interface UseConfirmOptions {
  /**
   * `dialog` (default) asks in an alert dialog. `inline` asks inside the
   * open dialog or sheet that `ConfirmSlot` sits in, replacing its content.
   */
  presentation?: "dialog" | "inline";
}

export interface UseConfirm {
  /** Asks (tiers 1 and 2) or acts with Undo (tier 0). Never rejects. */
  run: <Result>(
    request: ConfirmRequest<Result>,
  ) => Promise<ConfirmOutcome<Result>>;
  /** Whether a question is showing. */
  open: boolean;
  /** Answers the open question "no". */
  cancel: () => void;
  /** Render once, anywhere, for `presentation: "dialog"`. */
  dialog: ReactNode;
  /**
   * For `presentation: "inline"`, spread on the outer `Dialog`/`Sheet`:
   * while the question shows, Escape and an outside press cancel the
   * question instead of closing the dialog.
   */
  hostProps: {
    dismissible: boolean;
    onDismissAttempt: () => void;
  };
  /** Confirms the open question: what its confirming button does. */
  accept: () => Promise<boolean>;
  /** The open question, for `ConfirmSlot`. */
  asking: Asking | null;
  presentation: "dialog" | "inline";
}

const warn = (problems: string[]) => {
  const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } })
    .process?.env?.NODE_ENV;
  if (env === "production" || problems.length === 0) return;
  console.warn(`[tideline confirm] ${problems.join(" ")}`);
};

/** A modal is already open: a second would be two deep. */
const anotherModalOpen = () =>
  typeof document !== "undefined" &&
  document.querySelector(
    '[data-slot="dialog-content"][data-open], [data-slot="drawer-content"][data-open]',
  ) !== null;

export function useConfirm({
  presentation = "dialog",
}: UseConfirmOptions = {}): UseConfirm {
  const [asking, setAsking] = useState<Asking | null>(null);
  const [, setTick] = useState(0);
  const counter = useRef(0);

  const finish = useCallback((outcome: ConfirmOutcome<unknown>) => {
    setAsking((current) => {
      current?.resolve(outcome);
      return null;
    });
  }, []);

  const runUndo = useCallback(async <Result,>(request: UndoRequest<Result>) => {
    const context: ActionContext = {
      idempotencyKey: createIdempotencyKey(),
      attempt: 1,
      signal: new AbortController().signal,
    };
    const rollback = request.optimistic?.();
    let result: Result;
    try {
      result = await request.perform(context);
    } catch (error) {
      rollback?.();
      request.report?.(error);
      errorToast(
        errorMessage(
          error,
          request.errorMessage ?? "That did not work. Nothing changed.",
        ),
        { reference: errorReference(error) },
      );
      return { status: "failed", error } as ConfirmOutcome<Result>;
    }
    undoToast(request.title, {
      description: request.description,
      windowMs: request.windowMs,
      onUndo: async () => {
        const reverseContext: ActionContext = {
          idempotencyKey: createIdempotencyKey(),
          attempt: 1,
          signal: new AbortController().signal,
        };
        rollback?.();
        try {
          await request.reverse(result, reverseContext);
        } catch (error) {
          // The undo failed: the change stands, on screen too.
          request.optimistic?.();
          request.report?.(error);
          errorToast(
            errorMessage(
              error,
              "Could not undo. The change is still in place.",
            ),
            { reference: errorReference(error) },
          );
          throw error;
        }
        if (request.undoneMessage) successToast(request.undoneMessage);
        request.onUndone?.();
      },
    });
    return { status: "done", result } as ConfirmOutcome<Result>;
  }, []);

  const run = useCallback(
    <Result,>(
      request: ConfirmRequest<Result>,
    ): Promise<ConfirmOutcome<Result>> => {
      if (request.tier === "undo") return runUndo(request);
      warn(confirmProblems(request));
      if (presentation === "dialog" && anotherModalOpen()) {
        warn([
          'A confirmation opened over another dialog. Use useConfirm({ presentation: "inline" }) and ConfirmSlot inside it: never two dialogs deep.',
        ]);
      }
      const returnFocus =
        typeof document === "undefined"
          ? null
          : (document.activeElement as HTMLElement | null);
      return new Promise((resolve) => {
        counter.current += 1;
        const flight = createAction<[], unknown>(
          {
            action: (context) => request.perform(context),
            successHoldMs: 0,
          },
          () => setTick((tick) => tick + 1),
        );
        setAsking((current) => {
          // A question already showing is answered "no" before the next.
          current?.resolve({ status: "cancelled" });
          return {
            request: request as DialogConfirmRequest<unknown>,
            resolve: resolve as (outcome: ConfirmOutcome<unknown>) => void,
            flight,
            key: counter.current,
            returnFocus,
          };
        });
      });
    },
    [presentation, runUndo],
  );

  const cancel = useCallback(() => {
    setAsking((current) => {
      if (!current || current.flight.isPending()) return current;
      current.resolve({ status: "cancelled" });
      return null;
    });
  }, []);

  const confirmRun = useCallback(async () => {
    const current = asking;
    if (!current) return false;
    const outcome = await current.flight.run();
    if (outcome.status === "ignored") return false;
    if (outcome.status === "error") {
      current.request.report?.(outcome.error);
      return false;
    }
    const { success } = current.request;
    const message =
      typeof success === "function" ? success(outcome.result) : success;
    if (message) successToast(message);
    finish({ status: "done", result: outcome.result });
    return true;
  }, [asking, finish]);

  const dialog =
    presentation === "dialog" ? (
      <ConfirmDialogView
        asking={asking}
        onCancel={cancel}
        onConfirm={confirmRun}
      />
    ) : null;

  return {
    run,
    open: asking !== null,
    cancel,
    accept: confirmRun,
    dialog,
    hostProps: {
      dismissible: asking === null,
      // After the refused close has run its course, so the dialog never
      // sees itself dismissible again mid-request.
      onDismissAttempt: () => {
        setTimeout(cancel, 0);
      },
    },
    asking,
    presentation,
  };
}

/** The parts both presentations share: what happens, to whom, at what cost. */
function ConfirmBody({
  request,
  titleId,
  descriptionId,
  asDialog,
  error,
  reference,
  step,
  stepValue,
  onStepChange,
}: {
  request: DialogConfirmRequest<unknown>;
  titleId: string;
  descriptionId: string;
  asDialog: boolean;
  error: unknown;
  reference: string | undefined;
  step: SecondStep;
  stepValue: string | boolean;
  onStepChange: (value: string | boolean) => void;
}) {
  const strong = request.tier === "strong";
  const facts: Array<[string, ReactNode]> = [];
  if (strong && request.amount) facts.push(["Amount", request.amount]);
  if (strong && request.recipients) facts.push(["To", request.recipients]);
  if (strong && request.scope) facts.push(["Covers", request.scope]);
  if (request.reference) facts.push(["Reference", request.reference]);
  const Title = asDialog ? UiAlertDialogTitle : "h3";
  const Description = asDialog ? UiAlertDialogDescription : "div";
  return (
    <>
      <Title className="td-dialog__title td-confirm__title" id={titleId}>
        {request.title}
      </Title>
      <Description
        className="td-dialog__description td-confirm__description"
        id={descriptionId}
      >
        {request.description}
        {request.affected ? <> {request.affected}</> : null}
      </Description>
      {facts.length > 0 ? (
        <dl className="td-confirm__facts">
          {facts.map(([term, value]) => (
            <div className="td-confirm__fact" key={term}>
              <dt>{term}</dt>
              <dd
                className={
                  term === "Reference" ? "td-confirm__code" : undefined
                }
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {strong && request.consequence ? (
        <p className="td-confirm__consequence">
          <Icon name="alert" size="sm" />
          <span>{request.consequence}</span>
        </p>
      ) : null}
      {step?.kind === "type" ? (
        <Field
          className="td-confirm__step"
          hint="This acts on many at once, so it asks twice."
          label={
            <>
              Type <span className="td-confirm__phrase">{step.phrase}</span> to
              confirm
            </>
          }
        >
          <Input
            autoComplete="off"
            data-td-confirm-step=""
            onValueChange={(value) => onStepChange(String(value ?? ""))}
            spellCheck={false}
            value={typeof stepValue === "string" ? stepValue : ""}
          />
        </Field>
      ) : null}
      {step?.kind === "acknowledge" ? (
        <div className="td-confirm__step" data-td-confirm-step="">
          <Checkbox
            checked={stepValue === true}
            label={step.sentence}
            onCheckedChange={(checked) => onStepChange(checked === true)}
          />
        </div>
      ) : null}
      {error ? (
        <div className="td-confirm__error" role="alert">
          <Icon name="alert" size="sm" />
          <div>
            <p>
              {errorMessage(
                error,
                request.errorMessage ??
                  "That did not go through. Nothing changed. Try again.",
              )}
            </p>
            {reference ? (
              <p className="td-confirm__reference">
                Reference: <span className="td-confirm__code">{reference}</span>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function useSecondStep(request: DialogConfirmRequest<unknown> | undefined) {
  const step = request ? secondStepFor(request) : null;
  const [value, setValue] = useState<string | boolean>("");
  const ready =
    step === null
      ? true
      : step.kind === "type"
        ? typedMatches(String(value), step.phrase)
        : value === true;
  return { step, value, setValue, ready };
}

function ConfirmDialogView({
  asking,
  onCancel,
  onConfirm,
}: {
  asking: Asking | null;
  onCancel: () => void;
  onConfirm: () => Promise<boolean>;
}) {
  // Keep the last question while the dialog animates out.
  const [shown, setShown] = useState(asking);
  if (asking && asking !== shown) setShown(asking);
  const request = shown?.request;
  const titleId = useId();
  const descriptionId = useId();
  const content = useRef<HTMLDivElement>(null);
  const { step, value, setValue, ready } = useSecondStep(request);
  useEffect(() => {
    setValue("");
  }, [asking?.key, setValue]);

  const state = shown?.flight.getState();
  const pending = shown?.flight.isPending() ?? false;
  const focus = request ? initialFocusFor(request, step) : "cancel";

  return (
    <UiAlertDialog
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      open={asking !== null}
      pendingAnnouncement={request ? `${request.verb}…` : undefined}
    >
      <UiAlertDialogBackdrop className="td-scrim" />
      <UiAlertDialogContent
        className={cx(
          "td-dialog td-confirm",
          request?.tier === "strong" && "td-confirm--strong",
        )}
        data-tier={request?.tier}
        initialFocus={() =>
          content.current?.querySelector<HTMLElement>(
            focus === "second-step"
              ? "input[data-td-confirm-step], [data-td-confirm-step] input, [data-td-confirm-step] button"
              : focus === "confirm"
                ? "[data-td-confirm-verb]"
                : "[data-td-confirm-cancel]",
          ) ?? null
        }
        ref={content}
      >
        {request ? (
          <>
            <ConfirmBody
              asDialog
              descriptionId={descriptionId}
              error={state?.status === "error" ? state.error : null}
              onStepChange={setValue}
              reference={state?.reference}
              request={request}
              step={step}
              stepValue={value}
              titleId={titleId}
            />
            <div className="td-dialog__actions td-confirm__actions">
              <UiAlertDialogClose
                className={buttonClassName({ variant: "ghost" })}
                data-td-confirm-cancel=""
              >
                {request.cancelLabel ?? "Cancel"}
              </UiAlertDialogClose>
              <UiAlertDialogClose
                action={async () => {
                  const done = await onConfirm();
                  // Keep the dialog open, with the error, until it works.
                  if (!done) throw new Error("not confirmed");
                }}
                aria-busy={pending || undefined}
                className={buttonClassName({
                  variant: request.destructive ? "danger" : "primary",
                })}
                data-agent-confirm={request.agentConfirm}
                data-loading={pending ? "" : undefined}
                data-td-confirm-verb=""
                disabled={!ready}
                onKeyDown={preventKeyRepeat}
                value="confirm"
              >
                {request.verb}
              </UiAlertDialogClose>
            </div>
          </>
        ) : null}
      </UiAlertDialogContent>
    </UiAlertDialog>
  );
}

export interface ConfirmSlotProps {
  /** A `useConfirm({ presentation: "inline" })`. */
  confirm: UseConfirm;
  /** The dialog's normal content, replaced while the question shows. */
  children: ReactNode;
  className?: string;
}

/**
 * Where an inline confirmation appears: inside an open Dialog or Sheet, in
 * place of its content, so a confirmation is never a second dialog on top.
 * Focus moves to the question and back to where it was after; Escape
 * answers "no" and keeps the dialog open (with `hostProps` on it).
 */
export function ConfirmSlot({
  confirm,
  children,
  className,
}: ConfirmSlotProps) {
  const { asking } = confirm;
  const request = asking?.request;
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const { step, value, setValue, ready } = useSecondStep(request);

  useEffect(() => {
    if (!asking) return;
    setValue("");
    const focus = initialFocusFor(
      asking.request,
      secondStepFor(asking.request),
    );
    const target = panel.current?.querySelector<HTMLElement>(
      focus === "second-step"
        ? "input[data-td-confirm-step], [data-td-confirm-step] input, [data-td-confirm-step] button"
        : focus === "confirm"
          ? "[data-td-confirm-verb]"
          : "[data-td-confirm-cancel]",
    );
    target?.focus();
    return () => {
      // Back to the control that asked, if it is still there.
      const back = asking.returnFocus;
      requestAnimationFrame(() => {
        if (back?.isConnected) back.focus();
      });
    };
  }, [asking, setValue]);

  // The dialog's own content stays mounted, hidden, so what was typed in it
  // survives and focus can go back to the control that asked.
  const content = (
    <div
      className="td-confirm-slot"
      hidden={Boolean(asking && request) || undefined}
    >
      {children}
    </div>
  );
  if (confirm.presentation !== "inline" || !asking || !request) {
    return content;
  }
  const state = asking.flight.getState();
  const pending = asking.flight.isPending();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    // Escape belongs to the question, not the dialog around it: no close
    // request reaches the dialog, whatever its dismissible state is by then.
    event.preventDefault();
    event.stopPropagation();
    if (!pending) confirm.cancel();
  };
  return (
    <>
      {content}
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className={cx(
          riseClassName({ short: true }),
          "td-confirm td-confirm--inline",
          request.tier === "strong" && "td-confirm--strong",
          className,
        )}
        data-tier={request.tier}
        onKeyDown={onKeyDown}
        ref={panel}
        role="group"
      >
        <ConfirmBody
          asDialog={false}
          descriptionId={descriptionId}
          error={state.status === "error" ? state.error : null}
          onStepChange={setValue}
          reference={state.reference}
          request={request}
          step={step}
          stepValue={value}
          titleId={titleId}
        />
        <div className="td-dialog__actions td-confirm__actions">
          <Button
            data-td-confirm-cancel=""
            disabled={pending}
            onClick={confirm.cancel}
            variant="ghost"
          >
            {request.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            data-agent-confirm={request.agentConfirm}
            data-td-confirm-verb=""
            disabled={!ready}
            loading={pending}
            onClick={() => {
              void confirm.accept();
            }}
            onKeyDown={preventKeyRepeat}
            variant={request.destructive ? "danger" : "primary"}
          >
            {request.verb}
          </Button>
        </div>
      </div>
    </>
  );
}
