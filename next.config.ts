import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Sin cacheComponents: exige el entorno Node.js y la app corre en Cloudflare Workers.
  experimental: {
    // Las fotos de servicios se reducen en el navegador antes de subir; esto deja margen.
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// Permite usar los recursos de Cloudflare durante `next dev`.
initOpenNextCloudflareForDev();
