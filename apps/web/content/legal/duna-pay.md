---
title: "Duna Pay Terms"
slug: "duna-pay"
audience: "Organizations that take payments through Duna"
summary: "How organizations take payments through Duna and Stripe: fees, when funds are released and paid out, holdbacks, refunds, disputes, negative balances, taxes and suspension."
version: "1.0-draft"
effectiveDate: "[to be set when approved]"
lastUpdated: "2026-11-27"
---

# Duna Pay Terms

> **Draft for attorney review. Not in effect.**

> **The short version** (this summary does not replace the terms below)
>
> - Payments are processed by Stripe. You agree to Stripe's Connected Account Agreement.
> - Money for a sale is released once the payment has settled and you have delivered what you sold. We then pay it out within 3 business days on the daily schedule.
> - Dated sessions release after they end. Programs and leagues release session by session. Memberships release after settlement. Goods release once fulfilled.
> - Disputed amounts are held until the dispute is decided. Refunds come out of your balance or future sales. We may hold a reserve in limited cases, with notice.
> - Players pay Duna's service fee; it is Duna's. You pay your plan's Organization Fee and the card processing cost.

## 1. The agreement

1.1 These Duna Pay Terms are part of the [Duna HQ Terms](/legal/hq-terms) and use their definitions. They apply when your Organization takes payments through Duna ("**Duna Pay**").

