declare module "@mux/mux-data-react-native-video" {
  import type { ComponentType } from "react";

  interface MuxOptions {
    readonly application_name: string;
    readonly application_version?: string;
    readonly data: {
      readonly env_key: string;
      readonly player_name?: string;
      readonly player_software_version?: string;
      readonly video_id?: string;
      readonly video_title?: string;
      readonly video_series?: string;
      readonly video_stream_type?: "live" | "on-demand";
      readonly viewer_user_id?: string;
    };
  }

  export default function muxReactNativeVideo<Props>(
    component: ComponentType<Props>,
  ): ComponentType<Props & { readonly muxOptions: MuxOptions }>;
}
