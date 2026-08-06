import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity } from "expo-widgets";

export type DunaLiveActivityProps = {
  readonly subjectId: string;
  readonly kind: "upcoming" | "match" | "event" | "player";
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly startsAt?: string;
  readonly teamA?: string;
  readonly teamB?: string;
  readonly scoreA?: number;
  readonly scoreB?: number;
  readonly setLabel?: string;
  readonly phase?:
    "prepare" | "leave" | "travel" | "arrived" | "live" | "final";
  readonly distanceMeters?: number;
  readonly travelDurationSeconds?: number;
  readonly leaveBy?: string;
  readonly leaveByLabel?: string;
  readonly startsAtLabel?: string;
  readonly venueName?: string;
  readonly liveMatchCount?: number;
  readonly updatedAt: string;
};

const navy = "#141a1e";
const sky = "#d4b77c";
const white = "#ffffff";
const mist = "#a9b4b8";

function shortLabel(label?: string) {
  if (!label) return "TBD";
  const pieces = label.split(/[/,&]/).map((part) => part.trim());
  return pieces
    .map((part) => part.split(/\s+/).at(-1))
    .filter(Boolean)
    .join(" / ");
}

function arrivalDistance(distance?: number) {
  if (distance === undefined) return "Location ready";
  if (distance < 160) return "At the venue";
  const miles = distance / 1609.344;
  return miles < 10
    ? `${miles.toFixed(1)} mi away`
    : `${Math.round(miles)} mi away`;
}