1.2 **Stripe.** Payment processing services for Organizations on Duna are provided by Stripe and are subject to the [Stripe Connected Account Agreement](https://stripe.com/connect-account/legal/full), which includes the [Stripe Services Agreement](https://stripe.com/legal/ssa) (together, the "**Stripe Services Agreement**"). By agreeing to these Duna Pay Terms or continuing to operate as an Organization on Duna, you agree to be bound by the Stripe Services Agreement, as Stripe may modify it. As a condition of Duna enabling payment processing through Stripe, you agree to give Duna accurate and complete information about you and your business, and you authorize Duna to share it and transaction information related to your use of Stripe's services. Stripe's privacy policy is at <https://stripe.com/privacy>.

1.3 If these Duna Pay Terms conflict with the Stripe Services Agreement about Stripe's services, the Stripe Services Agreement controls. As between you and Duna, these Duna Pay Terms control.

## 2. Definitions

- "**Business day**": Monday to Friday, excluding US federal bank holidays.
- "**Settled**": Stripe has made a payment's funds available.
- "**Delivered**": the condition for the product type in section 6.
- "**Releasable**": Settled, Delivered and not held under section 7.
- "**Proceeds**": the part of a payment for your Offering that belongs to you: the price paid, minus Duna's Fees (section 4), minus any sales tax Duna collects and remits.
- "**Payout**": a transfer of Releasable Proceeds to your bank account.
- "**Duna's Fees**": the Organization Fee and the Processing Cost.

## 3. Setting up

3.1 To take payments you must complete Stripe onboarding, including identity and business verification, and keep it current. Stripe may require more information at any time.

3.2 You must be a business or individual operating lawfully in the United States with a US bank account. Payments are in US dollars.

3.3 You are responsible for the accuracy of your statement descriptor, which appears on players' card statements.

3.4 Until onboarding is complete, Duna may limit or switch off payments.

## 4. Fees

4.1 **Organization Fee.** A percentage of the price of each sale through Duna Pay, set by your plan: Free 5%, Club 2.5%, Scale 0%. It is calculated on the price after discounts, excluding tax and the Service Fee. A different rate applies only if agreed in writing.

4.2 **Processing Cost.** You pay the cost of processing each payment. Duna charges it at the rates shown in billing settings. At the date of this draft: online card payments 3% + $0.35; in-person card payments 2.8% + $0.15; bank (ACH) payments 1%, capped at $6. [Owner: these are Duna's estimates, built into code; confirm they are the published rates.]

4.3 **The Service Fee is Duna's.** The Service Fee players pay on some Bookings is Duna's fee for its consumer service. It is not part of your Proceeds. You may not charge players a fee that duplicates it.

4.4 **How fees are taken.** Duna takes its Fees and the Service Fee from each payment before your Proceeds reach your Stripe balance. You will see each deduction in your statements.

4.5 **Other amounts.** Duna may deduct from Proceeds any plan or add-on fees that are unpaid after notice, and any amounts under section 9.

## 5. How payments flow

5.1 A player pays Duna for your Offering. Duna acts as your limited payment collection agent: once Duna accepts the player's payment, the player has paid you. [Counsel: confirm.]

5.2 Payments are processed through Stripe, which transfers your Proceeds to your Stripe connected account. Once your account is fully enabled, the charge is made on your behalf and you are the merchant of record for it. [Engineering note: today this applies only when the account's card-payments capability is active.]

5.3 Duna manages when Proceeds are released and paid out, under sections 6 to 8. Stripe holds the funds. Duna does not hold your funds in its own accounts, and Duna Pay is not an escrow service.

## 6. When Proceeds are released

6.1 **Principle.** Proceeds for a sale become Releasable when the payment has Settled and you have Delivered what you sold. Card payments usually Settle in about 2 business days.

6.2 **Release by product type.**

| What you sold                                                                  | Delivered when                                                                                                                                            | Released                                                                                                                                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Court rental, lesson, assessment, clinic, open play, pickup                    | The scheduled end time passes                                                                                                                             | When Settled and Delivered                                                                                                                |
| Tournament or event entry, team entry, ticket, for an event of 7 days or fewer | The end of the last scheduled day                                                                                                                         | When Settled and Delivered                                                                                                                |
| League, program, camp, or event longer than 7 days                             | Each scheduled session, after it ends, releases its share of the price. With no session schedule: equal weekly shares from the start date to the end date | Each share, when Settled and Delivered; everything by the scheduled end                                                                   |
| Organization membership period                                                 | When that period's payment is received                                                                                                                    | 3 business days after Settled; or, if the membership offers a full refund within a set number of days, at the end of that window if later |
| Credit pack, package or bundle                                                 | When Settled                                                                                                                                              | 3 business days after Settled, less the Unredeemed Credit Reserve (section 7.4)                                                           |
| Physical goods                                                                 | When you mark the order fulfilled: handed over, or shipped with a tracking number                                                                         | When Settled and Delivered                                                                                                                |
| Digital goods, including drills                                                | When access is given                                                                                                                                      | 3 business days after Settled                                                                                                             |
| In-person payment                                                              | At payment                                                                                                                                                | 3 business days after Settled                                                                                                             |

6.3 **Start tranche.** If your Organization has had payouts for at least 90 days, with a refund rate under 5% and a dispute rate under 0.75% over the last 90 days, you may choose to release up to 25% of a program, camp or league price when its first session ends. [Owner: thresholds.]

6.4 **Shares.** A program's price is divided equally between its scheduled sessions unless you set different shares when you publish it.

6.5 **Changes to the schedule.** If you cancel a session, its share is not released; it pays any refund first.

## 7. Holdbacks and reserves

7.1 **First payout.** For a new Organization, the first Payout happens no earlier than 7 days after the first successful payment, unless Duna has reviewed and approved the account earlier. [Owner: 7 days.]

7.2 **Disputes.** When a player disputes a payment, Duna holds the disputed amount plus the dispute fee from your balance (section 10).

7.3 **Rolling reserve.** Duna may hold a reserve of a percentage of your Proceeds for a period if:

- your refund rate over 90 days is above 10%, or your dispute rate is above 0.75%;
- you sell Offerings that will be delivered more than 90 days after purchase;
- your business, volume or Offerings change materially;
- you are in your first 90 days and expected volume is high; or
- Stripe requires it.

We tell you in writing the reason, the percentage, how long it lasts and when we will review it. The default is 10% for 90 days. No reserve lasts more than 180 days. We review each reserve at least every 30 days, and you may ask for a review at any time. [Owner: defaults.]

7.4 **Unredeemed Credit Reserve.** While players hold unredeemed Credits you sold for money, Duna holds 20% of their cash value. The amount is recalculated daily and released as Credits are used or refunded. In your first 90 days, paid credit-pack Proceeds are released only as Credits are used. [Owner: 20%.]

7.5 **Other holds.** Duna may hold Proceeds while it investigates suspected fraud, a breach of these terms, a sale of something prohibited, or a legal requirement, and tells you unless the law or a risk prevents it.

## 8. Payouts

8.1 **Schedule.** Choose a daily, weekly or monthly payout schedule, or manual payouts, in HQ. Daily is the default.

8.2 **Timing.** On the daily schedule, Duna instructs Stripe to pay out Releasable Proceeds within 3 business days after they become Releasable. On weekly or monthly schedules, Releasable Proceeds are paid out on your next scheduled day. Your bank then usually credits the Payout within 1 to 2 business days. [Engineering gap: daily schedule is hidden in HQ today.]

8.3 **Minimum.** You may set a minimum Payout amount. Proceeds below it stay in your balance until the next Payout that reaches it. Manual Payouts ignore the minimum.

8.4 **Manual Payouts.** You may request a Payout of Releasable Proceeds at any time.

8.5 **Instant payouts** are not offered.

8.6 **Bank details.** Payouts go to the bank account in your Stripe account. If a Payout fails, we tell you and retry after you update the details.

## 9. Refunds

9.1 **Your policy, Duna's floor.** You set your Club Policy within the Duna Floor in the [Booking and Refund Policy](/legal/booking-and-refunds). You must show it before purchase and honor it.

9.2 **Who decides.** You decide refund requests under your Club Policy. Duna may refund a player directly, from your Proceeds, where the Duna Floor requires (for example, when you cancel or fail to deliver), for a duplicate or unauthorized charge, or where the law requires.

9.3 **Where refunds come from.** In this order: Proceeds not yet released for that sale; your available balance; future Proceeds; and then your bank account under section 11.

9.4 **Fees on refunds.**

| Who caused the refund                                            | Player gets back            | Organization Fee         | Processing Cost | Service Fee                    |
| ---------------------------------------------------------------- | --------------------------- | ------------------------ | --------------- | ------------------------------ |
| You cancel, do not deliver or make a material change             | Everything they paid        | Returned to you pro rata | Borne by you    | Refunded to the player by Duna |
| Duna's error                                                     | Everything they paid        | Returned to you pro rata | Borne by Duna   | Refunded by Duna               |
| Player cancels within your policy, or you give a courtesy refund | Price of the refunded items | Returned to you pro rata | Borne by you    | Kept by Duna                   |

[Owner decision; see `docs/legal/README.md`.]

9.5 **Credits.** Purchases paid with Credits are refunded in Credits. You may offer Credits instead of money, but only if the player chooses them.

9.6 **Timing.** Start approved refunds within 5 business days.

## 10. Disputes and chargebacks

10.1 When a player's bank opens a dispute, Stripe debits the amount and its dispute fee. Duna recovers them from you by holding the disputed amount and fee from your balance or by reversing the transfer of your Proceeds.

10.2 We tell you about the dispute in HQ. Provide evidence (such as the booking, attendance, waiver, communications and your Club Policy) within 7 days, or sooner if the deadline requires. Duna submits the response. Duna may accept a dispute it reasonably believes cannot be won, after telling you.

10.3 If the dispute is decided for you, the held amount is released, and the dispute fee is returned if Stripe returns it. If not, the amount and fee are yours to bear.

10.4 If your dispute rate is high, section 7.3 applies, and Duna may require changes to how you sell.

## 11. Negative balances

11.1 If refunds, disputes, fees or other amounts you owe exceed your balance, your balance is negative.

11.2 You authorize Duna to recover a negative balance by: deducting it from future Proceeds; having Stripe debit your bank account under the Stripe Services Agreement; and invoicing you, payable within 15 days.

11.3 **Set-off.** Duna may set off any amount you owe Duna under the HQ Terms or these Duna Pay Terms against Proceeds.

## 12. Prohibited sales

You may not use Duna Pay to sell anything on Stripe's restricted businesses list (<https://stripe.com/legal/restricted-businesses>), anything unlawful, gambling or betting, items you do not have the right to sell, or Offerings you do not intend to deliver. You may not split a sale, take payment off Duna for a Booking made through Duna, or process a payment for someone else's business.

## 13. Taxes

13.1 **Sales tax.** Where state law makes Duna a marketplace facilitator, or Duna is otherwise the seller for tax purposes, Duna calculates, collects and remits sales tax on your sales through Duna Pay, and that tax is not part of your Proceeds. You must give accurate tax categories and venue addresses. You remain responsible for tax on sales outside Duna Pay and for any tax Duna does not collect. [Counsel: state-by-state facilitator analysis; the code currently treats Duna as the tax seller for automatic tax.]

13.2 **Income tax reporting.** Stripe or Duna may issue information returns (such as Form 1099-K) as required and need your taxpayer information for that.

13.3 You are responsible for your own income taxes.

## 14. In-person payments

14.1 You may take card payments in person with Duna Pro and a supported device, including Tap to Pay on iPhone where available. Additional Stripe and Apple terms may apply.

14.2 You are responsible for the device, for following card acceptance rules, and for any payment you take for an Offering.

14.3 No Service Fee is added to in-person payments.

## 15. Contractor payouts

Contractor payouts are not available today. If they are added, they will be payments you instruct to recipients you choose, from your funds, and Duna will publish terms for them first.

## 16. Statements and records

HQ shows each payment, fee, refund, dispute, reserve, release and Payout. Tell us within 60 days of a statement if you think it is wrong. Duna's records and Stripe's records together are the record of your transactions.

## 17. Suspension and closure

17.1 Duna may suspend Duna Pay for the reasons in the HQ Terms, section 15. During suspension, new sales stop and Payouts may be held.

17.2 When your Organization closes or Duna Pay is suspended for more than 30 days:

- you must deliver, or cancel and refund, outstanding Bookings, programs and unfulfilled orders;
- held Proceeds are used first for those refunds, and for refunds of unredeemed paid Credits that players request within 60 days of our notice to them;
- Duna releases the rest 120 days after the last sale, less any amounts you owe.

[Owner: confirm 60 and 120 days.]

## 18. Changes

We may change these Duna Pay Terms with at least 30 days' notice, or sooner where Stripe or the law requires. Changes to the Organization Fee follow the HQ Terms, section 4.6.
