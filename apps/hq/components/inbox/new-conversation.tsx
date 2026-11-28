"use client";

import type { ConciergeSendProposal } from "@duna/api";
import { Icon, type IconName } from "@duna/ui/icons";
import {
  Avatar,
  Button,
  Checkbox,
  Field,
  IconButton,
  Input,
  Notice,
  Rise,
  Select,
  Switch,
  Textarea,
  useAction,
  useConfirm,
  useLeaveGuard,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  createGroupAction,
  startThreadAction,
} from "@/app/(next)/(hq)/inbox/actions";
import { ChannelStrip } from "./composer";
import type { ComposeOptions } from "./inbox-data";
import {
  type Audience,
  type CardDraft,
  type ChannelStatus,
  composeRoute,
  widgetsFrom,
} from "./inbox-model";
import { messageOf, reportFailure, unwrap } from "./inbox-result";
import { SendReview } from "./send-review";

const MAX = 4000;

const audienceIcons: Record<Audience["kind"], IconName> = {
  club: "users",
  session: "calendar",
  division: "tournament",
  person: "user-plus",
  people: "users",
};

const cardKinds: readonly {
  readonly kind: CardDraft["kind"];
  readonly label: string;
  readonly icon: IconName;
}[] = [
  { kind: "practice-plan", label: "Practice plan", icon: "lesson" },
  { kind: "session", label: "Session", icon: "calendar" },
  { kind: "video", label: "Video", icon: "film" },
  { kind: "poll", label: "Poll", icon: "podium" },
];

/**
 * A new conversation: who it is for (the club, a session, a league, a
 * division, one person or several), the message, and for a group, cards
 * and polls. To a thing or one person it goes through the Send review (each
 * person's channel); a named group with cards or a poll is in the Duna app,
 * confirmed with its recipients restated. Nothing is sent without Send.
 */
