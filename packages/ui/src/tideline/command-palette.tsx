"use client";

import {
  Command as UiCommand,
  CommandEmpty as UiCommandEmpty,
  CommandGroup as UiCommandGroup,
  CommandGroupLabel as UiCommandGroupLabel,
  CommandInput as UiCommandInput,
  CommandItem as UiCommandItem,
  CommandList as UiCommandList,
  CommandShortcut as UiCommandShortcut,
} from "@ui-sdk/react/command";
import {
  Dialog as UiDialog,
  DialogBackdrop as UiDialogBackdrop,
  DialogContent as UiDialogContent,
  DialogShortcut as UiDialogShortcut,
  DialogTitle as UiDialogTitle,
  DialogTrigger as UiDialogTrigger,
} from "@ui-sdk/react/dialog";
import { type ReactNode, useState } from "react";
import { buttonClassName } from "./button-style";
import { cx } from "./cx";
import { Icon, type IconName } from "./icons";

export interface CommandPaletteItem {
  value: string;
  label: string;
  /** Commands with the same group are listed under its name. */
  group?: string;
  icon?: IconName;
  /** Shown beside the command and bound while the page is open, like `mod+n`. */
  shortcut?: string;
  /** More words the search matches. */
  keywords?: string[];
  disabled?: boolean;
}

export interface CommandPaletteProps {
  commands: ReadonlyArray<CommandPaletteItem>;
  /** Runs a command. Return a Promise to keep it pending until it settles. */
  onAction: (value: string) => unknown;
  /** The trigger's text. */
  triggerLabel?: ReactNode;
  /** The dialog's name, for screen readers. */
  title?: string;
  placeholder?: string;
  emptyText?: ReactNode;
  /** The keys that open it from anywhere. `mod` is Cmd on Apple, Ctrl elsewhere. */
  shortcut?: string;
  className?: string;
}

/**
 * Search and run commands from anywhere with Cmd/Ctrl K. UI SDK's Dialog
 * supplies the modal, the shortcut, dismissal and focus return; its Command
 * supplies fuzzy search, arrow-key navigation and Enter to run.
 */
export function CommandPalette({
  commands,
  onAction,
  triggerLabel = "Search",
  title = "Command palette",
  placeholder = "Type a command or search",
  emptyText = "No commands match.",
  shortcut = "mod+k",
  className,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const groups = new Map<string, CommandPaletteItem[]>();
  for (const command of commands) {
    const name = command.group ?? "";
    groups.set(name, [...(groups.get(name) ?? []), command]);
  }

  return (
    <UiDialog onOpenChange={setOpen} open={open}>
      <UiDialogTrigger
        className={buttonClassName(
          { variant: "secondary" },
          cx("td-command__trigger", className),
        )}
        shortcut={shortcut}
      >
        <Icon name="search" size="sm" />
        <span className="td-btn__label">{triggerLabel}</span>
        <UiDialogShortcut className="td-kbd" />
      </UiDialogTrigger>
      <UiDialogBackdrop className="td-scrim" />
      <UiDialogContent className="td-dialog td-command">
        <UiDialogTitle className="td-sr">{title}</UiDialogTitle>
        <UiCommand
          className="td-command__body"
          onAction={async (value) => {
            await onAction(value);
            setOpen(false);
          }}
        >
          <div className="td-command__search">
            <Icon name="search" />
            <UiCommandInput
              aria-label={title}
              className="td-command__input"
              placeholder={placeholder}
            />
          </div>
          <UiCommandEmpty className="td-command__empty">
            {emptyText}
          </UiCommandEmpty>
          <UiCommandList className="td-command__list">
            {[...groups].map(([name, items]) => (
              <UiCommandGroup key={name}>
                {name ? (
                  <UiCommandGroupLabel className="td-command__group-label">
                    {name}
                  </UiCommandGroupLabel>
                ) : null}
                {items.map((item) => (
                  <UiCommandItem
                    className="td-command__item"
                    disabled={item.disabled}
                    key={item.value}
                    keywords={item.keywords}
                    shortcut={item.shortcut}
                    value={item.value}
                  >
                    {item.icon ? <Icon name={item.icon} /> : null}
                    {item.label}
                    {item.shortcut ? (
                      <UiCommandShortcut className="td-kbd td-command__keys" />
                    ) : null}
                  </UiCommandItem>
                ))}
              </UiCommandGroup>
            ))}
          </UiCommandList>
          <div aria-hidden="true" className="td-command__foot">
            <span>
              <kbd className="td-kbd">↑</kbd>
              <kbd className="td-kbd">↓</kbd> to move
            </span>
            <span>
              <kbd className="td-kbd">↵</kbd> to run
            </span>
            <span>
              <kbd className="td-kbd">Esc</kbd> to close
            </span>
          </div>
        </UiCommand>
      </UiDialogContent>
    </UiDialog>
  );
}
