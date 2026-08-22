import { describe, expect, it } from "vitest";
import { playerEventCheckoutHref } from "./event-checkout";

describe("player event checkout handoff", () => {
  it("keeps a signed-in player's division selection", () => {
    expect(
      playerEventCheckoutHref({
        slug: "kob-saturday-aug-22",
        divisionId: "52b811d7-736c-47c9-8305-0f069746f3b6",
      }),
    ).toBe(
      "/app/checkout/kob-saturday-aug-22?division=52b811d7-736c-47c9-8305-0f069746f3b6",
    );
  });

  it("keeps a ticket and its requested quantity", () => {
    expect(
      playerEventCheckoutHref({
        slug: "beach-finals",
        ticketTypeId: "premium access",
        ticketQuantity: "2",
      }),
    ).toBe("/app/checkout/beach-finals?ticket=premium+access&quantity=2");
  });
});
