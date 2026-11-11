import "server-only";
import { fetchRates } from "./rates";
import { STUDIO_SLUG } from "./studio";
import { createAdminClient } from "./supabase/admin";

// Tiempo mínimo entre dos consultas a la fuente. La tarea corre una vez al día;
// este margen evita que llamadas repetidas a la ruta gasten la cuota de la fuente.
const MIN_INTERVAL_MS = 60 * 60 * 1000;

export type RatesTaskResult =
  | { status: "updated"; eurToVes: number; eurToUsdt: number }
  | { status: "skipped"; reason: "manual" | "recent" }
  | { status: "kept"; reason: string } // la fuente falló o dio datos inválidos: se conserva la tasa anterior
  | { status: "error" };

// Tarea diaria: consulta la fuente y guarda las tasas del estudio.
export async function refreshStudioRates(now = new Date()): Promise<RatesTaskResult> {
  try {
    const supabase = createAdminClient();
    const { data: studio, error } = await supabase
      .from("studios")
      .select("id, rates_auto, rates_fetched_at")
      .eq("slug", STUDIO_SLUG)
      .maybeSingle();
    if (error || !studio) return { status: "error" };

    // Modo manual: la tarea no cambia nada.
    if (!studio.rates_auto) return { status: "skipped", reason: "manual" };

    const last = studio.rates_fetched_at ? Date.parse(studio.rates_fetched_at) : 0;
    if (now.getTime() - last < MIN_INTERVAL_MS) {
      return { status: "skipped", reason: "recent" };
    }

    const apiKey = process.env.COTIZA_VE_API_KEY;
    const result = apiKey
      ? await fetchRates(apiKey, now)
      : ({ ok: false, error: "Falta COTIZA_VE_API_KEY." } as const);

    if (!result.ok) {
      console.error(`[tasas] ${result.error}`);
      await supabase
        .from("studios")
        .update({ rates_fetched_at: now.toISOString() })
        .eq("id", studio.id);
      return { status: "kept", reason: result.error };
    }

    const { error: updateError } = await supabase
      .from("studios")
      .update({
        eur_to_ves_rate: result.rates.eurToVes,
        eur_to_usdt_rate: result.rates.eurToUsdt,
        rates_source_updated_at: result.rates.sourceUpdatedAt,
        rates_fetched_at: now.toISOString(),
      })
      .eq("id", studio.id);
    if (updateError) return { status: "error" };

    return {
      status: "updated",
      eurToVes: result.rates.eurToVes,
      eurToUsdt: result.rates.eurToUsdt,
    };
  } catch (e) {
    console.error(`[tasas] ${e instanceof Error ? e.message : String(e)}`);
    return { status: "error" };
  }
}
