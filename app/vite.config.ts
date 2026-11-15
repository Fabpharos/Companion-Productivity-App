import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Relative paths, so the build works at any address GitHub Pages serves it from.
  base: "./",
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    svelte(),
    VitePWA({
      // A new version installs itself and is used the next time the app opens.
      registerType: "autoUpdate",
      includeAssets: ["icon-180.png"],
      manifest: {
        name: "Companion",
        short_name: "Companion",
        description: "Notes, to-dos, shopping, chores and trips.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#f6f5f1",
        theme_color: "#f6f5f1",
        icons: [
          { src: "icon-180.png", sizes: "180x180", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
      },
    }),
  ],
});
