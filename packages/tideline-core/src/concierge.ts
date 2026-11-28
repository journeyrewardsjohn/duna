/**
 * What a Concierge thread is tied to, and the parts of its title and subtitle.
 * Pure data in, structured parts out; the renderer localises and formats.
 */

export type ThreadContextKind =
  "lesson" | "match" | "tournament" | "league" | "program" | "club" | "duna";

interface ContextBase {
  readonly id: string;
  /** Display title: "Tuesday lesson with Sam", "Beach Open final". */
  readonly title: string;
  /** Club the thing belongs to, when it is not the club itself. */
  readonly clubName?: string;
  /** Where, when known. */
  readonly place?: string;
  /** Epoch ms when it happens, when it has a time. */
  readonly startsAt?: number;
}

export type ThreadContext =
  | (ContextBase & { readonly kind: "lesson"; readonly coachName?: string })
  | (ContextBase & { readonly kind: "match" })
  | (ContextBase & { readonly kind: "tournament" })
  | (ContextBase & { readonly kind: "league" })
  | (ContextBase & { readonly kind: "program" })
  | (ContextBase & { readonly kind: "club" })
  /** The thread is with Duna itself; no object behind it. */
  | { readonly kind: "duna"; readonly id?: string; readonly title?: string };

export type SubtitlePart =
  /** i18n key `concierge.context.<kind>`. */
  | { readonly type: "kind"; readonly labelKey: string }
  | { readonly type: "time"; readonly at: number }
  | { readonly type: "club"; readonly text: string }
  | { readonly type: "place"; readonly text: string }
  | { readonly type: "coach"; readonly text: string };

export interface ThreadContextParts {
  readonly kind: ThreadContextKind;
  /** Title text; "Duna" for a Duna thread without its own title. */
  readonly title: string;
  readonly subtitleParts: ReadonlyArray<SubtitlePart>;
  /** True for the Duna thread, which Messages marks as Duna rather than a person. */
  readonly isDuna: boolean;
}

export const DUNA_THREAD_TITLE = "Duna";

export function threadContextParts(context: ThreadContext): ThreadContextParts {
  const kindPart: SubtitlePart = {
    type: "kind",
    labelKey: `concierge.context.${context.kind}`,
  };
  if (context.kind === "duna") {
    return {
      kind: "duna",
      title: context.title ?? DUNA_THREAD_TITLE,
      subtitleParts: [],
      isDuna: true,
    };
  }
  const subtitleParts: SubtitlePart[] = [kindPart];
  if (context.startsAt !== undefined)
    subtitleParts.push({ type: "time", at: context.startsAt });
  if (context.kind === "lesson" && context.coachName) {
    subtitleParts.push({ type: "coach", text: context.coachName });
  }
  if (context.clubName && context.kind !== "club") {
    subtitleParts.push({ type: "club", text: context.clubName });
  }
  if (context.place) subtitleParts.push({ type: "place", text: context.place });
  return {
    kind: context.kind,
    title: context.title,
    subtitleParts,
    isDuna: false,
  };
}