function Activity(
  props: DunaLiveActivityProps,
): ReturnType<Parameters<typeof createLiveActivity<DunaLiveActivityProps>>[1]> {
  "widget";

  const isScore =
    props.kind === "match" || props.kind === "event" || props.kind === "player";
  const etaMinutes = Math.max(
    0,
    Math.ceil((props.travelDurationSeconds ?? 0) / 60),
  );
  const hasTravelEta = props.travelDurationSeconds !== undefined;
  const score = `${props.scoreA ?? 0}–${props.scoreB ?? 0}`;
  const leading = isScore ? shortLabel(props.teamA) : props.status;
  const trailing = isScore ? shortLabel(props.teamB) : `${etaMinutes} MIN`;

  const mark = (
    <Image
      color={sky}
      size={18}
      systemName={isScore ? "volleyball.fill" : "location.fill"}
    />
  );

  const banner = (
    <VStack
      alignment="leading"
      modifiers={[padding({ all: 16 }), activityBackgroundTint(navy)]}
      spacing={10}
    >
      <HStack alignment="center" spacing={8}>
        {mark}
        <Text
          modifiers={[
            font({ size: 12, weight: "bold", design: "rounded" }),
            foregroundStyle(sky),
          ]}
        >
          {props.status.toUpperCase()}
        </Text>
        <Spacer />
        <Text
          modifiers={[
            font({ size: 11, weight: "semibold", design: "rounded" }),
            foregroundStyle(mist),
          ]}
        >
          DUNA
        </Text>
      </HStack>
      {isScore ? (
        <HStack alignment="center" spacing={12}>
          <VStack alignment="leading" spacing={2}>
            <Text
              modifiers={[
                font({ size: 18, weight: "bold", design: "rounded" }),
                foregroundStyle(white),
              ]}
            >
              {shortLabel(props.teamA)}
            </Text>
            <Text
              modifiers={[
                font({ size: 18, weight: "bold", design: "rounded" }),
                foregroundStyle(white),
              ]}
            >
              {shortLabel(props.teamB)}
            </Text>
          </VStack>
          <Spacer />
          <VStack alignment="trailing" spacing={0}>
            <Text
              modifiers={[
                font({ size: 34, weight: "black", design: "rounded" }),
                foregroundStyle(white),
              ]}
            >
              {score}
            </Text>
            <Text
              modifiers={[
                font({ size: 11, weight: "semibold", design: "rounded" }),
                foregroundStyle(sky),
              ]}
            >
              {props.setLabel ?? props.subtitle}
            </Text>
          </VStack>
        </HStack>
      ) : (
        <VStack alignment="leading" spacing={8}>
          <Text
            modifiers={[
              font({ size: 19, weight: "bold", design: "rounded" }),
              foregroundStyle(white),
            ]}
          >
            {props.title}
          </Text>
          <HStack alignment="center" spacing={10}>
            <VStack alignment="leading" spacing={1}>
              <Text
                modifiers={[
                  font({ size: 10, weight: "bold", design: "rounded" }),
                  foregroundStyle(sky),
                ]}
              >
                LEAVE BY
              </Text>
              <Text
                modifiers={[
                  font({ size: 18, weight: "black", design: "rounded" }),
                  foregroundStyle(white),
                ]}
              >
                {props.leaveByLabel ?? "—"}
              </Text>
            </VStack>
            <Spacer />
            <VStack alignment="leading" spacing={1}>
              <Text
                modifiers={[
                  font({ size: 10, weight: "bold", design: "rounded" }),
                  foregroundStyle(sky),
                ]}
              >
                TRAVEL ETA
              </Text>
              <Text
                modifiers={[
                  font({ size: 27, weight: "black", design: "rounded" }),
                  foregroundStyle(white),
                ]}
              >
                {hasTravelEta
                  ? etaMinutes === 0
                    ? "HERE"
                    : `${etaMinutes} MIN`
                  : "READY"}
              </Text>
            </VStack>
            <Spacer />
            <VStack alignment="trailing" spacing={1}>
              <Text
                modifiers={[
                  font({ size: 10, weight: "bold", design: "rounded" }),
                  foregroundStyle(sky),
                ]}
              >
                SESSION
              </Text>
              <Text
                modifiers={[
                  font({ size: 18, weight: "black", design: "rounded" }),
                  foregroundStyle(white),
                ]}
              >
                {props.startsAtLabel ?? "—"}
              </Text>
            </VStack>
          </HStack>
          <HStack alignment="center" spacing={6}>
            <Image color={mist} size={11} systemName="location.fill" />
            <Text
              modifiers={[
                font({ size: 10, weight: "medium", design: "rounded" }),
                foregroundStyle(mist),
              ]}
            >
              {arrivalDistance(props.distanceMeters)} ·{" "}
              {props.venueName ?? props.subtitle}
            </Text>
          </HStack>
        </VStack>
      )}
    </VStack>
  );

  const bannerSmall = (
    <HStack
      alignment="center"
      modifiers={[padding({ horizontal: 12, vertical: 10 })]}
      spacing={8}
    >
      {mark}
      <VStack alignment="leading" spacing={1}>
        <Text
          modifiers={[
            font({ size: 13, weight: "bold", design: "rounded" }),
            foregroundStyle(white),
          ]}
        >
          {isScore ? `${leading} vs ${trailing}` : props.title}
        </Text>
        <Text
          modifiers={[
            font({ size: 11, weight: "medium", design: "rounded" }),
            foregroundStyle(mist),
          ]}
        >
          {isScore
            ? `${score} · ${props.setLabel ?? props.status}`
            : `${props.status} · ${hasTravelEta ? (etaMinutes ? `${etaMinutes} min` : "at venue") : "ETA ready"}`}
        </Text>
      </VStack>
      <Spacer />
      <Text
        modifiers={[
          font({ size: 11, weight: "bold", design: "rounded" }),
          foregroundStyle(sky),
        ]}
      >
        DUNA
      </Text>
    </HStack>
  );

  return {
    banner,
    bannerSmall,
    compactLeading: mark,
    compactTrailing: (
      <Text
        modifiers={[
          font({ size: 13, weight: "bold", design: "rounded" }),
          foregroundStyle(white),
        ]}
      >
        {isScore
          ? score
          : hasTravelEta
            ? etaMinutes
              ? `${etaMinutes}m`
              : "HERE"
            : "SOON"}
      </Text>
    ),
    minimal: (
      <Image
        color={sky}
        size={15}
        systemName={isScore ? "volleyball.fill" : "location.fill"}
      />
    ),
    expandedLeading: (
      <VStack
        alignment="leading"
        modifiers={[frame({ maxWidth: 92 })]}
        spacing={2}
      >
        {mark}
        <Text
          modifiers={[
            font({ size: 11, weight: "bold", design: "rounded" }),
            foregroundStyle(white),
          ]}
        >
          {leading}
        </Text>
      </VStack>
    ),
    expandedCenter: (
      <VStack alignment="center" spacing={2}>
        <Text
          modifiers={[
            font({
              size: isScore ? 24 : 14,
              weight: "black",
              design: "rounded",
            }),
            foregroundStyle(white),
          ]}
        >
          {isScore
            ? score
            : hasTravelEta
              ? etaMinutes
                ? `${etaMinutes} MIN`
                : "ARRIVED"
              : "READY"}
        </Text>
        <Text
          modifiers={[
            font({ size: 10, weight: "semibold", design: "rounded" }),
            foregroundStyle(sky),
          ]}
        >
          {props.setLabel ?? props.status}
        </Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack
        alignment="trailing"
        modifiers={[frame({ maxWidth: 92 })]}
        spacing={2}
      >
        <Text
          modifiers={[
            font({ size: 11, weight: "bold", design: "rounded" }),
            foregroundStyle(white),
          ]}
        >
          {trailing}
        </Text>
      </VStack>
    ),
    expandedBottom: bannerSmall,
  };
}

export default createLiveActivity("DunaLiveActivity", Activity);
