import type { ReactNode } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { Chip, type TidelineTone } from "../surfaces/surfaces";
import { plainLink, type RenderObjectLink } from "./link";

export interface ObjectHeaderFact {
  readonly label: string;
  /** Numbers and money: pass them already formatted; they set in Geist Mono. */
  readonly value: ReactNode;
  /** Sets the value in the mono numeral face. */
  readonly numeric?: boolean;
}

export interface ObjectHeaderProps {
  /** The object's name: the ONE Jost title on the screen (never a numeral). */
  readonly title: ReactNode;
  /** The list it belongs to: { href: "/money/transactions", label: "Transactions" }. */
  readonly back?: { readonly href: string; readonly label: string };
  /** The object's mark: an avatar, a club mark or an icon tile. */
  readonly mark?: ReactNode;
  /** Draft / Live / Refunded…: words first, the tone only repeats them. */
  readonly status?: {
    readonly label: string;
    readonly tone?: TidelineTone | "neutral";
  };
  /** A line under the title. */
  readonly description?: ReactNode;
  /** Two to five key facts. */
  readonly facts?: readonly ObjectHeaderFact[];
  /** Buttons, primary last (one primary at most). */
  readonly actions?: ReactNode;
  /** A Menu of rarer actions, after the buttons. */
  readonly overflow?: ReactNode;
  /** The object's SubNav. */
  readonly subnav?: ReactNode;
  readonly renderLink?: RenderObjectLink;
  readonly className?: string;
}

/**
 * The top of an open object (S3, ia-hq.md): back link, mark, the one title,
 * a status chip, key facts, actions, then its SubNav. A `header` with a
 * level-1 heading; facts are a description list.
 */
export function ObjectHeader({
  title,
  back,
  mark,
  status,
  description,
  facts,
  actions,
  overflow,
  subnav,
  renderLink = plainLink,
  className,
}: ObjectHeaderProps) {
  return (
    <header className={cx("td-objhead", className)}>
      {back
        ? renderLink({
            href: back.href,
            className: "td-objhead__back",
            children: (
              <>
                <Icon name="chevron-left" size="inline" />
                {back.label}
              </>
            ),
          })
        : null}
      <div className="td-objhead__row">
        {mark ? <div className="td-objhead__mark">{mark}</div> : null}
        <div className="td-objhead__text">
          <div className="td-objhead__titlerow">
            <h1 className="td-display td-objhead__title">{title}</h1>
            {status ? (
              <Chip className="td-objhead__status" tone={status.tone}>
                {status.label}
              </Chip>
            ) : null}
          </div>
          {description ? (
            <p className="td-objhead__description">{description}</p>
          ) : null}
        </div>
        {actions || overflow ? (
          <div className="td-objhead__actions">
            {actions}
            {overflow}
          </div>
        ) : null}
      </div>
      {facts && facts.length > 0 ? (
        <dl className="td-objhead__facts">
          {facts.map((fact) => (
            <div className="td-objhead__fact" key={fact.label}>
              <dt>{fact.label}</dt>
              <dd className={fact.numeric ? "td-objhead__num" : undefined}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {subnav ? <div className="td-objhead__subnav">{subnav}</div> : null}
    </header>
  );
}
