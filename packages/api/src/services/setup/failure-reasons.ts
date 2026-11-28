/**
 * Every reason a website read can stop, with the plain words the setup
 * screens show (CS-States). Stored in `setup_runs.failure_reason`; the run's
 * `outcome` is `site-unreachable` for all of them.
 */
export const setupFailureReasons = [
  "no-response",
  "no-such-host",
  "address-not-allowed",
  "blocked-by-site",
  "nothing-readable",
  "too-large",
  "timed-out",
] as const;

export type SetupFailureReason = (typeof setupFailureReasons)[number];

export const setupFailureMessages: Readonly<
  Record<SetupFailureReason, string>
> = {
  "no-response":
    "Your website did not answer. Check the address, or try again later.",
  "no-such-host":
    "That address does not exist. Check the spelling of your website.",
  "address-not-allowed":
    "Duna can only read a public website address (http or https, no special ports).",
  "blocked-by-site":
    "Your website asked not to be read by tools like Duna. You can fill in your club by hand.",
  "nothing-readable":
    "Duna could not find readable text on your website. You can fill in your club by hand.",
  "too-large":
    "Your website's pages are too large to read. You can fill in your club by hand.",
  "timed-out":
    "Reading your website took too long. Try again, or fill in your club by hand.",
};

export function isSetupFailureReason(
  value: string | null | undefined,
): value is SetupFailureReason {
  return (setupFailureReasons as readonly string[]).includes(value ?? "");
}

/** A failure carrying its reason through the reader and the run. */
export class SetupReadError extends Error {
  constructor(readonly reason: SetupFailureReason) {
    super(setupFailureMessages[reason]);
    this.name = "SetupReadError";
  }
}
