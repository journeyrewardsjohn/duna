import { Chip, Icon } from "@duna/ui/tideline";
import Link from "next/link";
import {
  legalHub,
  legalSearchEntries,
  type LegalHubGroup,
  type LegalHubRow,
} from "./legal-library";
import { LegalSearch } from "./legal-search";
import { DRAFT_NOTICE } from "./legal-status";

/** "Which terms apply to me?": who reads what, by slug, in reading order. */
const guide: readonly {
  readonly who: string;
  readonly note: string;
  readonly slugs: readonly string[];
}[] = [
  {
    who: "I play",
    note: "You agree to the Terms of Service. The fee, booking and privacy documents explain what happens when you book and what Duna keeps.",
    slugs: [
      "terms",
      "fees-and-premium",
      "booking-and-refunds",
      "privacy",
      "acceptable-use",
      "eula",
    ],
  },
  {
    who: "I'm a parent or guardian",
    note: "You agree to the Terms of Service and the Guardian and Youth Terms for yourself and the junior you manage.",
    slugs: [
      "terms",
      "guardians-and-youth",
      "childrens-privacy",
      "privacy",
      "booking-and-refunds",
      "content-and-video",
    ],
  },
  {
    who: "I'm a junior player",
    note: "If you are 13 to 17, a parent or guardian agrees to these with you. Under 13, a guardian manages your account.",
    slugs: [
      "guardians-and-youth",
      "terms",
      "childrens-privacy",
      "acceptable-use",
      "content-and-video",
    ],
  },
  {
    who: "I run a club",
    note: "Your organization agrees to the Duna HQ Terms; taking payments adds the Duna Pay Terms.",
    slugs: [
      "hq-terms",
      "duna-pay",
      "privacy",
      "messaging",
      "acceptable-use",
      "subprocessors",
    ],
  },
  {
    who: "A club invited me as a coach or staff",
    note: "You use Duna HQ under your club's agreement, the Duna HQ Terms. If you also play, the Terms of Service cover you as a player.",
    slugs: [
      "hq-terms",
      "acceptable-use",
      "content-and-video",
      "messaging",
      "privacy",
      "terms",
    ],
  },
];

function Row({ row }: { readonly row: LegalHubRow }) {
  return (
    <li className="lc-row">
      <h3 className="lc-row__title">
        <Link href={row.href}>{row.title}</Link>
      </h3>
      <p className="lc-row__summary">{row.description}</p>
      <p className="lc-row__meta">
        {row.status === "in-effect" ? (
          <Chip tone="positive">In effect</Chip>
        ) : (
          <span className="lc-row__draft">
            <Icon name="info" size="inline" />
            {DRAFT_NOTICE}
          </span>
        )}
        <span>
          {row.dateTime ? (
            <time dateTime={row.dateTime}>{row.dateLabel}</time>
          ) : (
            row.dateLabel
          )}
        </span>
        <span className="td-num">Version {row.version}</span>
      </p>
      {row.draftHref ? (
        <p className="lc-row__revision">
          <Link href={row.draftHref}>
            A revised version is in review: read the draft
          </Link>
        </p>
      ) : null}
    </li>
  );
}

function Group({ group }: { readonly group: LegalHubGroup }) {
  const id = `legal-group-${group.id}`;
  return (
    <section aria-labelledby={id} className="lc-group">
      <h2 className="lc-group__title" id={id}>
        {group.title}
      </h2>
      <ul className="lc-rows">
        {group.rows.map((row) => (
          <Row key={row.slug} row={row} />
        ))}
      </ul>
    </section>
  );
}

export function LegalHub({ lead }: { readonly lead: string }) {
  const groups = legalHub();
  const titles = new Map(
    groups.flatMap((group) =>
      group.rows.map((row) => [row.slug, row] as const),
    ),
  );

  return (
    <main className="lc-main lc-hub" id="legal-content" tabIndex={-1}>
      <header className="lc-hub__header">
        <h1 className="td-display lc-hub__title">Duna Legal Center</h1>
        <p className="lc-hub__lead">{lead}</p>
      </header>

      <LegalSearch entries={legalSearchEntries()} />

      <section aria-labelledby="legal-guide" className="lc-guide">
        <h2 className="lc-group__title" id="legal-guide">
          Which terms apply to me?
        </h2>
        <ul className="lc-guide__list">
          {guide.map((item) => (
            <li key={item.who}>
              <details className="lc-guide__item">
                <summary className="lc-guide__who">
                  <span>{item.who}</span>
                  <Icon
                    className="lc-guide__chevron"
                    name="chevron-down"
                    size="inline"
                  />
                </summary>
                <div className="lc-guide__body">
                  <p>{item.note}</p>
                  <ul>
                    {item.slugs.flatMap((slug) => {
                      const row = titles.get(slug);
                      return row
                        ? [
                            <li key={slug}>
                              <Link href={row.href}>{row.title}</Link>
                              {row.status === "draft" ? (
                                <span className="lc-guide__draft">
                                  {" "}
                                  (draft)
                                </span>
                              ) : null}
                            </li>,
                          ]
                        : [];
                    })}
                  </ul>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      {groups.map((group) => (
        <Group group={group} key={group.id} />
      ))}

      <section aria-labelledby="legal-contact" className="lc-contact">
        <h2 className="lc-group__title" id="legal-contact">
          Questions or requests
        </h2>
        <ul>
          <li>
            Legal notices:{" "}
            <a href="mailto:legal@duna.coach">legal@duna.coach</a>
          </li>
          <li>
            Privacy and data requests:{" "}
            <a href="mailto:privacy@duna.coach">privacy@duna.coach</a>
          </li>
          <li>
            Help with an account or booking:{" "}
            <a href="mailto:support@duna.coach">support@duna.coach</a>
          </li>
        </ul>
      </section>
    </main>
  );
}
