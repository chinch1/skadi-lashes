"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/auth";
import { addDays, timeToMinutes, zonedToUtc } from "@/lib/time";
import { WEEKDAY_NAMES } from "./weekdays";

export type FormState = { error: string | null };
export type ScheduleState = { error: string | null; saved: boolean };

const PATH = "/admin/ajustes/horario";
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGES_PER_DAY = 2;
const MAX_REASON = 80;
const MAX_BLOCK_DAYS = 366;

type Range = { weekday: number; opens_at: string; closes_at: string };

// Convierte lo que envía el formulario en filas válidas, o devuelve el error.
function parseSchedule(raw: string): { ranges: Range[] } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: "No se pudo leer el horario. Recarga la página." };
  }
  if (!Array.isArray(data) || data.length > 7 * MAX_RANGES_PER_DAY) {
    return { error: "No se pudo leer el horario. Recarga la página." };
  }

  const byDay = new Map<number, Range[]>();
  for (const item of data) {
    const weekday = (item as Record<string, unknown>)?.weekday;
    const opens = (item as Record<string, unknown>)?.opens_at;
    const closes = (item as Record<string, unknown>)?.closes_at;
    if (
      typeof weekday !== "number" ||
      !Number.isInteger(weekday) ||
      weekday < 0 ||
      weekday > 6
    ) {
      return { error: "No se pudo leer el horario. Recarga la página." };
    }
    const day = WEEKDAY_NAMES[weekday];
    if (
      typeof opens !== "string" ||
      typeof closes !== "string" ||
      !TIME_RE.test(opens) ||
      !TIME_RE.test(closes)
    ) {
      return { error: `Revisa las horas del ${day}.` };
    }
    if (timeToMinutes(closes) <= timeToMinutes(opens)) {
      return { error: `El ${day}, la hora de salida debe ser después de la de entrada.` };
    }
    const list = byDay.get(weekday) ?? [];
    list.push({ weekday, opens_at: opens, closes_at: closes });
    byDay.set(weekday, list);
  }

  const ranges: Range[] = [];
  for (const [weekday, list] of byDay) {
    const day = WEEKDAY_NAMES[weekday];
    if (list.length > MAX_RANGES_PER_DAY) {
      return { error: `El ${day} solo puede tener una pausa.` };
    }
    if (list.length === 2 && timeToMinutes(list[1].opens_at) <= timeToMinutes(list[0].closes_at)) {
      return {
        error: `El ${day}, la tarde debe empezar después de que termine la mañana.`,
      };
    }
    ranges.push(...list);
  }
  return { ranges };
}

export async function saveWorkingHours(
  _prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const { supabase, studioId } = await requireAdminAction();

  const parsed = parseSchedule(String(formData.get("schedule") ?? ""));
  if ("error" in parsed) return { error: parsed.error, saved: false };

  const { data: existing, error: readError } = await supabase
    .from("working_hours")
    .select("id")
    .eq("studio_id", studioId);
  if (readError) return { error: "No se pudo guardar el horario.", saved: false };
  const oldIds = (existing ?? []).map((row) => row.id as string);

  // Primero se guardan las filas nuevas; las viejas se borran solo si eso funcionó.
  if (parsed.ranges.length > 0) {
    const { error: insertError } = await supabase
      .from("working_hours")
      .insert(parsed.ranges.map((range) => ({ ...range, studio_id: studioId })));
    if (insertError) return { error: "No se pudo guardar el horario.", saved: false };
  }

  if (oldIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("working_hours")
      .delete()
      .eq("studio_id", studioId)
      .in("id", oldIds);
    if (deleteError) {
      revalidatePath(PATH);
      return { error: "No se pudo guardar el horario. Recarga la página.", saved: false };
    }
  }

  revalidatePath(PATH);
  return { error: null, saved: true };
}

function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function createTimeBlock(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, studioId } = await requireAdminAction();

  const allDay = formData.get("all_day") === "on";
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!isCalendarDate(startDate)) return { error: "Elige la fecha de inicio." };
  if (!isCalendarDate(endDate)) return { error: "Elige la fecha final." };
  if (!allDay && (!TIME_RE.test(startTime) || !TIME_RE.test(endTime))) {
    return { error: "Elige la hora de inicio y la hora final." };
  }
  if (reason.length > MAX_REASON) return { error: "El motivo es demasiado largo." };

  const { data: studio } = await supabase
    .from("studios")
    .select("timezone")
    .eq("id", studioId)
    .maybeSingle();
  if (!studio) return { error: "No se pudo guardar el bloqueo." };
  const timeZone: string = studio.timezone;

  // Todo el día: desde las 00:00 del primer día hasta las 00:00 del día siguiente al último.
  const startsAt = zonedToUtc(startDate, allDay ? "00:00" : startTime, timeZone);
  const endsAt = allDay
    ? zonedToUtc(addDays(endDate, 1), "00:00", timeZone)
    : zonedToUtc(endDate, endTime, timeZone);

  if (endsAt <= startsAt) {
    return { error: "El final debe ser después del inicio." };
  }
  if (endsAt.getTime() <= Date.now()) {
    return { error: "Ese horario ya pasó." };
  }
  if (endsAt.getTime() - startsAt.getTime() > MAX_BLOCK_DAYS * 24 * 60 * 60 * 1000) {
    return { error: "Un bloqueo no puede durar más de un año." };
  }

  const { error } = await supabase.from("time_blocks").insert({
    studio_id: studioId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    reason: reason || null,
  });
  if (error) return { error: "No se pudo guardar el bloqueo." };

  revalidatePath(PATH);
  return { error: null };
}

export async function deleteTimeBlock(id: string) {
  const { supabase, studioId } = await requireAdminAction();
  await supabase.from("time_blocks").delete().eq("id", id).eq("studio_id", studioId);
  revalidatePath(PATH);
}
