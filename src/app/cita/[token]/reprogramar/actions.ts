"use server";

import { revalidatePath } from "next/cache";
import {
  releaseByClient,
  rescheduleAppointment,
  type ReleaseResult,
  type RescheduleResult,
} from "@/lib/reschedule";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Acciones públicas del enlace privado de la cita: reprogramar y "No podré asistir".
// La validación completa está en @/lib/reschedule; aquí solo se protege la ruta.

export async function reschedule(
  token: string,
  date: string,
  time: string,
  expectedMode: "on_time" | "late",
): Promise<RescheduleResult> {
  let result: RescheduleResult;
  try {
    result = await rescheduleAppointment(token, date, time, expectedMode);
  } catch (e) {
    console.error("[reprogramar] acción reprogramar:", e instanceof Error ? e.message : e);
    return { ok: false, code: "server", error: "No se pudo cambiar tu cita. Intenta de nuevo." };
  }
  if (result.ok && typeof token === "string" && UUID_RE.test(token)) {
    revalidatePath(`/cita/${token}`);
  }
  return result;
}

export async function release(token: string): Promise<ReleaseResult> {
  let result: ReleaseResult;
  try {
    result = await releaseByClient(token);
  } catch (e) {
    console.error("[reprogramar] acción liberar:", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo liberar tu cita. Intenta de nuevo." };
  }
  if (result.ok && typeof token === "string" && UUID_RE.test(token)) {
    revalidatePath(`/cita/${token}`);
  }
  return result;
}
