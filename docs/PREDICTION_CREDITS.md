# Duna prediction credits

## Product purpose

Duna prediction credits are a closed, non-cash research signal for measuring the wisdom of the beach-volleyball community. They are not money, a cash equivalent, a prize currency, or an organization credit.

- Every account receives a one-time 1,000-credit welcome allocation.
- Free members receive 100 credits each month.
- active Premium members receive 1,000 credits each month.
- Credits cannot be bought, sold for money, transferred, gifted, withdrawn, redeemed, or exchanged for merchandise, access, discounts, or prizes.
- There is no paid entry and no external wallet or blockchain connection.
- A member's confirmed order is immutable. The system keeps its full ledger history.

## Market design

Each match is one two-sided market. Each tournament team is its own binary proposition: “team wins” or “team does not win.” Ordinary public Duna matches use the same market contract as professional matches.

Prices are stored in basis points from 1% through 99% while a market is open. A matched YES and NO pair must sum to 100%. The pair is therefore fully funded in prediction credits: one winning share settles to one credit and the losing share settles to zero.

Duna uses a central limit order book:

1. A member chooses a side, a maximum price, and a whole-credit allocation.
2. Duna reserves the allocation on the immutable prediction-credit ledger.
3. The order matches against the best compatible resting orders, with price-time priority and execution at the resting order's price.
4. Partial fills remain open; price-improvement and rounding remainder are returned to the member.
5. A member cannot match their own opposite order.
6. Writes are serialized per market to prevent two takers from consuming the same resting shares.
7. When the official result is final, unmatched reserves are returned and winning shares settle to one credit each.

The displayed crowd price uses the bid/ask midpoint when both sides exist and the spread is no more than 10 percentage points. It uses the last matched price when the spread is wider or the book is one-sided. This mirrors the presentation rule documented by Polymarket while keeping Duna's implementation independent.

## Experience contract

- All public event and match pages use the same canonical match card.
- A compact two-line market summary belongs on the card; detailed charts and order entry belong in the match center.
- Match centers show a touch- or pointer-scrubbable probability history, volume, participant count, model context, positions, and open orders.
- Tournament pages show every team as a trend row and let a member open either the win or not-win side.
- Wallets keep prediction credits visually and technically separate from Stripe cash and organization credits.
- Order entry always has an explicit review step that states the order cannot be edited or withdrawn.
- Settled positions remain visible as won, lost, or void; open positions and unmatched orders remain separately identifiable.

## Integrity and resolution

- Market creation is deterministic by subject type and subject ID.
- Ledger grants, reservations, refunds, and settlements have unique idempotency keys.
- Market settlement is idempotent and rejects a conflicting second result.
- Official Duna/FIVB/AVP result ingestion is the resolution source. A correction requires a controlled administrator workflow and audit trail; it must never silently rewrite the ledger.
- A postponed, abandoned, or materially changed event should be voided under a published resolution policy and all unmatched reserves returned.
- Public analytics should use aggregate signals. Individual prediction history is account data and follows Duna privacy and deletion policies.

## Legal and store-review gate

An order book, complementary pricing, free credits, and the absence of cash or prizes are product safeguards; they do **not** by themselves determine whether a product is gambling, a regulated event contract, or permitted in every jurisdiction. Event contracts can fall within commodities and derivatives regulation, and Apple and Google apply separate gaming and simulated-gambling review rules.

Before enabling order placement in production, counsel and app-store review owners must approve:

- the no-purchase, no-transfer, no-redemption, and no-prize rules;
- age and jurisdiction availability;
- market topics and resolution policy;
- Terms, privacy disclosures, and responsible-use language;
- Apple App Review Guidelines section 5.3 classification;
- Google Play real-money and simulated-gambling classification;
- an emergency market-lock and void procedure.

Reference mechanics and policy material:

- [Polymarket: How are prices calculated?](https://help.polymarket.com/en/articles/13364488-how-are-prices-calculated)
- [Polymarket: Prices and order book](https://docs.polymarket.com/concepts/prices-orderbook)
- [Kalshi: How are prices determined?](https://help.kalshi.com/en/articles/13823836-how-are-prices-determined)
- [CFTC: Contracts and products](https://www.cftc.gov/IndustryOversight/ContractsProducts/index.htm)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play gambling policy](https://support.google.com/googleplay/android-developer/answer/9877032?hl=en)
