"use server";

import { revalidatePath } from "next/cache";
import { pickNewSlot, type PickSlotResult } from "@/lib/slot-change";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Acción pública: aparta el horario nuevo para la misma cita.
// La validación completa está en @/lib/slot-change; aquí solo se protege la ruta.
export async function chooseSlot(
  token: string,
  date: string,
  time: string,
): Promise<PickSlotResult> {
  let result: PickSlotResult;
  try {
    result = await pickNewSlot(token, date, time);
  } catch (e) {
    console.error("[otro horario] acción elegir:", e instanceof Error ? e.message : e);
    return { ok: false, code: "server", error: "No se pudo apartar el horario. Intenta de nuevo." };
  }
  if (result.ok && typeof token === "string" && UUID_RE.test(token)) {
    revalidatePath(`/cita/${token}`);
  }
  return result;
}
