import type { MetadataRoute } from "next";

/** Night Court is the brand's dark ground and the icon's field. */
const NIGHT_COURT = "#0E1A22";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Duna HQ",
    short_name: "Duna HQ",
    description: "The operating system for clubs, coaches, and facilities.",
    start_url: "/",
    display: "standalone",
    background_color: NIGHT_COURT,
    theme_color: NIGHT_COURT,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
