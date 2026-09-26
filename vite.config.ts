import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === "true" ? "/stock-management/" : "/",
  server: {
    allowedHosts: ["01e9-94-106-224-120.ngrok-free.app"]
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
        type: "module"
      },
      includeAssets: ["stockroom.svg", "stockroom-192.png", "stockroom-512.png"],
      manifest: {
        name: "Stockroom — Stock manager",
        short_name: "Stockroom",
        description: "Offline-ready warehouse stock management.",
        theme_color: "#f6f7f3",
        background_color: "#f6f7f3",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "stockroom-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "stockroom-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "stockroom.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      }
    })
  ]
});
