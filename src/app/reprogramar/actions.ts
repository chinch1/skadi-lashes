"use server";

import { findAppointmentsByPhone, type FindResult } from "@/lib/reschedule";

// Acción pública: busca las citas activas de la clienta por su número de WhatsApp.
export async function findAppointments(phone: string): Promise<FindResult> {
  try {
    return await findAppointmentsByPhone(typeof phone === "string" ? phone : "");
  } catch (e) {
    console.error("[reprogramar] acción buscar:", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo buscar tu cita. Intenta de nuevo." };
  }
}
