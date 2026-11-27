import { useEffect, useState } from "react";
import { View } from "react-native";
import { SvgUri } from "react-native-svg";
import { dunaWebUrl } from "../../../mobile-api";
import { SatoshiText as Text } from "../../../satoshi-text";
import { styles } from "../../legacy/styles";

export function ProTourBrandMark({
  source,
  compact = false,
}: {
  readonly source: "fivb" | "avp";
  readonly compact?: boolean;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [source]);
  const label = source === "avp" ? "AVP" : "BEACH PRO TOUR";
  const asset = source === "avp" ? "avp.svg" : "beach-pro-tour.svg";
  return (
    <View
      accessibilityLabel={
        source === "avp" ? "AVP" : "Volleyball World Beach Pro Tour"
      }
      style={[
        styles.proMobileBrandMark,
        compact && styles.proMobileBrandMarkCompact,
      ]}
    >
      {logoFailed ? (
        <Text
          numberOfLines={1}
          style={[
            styles.proMobileBrandFallback,
            source === "avp" && styles.proMobileBrandFallbackAvp,
          ]}
        >
          {label}
        </Text>
      ) : (
        <SvgUri
          height={compact ? 26 : 36}
          onError={() => setLogoFailed(true)}
          uri={`${dunaWebUrl}/media/tours/${asset}`}
          width={compact ? 58 : 84}
        />
      )}
    </View>
  );
}
