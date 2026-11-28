export function weatherSymbol(icon: string | undefined): string {
  if (icon === "clear" || icon === "mostly-clear") return "☀";
  if (icon === "partly-cloudy") return "🌤";
  if (icon === "rain" || icon === "drizzle") return "🌦";
  if (icon === "storm") return "⛈";
  if (icon === "snow") return "❄";
  if (icon === "fog") return "≋";
  return "☁";
}

export function recordedWeatherSymbol(condition: string): string {
  const normalized = condition.toLowerCase();
  if (normalized.includes("thunder")) return "⛈";
  if (normalized.includes("rain") || normalized.includes("drizzle")) {
    return "🌦";
  }
  if (normalized.includes("snow") || normalized.includes("ice")) return "❄";
  if (normalized.includes("fog")) return "≋";
  if (normalized.includes("partly") || normalized.includes("mostly cloudy")) {
    return "🌤";
  }
  if (normalized.includes("clear")) return "☀";
  return "☁";
}

export function fahrenheit(celsius: number | undefined): string {
  return celsius === undefined ? "" : `${Math.round((celsius * 9) / 5 + 32)}°`;
}

export function closestWeather<
  Point extends { readonly startsAt: string; readonly temperatureC?: number },
>(points: readonly Point[] | undefined, startsAt: string): Point | undefined {
  const timestamp = Date.parse(startsAt);
  return points
    ?.slice()
    .sort(
      (left, right) =>
        Math.abs(Date.parse(left.startsAt) - timestamp) -
        Math.abs(Date.parse(right.startsAt) - timestamp),
    )[0];
}
