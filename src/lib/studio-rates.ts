import { createClient } from "@supabase/supabase-js";
import { STUDIO_SLUG } from "./studio";
import { supabaseEnv } from "./supabase/env";
import { zonedParts } from "./time";

export type StudioRates = {
  eurToVes: number;
  eurToUsdt: number | null;
  updatedOn: string | null; // fecha local "AAAA-MM-DD" que reporta la fuente
};

// Tasa guardada del estudio (lectura pública). Nunca consulta la fuente.
export async function getStudioRates(): Promise<StudioRates | null> {
  try {
    const { url, anonKey } = supabaseEnv();
    const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data } = await supabase
      .from("studios")
      .select("timezone, eur_to_ves_rate, eur_to_usdt_rate, rates_source_updated_at")
      .eq("slug", STUDIO_SLUG)
      .maybeSingle();
    if (!data?.eur_to_ves_rate) return null;
    return {
      eurToVes: Number(data.eur_to_ves_rate),
      eurToUsdt: data.eur_to_usdt_rate ? Number(data.eur_to_usdt_rate) : null,
      updatedOn: data.rates_source_updated_at
        ? zonedParts(new Date(data.rates_source_updated_at), data.timezone).date
        : null,
    };
  } catch {
    return null;
  }
}
