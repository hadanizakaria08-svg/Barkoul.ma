import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["robots.txt"],
      manifest: {
        name: "Barkoul.ma",
        short_name: "Barkoul",
        description: "منصة مغربية لربط أصحاب البضائع بسائقي الشاحنات",
        lang: "ar",
        dir: "rtl",
        theme_color: "#123b70",
        background_color: "#f5f8fc",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,ico,png,woff2}"],
        navigateFallback: "index.html"
      }
    })
  ],
  base: process.env.GITHUB_PAGES === "true" ? "/Barkoul.ma/" : "/",
  build: { outDir: "dist", sourcemap: true }
});