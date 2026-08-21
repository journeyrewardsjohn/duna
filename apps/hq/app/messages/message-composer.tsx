"use client";

import type { MessageWidget } from "@duna/messaging-client";
import {
  BarChart3,
  CalendarDays,
  Check,
  ClipboardList,
  GripVertical,
  Plus,
  Search,
  Trash2,
  UsersRound,
  Video,
} from "lucide-react";
import { useMemo, useState } from "react";
import { MessagingActionForm } from "./messaging-action-form";
import styles from "./messaging.module.css";

type Audience = {
  readonly value: string;
  readonly title: string;
  readonly detail: string;
  readonly kind: "group" | "session" | "people";
};

type Person = {
  readonly personId: string;
  readonly displayName: string;
  readonly detail: string;
};

type Resource = {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly href: string;
  readonly startsAt?: string;
};

type ComposerWidget =
  | {
      readonly key: string;
      readonly kind: "practice-plan";
      readonly resourceId: string;
    }
  | {
      readonly key: string;
      readonly kind: "session";
      readonly resourceId: string;
    }
  | {
      readonly key: string;
      readonly kind: "video";
      readonly title: string;
      readonly href: string;
    }
  | {
      readonly key: string;
      readonly kind: "poll";
      readonly title: string;
      readonly options: readonly string[];
      readonly allowMultipleAnswers: boolean;
      readonly hideVoterNames: boolean;
      readonly endsAt: string;
    };

