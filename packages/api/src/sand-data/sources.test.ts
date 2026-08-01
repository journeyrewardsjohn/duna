import { describe, expect, it } from "vitest";
import {
  parseFivbEventIndexHtml,
  parseFivbPagePlayers,
  selectVolleyballLifeDivisionData,
} from "./sources";

describe("FIVB event index parsing", () => {
  it("keeps a country name as a location instead of treating it as a code", () => {
    const html = `
      <table>
        <thead>
          <tr>
            <th></th>
            <th data-field="Name">Name</th>
            <th data-field="Men">Men</th>
            <th data-field="Women">Women</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Future</td>
            <td>BPT Futures Mount Maunganui</td>
            <td><a href="/scripts/tournament.php?tcode=MNZL2026">05.02.-08.02.</a></td>
            <td><a href="/scripts/tournament.php?tcode=WNZL2026">05.02.-08.02.</a></td>
            <td>New Zealand</td>
          </tr>
        </tbody>
      </table>
    `;

    const events = parseFivbEventIndexHtml(html, 2026, "2026-07-31");

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      externalEventId: "MNZL2026",
      location: "New Zealand",
      countryCode: undefined,
      startsOn: "2026-02-05",
      endsOn: "2026-02-08",
      status: "completed",
    });
  });

  it("prefers full entry-list names over abbreviated match-table names", () => {
    const players = parseFivbPagePlayers(`
      <td>
        <a href="https://fivb.12ndr.at/player?player_id=170672&gender=W">Anderson</a>
      </td>
      <td>
        <a href="https://fivb.12ndr.at/player?player_id=170672&gender=W">Madelyne Anderson</a>
      </td>
    `);

    expect(players).toMatchObject([
      {
        externalPersonId: "170672",
        displayName: "Madelyne Anderson",
        isProfessional: true,
      },
    ]);
  });
});

describe("VolleyballLife division hydration", () => {
  it("falls back to embedded tournament data when the hydrate endpoint is empty", () => {
    const embedded = {
      id: 15131,
      teams: [{ id: 74291 }],
      days: [{ id: 1 }],
    };

    expect(
      selectVolleyballLifeDivisionData(
        { id: 15131, teams: [], days: [] },
        embedded,
      ),
    ).toBe(embedded);
  });
});
