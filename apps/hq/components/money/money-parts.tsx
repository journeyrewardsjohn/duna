import { Chip } from "@duna/ui/tideline";
import Link from "next/link";
import type { ReactNode } from "react";
import type { StateCopy, Tone } from "./money-model";

/** A money amount in Geist Mono with its currency symbol. */
export function Amount({
  children,
  tone,
}: {
  readonly children: string;
  readonly tone?: "out" | "muted";
}) {
  return (
    <span className="money-amount" data-tone={tone}>
      {children}
    </span>
  );
}

/** A state chip: the words first, the tone repeats them. */
export function StateChip({
  copy,
}: {
  readonly copy: Pick<StateCopy, "label" | "tone">;
}) {
  return <Chip tone={copy.tone as Tone}>{copy.label}</Chip>;
}

/** One figure in the balance row. */
export function Figure({
  label,
  value,
  note,
  id,
}: {
  readonly label: string;
  readonly value: string;
  readonly note?: ReactNode;
  readonly id: string;
}) {
  return (
    <div aria-labelledby={`${id}-label`} className="money-figure" role="group">
      <span className="money-figure__label" id={`${id}-label`}>
        {label}
      </span>
      <span className="money-figure__value">{value}</span>
      {note ? <span className="money-figure__note">{note}</span> : null}
    </div>
  );
}

/** A row in a Money list: what, who and when on the left; amount and state on the right. */
export function MoneyRow({
  href,
  title,
  meta,
  amount,
  state,
  trailing,
}: {
  readonly href?: string;
  readonly title: ReactNode;
  readonly meta?: ReactNode;
  readonly amount?: ReactNode;
  readonly state?: ReactNode;
  readonly trailing?: ReactNode;
}) {
  return (
    <li className="money-row">
      <span className="money-row__what">
        {href ? (
          <Link className="money-row__title" href={href}>
            {title}
          </Link>
        ) : (
          <span className="money-row__title">{title}</span>
        )}
        {meta ? <span className="money-row__meta">{meta}</span> : null}
      </span>
      {amount !== undefined ? (
        <span className="money-row__amount">{amount}</span>
      ) : null}
      {state ? <span className="money-row__state">{state}</span> : null}
      {trailing ? (
        <span className="money-row__trailing">{trailing}</span>
      ) : null}
    </li>
  );
}

/** A description list of facts about a sale, payout or dispute. */
export function Facts({
  items,
}: {
  readonly items: readonly {
    readonly label: string;
    readonly value: ReactNode;
    readonly numeric?: boolean;
  }[];
}) {
  return (
    <dl className="money-facts">
      {items.map((item) => (
        <div className="money-facts__item" key={item.label}>
          <dt>{item.label}</dt>
          <dd className={item.numeric ? "money-amount" : undefined}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A section's quiet line when it has nothing to show yet. */
export function Quiet({ children }: { readonly children: ReactNode }) {
  return <p className="money-quiet">{children}</p>;
}
