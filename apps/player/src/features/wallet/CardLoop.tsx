/**
 * The selected card's moving art when a club uploads a loop (or a painted
 * Duna loop ships): muted, looping, no controls, over the poster, on the
 * app's existing `expo-video`. Only one plays at a time (the selected card);
 * the identity library asks for it through `CardArtProvider`.
 */
import { StyleSheet } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import type { CardLoopRenderer } from "@duna/ui/native/identity";

function CardLoop({ uri }: { readonly uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });
  return (
    <VideoView
      allowsPictureInPicture={false}
      contentFit="cover"
      nativeControls={false}
      player={player}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    />
  );
}

export const renderCardLoop: CardLoopRenderer = ({ uri, playing }) =>
  playing ? <CardLoop uri={uri} /> : null;
