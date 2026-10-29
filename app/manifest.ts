import type { MetadataRoute } from "next";

/** Lets phones show the shop's name, colour and icon when it's added to the home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tlip Ventures — Home & Kitchen",
    short_name: "Tlip Ventures",
    description: "Home and kitchen goods in Ghana. Order on WhatsApp.",
    start_url: "/",
    display: "minimal-ui",
    background_color: "#ffffff",
    theme_color: "#0f6b43",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
