"use client";

import { formatMoney, type EventDivisionSummary } from "@duna/core";
import { Numeric } from "@duna/ui";
import {
  ArrowRight,
  Check,
  ChevronRight,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

interface DivisionFacet {
  readonly value: string;
  readonly label: string;
}

function words(value: string | undefined, fallback = "Open") {
  return value
    ? value
        .replaceAll("-", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

function ageFacet(division: EventDivisionSummary): DivisionFacet {
  if (division.ageMinimum === undefined && division.ageMaximum === undefined) {
    return { value: "all", label: "All ages" };
  }
  if (division.ageMaximum !== undefined && division.ageMinimum === undefined) {
    return {
      value: `u${division.ageMaximum}`,
      label: `${division.ageMaximum}U`,
    };
  }
  if (division.ageMinimum !== undefined && division.ageMaximum !== undefined) {
    return {
      value: `${division.ageMinimum}-${division.ageMaximum}`,
      label: `${division.ageMinimum}–${division.ageMaximum}`,
    };
  }
  return {
    value: `${division.ageMinimum}+`,
    label: `${division.ageMinimum}+`,
  };
}

const levelMatchers = [
  "Open",
  "Premier",
  "Elite",
  "AAA",
  "AA",
  "Advanced",
  "A",
  "Intermediate",
  "BB",
  "B",
  "Novice",
] as const;

function levelFacet(division: EventDivisionSummary): DivisionFacet {
  const match = levelMatchers.find((candidate) =>
    new RegExp(`(^|\\s)${candidate}(?=\\s|$)`, "i").test(division.name),
  );
  if (match) return { value: match.toLowerCase(), label: match };
  if (
    division.ratingMinimum !== undefined ||
    division.ratingMaximum !== undefined
  ) {
    const label =
      division.ratingMinimum !== undefined &&
      division.ratingMaximum !== undefined
        ? `${division.ratingMinimum.toFixed(2)}–${division.ratingMaximum.toFixed(2)}`
        : division.ratingMinimum !== undefined
          ? `${division.ratingMinimum.toFixed(2)}+`
          : `Up to ${division.ratingMaximum!.toFixed(2)}`;
    return { value: label, label };
  }
  return { value: division.name.toLowerCase(), label: division.name };
}

function formatFacet(division: EventDivisionSummary): DivisionFacet {
  const value = `${division.teamFormat ?? division.discipline}:${division.gender ?? "open"}:${division.surface ?? "sand"}`;
  return {
    value,
    label: `${words(division.teamFormat ?? division.discipline)} · ${words(division.gender)}`,
  };
}

function price(value: EventDivisionSummary["price"]) {
  return value.amountMinor === 0
    ? "Free"
    : formatMoney(value.amountMinor, value.currency);
}

function ratingLabel(division: EventDivisionSummary) {
  if (
    division.ratingMinimum !== undefined &&
    division.ratingMaximum !== undefined
  ) {
    return `${division.ratingMinimum.toFixed(2)}–${division.ratingMaximum.toFixed(2)}`;
  }
  if (division.ratingMinimum !== undefined) {
    return `${division.ratingMinimum.toFixed(2)}+`;
  }
  if (division.ratingMaximum !== undefined) {
    return `Up to ${division.ratingMaximum.toFixed(2)}`;
  }
  return "Open rating";
}

function uniqueFacets(
  divisions: readonly EventDivisionSummary[],
  selector: (division: EventDivisionSummary) => DivisionFacet,
) {
  return [
    ...new Map(
      divisions.map((item) => {
        const facet = selector(item);
        return [facet.value, facet] as const;
      }),
    ).values(),
  ];
}

export function EventDivisionExplorer({
  divisions,
  eventSlug,
}: {
  readonly divisions: readonly EventDivisionSummary[];
  readonly eventSlug: string;
}) {
  const [age, setAge] = useState("all-options");
  const [level, setLevel] = useState("all-options");
  const [format, setFormat] = useState("all-options");
  const ages = useMemo(() => uniqueFacets(divisions, ageFacet), [divisions]);
  const levels = useMemo(
    () => uniqueFacets(divisions, levelFacet),
    [divisions],
  );
  const formats = useMemo(
    () => uniqueFacets(divisions, formatFacet),
    [divisions],
  );

  const matches = (
    division: EventDivisionSummary,
    ignored?: "age" | "level" | "format",
  ) =>
    (ignored === "age" ||
      age === "all-options" ||
      ageFacet(division).value === age) &&
    (ignored === "level" ||
      level === "all-options" ||
      levelFacet(division).value === level) &&
    (ignored === "format" ||
      format === "all-options" ||
      formatFacet(division).value === format);

  const filtered = divisions.filter((division) => matches(division));
  const isFiltered =
    age !== "all-options" ||
    level !== "all-options" ||
    format !== "all-options";

  const renderFacet = (
    label: string,
    value: string,
    setValue: (next: string) => void,
    options: readonly DivisionFacet[],
    selector: (division: EventDivisionSummary) => DivisionFacet,
    ignored: "age" | "level" | "format",
  ) => (
    <fieldset className="division-explorer__facet">
      <legend>{label}</legend>
      <div role="list">
        <button
          aria-pressed={value === "all-options"}
          onClick={() => setValue("all-options")}
          type="button"
        >
          All{" "}
          <small>
            {divisions.filter((item) => matches(item, ignored)).length}
          </small>
        </button>
        {options.map((option) => {
          const count = divisions.filter(
            (division) =>
              matches(division, ignored) &&
              selector(division).value === option.value,
          ).length;
          return (
            <button
              aria-pressed={value === option.value}
              disabled={count === 0}
              key={option.value}
              onClick={() => setValue(option.value)}
              type="button"
            >
              {option.label} <small>{count}</small>
            </button>
          );
        })}
      </div>
    </fieldset>
  );

  return (
    <div className="division-explorer">
      <div className="division-explorer__filters">
        <div className="division-explorer__filter-heading">
          <span>
            <SlidersHorizontal aria-hidden size={18} /> Quick find
          </span>
          <strong>
            {filtered.length} {filtered.length === 1 ? "division" : "divisions"}
          </strong>
          {isFiltered && (
            <button
              onClick={() => {
                setAge("all-options");
                setLevel("all-options");
                setFormat("all-options");
              }}
              type="button"
            >
              Clear
            </button>
          )}
        </div>
        {ages.length > 1 &&
          renderFacet("Age group", age, setAge, ages, ageFacet, "age")}
        {levels.length > 1 &&
          renderFacet("Level", level, setLevel, levels, levelFacet, "level")}
        {formats.length > 1 &&
          renderFacet(
            "Format",
            format,
            setFormat,
            formats,
            formatFacet,
            "format",
          )}
      </div>

      {ages.length > 1 && levels.length > 1 && (
        <div className="division-explorer__matrix-wrap">
          <div className="division-explorer__matrix-label">
            <strong>Division matrix</strong>
            <small>Pick an age and level combination</small>
          </div>
          <div
            className="division-explorer__matrix"
            style={{
              gridTemplateColumns: `minmax(7.5rem, 1.1fr) repeat(${ages.length}, minmax(6.5rem, 1fr))`,
            }}
          >
            <span />
            {ages.map((ageOption) => (
              <strong key={ageOption.value}>{ageOption.label}</strong>
            ))}
            {levels.flatMap((levelOption) => [
              <strong key={`${levelOption.value}:label`}>
                {levelOption.label}
              </strong>,
              ...ages.map((ageOption) => {
                const options = divisions.filter(
                  (division) =>
                    ageFacet(division).value === ageOption.value &&
                    levelFacet(division).value === levelOption.value,
                );
                return options.length > 0 ? (
                  <button
                    aria-label={`Show ${ageOption.label} ${levelOption.label}`}
                    aria-pressed={
                      age === ageOption.value && level === levelOption.value
                    }
                    key={`${levelOption.value}:${ageOption.value}`}
                    onClick={() => {
                      setAge(ageOption.value);
                      setLevel(levelOption.value);
                    }}
                    type="button"
                  >
                    <span>{options.length}</span>
                    <small>
                      {Math.min(...options.map((item) => item.spotsRemaining))}{" "}
                      spots
                    </small>
                  </button>
                ) : (
                  <span
                    aria-hidden
                    className="division-explorer__matrix-empty"
                    key={`${levelOption.value}:${ageOption.value}`}
                  >
                    —
                  </span>
                );
              }),
            ])}
          </div>
        </div>
      )}

      <div className="division-explorer__results" aria-live="polite">
        {filtered.map((division) => (
          <article key={division.id}>
            <header>
              <span>
                <small>{ageFacet(division).label}</small>
                <small>{levelFacet(division).label}</small>
              </span>
              <strong className={division.spotsRemaining <= 4 ? "is-low" : ""}>
                {division.spotsRemaining} spots
              </strong>
            </header>
            <div className="division-explorer__title">
              <div>
                <h3>{division.name}</h3>
                <p>{division.description}</p>
              </div>
              <span>
                <UsersRound aria-hidden size={18} /> {division.teamSize ?? 1}{" "}
                players
              </span>
            </div>
            <div className="division-explorer__details">
              <span>
                <small>Format</small>
                <strong>
                  {words(division.teamFormat ?? division.discipline)}
                </strong>
              </span>
              <span>
                <small>Eligibility</small>
                <strong>{ratingLabel(division)}</strong>
              </span>
              <span>
                <small>Field</small>
                <strong>
                  {words(division.gender)} · {words(division.surface)}
                </strong>
              </span>
              <span>
                <small>Play</small>
                <strong>{words(division.tournamentFormat)}</strong>
              </span>
            </div>
            <footer>
              <div className="division-explorer__prices">
                <span>
                  <small>Team entry</small>
                  <Numeric>{price(division.teamPrice)}</Numeric>
                </span>
                <i aria-hidden />
                <span>
                  <small>Pay per player</small>
                  <Numeric>{price(division.playerPrice)}</Numeric>
                </span>
              </div>
              <Link href={`/app/checkout/${eventSlug}?division=${division.id}`}>
                Select division <ArrowRight aria-hidden size={16} />
              </Link>
            </footer>
          </article>
        ))}
        {filtered.length === 0 && (
          <div className="division-explorer__empty">
            <Check aria-hidden size={21} />
            <span>
              <strong>No exact combination</strong>
              <small>
                Clear one filter to see the nearest available divisions.
              </small>
            </span>
            <button
              onClick={() => {
                setAge("all-options");
                setLevel("all-options");
                setFormat("all-options");
              }}
              type="button"
            >
              Show all <ChevronRight aria-hidden size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
