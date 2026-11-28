"use client";

import type { OperatorWorkspace } from "@duna/api";
import {
  Button,
  Chip,
  EmptyState,
  Field,
  Input,
  Segmented,
  Select,
  Textarea,
  riseClassName,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import { report } from "@duna/observability";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addKnowledgeAction, archiveKnowledgeAction } from "./actions";
import { unwrap } from "./setup-result";

type Source = OperatorWorkspace["brandKnowledge"]["sources"][number];

const statusWords: Readonly<Record<Source["status"], string>> = {
  processing: "Reading",
  ready: "In use",
  failed: "Couldn't read",
  archived: "Removed",
};

/**
 * What Duna knows about the club beyond its profile: notes and links a
 * person approved (policies Duna read from the website land here too).
 * Each one can be removed from what Duna uses.
 */
export function KnowledgeList({
  sources,
}: {
  readonly sources: readonly Source[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(() =>
    sources.filter((s) => s.status !== "archived"),
  );
  const [kind, setKind] = useState<"note" | "link" | "document">("note");
  const [scope, setScope] = useState<
    "organization" | "brand" | "venue" | "service" | "product"
  >("organization");
  const [fileName, setFileName] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [problem, setProblem] = useState<string>();
  const confirm = useConfirm();

  const add = useAction(
    async ({ idempotencyKey }) =>
      unwrap(
        await addKnowledgeAction({
          kind,
          scope,
          title: title.trim(),
          text: text.trim(),
          url: url.trim() || undefined,
          fileName: fileName.trim() || undefined,
          idempotencyKey,
        }),
      ),
    {
      messages: { success: "Duna will use this from now on" },
      onSuccess: () => {
        setTitle("");
        setText("");
        setUrl("");
        router.refresh();
      },
      onError: (error) =>
        setProblem(
          (error as { userMessage?: string }).userMessage ??
            "Nothing was added. Try again.",
        ),
      report,
    },
  );

  const remove = (source: Source) =>
    void confirm
      .run({
        tier: "confirm",
        destructive: true,
        title: `Stop Duna using “${source.title}”?`,
        description:
          "Duna stops using it when it answers or writes for your club. Nothing else changes.",
        verb: "Remove from Duna",
        cancelLabel: "Keep it",
        agentConfirm: `Removes the knowledge source ${source.title} from what Duna uses`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await archiveKnowledgeAction({
              sourceId: source.id,
              idempotencyKey,
            }),
          ),
        success: "Removed from what Duna uses",
        report,
      })
      .then((outcome) => {
        if (outcome.status === "done")
          setItems((current) => current.filter((s) => s.id !== source.id));
      });

  return (
    <div className="setup-knowledge">
      {confirm.dialog}
      {items.length === 0 ? (
        <EmptyState
          description="Notes and links you add here help Duna answer questions and write in your club's words."
          icon="find"
          title="Nothing added yet"
        />
      ) : (
        <ul className="setup-knowledge__list">
          {items.map((source) => (
            <li className={riseClassName({ short: true })} key={source.id}>
              <span className="setup-knowledge__text">
                <strong>{source.title}</strong>
                <span className="setup-quiet">
                  {source.kind === "link"
                    ? source.sourceUrl
                    : source.kind === "document"
                      ? (source.originalFilename ?? source.storageUrl)
                      : source.contentText?.slice(0, 120)}
                </span>
              </span>
              <Chip
                kind="status"
                tone={source.status === "failed" ? "warning" : undefined}
              >
                {statusWords[source.status]}
              </Chip>
              <Button onClick={() => remove(source)} size="sm" variant="ghost">
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="setup-knowledge__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim() || !text.trim()) {
            setProblem("Give it a name and write what Duna should know.");
            return;
          }
          if (kind !== "note" && !/^https?:\/\/\S+\.\S+/.test(url.trim())) {
            setProblem("Paste the full link, starting with https://.");
            return;
          }
          setProblem(undefined);
          void add.run();
        }}
      >
        <Segmented
          aria-label="What are you adding?"
          onValueChange={(next) =>
            setKind(
              next === "link"
                ? "link"
                : next === "document"
                  ? "document"
                  : "note",
            )
          }
          options={[
            { value: "note", label: "A note" },
            { value: "link", label: "A link" },
            { value: "document", label: "A document" },
          ]}
          value={kind}
        />
        <Field label="It's about">
          <Select
            onValueChange={(next) => {
              if (
                next === "organization" ||
                next === "brand" ||
                next === "venue" ||
                next === "service" ||
                next === "product"
              )
                setScope(next);
            }}
            options={[
              { value: "organization", label: "The club" },
              { value: "brand", label: "How the club sounds" },
              { value: "venue", label: "A place" },
              { value: "service", label: "A lesson or program" },
              { value: "product", label: "Something you sell" },
            ]}
            value={scope}
          />
        </Field>
        <Field label="Name">
          <Input
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="Parking and arrival"
            value={title}
          />
        </Field>
        {kind === "link" ? (
          <Field label="Link">
            <Input
              inputMode="url"
              onChange={(event) => setUrl(event.currentTarget.value)}
              placeholder="https://"
              value={url}
            />
          </Field>
        ) : null}
        {kind === "document" ? (
          <>
            <Field
              hint="A private link to the file, like a shared drive address."
              label="Document address"
            >
              <Input
                inputMode="url"
                onChange={(event) => setUrl(event.currentTarget.value)}
                placeholder="https://"
                value={url}
              />
            </Field>
            <Field label="File name" optional>
              <Input
                onChange={(event) => setFileName(event.currentTarget.value)}
                placeholder="Club handbook.pdf"
                value={fileName}
              />
            </Field>
          </>
        ) : null}
        <Field
          label={
            kind === "note"
              ? "What Duna should know"
              : "The approved summary Duna may use"
          }
        >
          <Textarea
            onChange={(event) => setText(event.currentTarget.value)}
            rows={3}
            value={text}
          />
        </Field>
        {problem ? (
          <p className="setup-editor__error" role="alert">
            {problem}
          </p>
        ) : null}
        <Button loading={add.pending} type="submit" variant="secondary">
          Teach Duna this
        </Button>
      </form>
    </div>
  );
}
