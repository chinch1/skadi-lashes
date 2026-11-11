import { refreshStudioRates } from "@/lib/rates-task";

// Actualiza las tasas de cambio. La llama la tarea diaria de Cloudflare.
// No necesita llave: no recibe datos, y `refreshStudioRates` consulta la fuente
// como mucho una vez por hora, así que llamarla de más no hace daño.
export async function POST() {
  const result = await refreshStudioRates();
  return Response.json(result, {
    status: result.status === "error" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
