"use client";

import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  Chip,
  EmptyResults,
  FilterChip,
  rallyStyle,
  riseClassName,
} from "@duna/ui/tideline";
import Link from "next/link";
import { useState } from "react";
import type { ProgramStatus, StateCopy } from "./program-model";

export interface ProgramRow {
  readonly id: string;
  readonly title: string;
  readonly status: ProgramStatus;
  readonly state: StateCopy;
  readonly who?: string;
  readonly dates: string;
  readonly pattern?: string;
  readonly coaches?: string;
  readonly week: string;
  readonly nextPractice?: string;
  readonly openConflicts: number;
  readonly legacy: boolean;
}

type Filter = "all" | "active" | "draft" | "completed" | "cancelled";

const filters: readonly { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Draft" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

function matches(row: ProgramRow, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "completed") {
    return row.status === "completed" || row.status === "archived";
  }
  return row.status === filter;
}

/**
 * Programs as object rows: who, when, the weekly pattern in a sentence,
 * coaches, the current week, the next practice, the state, and how many
 * conflicts need a decision. States are in-page filters.
 */
export function ProgramList({
  rows,
}: {
  readonly rows: readonly ProgramRow[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = rows.filter((row) => matches(row, filter));
  return (
    <>
      <div aria-label="Show programs" className="tr-filters" role="group">
        {filters.map((item) => (
          <FilterChip
            key={item.id}
            onPressedChange={() => setFilter(item.id)}
            pressed={filter === item.id}
          >
            {item.label}
            <span className="tr-filters__count">
              {rows.filter((row) => matches(row, item.id)).length}
            </span>
          </FilterChip>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyResults onClear={() => setFilter("all")} />
      ) : (
        <ul aria-label="Programs" className="tr-rows">
          {shown.map((row, index) => (
            <li
              className={`tr-row ${riseClassName()}`}
              key={row.id}
              style={rallyStyle(index)}
            >
              <div className="tr-row__main">
                <Link
                  className="tr-row__name"
                  href={hqHref("trainingProgram", { programId: row.id })}
                >
                  {row.title}
                </Link>
                <span className="tr-quiet">
                  {[row.who, row.dates].filter(Boolean).join(" · ")}
                </span>
                {row.pattern ? (
                  <span className="tr-row__line">{row.pattern}</span>
                ) : null}
                {row.coaches ? (
                  <span className="tr-quiet">
                    <Icon name="coach" size="chip" /> {row.coaches}
                  </span>
                ) : null}
              </div>
              <div className="tr-row__side">
                <span className="tr-row__chips">
                  <Chip tone={row.state.tone}>{row.state.label}</Chip>
                  {row.openConflicts > 0 ? (
                    <Chip tone="attention">
                      {`${row.openConflicts} to decide`}
                    </Chip>
                  ) : null}
                </span>
                <span className="tr-quiet">{row.week}</span>
                {row.nextPractice ? (
                  <span className="tr-quiet">{`Next: ${row.nextPractice}`}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** A new club: start a program from a sentence, or browse Duna's drills. */
export function ProgramsFirstUse({
  canManage,
}: {
  readonly canManage: boolean;
}) {
  return (
    <div className="tr-first-use">
      <Icon name="coach" size="nav" />
      <h2 className="tr-first-use__title">No programs yet</h2>
      <p className="tr-body">
        {canManage
          ? "Describe the season in one sentence: who it's for, the days and times, the dates and the days off. Duna drafts it; nothing is scheduled until you confirm."
          : "When an owner or manager starts a program, it shows here."}
      </p>
      <div className="tr-actions">
        {canManage ? (
          <Button href={hqHref("trainingProgramCreate")} variant="primary">
            Start a program from a sentence
          </Button>
        ) : null}
        <Button
          href={`${hqHref("trainingDrills")}?tab=duna`}
          variant="secondary"
        >
          Browse Duna drills
        </Button>
      </div>
    </div>
  );
}
