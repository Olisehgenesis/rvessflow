import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const icon = { src: "/icon-192.png", sizes: "192x192", type: "image/png" };
  return {
    id: "/",
    name: "RvessFlow",
    short_name: "RvessFlow",
    description: "Beta. Savings, streams, locks, and groups on Base.",
    lang: "en",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#F7F6F3",
    theme_color: "#F7F6F3",
    categories: ["finance"],
    launch_handler: { client_mode: "navigate-existing" },
    prefer_related_applications: false,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      {
        src: "/pwa/narrow.png",
        sizes: "540x1164",
        type: "image/png",
        form_factor: "narrow",
        label: "Home on a phone",
      },
      {
        src: "/pwa/wide.png",
        sizes: "1280x723",
        type: "image/png",
        form_factor: "wide",
        label: "Home on a desktop",
      },
    ],
    shortcuts: [
      { name: "Home", short_name: "Home", url: "/home", icons: [icon] },
      { name: "Save", short_name: "Save", url: "/goals", icons: [icon] },
      { name: "Stream", short_name: "Stream", url: "/goals/flow", icons: [icon] },
      { name: "Lock", short_name: "Lock", url: "/vaults", icons: [icon] },
      { name: "Groups", short_name: "Groups", url: "/groups", icons: [icon] },
    ],
  };
}
