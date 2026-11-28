import { describe, expect, it } from "vitest";
import {
  bookingInviteUrl,
  dialable,
  inviteMessage,
  mailtoUrl,
  smsUrl,
  whatsappUrl,
} from "./invite-links";

const body = inviteMessage({
  organizerName: "John Sutton",
  what: "a beach court",
  place: "The Strand",
  when: "Sat Nov 28 11:30 AM",
  url: bookingInviteUrl("https://duna.coach/", "tok en"),
});

describe("invitations sent from the person's own phone", () => {
  it("words the invitation briefly, from the person", () => {
    expect(body).toBe(
      "John invited you to a beach court at The Strand, Sat Nov 28 11:30 AM. Join on Duna: https://duna.coach/app/booking-invite/tok%20en",
    );
  });

  it("keeps + and digits of a number, drops spaces and punctuation", () => {
    expect(dialable("+1 (704) 555-0199")).toBe("+17045550199");
    expect(dialable(" 704 555 0199 ")).toBe("7045550199");
    expect(dialable("12")).toBeUndefined();
  });

  it("opens Messages addressed and filled in (iOS uses &body=, Android ?body=)", () => {
    expect(smsUrl(["+1 704 555 0199"], "Hi & come: 50% off?", "ios")).toBe(
      "sms:+17045550199&body=Hi%20%26%20come%3A%2050%25%20off%3F",
    );
    expect(smsUrl(["+17045550199"], "Hi", "android")).toBe(
      "sms:+17045550199?body=Hi",
    );
    expect(smsUrl(["nope"], "Hi", "ios")).toBeUndefined();
  });

  it("makes one group message only for several numbers the person chose", () => {
    expect(smsUrl(["+17045550199", "+44 7700 900123"], "Hi", "ios")).toBe(
      "sms:/open?addresses=+17045550199,+447700900123&body=Hi",
    );
  });

  it("opens WhatsApp only for a number with its country code", () => {
    expect(whatsappUrl("+44 7700 900123", body)).toBe(
      `https://wa.me/447700900123?text=${encodeURIComponent(body)}`,
    );
    expect(whatsappUrl("704 555 0199", body)).toBeUndefined();
  });

  it("emails from the person's own mail app", () => {
    expect(mailtoUrl("kim@x.com", "Court at The Strand", "Hi there")).toBe(
      "mailto:kim%40x.com?subject=Court%20at%20The%20Strand&body=Hi%20there",
    );
  });
});
