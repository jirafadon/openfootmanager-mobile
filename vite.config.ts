import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

function normalizeModuleId(id: string): string {
  return id.replaceAll("\\", "/");
}

function isNodeModulePackage(id: string, packageName: string): boolean {
  const normalizedId = normalizeModuleId(id);
  const packagePath = `/node_modules/${packageName}`;
  return normalizedId.includes(`${packagePath}/`) || normalizedId.endsWith(packagePath);
}

function matchesAnyPackage(id: string, packageNames: string[]): boolean {
  return packageNames.some((packageName) => isNodeModulePackage(id, packageName));
}

function isAppModule(id: string, modulePath: string): boolean {
  return normalizeModuleId(id).endsWith(modulePath);
}

function manualChunks(id: string): string | undefined {
  if (isAppModule(id, "/src/lib/countries.ts")) return "countries";
  if (id.indexOf("node_modules") === -1) return undefined;
  if (matchesAnyPackage(id, ["i18n-iso-countries"])) return "countries";
  if (matchesAnyPackage(id, ["react-router", "react-router-dom"])) return "router";
  if (matchesAnyPackage(id, ["i18next", "react-i18next", "i18next-resources-to-backend"])) return "i18n";
  if (isNodeModulePackage(id, "lucide-react")) return "icons";
  if (matchesAnyPackage(id, ["idb"])) return "idb";
  if (matchesAnyPackage(id, ["react", "react-dom", "scheduler"])) return "react-vendor";
  return undefined;
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["openfootmanager_icon.png", "openfootball.svg", "openfootlogo.svg"],
      manifest: {
        name: "Openfoot Manager",
        short_name: "OFM",
        description: "Football manager simulation game",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "openfootmanager_icon.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "openfootmanager_icon.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm,json}"],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.wasm$/,
            handler: "CacheFirst",
            options: {
              cacheName: "wasm-cache",
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
    coverage: {
      exclude: ["src/i18n/locales/**", "src/**/*.test.{ts,tsx}", "src/test-setup.ts"]
    }
  },
  clearScreen: false,
  build: {
    rollupOptions: {
      output: { manualChunks }
    }
  },
  server: {
    port: 1420
  }
});
