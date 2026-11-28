import { describe, expect, it } from "vitest";
import {
  BRAND_MIN_ZOOM,
  CLUSTER_MAX_ZOOM,
  clustersAllowed,
  COURT_MIN_ZOOM,
  ICON_MIN_ZOOM,
  LABEL_MIN_ZOOM,
  mapStyleForZoom,
  pinModel,
} from "./map-pins";

describe("mapStyleForZoom", () => {
  it("is standard to zoom 16 and satellite for the last three levels", () => {
    expect(mapStyleForZoom(3)).toBe("standard");
    expect(mapStyleForZoom(16)).toBe("standard");
    expect(mapStyleForZoom(16.4)).toBe("satellite");
    expect(mapStyleForZoom(17)).toBe("satellite");
    expect(mapStyleForZoom(19)).toBe("satellite");
  });
  it("follows a different max zoom", () => {
    expect(mapStyleForZoom(17, 20)).toBe("standard");
    expect(mapStyleForZoom(17.5, 20)).toBe("satellite");
  });
});

describe("pinModel ladder for clubs", () => {
  it("dot, icon, icon + label, club mark", () => {
    expect(pinModel({ zoom: ICON_MIN_ZOOM - 0.1, kind: "club" })).toMatchObject(
      { tier: "dot", showIcon: false },
    );
    expect(pinModel({ zoom: ICON_MIN_ZOOM, kind: "club" })).toMatchObject({
      tier: "icon",
      showIcon: true,
      showLabel: false,
    });
    expect(pinModel({ zoom: LABEL_MIN_ZOOM, kind: "club" })).toMatchObject({
      tier: "icon-label",
      showLabel: true,
    });
    expect(pinModel({ zoom: BRAND_MIN_ZOOM - 0.1, kind: "club" }).tier).toBe(
      "icon-label",
    );
    expect(pinModel({ zoom: BRAND_MIN_ZOOM, kind: "club" })).toMatchObject({
      tier: "club-mark",
      showClubMark: true,
      showIcon: false,
      showLabel: true,
    });
    expect(pinModel({ zoom: 19, kind: "club" }).tier).toBe("club-mark");
  });

  it("other kinds never get a club mark", () => {
    expect(pinModel({ zoom: 17, kind: "tournament" })).toMatchObject({
      tier: "icon-label",
      showClubMark: false,
    });
  });
});

describe("pinModel clusters", () => {
  it("clusters only when allowed by zoom", () => {
    expect(clustersAllowed(CLUSTER_MAX_ZOOM)).toBe(true);
    expect(clustersAllowed(CLUSTER_MAX_ZOOM + 1)).toBe(false);
    expect(pinModel({ zoom: 8, kind: "club", clusterCount: 5 })).toMatchObject({
      tier: "cluster",
      clusterCount: 5,
      showIcon: false,
    });
    expect(pinModel({ zoom: 15, kind: "club", clusterCount: 5 }).tier).toBe(
      "club-mark",
    );
    expect(pinModel({ zoom: 8, kind: "club", clusterCount: 1 }).tier).toBe(
      "dot",
    );
  });
});

describe("pinModel courts", () => {
  it("courts appear only from zoom 18", () => {
    expect(
      pinModel({ zoom: COURT_MIN_ZOOM - 0.1, kind: "court" }),
    ).toMatchObject({ tier: "hidden" });
    expect(pinModel({ zoom: COURT_MIN_ZOOM, kind: "court" })).toMatchObject({
      tier: "court",
      showLabel: true,
    });
  });
});

describe("pinModel flags", () => {
  it("yours is inverted and live is Solar, independently", () => {
    expect(pinModel({ zoom: 14, kind: "club" })).toMatchObject({
      inverted: false,
      solar: false,
    });
    expect(pinModel({ zoom: 14, kind: "club", yours: true })).toMatchObject({
      inverted: true,
      solar: false,
    });
    expect(pinModel({ zoom: 14, kind: "match", live: true })).toMatchObject({
      inverted: false,
      solar: true,
    });
    expect(
      pinModel({ zoom: 5, kind: "club", yours: true, live: true }),
    ).toMatchObject({ inverted: true, solar: true });
    expect(pinModel({ zoom: 19, kind: "court", live: true }).solar).toBe(true);
    expect(
      pinModel({ zoom: 8, kind: "club", clusterCount: 3, yours: true })
        .inverted,
    ).toBe(true);
  });
});
