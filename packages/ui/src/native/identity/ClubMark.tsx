/**
 * The club's mark on a card and its pass (contract R13): the club's logo on
 * its colour, its uploaded tile, or its two-character Jost monogram on its
 * colour, from the shared `clubMarkModel`. Never a white border, never faded.
 */
import { Image, StyleSheet, Text as NativeText, View } from "react-native";
import { clubMarkModel } from "@duna/tideline-core";
import { fontFace } from "../type";
import type { NativeWalletCard } from "./model";

export function CardClubMark({
  club,
  size,
}: {
  readonly club: NativeWalletCard["club"];
  readonly size: number;
}) {
  const model = clubMarkModel({ ...club, size });
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: model.radius,
          backgroundColor: model.background,
        },
      ]}
    >
      {model.src ? (
        <Image
          resizeMode={model.form === "tile" ? "cover" : "contain"}
          source={{ uri: model.src, width: size, height: size }}
          style={
            model.form === "tile"
              ? StyleSheet.absoluteFill
              : { width: size * 0.72, height: size * 0.72 }
          }
        />
      ) : (
        <NativeText
          allowFontScaling={false}
          style={{
            color: model.foreground,
            fontFamily: model.monogramHasNumeral
              ? fontFace("ui", 600)
              : fontFace("brand", 500),
            fontSize: Math.max(12, Math.round(size * 0.42)),
            lineHeight: Math.round(size * 0.5),
          }}
        >
          {model.monogram ?? ""}
        </NativeText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
