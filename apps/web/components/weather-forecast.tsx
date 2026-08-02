import type {
  WeatherForecast,
  WeatherForecastPoint,
  WeatherIcon,
} from "@duna/core";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Snowflake,
  Sun,
  Sunrise,
  Sunset,
  Wind,
} from "lucide-react";

function closestPoint(
  forecast: WeatherForecast,
  instant: string,
): WeatherForecastPoint | undefined {
  const target = Date.parse(instant);
  return [...forecast.hourly].sort(
    (left, right) =>
      Math.abs(Date.parse(left.startsAt) - target) -
      Math.abs(Date.parse(right.startsAt) - target),
  )[0];
}

function Icon({
  icon,
  size = 18,
}: {
  readonly icon: WeatherIcon;
  readonly size?: number;
}) {
  if (icon === "clear" || icon === "mostly-clear") {
    return <Sun aria-hidden size={size} />;
  }
  if (icon === "partly-cloudy") return <CloudSun aria-hidden size={size} />;
  if (icon === "fog") return <CloudFog aria-hidden size={size} />;
  if (icon === "drizzle" || icon === "rain") {
    return <CloudRain aria-hidden size={size} />;
  }
  if (icon === "snow") return <Snowflake aria-hidden size={size} />;
  if (icon === "storm") return <CloudLightning aria-hidden size={size} />;
  if (icon === "wind") return <Wind aria-hidden size={size} />;
  return <Cloud aria-hidden size={size} />;
}

function fahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

function milesPerHour(kph: number): number {
  return Math.round(kph * 0.621371);
}

function venueTime(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(instant));
}

export function WeatherInline({
  forecast,
  instant,
}: {
  readonly forecast?: WeatherForecast;
  readonly instant: string;
}) {
  if (!forecast) return null;
  const point = closestPoint(forecast, instant);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: forecast.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
  const day = forecast.days.find((candidate) => candidate.date === date);
  const presentation = point ?? day;
  if (!presentation) return null;
  return (
    <span className="weather-inline">
      <Icon icon={presentation.icon} size={15} />
      {point?.temperatureC !== undefined && (
        <strong>{fahrenheit(point.temperatureC)}°</strong>
      )}
      <span>{presentation.condition}</span>
    </span>
  );
}

export function WeatherForecastCard({
  forecast,
  instant,
  title = "Expected conditions",
}: {
  readonly forecast?: WeatherForecast;
  readonly instant: string;
  readonly title?: string;
}) {
  if (!forecast) return null;
  const point = closestPoint(forecast, instant);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: forecast.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
  const day = forecast.days.find((candidate) => candidate.date === date);
  const presentation = point ?? day;
  if (!presentation) return null;
  return (
    <article className="weather-card">
      <header>
        <span className="weather-card__icon">
          <Icon icon={presentation.icon} size={26} />
        </span>
        <div>
          <small>{title}</small>
          <strong>
            {point?.temperatureC !== undefined
              ? `${fahrenheit(point.temperatureC)}° · `
              : ""}
            {presentation.condition}
          </strong>
        </div>
        <span className="weather-card__source">
          {forecast.source === "tomorrow.io"
            ? "Tomorrow.io forecast"
            : "Daylight estimate"}
        </span>
      </header>
      <div className="weather-card__details">
        {point?.precipitationProbability !== undefined && (
          <span>
            <CloudRain aria-hidden size={16} />
            <small>Rain</small>
            <strong>{Math.round(point.precipitationProbability)}%</strong>
          </span>
        )}
        {point?.windSpeedKph !== undefined && (
          <span>
            <Wind aria-hidden size={16} />
            <small>Wind</small>
            <strong>{milesPerHour(point.windSpeedKph)} mph</strong>
          </span>
        )}
        {day?.sunriseAt && (
          <span>
            <Sunrise aria-hidden size={16} />
            <small>Sunrise</small>
            <strong>{venueTime(day.sunriseAt, forecast.timezone)}</strong>
          </span>
        )}
        {day?.sunsetAt && (
          <span>
            <Sunset aria-hidden size={16} />
            <small>Sunset</small>
            <strong>{venueTime(day.sunsetAt, forecast.timezone)}</strong>
          </span>
        )}
      </div>
      <footer>
        Updated {venueTime(forecast.updatedAt, forecast.timezone)}
        {forecast.source === "calculated-daylight"
          ? " · Weather becomes available closer to play"
          : ""}
      </footer>
    </article>
  );
}
