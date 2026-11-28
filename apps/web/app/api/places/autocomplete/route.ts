import { NextResponse } from "next/server";
import {
  PLACES_CACHE_TTL_MS,
  placesRateLimit,
  regionCodeFrom,
  sessionTokenFrom,
  ShortCache,
} from "../guard";

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

interface Suggestion {
  readonly placeId: string;
  readonly text: string;
  readonly mainText: string;
  readonly secondaryText: string;
}

/** Identical text from the same region, for ten minutes. */
const cache = new ShortCache<readonly Suggestion[]>(PLACES_CACHE_TTL_MS, 500);

export async function GET(request: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Location search is not configured." },
      { status: 503 },
    );
  }
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3 || query.length > 180) {
    return NextResponse.json({ suggestions: [] });
  }
  const limited = await placesRateLimit(request, "autocomplete");
  if (limited) return limited;

  const regionCode = regionCodeFrom(request);
  const cacheKey = `${regionCode ?? "-"}:${query.toLowerCase().replace(/\s+/g, " ")}`;
  const cached = cache.get(cacheKey);
  if (cached) return NextResponse.json({ suggestions: cached });

  const sessionToken = sessionTokenFrom(request);
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
        // Billing: every keystroke in one open picker is one session.
        ...(sessionToken ? { sessionToken } : {}),
        // Bias (never restrict) towards where the visitor is.
        ...(regionCode ? { regionCode } : {}),
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
  const suggestions = (data.suggestions ?? []).flatMap((suggestion) => {
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
  });
  cache.set(cacheKey, suggestions);
  return NextResponse.json({ suggestions });
}
