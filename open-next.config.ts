import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sin caché en R2 por ahora: las páginas son estáticas o dinámicas.
export default defineCloudflareConfig();
