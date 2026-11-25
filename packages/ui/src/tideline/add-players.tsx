"use client";

import { Button as UiButton } from "@ui-sdk/react/button";
import { Toggle as UiToggle } from "@ui-sdk/react/toggle";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import {
  addPlayer,
  filterPlayers,
  isPlayerSelected,
  openSpots,
  playerSlots,
  removePlayer,
} from "./add-players-logic";
import { AvatarLevel, PlayerSlot, type PlayerSummary } from "./avatar";
import { Button } from "./button";
import { cx } from "./cx";
import { Icon } from "./icons";
import { useAsyncSearch } from "./interactions";
import { SearchField } from "./search-field";

export interface AddPlayersChange {
  type: "add" | "remove";
  player: PlayerSummary;
}

export interface AddPlayersLabels {
  slots: string;
  /** "2 of 4 spots filled". */
  filled: (count: number, capacity: number) => string;
  full: string;
  openSpot: string;
  search: string;
  searchPlaceholder: string;
  suggestions: string;
  contacts: string;
  noContacts: string;
  add: string;
  added: string;
  remove: string;
  locked: string;
}

const defaultLabels: AddPlayersLabels = {
  slots: "Players",
  filled: (count, capacity) => `${count} of ${capacity} spots filled`,
  full: "Every spot is filled. Remove a player to add someone else.",
  openSpot: "Open spot",
  search: "Search players",
  searchPlaceholder: "Search by name",
  suggestions: "Suggested",
  contacts: "Your contacts",
  noContacts: "No contacts match.",
  add: "Add",
  added: "Added",
  remove: "Remove",
  locked: "You",
};

export interface AddPlayersProps {
  /** The players in the slots, in order. Controlled. */
  selected: ReadonlyArray<PlayerSummary>;
  /** Called with the next list and what changed. */
  onSelectedChange: (
    selected: PlayerSummary[],
    change: AddPlayersChange,
  ) => void;
  /** How many places there are in total. */
  capacity: number;
  /** Players that cannot be removed, like the organiser. */
  lockedIds?: ReadonlyArray<string>;
  /** People Duna suggests, shown as cards. */
  suggestions?: ReadonlyArray<PlayerSummary>;
  /** The person's own contacts, shown as a list with add and remove. */
  contacts?: ReadonlyArray<PlayerSummary>;
  /**
   * Finds players beyond the ones already loaded. The caller owns the
   * request; honour `signal`, which aborts when the text changes. Suggestions
   * and contacts are filtered at once while it runs. Leave it out to hide the
   * search box.
   */
  searchPlayers?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<PlayerSummary[]>;
  /** Quiet time before `searchPlayers` is called. */
  searchDebounce?: number;
  labels?: Partial<AddPlayersLabels>;
  className?: string;
}

interface PersonRowProps {
  player: PlayerSummary;
  action: ReactNode;
}

function PersonRow({ player, action }: PersonRowProps) {
  return (
    <li className="td-listrow">
      <AvatarLevel
        decorative
        level={player.level}
        name={player.name}
        size="sm"
        src={player.avatarUrl}
      />
      <span className="td-listrow__main">
        <span className="td-listrow__title">{player.name}</span>
        {player.detail ? (
          <span className="td-listrow__meta">{player.detail}</span>
        ) : null}
      </span>
      {action}
    </li>
  );
}

/**
 * Fills the places of a match or booking: the selected slots, a debounced
 * search, suggestion cards with Add / Added, and a contact list with add and
 * remove. It is controlled and fetches nothing itself: the caller owns the
 * selected list, the suggestions, the contacts and the `searchPlayers`
 * request, which runs through `useAsyncSearch`. The selection
 * rules (capped, no duplicates, locked players) live in
 * `add-players-logic.ts`.
 *
 * Parts: Root, Slots, Slot, Remove, Search, Suggestions, Suggestion,
 * AddButton, Contacts, ContactRow. The Add button is a UI SDK Toggle, so it
 * carries `aria-pressed`.
 */
