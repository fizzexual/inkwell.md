import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    // installable + offline on the phone (Add to Home Screen). Needs a secure context
    // (localhost or HTTPS — e.g. `tailscale serve`) for the service worker to activate.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png", "icon-256.png", "icon-512.png"],
      manifest: {
        name: "Inkwell",
        short_name: "Inkwell",
        description: "Local-first research workspace — notes, knowledge graph, and self-hosted device sync.",
        theme_color: "#1d1e2a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-256.png", sizes: "256x256", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff,woff2,svg,png,ico}"],
        // the semantic-search ML runtime (transformers chunk + onnxruntime .wasm, ~22MB) is
        // online-only, so keep it out of the offline precache entirely
        globIgnores: ["**/transformers*", "**/ort-*", "**/*.wasm"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: true, type: "module" },
    }),
  ],

  // transformers.js runs on onnxruntime-web (WASM). BOTH must stay out of Vite's dep pre-bundling —
  // if esbuild optimizes onnxruntime-web its backend self-registration breaks ("registerBackend of
  // undefined"), so exclude the runtime as well as the wrapper.
  optimizeDeps: {
    exclude: ["@huggingface/transformers", "onnxruntime-web"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
