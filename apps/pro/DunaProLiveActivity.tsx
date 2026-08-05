import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity } from "expo-widgets";

export type DunaProLiveActivityProps = {
  readonly subjectId: string;
  readonly kind: "coach";
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
  readonly startsAt?: string;
  readonly phase?:
    "prepare" | "leave" | "travel" | "arrived" | "live" | "final";
  readonly venueName?: string;
  readonly rosterSummary?: string;
  readonly playerOneName?: string;
  readonly playerOneEtaMinutes?: number;
  readonly playerOneStatus?: string;
  readonly playerTwoName?: string;
  readonly playerTwoEtaMinutes?: number;
  readonly playerTwoStatus?: string;
  readonly updatedAt: string;
};

const navy = "#10263d";
const sky = "#86c9ef";
const white = "#ffffff";
const mist = "#c8d6e2";
const warning = "#f7c86b";

function eta(value?: number, status?: string) {
  if (status === "arrived") return "HERE";
  if (value === undefined) return "—";
  return `${Math.max(0, value)} MIN`;
}

function statusColor(status?: string) {
  return status === "running-late" ? warning : sky;
}

function Activity(
  props: DunaProLiveActivityProps,
): ReturnType<
  Parameters<typeof createLiveActivity<DunaProLiveActivityProps>>[1]
> {
  "widget";

  const mark = <Image color={sky} size={17} systemName="figure.run" />;
  const playerRow = (
    name?: string,
    etaMinutes?: number,
    playerStatus?: string,
  ) => (
    <HStack alignment="center" spacing={8}>
      <Text
        modifiers={[
          font({ size: 13, weight: "bold", design: "rounded" }),
          foregroundStyle(white),
        ]}
      >
        {name ?? "Waiting for player"}
      </Text>
      <Spacer />
      <Text
        modifiers={[
          font({ size: 13, weight: "black", design: "rounded" }),
          foregroundStyle(statusColor(playerStatus)),
        ]}
      >
        {eta(etaMinutes, playerStatus)}
      </Text>
    </HStack>
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
            font({ size: 11, weight: "bold", design: "rounded" }),
            foregroundStyle(sky),
          ]}
        >
          PLAYER ARRIVALS
        </Text>
        <Spacer />
        <Text
          modifiers={[
            font({ size: 10, weight: "black", design: "rounded" }),
            foregroundStyle(warning),
          ]}
        >
          DUNA PRO
        </Text>
      </HStack>
      <VStack alignment="leading" spacing={2}>
        <Text
          modifiers={[
            font({ size: 19, weight: "black", design: "rounded" }),
            foregroundStyle(white),
          ]}
        >
          {props.title}
        </Text>
        <Text
          modifiers={[
            font({ size: 11, weight: "medium", design: "rounded" }),
            foregroundStyle(mist),
          ]}
        >
          {props.rosterSummary ?? props.status}
        </Text>
      </VStack>
      <VStack alignment="leading" spacing={7}>
        {playerRow(
          props.playerOneName,
          props.playerOneEtaMinutes,
          props.playerOneStatus,
        )}
        {playerRow(
          props.playerTwoName,
          props.playerTwoEtaMinutes,
          props.playerTwoStatus,
        )}
      </VStack>
    </VStack>
  );

  const compact = (
    <HStack
      alignment="center"
      modifiers={[padding({ horizontal: 12, vertical: 9 })]}
      spacing={8}
    >
      {mark}
      <VStack alignment="leading" spacing={1}>
        <Text
          modifiers={[
            font({ size: 12, weight: "bold", design: "rounded" }),
            foregroundStyle(white),
          ]}
        >
          {props.title}
        </Text>
        <Text
          modifiers={[
            font({ size: 10, weight: "medium", design: "rounded" }),
            foregroundStyle(mist),
          ]}
        >
          {props.rosterSummary ?? props.status}
        </Text>
      </VStack>
      <Spacer />
      <Text
        modifiers={[
          font({ size: 12, weight: "black", design: "rounded" }),
          foregroundStyle(sky),
        ]}
      >
        {eta(props.playerOneEtaMinutes, props.playerOneStatus)}
      </Text>
    </HStack>
  );

  return {
    banner,
    bannerSmall: compact,
    compactLeading: mark,
    compactTrailing: (
      <Text
        modifiers={[
          font({ size: 12, weight: "black", design: "rounded" }),
          foregroundStyle(sky),
        ]}
      >
        {eta(props.playerOneEtaMinutes, props.playerOneStatus)}
      </Text>
    ),
    minimal: <Image color={sky} size={15} systemName="figure.run" />,
    expandedLeading: (
      <VStack
        alignment="leading"
        modifiers={[frame({ maxWidth: 96 })]}
        spacing={2}
      >
        {mark}
        <Text
          modifiers={[
            font({ size: 10, weight: "bold", design: "rounded" }),
            foregroundStyle(white),
          ]}
        >
          {props.playerOneName ?? "ARRIVALS"}
        </Text>
      </VStack>
    ),
    expandedCenter: (
      <VStack alignment="center" spacing={2}>
        <Text
          modifiers={[
            font({ size: 18, weight: "black", design: "rounded" }),
            foregroundStyle(white),
          ]}
        >
          {eta(props.playerOneEtaMinutes, props.playerOneStatus)}
        </Text>
        <Text
          modifiers={[
            font({ size: 10, weight: "bold", design: "rounded" }),
            foregroundStyle(sky),
          ]}
        >
          NEXT ARRIVAL
        </Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack
        alignment="trailing"
        modifiers={[frame({ maxWidth: 96 })]}
        spacing={2}
      >
        <Text
          modifiers={[
            font({ size: 10, weight: "bold", design: "rounded" }),
            foregroundStyle(white),
          ]}
        >
          DUNA PRO
        </Text>
        <Text
          modifiers={[
            font({ size: 10, weight: "medium", design: "rounded" }),
            foregroundStyle(mist),
          ]}
        >
          {props.status}
        </Text>
      </VStack>
    ),
    expandedBottom: compact,
  };
}

export default createLiveActivity("DunaProLiveActivity", Activity);
