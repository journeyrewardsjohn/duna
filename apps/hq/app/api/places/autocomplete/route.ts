import { NextResponse } from "next/server";

interface GoogleAutocompleteResponse {
  readonly suggestions?: readonly {
    readonly placePrediction?: {
      readonly placeId?: string;
      readonly text?: { readonly text?: string };
      readonly structuredFormat?: {
        readonly mainText?: { readonly text?: string };
        readonly secondaryText?: { readonly text?: string };
      };
    };
  }[];
}

export async function GET(request: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Google Places is not configured." },
      { status: 503 },
    );
  }
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3 || query.length > 180) {
    return NextResponse.json({ suggestions: [] });
  }
  const response = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
      },
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ["us", "ca", "au", "br"],
      }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    return NextResponse.json(
      { error: "Location search is temporarily unavailable." },
      { status: 502 },
    );
  }
  const data = (await response.json()) as GoogleAutocompleteResponse;
  return NextResponse.json({
    suggestions: (data.suggestions ?? []).flatMap((suggestion) => {
      const prediction = suggestion.placePrediction;
      if (!prediction?.placeId || !prediction.text?.text) return [];
      return [
        {
          placeId: prediction.placeId,
          text: prediction.text.text,
          mainText:
            prediction.structuredFormat?.mainText?.text ?? prediction.text.text,
          secondaryText: prediction.structuredFormat?.secondaryText?.text ?? "",
        },
      ];
    }),
  });
}
