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
  readonly kind: "upcoming" | "match";
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly startsAt?: string;
  readonly teamA?: string;
  readonly teamB?: string;
  readonly scoreA?: number;
  readonly scoreB?: number;
  readonly setLabel?: string;
  readonly updatedAt: string;
};

const navy = "#10263d";
const blue = "#2f6fb1";
const sky = "#86c9ef";
const white = "#ffffff";
const mist = "#d9e7f2";

function shortLabel(label?: string) {
  if (!label) return "TBD";
  const pieces = label.split(/[/,&]/).map((part) => part.trim());
  return pieces
    .map((part) => part.split(/\s+/).at(-1))
    .filter(Boolean)
    .join(" / ");
}

function Activity(
  props: DunaLiveActivityProps,
): ReturnType<Parameters<typeof createLiveActivity<DunaLiveActivityProps>>[1]> {
  "widget";

  const isMatch = props.kind === "match";
  const score = `${props.scoreA ?? 0}–${props.scoreB ?? 0}`;
  const leading = isMatch ? shortLabel(props.teamA) : props.status;
  const trailing = isMatch ? shortLabel(props.teamB) : "DUNA";

  const mark = (
    <Image
      color={sky}
      size={18}
      systemName={isMatch ? "volleyball.fill" : "calendar.badge.clock"}
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
      {isMatch ? (
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
        <VStack alignment="leading" spacing={4}>
          <Text
            modifiers={[
              font({ size: 20, weight: "bold", design: "rounded" }),
              foregroundStyle(white),
            ]}
          >
            {props.title}
          </Text>
          <Text
            modifiers={[
              font({ size: 13, weight: "medium", design: "rounded" }),
              foregroundStyle(mist),
            ]}
          >
            {props.subtitle}
          </Text>
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
          {isMatch ? `${leading} vs ${trailing}` : props.title}
        </Text>
        <Text
          modifiers={[
            font({ size: 11, weight: "medium", design: "rounded" }),
            foregroundStyle(mist),
          ]}
        >
          {isMatch
            ? `${score} · ${props.setLabel ?? props.status}`
            : props.status}
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
        {isMatch ? score : props.status}
      </Text>
    ),
    minimal: (
      <Image
        color={sky}
        size={15}
        systemName={isMatch ? "volleyball.fill" : "calendar.badge.clock"}
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
              size: isMatch ? 24 : 14,
              weight: "black",
              design: "rounded",
            }),
            foregroundStyle(white),
          ]}
        >
          {isMatch ? score : props.title}
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
