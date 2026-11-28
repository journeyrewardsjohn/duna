import type { ReactNode } from "react";
import { cx } from "../base/cx";
import { Icon, type IconName } from "../base/icons";
import { plainLink, type RenderObjectLink } from "./link";
import {
  type SectionMark,
  sectionMarkLabel,
  sectionProgress,
} from "./object-core";

export interface SectionNavItem {
  readonly id: string;
  readonly label: string;
  /** A route, or `#id` for a section on the same page. */
  readonly href: string;
  readonly mark?: SectionMark;
  /** One quiet line under the label. */
  readonly description?: ReactNode;
}

export interface SectionNavGroup {
  /** A quiet group label; leave it out for a single group. */
  readonly label?: string;
  readonly items: readonly SectionNavItem[];
}

export interface SectionNavProps {
  /** Names the navigation landmark: "Duna Pay setup". */
  readonly label: string;
  readonly groups: readonly SectionNavGroup[];
  /** The id of the current item (`aria-current`). */
  readonly current?: string;
  /** Shows "2 of 4 done" from the marks. */
  readonly showProgress?: boolean;
  readonly renderLink?: RenderObjectLink;
  readonly className?: string;
}

const markIcons: Record<SectionMark, IconName> = {
  done: "success",
  "in-progress": "clock",
  "not-started": "minus",
  attention: "alert",
};

/**
 * The sections of a settings area or a setup flow (S3, ia-hq.md): a grouped
 * list with a completion mark per item and optional progress. Beside the
 * form on wide screens; a row of steps that scrolls on a phone. Marks are
 * an icon and words, never colour alone.
 */
export function SectionNav({
  label,
  groups,
  current,
  showProgress = false,
  renderLink = plainLink,
  className,
}: SectionNavProps) {
  const progress = showProgress
    ? sectionProgress(groups.flatMap((group) => group.items.map((i) => i.mark)))
    : undefined;
  return (
    <nav aria-label={label} className={cx("td-sectionnav", className)}>
      {progress ? (
        <p className="td-sectionnav__progress">
          <span className="td-num">{progress.label}</span>
          <span
            aria-hidden="true"
            className="td-sectionnav__bar"
            style={
              {
                "--td-sectionnav-fill": `${(progress.done / progress.total) * 100}%`,
              } as React.CSSProperties
            }
          />
        </p>
      ) : null}
      {groups.map((group, index) => (
        <div className="td-sectionnav__group" key={group.label ?? index}>
          {group.label ? (
            <p className="td-sectionnav__group-label">{group.label}</p>
          ) : null}
          <ul className="td-sectionnav__list">
            {group.items.map((item) => (
              <li
                className="td-sectionnav__item"
                data-mark={item.mark}
                key={item.id}
              >
                {renderLink({
                  href: item.href,
                  className: "td-sectionnav__link",
                  "aria-current":
                    item.id === current
                      ? item.href.startsWith("#")
                        ? "location"
                        : "page"
                      : undefined,
                  "data-nav-id": item.id,
                  children: (
                    <>
                      {item.mark ? (
                        <span
                          className="td-sectionnav__mark"
                          data-mark={item.mark}
                        >
                          <Icon name={markIcons[item.mark]} size="inline" />
                          <span className="td-sr">
                            {sectionMarkLabel(item.mark)}:{" "}
                          </span>
                        </span>
                      ) : null}
                      <span className="td-sectionnav__text">
                        <span className="td-sectionnav__label">
                          {item.label}
                        </span>
                        {item.description ? (
                          <span className="td-sectionnav__description">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                    </>
                  ),
                })}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
