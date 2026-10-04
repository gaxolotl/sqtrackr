import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "sqtrackr",
    short_name: "sqtrackr",
    description: "A focused, private torrent tracker.",
    start_url: "/",
    display: "standalone",
    background_color: "#1f2023",
    theme_color: "#f0644c",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
