"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/auth";
import { addDays, zonedParts } from "@/lib/time";

const PATH = "/admin/ajustes/horario";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_DAYS = 62;
const MAX_TIMES = 40;
const MAX_DAYS_AHEAD = 400;
const SAVE_ERROR = "No se pudieron guardar las horas. Inténtalo otra vez.";

function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// Reemplaza las horas de exactamente esos días. Los demás días no se tocan.
// Con `times` vacío, esos días se quedan sin horas.
export async function saveDaySlots(
  days: string[],
  times: string[],
): Promise<{ error: string | null }> {
  const { supabase, studioId } = await requireAdminAction();

  if (
    !Array.isArray(days) ||
    days.length === 0 ||
    days.length > MAX_DAYS ||
    !days.every((day) => typeof day === "string" && isCalendarDate(day)) ||
    new Set(days).size !== days.length
  ) {
    return { error: "Revisa los días elegidos." };
  }
  if (
    !Array.isArray(times) ||
    times.length > MAX_TIMES ||
    !times.every((time) => typeof time === "string" && TIME_RE.test(time)) ||
    new Set(times).size !== times.length
  ) {
    return { error: "Revisa las horas marcadas." };
  }

  const { data: studio, error: studioError } = await supabase
    .from("studios")
    .select("timezone")
    .eq("id", studioId)
    .maybeSingle();
  if (studioError || !studio) {
    if (studioError) console.error("[horario] leer estudio:", studioError);
    return { error: SAVE_ERROR };
  }

  const today = zonedParts(new Date(), studio.timezone).date;
  const lastDay = addDays(today, MAX_DAYS_AHEAD);
  if (days.some((day) => day < today)) {
    return { error: "No puedes cambiar las horas de un día que ya pasó." };
  }
  if (days.some((day) => day > lastDay)) {
    return { error: "Ese día está demasiado lejos." };
  }

  // Primero se agregan las horas que faltan; luego se borran las que sobran.
  // Así, si algo falla a mitad, ningún día se queda vacío por error.
  if (times.length > 0) {
    const rows = days.flatMap((day) =>
      times.map((time) => ({ studio_id: studioId, day, start_time: time })),
    );
    const { error: insertError } = await supabase
      .from("day_slots")
      .upsert(rows, {
        onConflict: "studio_id,day,start_time",
        ignoreDuplicates: true,
      });
    if (insertError) {
      console.error("[horario] agregar horas:", insertError);
      return { error: SAVE_ERROR };
    }
  }

  let remove = supabase
    .from("day_slots")
    .delete()
    .eq("studio_id", studioId)
    .in("day", days);
  if (times.length > 0) {
    // Valores ya validados como "HH:MM"; van entre comillas por los dos puntos.
    remove = remove.not(
      "start_time",
      "in",
      `(${times.map((time) => `"${time}:00"`).join(",")})`,
    );
  }
  const { error: deleteError } = await remove;
  if (deleteError) {
    console.error("[horario] quitar horas:", deleteError);
    revalidatePath(PATH);
    return { error: SAVE_ERROR };
  }

  revalidatePath(PATH);
  return { error: null };
}
