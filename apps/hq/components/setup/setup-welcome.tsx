import { Notice, Rise } from "@duna/ui/tideline";

const welcomes: Readonly<Record<string, { title: string; body: string }>> = {
  identity: {
    title: "Your club's identity is in",
    body: "Here is what is left before people can book. Each step has one next action.",
  },
  applied: {
    title: "What you kept is in your club",
    body: "Prices and policies were saved as drafts and nobody was invited. Here is what is next.",
  },
};

/** The success pattern after the first run: what happened, then what is next. */
export function SetupWelcome({ kind }: { readonly kind: string }) {
  const copy = welcomes[kind] ?? welcomes.identity!;
  return (
    <Rise from="top">
      <Notice role="status" title={copy.title} tone="positive">
        {copy.body}
      </Notice>
    </Rise>
  );
}
