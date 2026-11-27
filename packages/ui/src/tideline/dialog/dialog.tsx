import {
  Dialog as UiDialog,
  DialogBackdrop as UiDialogBackdrop,
  DialogClose as UiDialogClose,
  DialogContent as UiDialogContent,
  DialogDescription as UiDialogDescription,
  DialogTitle as UiDialogTitle,
  DialogTrigger as UiDialogTrigger,
} from "@ui-sdk/react/dialog";
import {
  Drawer as UiDrawer,
  DrawerBackdrop as UiDrawerBackdrop,
  DrawerClose as UiDrawerClose,
  DrawerContent as UiDrawerContent,
  DrawerDescription as UiDrawerDescription,
  DrawerTitle as UiDrawerTitle,
  DrawerTrigger as UiDrawerTrigger,
} from "@ui-sdk/react/drawer";
import type { ComponentProps, ReactNode } from "react";
import {
  buttonClassName,
  type ButtonStyleOptions,
} from "../button/button-style";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";

type Styled<Props> = Omit<Props, "className"> & { className?: string };

export type DialogProps = ComponentProps<typeof UiDialog>;

/**
 * A focused task over the page. UI SDK Dialog: focus moves in and is trapped,
 * Escape and an outside press close it, and focus returns to the trigger. On
 * small touch screens it presents as a sheet (`presentation="auto"`).
 */
export function Dialog({ presentation = "auto", ...props }: DialogProps) {
  return <UiDialog presentation={presentation} {...props} />;
}

export type DialogTriggerProps = Styled<
  ComponentProps<typeof UiDialogTrigger>
> &
  ButtonStyleOptions;

/** The button that opens the dialog, styled as a Tideline button. */
export function DialogTrigger({
  variant,
  size,
  block,
  className,
  ...props
}: DialogTriggerProps) {
  return (
    <UiDialogTrigger
      className={buttonClassName({ variant, size, block }, className)}
      {...props}
    />
  );
}

export interface DialogContentProps extends Omit<
  ComponentProps<typeof UiDialogContent>,
  "className" | "title" | "children"
> {
  className?: string;
  /** Names the dialog. */
  title: ReactNode;
  /** Context under the title, announced with the dialog. */
  description?: ReactNode;
  children?: ReactNode;
  /** The name of the corner close button. */
  closeLabel?: string;
  /** Leaves the corner close button out, for a dialog that needs an answer. */
  hideClose?: boolean;
}

/** The dialog's surface, with its scrim, title and corner close button. */
export function DialogContent({
  title,
  description,
  children,
  className,
  closeLabel = "Close",
  hideClose = false,
  ...props
}: DialogContentProps) {
  return (
    <>
      <UiDialogBackdrop className="td-scrim" />
      <UiDialogContent className={cx("td-dialog", className)} {...props}>
        <UiDialogTitle className="td-dialog__title">{title}</UiDialogTitle>
        {description ? (
          <UiDialogDescription className="td-dialog__description">
            {description}
          </UiDialogDescription>
        ) : null}
        {children}
        {/* Last in the DOM so focus starts on the dialog's first control. */}
        {hideClose ? null : (
          <UiDialogClose
            aria-label={closeLabel}
            className="td-iconbtn td-iconbtn--sm td-dialog__close"
          >
            <Icon name="close" />
          </UiDialogClose>
        )}
      </UiDialogContent>
    </>
  );
}

/** The row of buttons at the end of a dialog or sheet. */
export function DialogActions({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("td-dialog__actions", className)} {...props} />;
}

export type DialogCloseProps = Styled<ComponentProps<typeof UiDialogClose>> &
  ButtonStyleOptions;

/** A button that closes the dialog; its `action` can run first. */
export function DialogClose({
  variant = "ghost",
  size,
  block,
  className,
  ...props
}: DialogCloseProps) {
  return (
    <UiDialogClose
      className={buttonClassName({ variant, size, block }, className)}
      {...props}
    />
  );
}

export type SheetProps = ComponentProps<typeof UiDrawer>;

/**
 * A panel that slides from an edge: the bottom by default, `side="right"` for
 * a drawer. UI SDK Drawer: swipe to dismiss, focus trap and focus return.
 */
export function Sheet(props: SheetProps) {
  return <UiDrawer {...props} />;
}

export type SheetTriggerProps = Styled<ComponentProps<typeof UiDrawerTrigger>> &
  ButtonStyleOptions;

export function SheetTrigger({
  variant,
  size,
  block,
  className,
  ...props
}: SheetTriggerProps) {
  return (
    <UiDrawerTrigger
      className={buttonClassName({ variant, size, block }, className)}
      {...props}
    />
  );
}

export interface SheetContentProps extends Omit<
  ComponentProps<typeof UiDrawerContent>,
  "className" | "title" | "children"
> {
  className?: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  closeLabel?: string;
  hideClose?: boolean;
}

/** The sheet's surface, with its scrim, grabber, title and close button. */
export function SheetContent({
  title,
  description,
  children,
  className,
  closeLabel = "Close",
  hideClose = false,
  ...props
}: SheetContentProps) {
  return (
    <>
      <UiDrawerBackdrop className="td-scrim" />
      <UiDrawerContent className={cx("td-sheet", className)} {...props}>
        <span aria-hidden="true" className="td-sheet__grabber" />
        <UiDrawerTitle className="td-dialog__title">{title}</UiDrawerTitle>
        {description ? (
          <UiDrawerDescription className="td-dialog__description">
            {description}
          </UiDrawerDescription>
        ) : null}
        {children}
        {hideClose ? null : (
          <UiDrawerClose
            aria-label={closeLabel}
            className="td-iconbtn td-iconbtn--sm td-dialog__close"
          >
            <Icon name="close" />
          </UiDrawerClose>
        )}
      </UiDrawerContent>
    </>
  );
}

export type SheetCloseProps = Styled<ComponentProps<typeof UiDrawerClose>> &
  ButtonStyleOptions;

export function SheetClose({
  variant = "ghost",
  size,
  block,
  className,
  ...props
}: SheetCloseProps) {
  return (
    <UiDrawerClose
      className={buttonClassName({ variant, size, block }, className)}
      {...props}
    />
  );
}
