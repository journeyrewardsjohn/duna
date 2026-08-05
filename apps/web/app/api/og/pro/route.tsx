import { ImageResponse } from "next/og";

export const runtime = "edge";

function copy(value: string | null, fallback: string, length: number) {
  return value?.trim().slice(0, length) || fallback;
}

export function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const title = copy(
    parameters.get("title"),
    "Professional beach volleyball",
    120,
  );
  const eyebrow = copy(parameters.get("eyebrow"), "Duna Pro Tour", 80);
  const detail = copy(
    parameters.get("detail"),
    "Events · teams · scores · broadcasts · SandRating",
    140,
  );

  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "#071b29",
        color: "#f7f3e9",
        display: "flex",
        height: "100%",
        justifyContent: "space-between",
        overflow: "hidden",
        padding: "68px 72px",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          background:
            "radial-gradient(circle at center, rgba(90,218,207,.42), rgba(7,27,41,0) 68%)",
          border: "2px solid rgba(247,243,233,.12)",
          borderRadius: 999,
          display: "flex",
          height: 620,
          position: "absolute",
          right: -140,
          top: -230,
          width: 620,
        }}
      />
      <div
        style={{
          alignItems: "flex-start",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          maxWidth: 930,
          zIndex: 2,
        }}
      >
        <div
          style={{
            alignItems: "center",
            color: "#69d8d0",
            display: "flex",
            fontSize: 25,
            fontWeight: 800,
            letterSpacing: ".12em",
            textTransform: "uppercase",
          }}
        >
          <span
            style={{
              background: "#69d8d0",
              borderRadius: 999,
              display: "flex",
              height: 13,
              marginRight: 15,
              width: 13,
            }}
          />
          {eyebrow}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: title.length > 66 ? 58 : 72,
              fontWeight: 900,
              letterSpacing: "-.055em",
              lineHeight: 0.98,
              maxWidth: 980,
            }}
          >
            {title}
          </div>
          <div
            style={{
              color: "rgba(247,243,233,.68)",
              fontSize: 26,
              lineHeight: 1.35,
              marginTop: 28,
            }}
          >
            {detail}
          </div>
        </div>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: ".14em",
            textTransform: "uppercase",
          }}
        >
          Duna
          <span
            style={{
              color: "rgba(247,243,233,.48)",
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: 0,
              marginLeft: 18,
              textTransform: "none",
            }}
          >
            The operating system for sand
          </span>
        </div>
      </div>
      <div
        style={{
          alignItems: "center",
          alignSelf: "flex-end",
          background: "linear-gradient(145deg, #f1c163, #b97717)",
          border: "8px solid rgba(247,243,233,.12)",
          borderRadius: 999,
          boxShadow: "0 25px 60px rgba(0,0,0,.28)",
          color: "#071b29",
          display: "flex",
          fontSize: 58,
          fontWeight: 900,
          height: 170,
          justifyContent: "center",
          marginBottom: 18,
          width: 170,
          zIndex: 2,
        }}
      >
        SR
      </div>
    </div>,
    {
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
      width: 1200,
    },
  );
}
