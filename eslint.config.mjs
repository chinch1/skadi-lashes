import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Sin optimización de imágenes en Cloudflare (costo cero): se usa <img> directo.
    rules: { "@next/next/no-img-element": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Compilación de Cloudflare:
    ".open-next/**",
    ".wrangler/**",
    "cloudflare-env.d.ts",
    "custom-worker.ts",
  ]),
]);

export default eslintConfig;
