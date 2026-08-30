import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/solarvisit-icon-192.png",
        "icons/solarvisit-icon-512.png",
        "icons/solarvisit-maskable-192.png",
        "icons/solarvisit-maskable-512.png",
        "icons/apple-touch-icon.png",
        "icons/favicon.png",
        "offline.html"
      ],
      manifest: {
        name: "SolarVisit",
        short_name: "SolarVisit",
        description: "SolarVisit planning app.",
        theme_color: "#142E26",
        background_color: "#F7FAF8",
        display: "standalone",
        orientation: "portrait",
        start_url: "/appointments",
        scope: "/",
        icons: [
          {
            src: "/icons/solarvisit-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/solarvisit-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/solarvisit-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "/icons/solarvisit-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,json,webmanifest}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "solarvisit-pages",
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 7 * 24 * 60 * 60
              }
            }
          },
          {
            urlPattern: ({ request }) =>
              request.destination === "script" ||
              request.destination === "style" ||
              request.destination === "worker",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "solarvisit-static-assets",
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 30 * 24 * 60 * 60
              }
            }
          },
          {
            urlPattern: ({ request, url }) =>
              request.destination === "image" && url.origin === self.location.origin,
            handler: "CacheFirst",
            options: {
              cacheName: "solarvisit-local-images",
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 30 * 24 * 60 * 60
              }
            }
          }
        ]
      }
    })
  ]
});
