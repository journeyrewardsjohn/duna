import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

type ResultPlayIconProps = {
  readonly outcome: "won" | "lost";
  readonly playersPerSide?: number;
  readonly size?: number;
};

/**
 * A scalable, native beach-volleyball object for result cards. Gradients,
 * inset highlights, contact shadows, and sand texture give the small icon the
 * dimensional character of a physical trophy rather than flat decoration.
 */
export function ResultPlayIcon({
  outcome,
  playersPerSide = 2,
  size = 142,
}: ResultPlayIconProps) {
  const won = outcome === "won";
  const safePlayersPerSide = Math.max(1, Math.min(playersPerSide, 6));
  const label = `${safePlayersPerSide}V${safePlayersPerSide}`;

  return (
    <Svg
      accessibilityElementsHidden
      aria-hidden
      height={size}
      viewBox="0 0 160 160"
      width={size}
    >
      <Defs>
        <LinearGradient id="sand" x1="0" x2="0.8" y1="0" y2="1">
          <Stop offset="0" stopColor={won ? "#F7E5A8" : "#E7D9BA"} />
          <Stop offset="0.55" stopColor={won ? "#DCB868" : "#BFA97F"} />
          <Stop offset="1" stopColor={won ? "#9C6D31" : "#806B4F"} />
        </LinearGradient>
        <LinearGradient id="sandRim" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFF4CD" stopOpacity="0.95" />
          <Stop offset="1" stopColor="#8B602F" stopOpacity="0.4" />
        </LinearGradient>
        <RadialGradient cx="0.32" cy="0.2" id="ball" r="0.8">
          <Stop offset="0" stopColor="#FFFBE7" />
          <Stop offset="0.34" stopColor="#FFE866" />
          <Stop offset="0.74" stopColor="#F0B52A" />
          <Stop offset="1" stopColor="#B86A16" />
        </RadialGradient>
        <LinearGradient id="bluePanel" x1="0.2" x2="0.9" y1="0" y2="1">
          <Stop offset="0" stopColor="#77DDE1" />
          <Stop offset="0.5" stopColor="#2B8897" />
          <Stop offset="1" stopColor="#163E49" />
        </LinearGradient>
        <LinearGradient id="netPost" x1="0" x2="1" y1="0" y2="0">
          <Stop offset="0" stopColor="#294B54" />
          <Stop offset="0.45" stopColor="#F6FBF9" />
          <Stop offset="1" stopColor="#19353C" />
        </LinearGradient>
        <LinearGradient id="badge" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={won ? "#2F6268" : "#43585B"} />
          <Stop offset="1" stopColor={won ? "#102F37" : "#23373C"} />
        </LinearGradient>
        <RadialGradient cx="0.35" cy="0.25" id="glow" r="0.75">
          <Stop
            offset="0"
            stopColor={won ? "#FFF2A8" : "#D7ECED"}
            stopOpacity={won ? 0.88 : 0.54}
          />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <Circle cx="82" cy="73" fill="url(#glow)" r="68" />
      <Ellipse cx="82" cy="137" fill="#19363D" opacity="0.2" rx="59" ry="11" />
      <Ellipse cx="80" cy="127" fill="url(#sand)" rx="58" ry="22" />
      <Path
        d="M24 125c5 14 26 23 56 23s53-9 58-23c-10 10-30 15-58 15-26 0-47-5-56-15Z"
        fill="#79532C"
        opacity="0.58"
      />
      <Ellipse
        cx="80"
        cy="124"
        fill="none"
        rx="55"
        ry="18"
        stroke="url(#sandRim)"
        strokeWidth="2"
      />
      <Path
        d="M43 119c15-8 58-9 78 1M51 129c14 6 48 7 65 0"
        fill="none"
        opacity="0.36"
        stroke="#FFF0C1"
        strokeLinecap="round"
        strokeWidth="2"
      />

      <Rect fill="url(#netPost)" height="61" rx="2.5" width="7" x="34" y="60" />
      <Rect
        fill="url(#netPost)"
        height="61"
        rx="2.5"
        width="7"
        x="121"
        y="60"
      />
      <Rect fill="#F7FAF7" height="4" rx="2" width="87" x="38" y="63" />
      <Path
        d="M40 68h82v35H40zM40 76h82M40 85h82M40 94h82M51 67v36M63 67v36M75 67v36M87 67v36M99 67v36M111 67v36"
        fill="none"
        opacity="0.72"
        stroke="#EEF4EC"
        strokeWidth="1.15"
      />
      <Path
        d="M41 104c21 4 58 5 80 0"
        fill="none"
        opacity="0.65"
        stroke="#173941"
        strokeWidth="3"
      />

      {won ? (
        <G>
          <Path
            d="M102 21l2.8 7.1 7.2 2.9-7.2 2.8-2.8 7.2-2.9-7.2-7.1-2.8 7.1-2.9L102 21Z"
            fill="#FFF1A3"
          />
          <Path
            d="M59 27l1.8 4.6 4.7 1.9-4.7 1.8-1.8 4.7-1.9-4.7-4.6-1.8 4.6-1.9L59 27Z"
            fill="#FFFFFF"
            opacity="0.9"
          />
        </G>
      ) : (
        <Path
          d="M51 40c10-10 22-14 34-12"
          fill="none"
          opacity="0.55"
          stroke="#4B6970"
          strokeDasharray="3 5"
          strokeLinecap="round"
          strokeWidth="2.5"
        />
      )}

      <Ellipse
        cx={won ? 82 : 78}
        cy={won ? 101 : 116}
        fill="#4B321A"
        opacity={won ? 0.17 : 0.27}
        rx={won ? 17 : 21}
        ry={won ? 5 : 6}
      />
      <G
        transform={
          won
            ? "translate(52 24) rotate(-9 30 30)"
            : "translate(51 71) rotate(8 30 30)"
        }
      >
        <Circle cx="30" cy="30" fill="#5A3914" opacity="0.25" r="29" />
        <Circle cx="29" cy="27" fill="url(#ball)" r="28" />
        <Path
          d="M8 14c12 1 18 7 21 15 4 11 14 18 26 18"
          fill="none"
          stroke="url(#bluePanel)"
          strokeLinecap="round"
          strokeWidth="10"
        />
        <Path
          d="M37 2c-8 9-11 19-8 27 4 11 1 19-8 26"
          fill="none"
          stroke="url(#bluePanel)"
          strokeLinecap="round"
          strokeWidth="9"
        />
        <Path
          d="M4 34c11-5 20-6 27-2 9 5 18 5 25 1"
          fill="none"
          opacity="0.72"
          stroke="#FFF8D6"
          strokeLinecap="round"
          strokeWidth="2"
        />
        <Ellipse
          cx="18"
          cy="11"
          fill="#FFFFFF"
          opacity="0.5"
          rx="8"
          ry="4"
          transform="rotate(-25 18 11)"
        />
      </G>

      <G>
        <Rect
          fill="#0C252C"
          height="26"
          opacity="0.22"
          rx="13"
          width="49"
          x="58"
          y="126"
        />
        <Rect
          fill="url(#badge)"
          height="24"
          rx="12"
          width="49"
          x="56"
          y="123"
        />
        <Path
          d="M62 126h37"
          opacity="0.35"
          stroke="#FFFFFF"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
        <SvgText
          fill="#F7F2E5"
          fontSize="10"
          fontWeight="900"
          letterSpacing="1.1"
          textAnchor="middle"
          x="80.5"
          y="139"
        >
          {label}
        </SvgText>
      </G>
    </Svg>
  );
}
