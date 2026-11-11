// Entrada del Worker en Cloudflare. Reutiliza la app que genera OpenNext y añade
// la tarea programada (ver "triggers" en wrangler.jsonc).
// `.open-next/worker.js` se genera al compilar, por eso este archivo queda fuera
// de la revisión de tipos y de estilo.
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,

  // Tareas diarias: actualizar las tasas de cambio y hacer la limpieza
  // (comprobantes viejos y reservas vencidas), llamando a las rutas internas.
  async scheduled(_event, env, ctx) {
    for (const path of ["/api/tasks/rates", "/api/tasks/cleanup"]) {
      const request = new Request(`https://skadi-lashes.internal${path}`, {
        method: "POST",
      });
      ctx.waitUntil(handler.fetch(request, env, ctx));
    }
  },
};
