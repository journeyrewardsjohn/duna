"use client";

import {
  Button,
  Chip,
  Field,
  FilterChip,
  Notice,
  Select,
  useConfirm,
} from "@duna/ui/tideline";
import { useMemo, useState } from "react";
import { importPeopleAction } from "@/app/(next)/(hq)/people/actions";
import {
  checkImport,
  type DuplicateCandidate,
  guessMapping,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  type ImportField,
  importFieldLabels,
  mappingProblems,
  parseCsv,
} from "./people-model";
import { reportFailure, unwrap } from "./people-result";

const fieldOptions = (Object.keys(importFieldLabels) as ImportField[]).map(
  (field) => ({ value: field, label: importFieldLabels[field] }),
);

/**
 * Import people from a spreadsheet: choose the file, match its columns,
 * then a dry run that shows what each row would become and every problem,
 * writing nothing. Importing is one strong confirmation that restates the
 * counts. Nobody is messaged by an import.
 */
export function ImportFlow({
  people,
  now,
}: {
  readonly people: readonly DuplicateCandidate[];
  readonly now: string;
}) {
  const confirm = useConfirm();
  const [fileName, setFileName] = useState<string>();
  const [table, setTable] = useState<string[][]>();
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [fileError, setFileError] = useState<string>();
  const [checked, setChecked] = useState(false);
  const [problemsOnly, setProblemsOnly] = useState(false);

  const headers = table?.[0] ?? [];
  const problems = table ? mappingProblems(mapping) : [];
  const result = useMemo(
    () =>
      table && checked && problems.length === 0
        ? checkImport(table, mapping, people, new Date(now))
        : undefined,
    [table, checked, problems.length, mapping, people, now],
  );

  const read = async (file: File | undefined) => {
    setChecked(false);
    setFileError(undefined);
    setTable(undefined);
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) {
      setFileError(
        "That file is larger than 2 MB. Split it and import each part.",
      );
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      setFileError(
        "That file has no rows under its header. Save the sheet as CSV with one person per row.",
      );
      return;
    }
    if (parsed.length - 1 > IMPORT_MAX_ROWS) {
      setFileError(
        `That file has ${parsed.length - 1} rows. Import ${IMPORT_MAX_ROWS} or fewer at a time.`,
      );
      return;
    }
    setFileName(file.name);
    setTable(parsed);
    setMapping(guessMapping(parsed[0] ?? []));
  };

  const runImport = () => {
    if (!result) return;
    const { ready, duplicates, problems: bad, juniors } = result.summary;
    void confirm.run({
      tier: "strong",
      title: `Add ${ready} ${ready === 1 ? "person" : "people"} to the club?`,
      description: `From ${fileName}. Each becomes a person in People; juniors are added with their guardian as the contact.`,
      scope: `${ready} ready${juniors > 0 ? `, of whom ${juniors} ${juniors === 1 ? "is a junior" : "are juniors"}` : ""}. ${duplicates} ${duplicates === 1 ? "duplicate" : "duplicates"} and ${bad} ${bad === 1 ? "row" : "rows"} with problems are left out.`,
      consequence:
        "No one is messaged. You invite people later from People, where each invitation is reviewed.",
      verb: `Add ${ready} ${ready === 1 ? "person" : "people"}`,
      cancelLabel: "Don't import",
      agentConfirm: `Adds ${ready} people from ${fileName}`,
      perform: async ({ idempotencyKey }) =>
        unwrap(await importPeopleAction({ ready, idempotencyKey })),
      errorMessage: "Nothing was imported.",
      report: reportFailure("hq.people.import_failed"),
    });
  };

  return (
    <div className="people-import">
      <section aria-labelledby="import-file" className="hqs-section">
        <div className="hqs-section__head">
          <h2 className="hqs-section__title" id="import-file">
            Choose the file
          </h2>
        </div>
        <div className="hqs-section__body">
          <p className="people-body">
            A spreadsheet saved as CSV, one person per row, with a header row.
            Columns for name, email and mobile are enough; add date of birth or
            a junior column, and the guardian&apos;s name and contact, for
            juniors.
          </p>
          <Field label="Spreadsheet file">
            <input
              accept=".csv,text/csv"
              className="people-file"
              onChange={(event) => void read(event.currentTarget.files?.[0])}
              type="file"
            />
          </Field>
          {fileError ? (
            <Notice role="alert" title="Can't read that file" tone="danger">
              {fileError}
            </Notice>
          ) : null}
        </div>
      </section>

      {table ? (
        <section aria-labelledby="import-columns" className="hqs-section">
          <div className="hqs-section__head">
            <h2 className="hqs-section__title" id="import-columns">
              Match the columns
            </h2>
          </div>
          <div className="hqs-section__body">
            <p className="people-quiet">
              {`${fileName}: ${table.length - 1} ${table.length - 1 === 1 ? "row" : "rows"}. Duna guessed from the headers; change any that are wrong.`}
            </p>
            <ul className="people-columns">
              {headers.map((header, index) => (
                <li key={`${header}-${index}`}>
                  <Field
                    hint={
                      table[1]?.[index]
                        ? `First row: ${table[1][index]}`
                        : "Empty in the first row"
                    }
                    label={header || `Column ${index + 1}`}
                  >
                    <Select
                      onValueChange={(value) => {
                        setChecked(false);
                        setMapping((current) =>
                          current.map((field, at) =>
                            at === index
                              ? ((value ?? "ignore") as ImportField)
                              : field,
                          ),
                        );
                      }}
                      options={fieldOptions}
                      value={mapping[index] ?? "ignore"}
                    />
                  </Field>
                </li>
              ))}
            </ul>
            {problems.length > 0 ? (
              <Notice title="Before checking" tone="warning">
                <ul className="people-plain-list">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}
            <div className="people-actions">
              <Button
                disabled={problems.length > 0}
                onClick={() => setChecked(true)}
                variant="primary"
              >
                Check the rows
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {result ? (
        <section
          aria-labelledby="import-check"
          className="hqs-section"
          data-flush
        >
          <div className="hqs-section__head">
            <h2 className="hqs-section__title" id="import-check">
              Dry run
            </h2>
          </div>
          <div className="hqs-section__body">
            <p className="people-body" role="status">
              {`Nothing is saved yet. ${result.summary.ready} ready, ${result.summary.duplicates} ${result.summary.duplicates === 1 ? "duplicate" : "duplicates"}, ${result.summary.problems} with problems.`}
            </p>
            <div className="people-actions">
              <FilterChip
                onPressedChange={setProblemsOnly}
                pressed={problemsOnly}
              >
                Only rows that need a look
              </FilterChip>
            </div>
            <ul aria-label="Rows in the file" className="people-import-rows">
              {result.rows
                .filter((row) => !problemsOnly || row.status !== "ready")
                .slice(0, 300)
                .map((row) => (
                  <li data-status={row.status} key={row.line}>
                    <span className="people-num people-import-rows__line">
                      {`Row ${row.line}`}
                    </span>
                    <span className="people-import-rows__what">
                      <strong>{row.name}</strong>
                      <span className="people-quiet">
                        {row.kind === "junior"
                          ? `Junior · guardian ${row.guardianName ?? "missing"}`
                          : [row.email, row.phone]
                              .filter(Boolean)
                              .join(" · ") || "No contact"}
                      </span>
                      {row.problems.length > 0 ? (
                        <span className="people-import-rows__problems">
                          {row.problems.join(". ")}
                        </span>
                      ) : null}
                      {row.duplicateOf ? (
                        <span className="people-import-rows__problems">
                          {`Already at the club: ${row.duplicateOf}`}
                        </span>
                      ) : null}
                    </span>
                    <Chip
                      tone={
                        row.status === "ready"
                          ? "positive"
                          : row.status === "duplicate"
                            ? "info"
                            : "warning"
                      }
                    >
                      {row.status === "ready"
                        ? "Ready"
                        : row.status === "duplicate"
                          ? "Duplicate"
                          : "Problem"}
                    </Chip>
                  </li>
                ))}
            </ul>
            <div className="people-actions">
              <Button
                disabled={result.summary.ready === 0}
                onClick={runImport}
                variant="primary"
              >
                {`Import ${result.summary.ready} ${result.summary.ready === 1 ? "person" : "people"}`}
              </Button>
            </div>
          </div>
        </section>
      ) : null}
      {confirm.dialog}
    </div>
  );
}