export function NewConversation({
  options,
  channels,
  canSend,
  canStartThread,
  canCreateGroup,
  canChooseChannel,
  canSeeDeliveries,
  initialRecipient,
  recipientUnavailable,
  backHref,
}: {
  readonly options: ComposeOptions;
  readonly channels: readonly ChannelStatus[];
  readonly canSend: boolean;
  readonly canStartThread: boolean;
  readonly canCreateGroup: boolean;
  readonly canChooseChannel: boolean;
  readonly canSeeDeliveries: boolean;
  readonly initialRecipient?: string;
  /** A recipient was asked for in the address but can't be messaged here. */
  readonly recipientUnavailable: boolean;
  readonly backHref: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const audiences = options.audiences.filter((audience) =>
    audience.kind === "people"
      ? canCreateGroup
      : canStartThread || canCreateGroup,
  );
  const [audienceKey, setAudienceKey] = useState<string>(
    initialRecipient ? "person" : (audiences[0]?.key ?? "person"),
  );
  const audience = audiences.find((entry) => entry.key === audienceKey);
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState<string | undefined>(initialRecipient);
  const [chosen, setChosen] = useState<readonly string[]>(
    initialRecipient ? [initialRecipient] : [],
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cards, setCards] = useState<readonly CardDraft[]>([]);
  const [updatesOnly, setUpdatesOnly] = useState(false);
  const [review, setReview] = useState<
    | {
        readonly proposal: ConciergeSendProposal;
        readonly conversationId: string;
      }
    | undefined
  >();
  const [error, setError] = useState<string | undefined>();
  useLeaveGuard(body.trim().length > 0 && !review);

  const route = composeRoute({
    audience: audience?.kind ?? "person",
    cards: cards.length,
    updatesOnly,
  });
  const visiblePeople = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return options.people
      .filter(
        (entry) => !needle || entry.name.toLocaleLowerCase().includes(needle),
      )
      .slice(0, 60);
  }, [options.people, search]);
  const nameOf = (id: string) =>
    options.people.find((entry) => entry.personId === id)?.name ??
    "this person";
  const widgets = widgetsFrom(cards, options);

  const start = useAction(
    async () => {
      if (!audience) throw new Error("Choose who it is for.");
      const target =
        audience.kind === "person"
          ? {
              contextType: "direct" as const,
              contextId: person ?? "",
              label: person ? nameOf(person) : undefined,
            }
          : audience.kind === "people"
            ? undefined
            : {
                contextType: audience.contextType,
                contextId: audience.contextId,
                label: audience.title,
              };
      if (!target) throw new Error("Choose who it is for.");
      return unwrap(
        await startThreadAction({ ...target, body, draftedBy: "person" }),
      );
    },
    {
      report: reportFailure("hq.inbox.startFailed"),
      onSuccess: (result) => {
        if (result.proposal)
          setReview({
            proposal: result.proposal,
            conversationId: result.conversationId,
          });
        else router.push(`/inbox?thread=${result.conversationId}`);
      },
    },
  );

  const validate = (): string | undefined => {
    if (!audience) return "Choose who it is for.";
    if (audience.kind === "person" && !person) return "Choose the person.";
    if (audience.kind === "people" && chosen.length === 0)
      return "Choose at least one person.";
    if (route === "group" && !title.trim()) return "Name the conversation.";
    if (!body.trim()) return "Write the message first.";
    if (body.length > MAX) return `Keep it under ${MAX} characters.`;
    if (widgets.length < cards.length)
      return "Finish or remove the card that isn't complete.";
    return undefined;
  };

  const sendGroup = async () => {
    if (!audience) return;
    const recipientIds =
      audience.kind === "people"
        ? chosen
        : audience.kind === "person" && person
          ? [person]
          : [];
    const context =
      audience.kind === "club" ||
      audience.kind === "session" ||
      audience.kind === "division"
        ? {
            type: audience.contextType,
            id: audience.contextId,
            label: audience.title,
          }
        : undefined;
    const who = context
      ? audience.title
      : recipientIds.length === 1
        ? nameOf(recipientIds[0]!)
        : `${recipientIds.length} people`;
    const outcome = await confirm.run({
      tier:
        recipientIds.length > 10 || audience.kind === "club"
          ? "strong"
          : "confirm",
      title: `Start "${title.trim()}" and send?`,
      description: `The conversation opens in the Duna app with your message${widgets.length ? ` and ${widgets.length} ${widgets.length === 1 ? "card" : "cards"}` : ""}. Cards and polls stay in the Duna app; people are notified there.`,
      affected: context
        ? `Everyone connected to ${audience.title} now, including the verified guardians of any junior.`
        : `${recipientIds.map(nameOf).slice(0, 5).join(", ")}${recipientIds.length > 5 ? ` and ${recipientIds.length - 5} more` : ""}, and the verified guardians of any junior.`,
      ...(recipientIds.length > 10 || audience.kind === "club"
        ? {
            recipients: who,
            consequence: updatesOnly
              ? "Only your club's staff can post in it. A sent message can't be taken back."
              : "A sent message can't be taken back.",
          }
        : {}),
      verb: `Send to ${who}`,
      cancelLabel: "Keep editing",
      agentConfirm: `Starts the conversation "${title.trim()}" and sends the first message to ${who}`,
      perform: async ({ idempotencyKey }) =>
        unwrap(
          await createGroupAction({
            organizationId: options.organizationId,
            title,
            message: body,
            recipientPersonIds: recipientIds,
            ...(context ? { context } : {}),
            widgets,
            announcementOnly: updatesOnly,
            idempotencyKey,
          }),
        ),
      success: `Sent to ${who}`,
      report: reportFailure("hq.inbox.groupFailed"),
    });
    if (outcome.status === "done") {
      setBody("");
      router.push(`/inbox?thread=${outcome.result.conversationId}`);
    }
  };

  const submit = () => {
    const problem = validate();
    setError(problem);
    if (problem) return;
    if (route === "group") void sendGroup();
    else void start.run();
  };

  const addCard = (kind: CardDraft["kind"]) =>
    setCards((current) => {
      if (current.length >= 8) return current;
      const key = crypto.randomUUID();
      if (kind === "practice-plan" || kind === "session") {
        const list =
          kind === "session" ? options.sessions : options.practicePlans;
        return list[0]
          ? [...current, { key, kind, resourceId: list[0].id }]
          : current;
      }
      if (kind === "video")
        return [...current, { key, kind, title: "", href: "" }];
      return [
        ...current,
        {
          key,
          kind,
          title: "",
          options: ["", ""],
          allowMultipleAnswers: false,
          hideVoterNames: false,
          endsAt: "",
        },
      ];
    });
  const updateCard = (key: string, patch: Partial<CardDraft>) =>
    setCards((current) =>
      current.map((card) =>
        card.key === key ? ({ ...card, ...patch } as CardDraft) : card,
      ),
    );

  if (review) {
    return (
      <div className="inbox-new">
        <SendReview
          canChooseChannel={canChooseChannel}
          canSeeDeliveries={canSeeDeliveries}
          canSend={canSend}
          channels={channels}
          onClosed={() => setReview(undefined)}
          onEdit={(text) => {
            setBody(text);
            setReview(undefined);
          }}
          onSent={() => {
            setBody("");
            router.push(`/inbox?thread=${review.conversationId}`);
          }}
          proposal={review.proposal}
          where={
            audience?.kind === "person" && person
              ? nameOf(person)
              : (audience?.title ?? "the conversation")
          }
        />
      </div>
    );
  }

  return (
    <form
      aria-label="New message"
      className="inbox-new"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {recipientUnavailable ? (
        <Notice
          role="alert"
          title="That person can't be messaged here"
          tone="warning"
        >
          They aren't related to this club, so Duna won't start a conversation
          with them. Choose someone below.
        </Notice>
      ) : null}

      <fieldset className="inbox-new__section">
        <legend className="inbox-new__legend">Who is it for?</legend>
        <div
          className="inbox-audiences"
          role="radiogroup"
          aria-label="Who is it for?"
        >
          {audiences.map((entry) => (
            <button
              aria-checked={entry.key === audienceKey}
              className="inbox-audience"
              key={entry.key}
              onClick={() => setAudienceKey(entry.key)}
              role="radio"
              type="button"
            >
              <span aria-hidden="true" className="inbox-audience__icon">
                <Icon name={audienceIcons[entry.kind]} size="control" />
              </span>
              <span className="inbox-audience__text">
                <span className="inbox-audience__title">{entry.title}</span>
                <span className="inbox-audience__detail">{entry.detail}</span>
              </span>
              {entry.key === audienceKey ? (
                <Icon name="check" size="inline" />
              ) : null}
            </button>
          ))}
        </div>
      </fieldset>

      {audience?.kind === "person" || audience?.kind === "people" ? (
        <fieldset className="inbox-new__section">
          <legend className="inbox-new__legend">
            {audience.kind === "person"
              ? "Choose the person"
              : `Choose people (${chosen.length} chosen)`}
          </legend>
          <Input
            aria-label="Search related people"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search related people"
            type="search"
            value={search}
          />
          {options.people.length === 0 ? (
            <p className="inbox-quiet">
              Nobody is related to the club yet. Add people in People first.
            </p>
          ) : (
            <ul className="inbox-pick" aria-label="Related people">
              {visiblePeople.map((entry) => {
                const selected =
                  audience.kind === "person"
                    ? person === entry.personId
                    : chosen.includes(entry.personId);
                return (
                  <li key={entry.personId}>
                    <button
                      aria-pressed={selected}
                      className="inbox-pick__row"
                      onClick={() =>
                        audience.kind === "person"
                          ? setPerson(entry.personId)
                          : setChosen((current) =>
                              current.includes(entry.personId)
                                ? current.filter((id) => id !== entry.personId)
                                : [...current, entry.personId],
                            )
                      }
                      type="button"
                    >
                      <Avatar
                        decorative
                        name={entry.name}
                        size="sm"
                        src={entry.avatarUrl}
                      />
                      <span className="inbox-pick__text">
                        {entry.name}
                        <span className="inbox-quiet">{entry.detail}</span>
                      </span>
                      <span aria-hidden="true" className="inbox-pick__mark">
                        {selected ? <Icon name="check" size="chip" /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      ) : null}

      {route === "group" ? (
        <Field label="Conversation name">
          <Input
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Saturday clinic · Players"
            value={title}
          />
        </Field>
      ) : null}

      <Field label="Message">
        <Textarea
          autoResize
          maxLength={MAX + 200}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What changed, and what should people do next?"
          rows={5}
          value={body}
        />
      </Field>

      {canCreateGroup ? (
        <details
          className="inbox-new__extras"
          open={cards.length > 0 || updatesOnly}
        >
          <summary>
            Cards, polls and updates-only
            <span className="inbox-quiet"> · Duna app only</span>
          </summary>
          <div className="inbox-shelf" aria-label="Add to the message">
            {cardKinds.map((entry) => (
              <Button
                disabled={
                  cards.length >= 8 ||
                  (entry.kind === "session" && options.sessions.length === 0) ||
                  (entry.kind === "practice-plan" &&
                    options.practicePlans.length === 0)
                }
                icon={<Icon name={entry.icon} size="control" />}
                key={entry.kind}
                onClick={() => addCard(entry.kind)}
                size="sm"
                type="button"
                variant="secondary"
              >
                {entry.label}
              </Button>
            ))}
          </div>
          {cards.map((card) => (
            <Rise className="inbox-cardedit" from="top" key={card.key} short>
              <div className="inbox-cardedit__head">
                <span className="inbox-cardedit__kind">
                  {cardKinds.find((entry) => entry.kind === card.kind)?.label}
                </span>
                <IconButton
                  label={`Remove ${card.kind.replace("-", " ")}`}
                  onClick={() =>
                    setCards((current) =>
                      current.filter((entry) => entry.key !== card.key),
                    )
                  }
                  size="sm"
                  variant="ghost"
                >
                  <Icon name="close" size="inline" />
                </IconButton>
              </div>
              {card.kind === "practice-plan" || card.kind === "session" ? (
                <Select
                  aria-label={
                    card.kind === "session" ? "Session" : "Practice plan"
                  }
                  onValueChange={(value) =>
                    value && updateCard(card.key, { resourceId: value })
                  }
                  options={(card.kind === "session"
                    ? options.sessions
                    : options.practicePlans
                  ).map((resource) => ({
                    value: resource.id,
                    label: resource.title,
                  }))}
                  value={card.resourceId}
                />
              ) : null}
              {card.kind === "video" ? (
                <div className="inbox-cardedit__grid">
                  <Field label="Video title">
                    <Input
                      onChange={(event) =>
                        updateCard(card.key, { title: event.target.value })
                      }
                      value={card.title}
                    />
                  </Field>
                  <Field
                    hint="A Duna address, starting with /"
                    label="Where it is"
                  >
                    <Input
                      onChange={(event) =>
                        updateCard(card.key, { href: event.target.value })
                      }
                      placeholder="/videos/…"
                      value={card.href}
                    />
                  </Field>
                </div>
              ) : null}
              {card.kind === "poll" ? (
                <div className="inbox-cardedit__grid">
                  <Field label="Question">
                    <Input
                      onChange={(event) =>
                        updateCard(card.key, { title: event.target.value })
                      }
                      placeholder="Which night works for the next clinic?"
                      value={card.title}
                    />
                  </Field>
                  {card.options.map((option, index) => (
                    <div
                      className="inbox-cardedit__option"
                      key={`${card.key}-${index}`}
                    >
                      <Input
                        aria-label={`Answer ${index + 1}`}
                        onChange={(event) => {
                          const next = [...card.options];
                          next[index] = event.target.value;
                          updateCard(card.key, { options: next });
                        }}
                        placeholder={`Answer ${index + 1}`}
                        value={option}
                      />
                      {card.options.length > 2 ? (
                        <IconButton
                          label={`Remove answer ${index + 1}`}
                          onClick={() =>
                            updateCard(card.key, {
                              options: card.options.filter(
                                (_, at) => at !== index,
                              ),
                            })
                          }
                          size="sm"
                          variant="ghost"
                        >
                          <Icon name="minus" size="inline" />
                        </IconButton>
                      ) : null}
                    </div>
                  ))}
                  {card.options.length < 10 ? (
                    <Button
                      icon={<Icon name="plus" size="control" />}
                      onClick={() =>
                        updateCard(card.key, { options: [...card.options, ""] })
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Add an answer
                    </Button>
                  ) : null}
                  <Checkbox
                    checked={card.allowMultipleAnswers}
                    label="Allow more than one answer"
                    onCheckedChange={(checked) =>
                      updateCard(card.key, {
                        allowMultipleAnswers: Boolean(checked),
                      })
                    }
                  />
                  <Checkbox
                    checked={card.hideVoterNames}
                    label="Hide who voted for what"
                    onCheckedChange={(checked) =>
                      updateCard(card.key, { hideVoterNames: Boolean(checked) })
                    }
                  />
                  <Field label="Closes" optional>
                    <Input
                      onChange={(event) =>
                        updateCard(card.key, { endsAt: event.target.value })
                      }
                      type="datetime-local"
                      value={card.endsAt}
                    />
                  </Field>
                </div>
              ) : null}
            </Rise>
          ))}
          <Switch
            checked={updatesOnly}
            description="Only your club's staff can post in this conversation."
            label="Updates only"
            onCheckedChange={(checked) => setUpdatesOnly(Boolean(checked))}
          />
        </details>
      ) : null}

      {route === "concierge" ? <ChannelStrip channels={channels} /> : null}

      {error ? (
        <Notice role="alert" title="Not ready yet" tone="warning">
          {error}
        </Notice>
      ) : null}
      {start.error ? (
        <Notice role="alert" title="Not ready to review" tone="danger">
          {messageOf(
            start.error,
            "The review couldn't be prepared. Nothing was sent.",
          )}
        </Notice>
      ) : null}

      <footer className="inbox-new__actions">
        <Button href={backHref} variant="ghost">
          Cancel
        </Button>
        {route === "concierge" ? (
          <Button
            loading={start.buttonProps.loading}
            type="submit"
            variant="primary"
          >
            Review
          </Button>
        ) : canSend ? (
          <Button
            icon={<Icon name="send" size="control" />}
            type="submit"
            variant="primary"
          >
            Review and send
          </Button>
        ) : (
          <Notice title="An owner or manager sends it" tone="info">
            Your role can prepare messages but not start a group conversation.
          </Notice>
        )}
      </footer>
      <p className="inbox-quiet">
        {route === "concierge"
          ? "Nothing is sent until you review who gets it and press Send."
          : "Nothing is sent until you confirm who gets it."}
      </p>
      {confirm.dialog}
    </form>
  );
}
