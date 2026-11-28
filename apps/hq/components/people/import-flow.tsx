"use client";

import { Icon } from "@duna/ui/icons";
import {
  Button,
  Chip,
  Field,
  FilterChip,
  Notice,
  Progress,
  riseClassName,
  Select,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import type { PeopleImportPreview, PeopleImportResult } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  importPeopleAction,
  importPreviewAction,
} from "@/app/(next)/(hq)/people/actions";
import {
  guessMapping,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  type ImportField,
  importFieldLabels,
  importRequest,
  mappingProblems,
  parseCsv,
} from "./people-model";
import { PeopleActionError, reportFailure, unwrap } from "./people-result";

const fieldOptions = (Object.keys(importFieldLabels) as ImportField[]).map(
  (field) => ({ value: field, label: importFieldLabels[field] }),
);

/**
 * The file part: a drop area that is also the real file control. The input
 * stays in the page (keyboard, screen readers, "Choose file" on a phone);
 * the label around it is the visible target, with a focus ring when the
 * input has focus and a drop state while a file is dragged over it.
 */
function FileDrop({
  onFile,
  fileName,
}: {
  readonly onFile: (file: File | undefined) => void;
  readonly fileName?: string;
}) {
  const id = useId();
  const [over, setOver] = useState(false);
  return (
    <label
      className="people-drop"
      data-over={over || undefined}
      htmlFor={id}
      onDragLeave={() => setOver(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        accept=".csv,text/csv"
        aria-describedby={`${id}-hint`}
        className="people-drop__input"
        id={id}
        onChange={(event) => onFile(event.currentTarget.files?.[0])}
        type="file"
      />
      <Icon name="users" size="control" />
      <span className="people-drop__title">Spreadsheet file</span>
      <span className="people-drop__hint" id={`${id}-hint`}>
        {fileName
          ? `${fileName} is chosen. Choose or drop another to replace it.`
          : "Choose a CSV file, or drop it here. Up to 2 MB."}
      </span>
    </label>
  );
}

const actionWords: Record<
  PeopleImportPreview["rows"][number]["action"],
  {
    readonly label: string;
    readonly tone: "positive" | "info" | "warning" | undefined;
  }
> = {
  create: { label: "New", tone: "positive" },
  update: { label: "Adds tags", tone: "info" },
  duplicate: { label: "Already here", tone: undefined },
  problem: { label: "Problem", tone: "warning" },
};

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * Import people from a spreadsheet: choose the file, match its columns,
 * then Duna's dry run (`importPreview`): what each row would become (new,
 * tags added to someone already here, already here, or a problem with its
 * reason), writing nothing. Importing is one strong confirmation that
 * restates the counts, then exactly that plan is written. Nobody is
 * messaged by an import.
 */
export function ImportFlow() {
  const router = useRouter();
  const confirm = useConfirm();
  const [fileName, setFileName] = useState<string>();
  const [table, setTable] = useState<string[][]>();
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [fileError, setFileError] = useState<string>();
  const [preview, setPreview] = useState<PeopleImportPreview>();
  const [stale, setStale] = useState<string>();
  const [result, setResult] = useState<PeopleImportResult>();
  const [problemsOnly, setProblemsOnly] = useState(false);

  const headers = table?.[0] ?? [];
  const problems = table ? mappingProblems(mapping) : [];

  const forget = () => {
    setPreview(undefined);
    setStale(undefined);
    setResult(undefined);
  };

  const check = useAction(
    async () => {
      if (!table)
        throw new PeopleActionError("Choose a file first.", "invalid");
      const request = importRequest(table, mapping);
      if (!request.ok) throw new PeopleActionError(request.problem, "invalid");
      return unwrap(
        await importPreviewAction({
          rows: request.rows,
          mapping: request.mapping,
        }),
      );
    },
    {
      report: reportFailure("hq.people.import_preview_failed"),
      onSuccess: (next) => {
        setPreview(next);
        setStale(undefined);
        setResult(undefined);
        setProblemsOnly(next.counts.problem > 0);
      },
    },
  );

  const read = async (file: File | undefined) => {
    forget();
    check.reset();
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
        `That file has ${parsed.length - 1} rows. Import ${IMPORT_MAX_ROWS} or fewer at a time: split it and import each part.`,
      );
      return;
    }
    setFileName(file.name);
    setTable(parsed);
    setMapping(guessMapping(parsed[0] ?? []));
  };

  const write = (current: PeopleImportPreview, continuing: boolean) => {
    const { create, update, duplicate, problem, juniors } = current.counts;
    const writes = create + update;
    const left = duplicate + problem;
    return confirm
      .run({
        tier: "strong",
        title: continuing
          ? "Continue the import?"
          : `Add ${plural(create, "person", "people")} to the club?`,
        description: continuing
          ? "Duna carries on from the row where the import stopped. Rows already written are not written twice."
          : `From ${fileName}. Each new person is added to People${juniors > 0 ? "; a junior is added with their guardian as the contact, and the guardian link waits for review with consent not recorded" : ""}.`,
        scope: [
          `${plural(create, "new person", "new people")}${juniors > 0 ? ` (${plural(juniors, "junior", "juniors")})` : ""}`,
          update > 0
            ? `${plural(update, "person already here gets", "people already here get")} the file's tags`
            : undefined,
          left > 0
            ? `${[
                duplicate > 0
                  ? plural(duplicate, "duplicate", "duplicates")
                  : undefined,
                problem > 0
                  ? plural(problem, "row with problems", "rows with problems")
                  : undefined,
              ]
                .filter(Boolean)
                .join(" and ")} ${left === 1 ? "is" : "are"} left out`
            : undefined,
        ]
          .filter(Boolean)
          .join(". ")
          .concat("."),
        consequence:
          "No one is messaged. An imported person is invited later from People, where each invitation is reviewed. An import can't be undone from here.",
        reference: `Import ${current.previewId.slice(0, 8)}`,
        verb: continuing
          ? "Continue the import"
          : `Add ${plural(create, "person", "people")}`,
        cancelLabel: "Don't import",
        agentConfirm: `Imports ${writes} rows from ${fileName ?? "the file"} as previewed`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await importPeopleAction({
              previewId: current.previewId,
              idempotencyKey,
            }),
          ),
        success: (done) =>
          done.status === "completed"
            ? `Imported: ${plural(done.created, "person", "people")} added. No one was messaged.`
            : `${done.processed} of ${done.total} rows written so far`,
        errorMessage: "Nothing was imported.",
        report: reportFailure("hq.people.import_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setResult(outcome.result);
          if (outcome.result.status === "completed") router.refresh();
        }
        if (
          outcome.status === "failed" &&
          outcome.error instanceof PeopleActionError &&
          outcome.error.code === "stale"
        ) {
          setStale(outcome.error.userMessage);
        }
      });
  };

  const rows = preview?.rows ?? [];
  const shown = rows.filter((row) => !problemsOnly || row.action !== "create");
  const expires = preview
    ? new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(preview.expiresAt))
    : undefined;

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
            juniors. A junior&apos;s own email or mobile is never imported: the
            guardian is the contact.
          </p>
          <FileDrop fileName={fileName} onFile={(file) => void read(file)} />
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
              {`${fileName}: ${plural(table.length - 1, "row", "rows")}. Duna guessed from the headers; change any that are wrong.`}
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
                        forget();
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
            {check.error ? (
              <Notice
                role="alert"
                title="The rows weren't checked"
                tone="danger"
              >
                {(check.error as { userMessage?: string }).userMessage ??
                  "Something went wrong on our side. Nothing was saved; try again."}
              </Notice>
            ) : null}
            <div className="people-actions">
              <Button
                {...check.buttonProps}
                disabled={problems.length > 0 || check.pending}
                variant={preview ? "secondary" : "primary"}
              >
                {preview ? "Check the rows again" : "Check the rows"}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {preview ? (
        <section
          aria-labelledby="import-check"
          className={`hqs-section ${riseClassName()}`}
          data-flush
        >
          <div className="hqs-section__head">
            <h2 className="hqs-section__title" id="import-check">
              Dry run
            </h2>
          </div>
          <div className="hqs-section__body">
            <p className="people-body" role="status">
              {`Nothing is saved yet. ${preview.counts.create} new, ${preview.counts.update} already here with tags to add, ${plural(preview.counts.duplicate, "duplicate", "duplicates")}, ${preview.counts.problem} with problems.`}
            </p>
            <p className="people-quiet">
              {`Checked against the club's people. This check is kept until ${expires}; after that, check again.`}
            </p>
            {stale ? (
              <Notice
                action={
                  <Button {...check.buttonProps} size="sm" variant="secondary">
                    Check the rows again
                  </Button>
                }
                role="alert"
                title="The check is out of date"
                tone="warning"
              >
                {stale}
              </Notice>
            ) : null}
            <div className="people-actions">
              <FilterChip
                onPressedChange={setProblemsOnly}
                pressed={problemsOnly}
              >
                Only rows that need a look
              </FilterChip>
            </div>
            <ul aria-label="Rows in the file" className="people-import-rows">
              {shown.slice(0, 300).map((row) => (
                <li data-status={row.action} key={row.row}>
                  <span className="people-num people-import-rows__line">
                    {`Row ${row.row}`}
                  </span>
                  <span className="people-import-rows__what">
                    <strong>{row.displayName || "(no name)"}</strong>
                    <span className="people-quiet">
                      {row.isMinor
                        ? "Junior: the guardian is the contact"
                        : row.action === "update"
                          ? `Adds ${row.adds?.join(", ") ?? "tags"}`
                          : row.action === "duplicate"
                            ? "Already at the club, nothing to add"
                            : row.action === "create"
                              ? "Adult"
                              : "Not imported until it's fixed in the file"}
                    </span>
                    {row.problems.length > 0 ? (
                      <span className="people-import-rows__problems">
                        {row.problems
                          .map((problem) => problem.message)
                          .join(" ")}
                      </span>
                    ) : null}
                    {row.matchPersonId ? (
                      <Link
                        className="people-link"
                        href={hqHref("member", { personId: row.matchPersonId })}
                      >
                        Open the person already here
                      </Link>
                    ) : null}
                  </span>
                  <Chip tone={actionWords[row.action].tone}>
                    {actionWords[row.action].label}
                  </Chip>
                </li>
              ))}
            </ul>
            {shown.length > 300 ? (
              <p className="people-quiet">
                {`Showing the first 300 of ${shown.length} rows.`}
              </p>
            ) : null}
            {result ? null : (
              <div className="people-actions">
                <Button
                  disabled={
                    preview.counts.create + preview.counts.update === 0 ||
                    Boolean(stale)
                  }
                  onClick={() => void write(preview, false)}
                  variant="primary"
                >
                  {preview.counts.create > 0
                    ? `Import ${plural(preview.counts.create, "person", "people")}`
                    : `Add tags to ${plural(preview.counts.update, "person", "people")}`}
                </Button>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {result && preview ? (
        <section
          aria-labelledby="import-result"
          className={`hqs-section ${riseClassName()}`}
        >
          <div className="hqs-section__head">
            <h2 className="hqs-section__title" id="import-result">
              {result.status === "completed"
                ? "Imported"
                : "Import in progress"}
            </h2>
          </div>
          <div className="hqs-section__body">
            {result.status === "importing" ? (
              <>
                <Progress
                  label={`${result.processed} of ${result.total} rows written`}
                  max={Math.max(result.total, 1)}
                  value={result.processed}
                />
                <p className="people-body">
                  The import stopped part-way. Rows already written stay;
                  continuing picks up where it stopped.
                </p>
                <div className="people-actions">
                  <Button
                    onClick={() => void write(preview, true)}
                    variant="primary"
                  >
                    Continue the import
                  </Button>
                </div>
              </>
            ) : (
              <>
                <dl className="people-facts">
                  <div>
                    <dt>Added</dt>
                    <dd className="people-num">{result.created}</dd>
                  </div>
                  <div>
                    <dt>Tags added</dt>
                    <dd className="people-num">{result.updated}</dd>
                  </div>
                  <div>
                    <dt>Guardians linked</dt>
                    <dd className="people-num">{result.guardiansLinked}</dd>
                  </div>
                  <div>
                    <dt>Left out</dt>
                    <dd className="people-num">{result.skipped}</dd>
                  </div>
                </dl>
                <p className="people-body">
                  No one was messaged. Guardian links wait for Duna&apos;s
                  review, with consent not recorded until the guardian gives it.
                </p>
                <div className="people-actions">
                  <Button
                    href={`${hqHref("people")}?segment=everyone`}
                    variant="primary"
                  >
                    See them in People
                  </Button>
                  <Button href={hqHref("memberInvite")} variant="secondary">
                    Invite someone
                  </Button>
                </div>
              </>
            )}
          </div>
        </section>
      ) : null}
      {confirm.dialog}
    </div>
  );
}
