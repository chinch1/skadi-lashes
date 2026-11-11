// Entrada del Worker en Cloudflare. Reutiliza la app que genera OpenNext y añade
// la tarea programada (ver "triggers" en wrangler.jsonc).
// `.open-next/worker.js` se genera al compilar, por eso este archivo queda fuera
// de la revisión de tipos y de estilo.
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,

  // Tarea diaria: actualizar las tasas de cambio llamando a la ruta interna.
  async scheduled(_event, env, ctx) {
    const request = new Request("https://skadi-lashes.internal/api/tasks/rates", {
      method: "POST",
    });
    ctx.waitUntil(handler.fetch(request, env, ctx));
  },
};
