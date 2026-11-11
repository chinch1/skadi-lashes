"use server";

import { createBooking } from "@/lib/booking";
import type { BookingInput, BookingResult } from "@/lib/booking";

// Acción pública: la entrada no es de confianza. createBooking revisa todo,
// incluidos los tipos, y nunca devuelve detalles de la base de datos.
export async function bookAppointment(input: BookingInput): Promise<BookingResult> {
  try {
    return await createBooking(input);
  } catch (e) {
    console.error("[agendar] acción:", e instanceof Error ? e.message : e);
    return { ok: false, code: "server", error: "No se pudo agendar. Intenta de nuevo." };
  }
}
