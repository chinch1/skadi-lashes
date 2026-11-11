import { runCleanup } from "@/lib/cleanup-task";

// Limpieza diaria: borra comprobantes viejos y libera reservas vencidas.
// La llama la tarea programada de Cloudflare. No necesita llave: no recibe
// datos y solo actúa sobre lo que ya venció.
export async function POST() {
  const result = await runCleanup();
  return Response.json(result, {
    status: result.status === "error" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
