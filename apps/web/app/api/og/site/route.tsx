import { tidelineTokens } from "@duna/ui/tideline/tokens";
import { ImageResponse } from "next/og";

export const runtime = "edge";

/**
 * The public site's social card (docs/design/website.md §2.12): the Night
 * Court ground, the net line with its post, the Jost title and one concept
 * drawn in the brand's lines. Colours come from the token table (an image
 * cannot read CSS variables); the fonts are the brand's own files (OFL).
 */
const brand = tidelineTokens.color.dark;
const NIGHT = brand["brand-night-court"];
const SALT = brand["brand-salt"];
const DUNE = brand["brand-dune"];
const LINE = brand["mesh-night-court-b"];
const PANEL = brand["mesh-night-court-a"];

const concepts = ["rating", "club", "coach", "price", "score"] as const;
type Concept = (typeof concepts)[number];

function text(value: string | null, fallback: string, length: number) {
  return value?.trim().slice(0, length) || fallback;
}

function Ring() {
  // The two-ring Sand Rating, drawn: a track, an arc and the reliability band.
  const r = 120;
  const c = 2 * Math.PI * r;
  return (
    <svg height="300" viewBox="0 0 300 300" width="300">
      <circle
        cx="150"
        cy="150"
        fill="none"
        r={r}
        stroke={LINE}
        strokeWidth="14"
      />
      <circle
        cx="150"
        cy="150"
        fill="none"
        r={r}
        stroke={DUNE}
        strokeDasharray={`${c * 0.4} ${c}`}
        strokeLinecap="round"
        strokeWidth="14"
        transform="rotate(-90 150 150)"
      />
      <circle
        cx="150"
        cy="150"
        fill="none"
        r="96"
        stroke={PANEL}
        strokeWidth="6"
      />
    </svg>
  );
}

function Slots({ filled }: { readonly filled: number }) {
  return (
    <div style={{ display: "flex", gap: 18 }}>
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            background: index < filled ? DUNE : "transparent",
            border: `3px ${index < filled ? "solid" : "dashed"} ${index < filled ? DUNE : LINE}`,
          }}
        />
      ))}
    </div>
  );
}

function ConceptArt({ concept }: { readonly concept: Concept }) {
  if (concept === "rating") return <Ring />;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 26,
        padding: 36,
        borderRadius: 28,
        border: `2px solid ${LINE}`,
        background: PANEL,
        width: 360,
      }}
    >
      <div
        style={{
          display: "flex",
          height: 14,
          width: 180,
          borderRadius: 7,
          background: LINE,
        }}
      />
      {concept === "score" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {[0, 1].map((row) => (
            <div
              key={row}
              style={{ display: "flex", alignItems: "center", gap: 18 }}
            >
              <div
                style={{
                  display: "flex",
                  height: 14,
                  width: 150,
                  borderRadius: 7,
                  background: LINE,
                }}
              />
              <div
                style={{
                  display: "flex",
                  height: 40,
                  width: 56,
                  borderRadius: 8,
                  background: row === 0 ? DUNE : LINE,
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <Slots filled={concept === "price" ? 2 : concept === "coach" ? 3 : 4} />
      )}
      <div
        style={{
          display: "flex",
          height: 8,
          width: 288,
          borderRadius: 4,
          background: LINE,
        }}
      >
        <div
          style={{
            display: "flex",
            height: 8,
            borderRadius: 4,
            background: DUNE,
            width: concept === "price" ? 144 : concept === "coach" ? 216 : 288,
          }}
        />
      </div>
    </div>
  );
}

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const title = text(parameters.get("title"), "Meet you at the net.", 90);
  const eyebrow = text(parameters.get("eyebrow"), "Duna", 48);
  const requested = parameters.get("concept");
  const concept: Concept = concepts.includes(requested as Concept)
    ? (requested as Concept)
    : "rating";
  const [jost, geist] = await Promise.all([
    fetch(new URL("./Jost-Medium.ttf", import.meta.url)).then((response) =>
      response.arrayBuffer(),
    ),
    fetch(new URL("./Geist-Medium.ttf", import.meta.url)).then((response) =>
      response.arrayBuffer(),
    ),
  ]);

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: NIGHT,
        color: SALT,
        padding: "72px 80px",
        fontFamily: "Geist",
        justifyContent: "space-between",
        alignItems: "stretch",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          maxWidth: 640,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: DUNE,
            }}
          >
            {eyebrow}
          </div>
          <div style={{ display: "flex", alignItems: "center", width: 560 }}>
            <div
              style={{
                display: "flex",
                width: 4,
                height: 18,
                background: SALT,
              }}
            />
            <div
              style={{ display: "flex", flex: 1, height: 2, background: LINE }}
            />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Jost",
            fontSize: title.length > 48 ? 64 : 76,
            lineHeight: 1.06,
            letterSpacing: "-0.015em",
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", fontSize: 26, color: DUNE }}>
          duna.coach
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ConceptArt concept={concept} />
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Jost", data: jost, weight: 500, style: "normal" },
        { name: "Geist", data: geist, weight: 500, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=86400, immutable" },
    },
  );
}
