import { describe, expect, it } from "vitest";
import {
  bookingInviteUrl,
  inviteMessage,
  inviteStateWords,
  sessionInviteMessage,
  smsUrl,
  whatsappUrl,
} from "./invite-links";

const body = inviteMessage({
  organizerName: "Remy Alvarez",
  what: "a court",
  place: "The Strand",
  when: "Sat Nov 28 11:30 AM",
  url: bookingInviteUrl("https://duna.coach/", "tok en/1"),
});

describe("invitation links", () => {
  it("writes the message from the person, with the claim link", () => {
    expect(body).toBe(
      "Remy invited you to a court at The Strand, Sat Nov 28 11:30 AM. Join on Duna: https://duna.coach/app/booking-invite/tok%20en%2F1",
    );
    expect(
      inviteMessage({
        organizerName: " ",
        what: "a match",
        place: "Pier 3",
        url: "https://duna.coach/x",
      }),
    ).toBe(
      "A friend invited you to a match at Pier 3. Join on Duna: https://duna.coach/x",
    );
  });

  it("writes the words for a shared session link", () => {
    expect(
      sessionInviteMessage("Sunset pickup", "https://duna.coach/e/1"),
    ).toBe("Join me: Sunset pickup. Open it on Duna: https://duna.coach/e/1");
  });

  it("encodes the body in the text-message link", () => {
    const encoded = encodeURIComponent(body);
    expect(smsUrl(body)).toBe(`sms:?&body=${encoded}`);
    expect(smsUrl(body, { phone: "+1 (704) 555-0123", platform: "ios" })).toBe(
      `sms:+17045550123&body=${encoded}`,
    );
    expect(smsUrl(body, { phone: "+17045550123" })).toBe(
      `sms:+17045550123?body=${encoded}`,
    );
    expect(encoded).not.toMatch(/[ &?#]/);
  });

  it("builds WhatsApp links, addressed only with a country code", () => {
    const encoded = encodeURIComponent(body);
    expect(whatsappUrl(body)).toBe(`https://wa.me/?text=${encoded}`);
    expect(whatsappUrl(body, "+17045550123")).toBe(
      `https://wa.me/17045550123?text=${encoded}`,
    );
    expect(whatsappUrl(body, "7045550123")).toBe(
      `https://wa.me/?text=${encoded}`,
    );
  });

  it("never says sent; the server's word wins over what was opened", () => {
    expect(inviteStateWords("invited").label).toBe("Link ready");
    expect(inviteStateWords("invited", "whatsapp").label).toBe(
      "Opened in WhatsApp",
    );
    expect(inviteStateWords("paid", "messages").label).toBe("Joined");
    for (const status of ["invited", "accepted", "declined"] as const)
      expect(inviteStateWords(status, "messages").label).not.toMatch(/sent/i);
  });
});
