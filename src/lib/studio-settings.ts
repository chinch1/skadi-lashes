import "server-only";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_RULE_SETTINGS, type RuleSettings } from "./rules";
import { STUDIO_SLUG } from "./studio";
import { supabaseEnv } from "./supabase/env";

// Entero no negativo de la base de datos, o el valor de la app si no sirve.
function count(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

// Números de las normas que ve la clienta (lectura pública).
// Ante cualquier error se usan los valores de la app.
export async function getRuleSettings(): Promise<RuleSettings> {
  try {
    const { url, anonKey } = supabaseEnv();
    const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from("studios")
      .select("late_fee_cents, late_tolerance_min, reschedule_notice_hours")
      .eq("slug", STUDIO_SLUG)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("[normas] leer ajustes:", error.message);
      return DEFAULT_RULE_SETTINGS;
    }
    return ruleSettingsFrom(data);
  } catch (e) {
    console.error("[normas] leer ajustes:", e);
    return DEFAULT_RULE_SETTINGS;
  }
}

// Convierte una fila de `studios` en los números de las normas.
function ruleSettingsFrom(row: {
  late_fee_cents?: unknown;
  late_tolerance_min?: unknown;
  reschedule_notice_hours?: unknown;
}): RuleSettings {
  return {
    lateFeeCents: count(row.late_fee_cents, DEFAULT_RULE_SETTINGS.lateFeeCents),
    lateToleranceMin: count(row.late_tolerance_min, DEFAULT_RULE_SETTINGS.lateToleranceMin),
    noticeHours: count(row.reschedule_notice_hours, DEFAULT_RULE_SETTINGS.noticeHours),
  };
}