function key() {
  return crypto.randomUUID();
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function MessageComposer({
  audiences,
  clientMessageId,
  organizationId,
  people,
  practicePlans,
  sessions,
}: {
  readonly audiences: readonly Audience[];
  readonly clientMessageId: string;
  readonly organizationId: string;
  readonly people: readonly Person[];
  readonly practicePlans: readonly Resource[];
  readonly sessions: readonly Resource[];
}) {
  const [audience, setAudience] = useState(audiences[0]?.value ?? "");
  const [search, setSearch] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<readonly string[]>([]);
  const [widgets, setWidgets] = useState<readonly ComposerWidget[]>([]);
  const specific = audience.startsWith("specific::");
  const visiblePeople = people.filter((person) =>
    person.displayName.toLowerCase().includes(search.toLowerCase()),
  );

  const addWidget = (kind: ComposerWidget["kind"]) => {
    setWidgets((current) => {
      if (current.length >= 8) return current;
      if (kind === "practice-plan") {
        return practicePlans[0]
          ? [...current, { key: key(), kind, resourceId: practicePlans[0].id }]
          : current;
      }
      if (kind === "session") {
        return sessions[0]
          ? [...current, { key: key(), kind, resourceId: sessions[0].id }]
          : current;
      }
      if (kind === "video") {
        return [
          ...current,
          { key: key(), kind, title: "Video review", href: "/app/videos" },
        ];
      }
      return [
        ...current,
        {
          key: key(),
          kind: "poll",
          title: "Vote on the next team decision",
          options: ["Option 1", "Option 2"],
          allowMultipleAnswers: false,
          hideVoterNames: false,
          endsAt: "",
        },
      ];
    });
  };

  const payload = useMemo<MessageWidget[]>(
    () =>
      widgets.flatMap((widget): MessageWidget[] => {
        if (widget.kind === "poll") {
          const options = widget.options
            .map((label, index) => ({
              id: `option-${index + 1}`,
              label: label.trim(),
            }))
            .filter((option) => option.label);
          return options.length >= 2 && widget.title.trim()
            ? [
                {
                  kind: "poll" as const,
                  id: widget.key.slice(0, 36),
                  title: widget.title.trim(),
                  options,
                  allowMultipleAnswers: widget.allowMultipleAnswers,
                  hideVoterNames: widget.hideVoterNames,
                  ...(widget.endsAt
                    ? { endsAt: new Date(widget.endsAt).toISOString() }
                    : {}),
                },
              ]
            : [];
        }
        if (widget.kind === "video") {
          return [
            {
              kind: "resource-card" as const,
              resourceType: "video" as const,
              title: widget.title,
              action: { label: "Watch video", href: widget.href },
            },
          ];
        }
        const resources = widget.kind === "session" ? sessions : practicePlans;
        const resource = resources.find(
          (candidate) => candidate.id === widget.resourceId,
        );
        if (!resource) return [];
        return [
          {
            kind: "resource-card" as const,
            resourceType: widget.kind,
            title: resource.title,
            detail: resource.detail,
            ...(resource.startsAt ? { startsAt: resource.startsAt } : {}),
            action: {
              label:
                widget.kind === "session"
                  ? "Open session"
                  : "Open practice plan",
              href: resource.href,
            },
          },
        ];
      }),
    [practicePlans, sessions, widgets],
  );

  const updateWidget = (widgetKey: string, patch: Partial<ComposerWidget>) =>
    setWidgets((current) =>
      current.map((widget) =>
        widget.key === widgetKey
          ? ({ ...widget, ...patch } as ComposerWidget)
          : widget,
      ),
    );

  return (
    <MessagingActionForm
      buttonClassName={styles.sendButton}
      mode="create"
      pendingLabel="Creating and sending…"
      submitLabel="Create and send"
    >
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="clientMessageId" type="hidden" value={clientMessageId} />
      <input name="audience" type="hidden" value={audience} />
      <input name="widgets" type="hidden" value={JSON.stringify(payload)} />
      <section className={styles.audienceStudio}>
        <header>
          <span>Groups and sessions</span>
          <small>Start with the real Duna relationship.</small>
        </header>
        <div className={styles.audienceCards}>
          {audiences.map((option) => (
            <button
              className={
                audience === option.value ? styles.selectedAudience : undefined
              }
              key={option.value}
              onClick={() => setAudience(option.value)}
              type="button"
            >
              {option.kind === "session" ? (
                <CalendarDays aria-hidden size={18} />
              ) : (
                <UsersRound aria-hidden size={18} />
              )}
              <span>
                <strong>{option.title}</strong>
                <small>{option.detail}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      {specific ? (
        <section className={styles.specificPeople}>
          {selectedPeople.map((personId) => (
            <input
              key={personId}
              name="recipientPersonId"
              type="hidden"
              value={personId}
            />
          ))}
          <label>
            <Search aria-hidden size={16} />
            <input
              aria-label="Search related people"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search related people"
              value={search}
            />
          </label>
          <div>
            {visiblePeople.map((person) => (
              <button
                aria-pressed={selectedPeople.includes(person.personId)}
                key={person.personId}
                onClick={() =>
                  setSelectedPeople((current) =>
                    current.includes(person.personId)
                      ? current.filter(
                          (personId) => personId !== person.personId,
                        )
                      : [...current, person.personId],
                  )
                }
                type="button"
              >
                <span className={styles.personSelectionMark}>
                  {selectedPeople.includes(person.personId) ? (
                    <Check aria-hidden size={13} />
                  ) : null}
                </span>
                <span className={styles.personAvatar}>
                  {initials(person.displayName)}
                </span>
                <span>
                  <strong>{person.displayName}</strong>
                  <small>{person.detail}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <label>
        <span>Conversation name</span>
        <input
          maxLength={160}
          name="title"
          placeholder="Saturday clinic · Players"
          required
        />
      </label>
      <div
        className={styles.messageBuilder}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const kind = event.dataTransfer.getData(
            "application/duna-widget",
          ) as ComposerWidget["kind"];
          if (kind) addWidget(kind);
        }}
      >
        <div className={styles.messageCanvas}>
          <label>
            <span>Message</span>
            <textarea
              maxLength={10_000}
              name="message"
              placeholder="Share the useful update, what changed, and what people should do next."
              required
              rows={5}
            />
          </label>
          {widgets.map((widget) => (
            <article className={styles.widgetDraft} key={widget.key}>
              <GripVertical aria-hidden size={17} />
              <div>
                <strong>{widget.kind.replace("-", " ")}</strong>
                {widget.kind === "practice-plan" ||
                widget.kind === "session" ? (
                  <select
                    onChange={(event) =>
                      updateWidget(widget.key, {
                        resourceId: event.target.value,
                      })
                    }
                    value={widget.resourceId}
                  >
                    {(widget.kind === "session" ? sessions : practicePlans).map(
                      (resource) => (
                        <option key={resource.id} value={resource.id}>
                          {resource.title}
                        </option>
                      ),
                    )}
                  </select>
                ) : null}
                {widget.kind === "video" ? (
                  <>
                    <input
                      aria-label="Video title"
                      onChange={(event) =>
                        updateWidget(widget.key, { title: event.target.value })
                      }
                      value={widget.title}
                    />
                    <input
                      aria-label="Duna video path"
                      onChange={(event) =>
                        updateWidget(widget.key, { href: event.target.value })
                      }
                      placeholder="/app/videos/..."
                      value={widget.href}
                    />
                  </>
                ) : null}
                {widget.kind === "poll" ? (
                  <div className={styles.pollBuilder}>
                    <input
                      aria-label="Poll name"
                      onChange={(event) =>
                        updateWidget(widget.key, { title: event.target.value })
                      }
                      value={widget.title}
                    />
                    {widget.options.map((option, index) => (
                      <label key={`${widget.key}:${index}`}>
                        <span>{index + 1}</span>
                        <input
                          aria-label={`Poll option ${index + 1}`}
                          onChange={(event) => {
                            const options = [...widget.options];
                            options[index] = event.target.value;
                            updateWidget(widget.key, { options });
                          }}
                          value={option}
                        />
                        {widget.options.length > 2 ? (
                          <button
                            aria-label={`Remove option ${index + 1}`}
                            onClick={() =>
                              updateWidget(widget.key, {
                                options: widget.options.filter(
                                  (_, optionIndex) => optionIndex !== index,
                                ),
                              })
                            }
                            type="button"
                          >
                            <Trash2 aria-hidden size={14} />
                          </button>
                        ) : null}
                      </label>
                    ))}
                    {widget.options.length < 10 ? (
                      <button
                        onClick={() =>
                          updateWidget(widget.key, {
                            options: [
                              ...widget.options,
                              `Option ${widget.options.length + 1}`,
                            ],
                          })
                        }
                        type="button"
                      >
                        <Plus aria-hidden size={14} /> Add option
                      </button>
                    ) : null}
                    <label>
                      <input
                        checked={widget.allowMultipleAnswers}
                        onChange={(event) =>
                          updateWidget(widget.key, {
                            allowMultipleAnswers: event.target.checked,
                          })
                        }
                        type="checkbox"
                      />{" "}
                      Allow multiple answers
                    </label>
                    <label>
                      <input
                        checked={widget.hideVoterNames}
                        onChange={(event) =>
                          updateWidget(widget.key, {
                            hideVoterNames: event.target.checked,
                          })
                        }
                        type="checkbox"
                      />{" "}
                      Hide voter names
                    </label>
                    <label>
                      <span>End time (optional)</span>
                      <input
                        onChange={(event) =>
                          updateWidget(widget.key, {
                            endsAt: event.target.value,
                          })
                        }
                        type="datetime-local"
                        value={widget.endsAt}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
              <button
                aria-label={`Remove ${widget.kind}`}
                onClick={() =>
                  setWidgets((current) =>
                    current.filter((candidate) => candidate.key !== widget.key),
                  )
                }
                type="button"
              >
                <Trash2 aria-hidden size={15} />
              </button>
            </article>
          ))}
        </div>
        <aside className={styles.widgetShelf}>
          <span>Add to message</span>
          <small>Drag or tap a useful card.</small>
          {(
            [
              ["practice-plan", ClipboardList, "Practice plan"],
              ["session", CalendarDays, "Session"],
              ["video", Video, "Video"],
              ["poll", BarChart3, "Poll"],
            ] as const
          ).map(([kind, Icon, label]) => (
            <button
              draggable
              key={kind}
              onClick={() => addWidget(kind)}
              onDragStart={(event) =>
                event.dataTransfer.setData("application/duna-widget", kind)
              }
              type="button"
            >
              <Icon aria-hidden size={17} /> {label}
            </button>
          ))}
        </aside>
      </div>
      <label className={styles.checkLabel}>
        <input name="announcementOnly" type="checkbox" />
        <span>
          <strong>Updates only</strong>
          <small>Only organization staff can post.</small>
        </span>
      </label>
    </MessagingActionForm>
  );
}
