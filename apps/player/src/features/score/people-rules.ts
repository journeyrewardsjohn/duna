/**
 * Checks for a person added by name (M-P4a), the same rules as the web
 * add-score names: letters, spaces, apostrophes, hyphens and a full stop,
 * at most 40 characters, never a web address. Pure; tested.
 */
import type { LivePerson } from "./scoring-machine";

const NAME_RULE = /^[\p{L}][\p{L} .'’-]{0,39}$/u;
const PHONE_RULE = /^\+[1-9]\d{7,14}$/;
const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checks a person added by name. Pure; tested. */
export function checkAddedPerson(input: {
  readonly givenName: string;
  readonly familyName: string;
  readonly contact: string;
}):
  | { readonly ok: true; readonly person: LivePerson }
  | {
      readonly ok: false;
      readonly field: "given" | "family" | "contact";
      readonly problem: string;
    } {
  const given = input.givenName.trim();
  const family = input.familyName.trim();
  const contact = input.contact.trim();
  if (!NAME_RULE.test(given) || /https?:|www\./i.test(given))
    return {
      ok: false,
      field: "given",
      problem: "Add a first name (letters only).",
    };
  if (!NAME_RULE.test(family) || /https?:|www\./i.test(family))
    return {
      ok: false,
      field: "family",
      problem: "Add a last name or an initial.",
    };
  let email: string | undefined;
  let phoneE164: string | undefined;
  if (contact) {
    if (contact.includes("@")) {
      if (!EMAIL_RULE.test(contact))
        return {
          ok: false,
          field: "contact",
          problem: "Check the email address.",
        };
      email = contact.toLowerCase();
    } else {
      const digits = contact.replace(/[\s()-]/g, "");
      if (!PHONE_RULE.test(digits))
        return {
          ok: false,
          field: "contact",
          problem: "Use an international mobile number beginning with +.",
        };
      phoneE164 = digits;
    }
  }
  return {
    ok: true,
    person: {
      name: `${given} ${family}`,
      givenName: given,
      familyName: family,
      ...(email ? { email } : {}),
      ...(phoneE164 ? { phoneE164 } : {}),
    },
  };
}