export function AddPlayers({
  selected,
  onSelectedChange,
  capacity,
  lockedIds = [],
  suggestions = [],
  contacts = [],
  searchPlayers,
  searchDebounce,
  labels,
  className,
}: AddPlayersProps) {
  const text = { ...defaultLabels, ...labels };
  const full = openSpots(selected, capacity) === 0;
  const loaded = useMemo(() => {
    const byId = new Map<string, PlayerSummary>();
    for (const player of [...suggestions, ...contacts]) {
      byId.set(player.id, player);
    }
    return [...byId.values()];
  }, [suggestions, contacts]);
  const search = useAsyncSearch<PlayerSummary>({
    search: (query, signal) =>
      searchPlayers ? searchPlayers(query, signal) : Promise.resolve([]),
    items: loaded,
    filter: (player, query) => filterPlayers([player], query).length > 0,
    getKey: (player) => player.id,
    debounceMs: searchDebounce,
  });
  const slotsRef = useRef<HTMLUListElement>(null);
  const restoreFocus = useRef(false);

  // Removing a player unmounts the button that was pressed. Send focus to the
  // next Remove button, or to the list, so it never falls back to the page.
  useEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    const list = slotsRef.current;
    if (!list || list.contains(document.activeElement)) return;
    (list.querySelector<HTMLElement>(".td-addp__remove") ?? list).focus();
  }, [selected]);

  const add = (player: PlayerSummary) => {
    const result = addPlayer(selected, player, capacity);
    if (result.changed) {
      onSelectedChange(result.selected, { type: "add", player });
    }
  };
  const remove = (player: PlayerSummary) => {
    const result = removePlayer(selected, player.id, lockedIds);
    if (result.changed) {
      onSelectedChange(result.selected, { type: "remove", player });
    }
  };

  /** Add / Added: pressed while the player is in; pressing again removes. */
  const addButton = (player: PlayerSummary) => {
    const isIn = isPlayerSelected(selected, player.id);
    const locked = lockedIds.includes(player.id);
    return (
      <UiToggle
        className="td-addbtn"
        disabled={isIn ? locked : full}
        focusableWhenDisabled
        onPressedChange={(next) => (next ? add(player) : remove(player))}
        pressed={isIn}
      >
        <Icon name={isIn ? "check" : "plus"} />
        {isIn ? text.added : text.add}
        <span className="td-sr"> {player.name}</span>
      </UiToggle>
    );
  };

  /** Add when out, Remove when in: both stay pressable. */
  const contactButton = (player: PlayerSummary) => {
    const isIn = isPlayerSelected(selected, player.id);
    const locked = lockedIds.includes(player.id);
    return (
      <Button
        disabled={isIn ? locked : full}
        focusableWhenDisabled
        onClick={() => (isIn ? remove(player) : add(player))}
        size="sm"
        variant={isIn ? "ghost" : "secondary"}
      >
        {isIn ? (locked ? text.locked : text.remove) : text.add}
        <span className="td-sr"> {player.name}</span>
      </Button>
    );
  };

  return (
    <div className={cx("td-addp", className)}>
      <section aria-label={text.slots} className="td-addp__section">
        <div className="td-addp__head">
          <h3 className="td-addp__h">{text.slots}</h3>
          <p className="td-addp__count" role="status">
            {text.filled(selected.length, capacity)}
          </p>
        </div>
        <ul className="td-addp__slots" ref={slotsRef} tabIndex={-1}>
          {playerSlots(selected, capacity).map((player, index) => (
            <li
              className="td-addp__slot"
              key={player ? player.id : `open-${index}`}
            >
              <PlayerSlot
                openLabel={text.openSpot}
                player={player ?? undefined}
                you={player ? lockedIds.includes(player.id) : false}
              />
              {player && !lockedIds.includes(player.id) ? (
                <UiButton
                  aria-label={`${text.remove} ${player.name}`}
                  className="td-addp__remove"
                  onClick={() => {
                    restoreFocus.current = true;
                    remove(player);
                  }}
                >
                  <Icon name="close" />
                </UiButton>
              ) : null}
            </li>
          ))}
        </ul>
        {full ? <p className="td-addp__note">{text.full}</p> : null}
      </section>

      {searchPlayers ? (
        <SearchField
          label={text.search}
          onRetry={search.submit}
          onSubmit={search.submit}
          onValueChange={search.setQuery}
          placeholder={text.searchPlaceholder}
          resultCount={search.results.length}
          stale={search.stale}
          status={search.status}
          value={search.query}
        >
          {search.results.length > 0 ? (
            <ul className="td-list">
              {search.results.map((player) => (
                <PersonRow
                  action={contactButton(player)}
                  key={player.id}
                  player={player}
                />
              ))}
            </ul>
          ) : null}
        </SearchField>
      ) : null}

      {suggestions.length > 0 ? (
        <section aria-label={text.suggestions} className="td-addp__section">
          <h3 className="td-addp__h">{text.suggestions}</h3>
          <ul className="td-addp__sugs">
            {suggestions.map((player) => (
              <li className="td-sug" key={player.id}>
                <AvatarLevel
                  decorative
                  level={player.level}
                  name={player.name}
                  size="lg"
                  src={player.avatarUrl}
                />
                <span className="td-sug__name">{player.name}</span>
                {player.detail ? (
                  <span className="td-sug__meta">{player.detail}</span>
                ) : null}
                {addButton(player)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label={text.contacts} className="td-addp__section">
        <h3 className="td-addp__h">{text.contacts}</h3>
        {contacts.length > 0 ? (
          <ul className="td-list">
            {contacts.map((player) => (
              <PersonRow
                action={contactButton(player)}
                key={player.id}
                player={player}
              />
            ))}
          </ul>
        ) : (
          <p className="td-addp__note">{text.noContacts}</p>
        )}
      </section>
    </div>
  );
}
