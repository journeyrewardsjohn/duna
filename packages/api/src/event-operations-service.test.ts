import { describe, expect, it } from "vitest";
import {
  collectRegistrationOrderIds,
  eventPlayerInvitationMessage,
  planDivisionSelection,
  registrationCanReceiveEventCancellationRefund,
  registrationRefundIsComplete,
} from "./event-operations-service";

describe("event player invitations", () => {
  const invitation = {
    organizationName: "Duna Beach Club",
    eventTitle: "Summer Classic",
    divisionName: "Open KOB",
    invitationUrl: "https://duna.coach/join/organization/claim-token",
  } as const;

  it("makes complimentary coverage explicit", () => {
    expect(
      eventPlayerInvitationMessage({
        ...invitation,
        paymentTreatment: "complimentary",
      }),
    ).toContain("Your entry is complimentary.");
  });

  it("makes the reserved spot and payment step explicit", () => {
    const message = eventPlayerInvitationMessage({
      ...invitation,
      paymentTreatment: "to-be-paid",
    });
    expect(message).toContain("Your place is reserved");
    expect(message).toContain("payment is due after you claim it");
    expect(message).toContain(invitation.invitationUrl);
  });
});

const paidAt = (hour: number) =>
  `2026-08-12T${String(hour).padStart(2, "0")}:00:00.000Z`;

describe("planDivisionSelection", () => {
  it("uses full-payment confirmation time for first-come qualification", () => {
    const plan = planDivisionSelection({
      method: "first-come",
      maximumTeams: 2,
      teams: [
        {
          id: "registered-first-paid-last",
          fullyPaid: true,
          fullyPaidAt: paidAt(12),
          registeredAt: paidAt(8),
          selectionStatus: "pending",
          selectionLocked: false,
        },
        {
          id: "paid-first",
          fullyPaid: true,
          fullyPaidAt: paidAt(9),
          registeredAt: paidAt(9),
          selectionStatus: "pending",
          selectionLocked: false,
        },
        {
          id: "paid-second",
          fullyPaid: true,
          fullyPaidAt: paidAt(10),
          registeredAt: paidAt(10),
          selectionStatus: "pending",
          selectionLocked: false,
        },
      ],
    });

    expect(plan).toEqual([
      expect.objectContaining({
        id: "registered-first-paid-last",
        selectionStatus: "waitlisted",
        seed: 3,
      }),
      expect.objectContaining({
        id: "paid-first",
        selectionStatus: "confirmed",
        seed: 1,
      }),
      expect.objectContaining({
        id: "paid-second",
        selectionStatus: "confirmed",
        seed: 2,
      }),
    ]);
  });

  it("uses a frozen Sand Rating score and keeps unpaid teams pending", () => {
    const plan = planDivisionSelection({
      method: "sand-rating-score",
      maximumTeams: 1,
      teams: [
        {
          id: "frozen-leader",
          fullyPaid: true,
          fullyPaidAt: paidAt(10),
          registeredAt: paidAt(8),
          averageRating: 4.2,
          qualificationScore: 5.6,
          selectionStatus: "pending",
          selectionLocked: false,
        },
        {
          id: "current-leader",
          fullyPaid: true,
          fullyPaidAt: paidAt(9),
          registeredAt: paidAt(9),
          averageRating: 5.2,
          qualificationScore: 5.1,
          selectionStatus: "pending",
          selectionLocked: false,
        },
        {
          id: "unpaid",
          fullyPaid: false,
          registeredAt: paidAt(7),
          averageRating: 8,
          selectionStatus: "pending",
          selectionLocked: false,
        },
      ],
    });

    expect(plan.find((team) => team.id === "frozen-leader")).toMatchObject({
      selectionStatus: "confirmed",
      seed: 1,
      qualificationScore: 5.6,
    });
    expect(plan.find((team) => team.id === "current-leader")).toMatchObject({
      selectionStatus: "waitlisted",
      seed: 2,
    });
    expect(plan.find((team) => team.id === "unpaid")).toMatchObject({
      selectionStatus: "pending",
      seed: undefined,
    });
  });

  it("honors locked organizer choices while filling the remaining field", () => {
    const plan = planDivisionSelection({
      method: "sand-rating-score",
      maximumTeams: 2,
      teams: [
        {
          id: "locked-confirmed",
          fullyPaid: true,
          registeredAt: paidAt(8),
          averageRating: 2,
          selectionStatus: "confirmed",
          selectionLocked: true,
          seed: 2,
        },
        {
          id: "locked-waitlist",
          fullyPaid: true,
          registeredAt: paidAt(9),
          averageRating: 8,
          selectionStatus: "waitlisted",
          selectionLocked: true,
        },
        {
          id: "best-unlocked",
          fullyPaid: true,
          registeredAt: paidAt(10),
          averageRating: 7,
          selectionStatus: "pending",
          selectionLocked: false,
        },
        {
          id: "next-unlocked",
          fullyPaid: true,
          registeredAt: paidAt(11),
          averageRating: 6,
          selectionStatus: "pending",
          selectionLocked: false,
        },
      ],
    });

    expect(plan.find((team) => team.id === "locked-confirmed")).toMatchObject({
      selectionStatus: "confirmed",
      seed: 2,
    });
    expect(plan.find((team) => team.id === "best-unlocked")).toMatchObject({
      selectionStatus: "confirmed",
      seed: 1,
    });
    expect(plan.find((team) => team.id === "locked-waitlist")).toMatchObject({
      selectionStatus: "waitlisted",
      seed: 3,
    });
    expect(plan.find((team) => team.id === "next-unlocked")).toMatchObject({
      selectionStatus: "waitlisted",
      seed: 4,
    });
  });
});

describe("event registration refund coverage", () => {
  it("includes legacy cancelled registrations until their payment is refunded", () => {
    expect(registrationCanReceiveEventCancellationRefund("cancelled")).toBe(
      true,
    );
    expect(registrationCanReceiveEventCancellationRefund("refunded")).toBe(
      false,
    );
  });

  it("includes the captain and every split-pay teammate order once", () => {
    expect(
      collectRegistrationOrderIds("captain-order", [
        { orderId: "teammate-order" },
        { orderId: "teammate-order" },
        {},
      ]),
    ).toEqual(["captain-order", "teammate-order"]);
  });

  it("does not mark a split-pay registration refunded until every payer succeeds", () => {
    const associatedOrderIds = ["captain-order", "teammate-order"];
    const refundableOrderIds = new Set(associatedOrderIds);

    expect(
      registrationRefundIsComplete({
        associatedOrderIds,
        refundableOrderIds,
        succeededOrderIds: new Set(["captain-order"]),
      }),
    ).toBe(false);
    expect(
      registrationRefundIsComplete({
        associatedOrderIds,
        refundableOrderIds,
        succeededOrderIds: new Set(associatedOrderIds),
      }),
    ).toBe(true);
  });
});
