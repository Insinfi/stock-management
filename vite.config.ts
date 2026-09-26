import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["stockroom.svg"],
      manifest: {
        name: "Stockroom — Stock manager",
        short_name: "Stockroom",
        description: "Offline-ready warehouse stock management.",
        theme_color: "#f6f7f3",
        background_color: "#f6f7f3",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "/stockroom.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      }
    })
  ]
});
