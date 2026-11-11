"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/auth";

// Registro de recordatorios de WhatsApp. Abrir WhatsApp, "Ya le recordé" y
// "No recordar" dejan la misma marca: la fila sale de la lista.

type Result = { error: string | null };
type ReminderKind = "appointment_reminder" | "retouch_reminder";

const PATH = "/admin/recordatorios";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GENERIC_ERROR = "No se pudo guardar. Intenta de nuevo.";
const NOT_FOUND = "No encontramos esta cita.";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// El detalle queda en el registro del servidor; nunca se devuelve.
function failure(context: string, detail: unknown): Result {
  console.error(
    `[recordatorios] ${context}:`,
    detail instanceof Error ? detail.message : detail,
  );
  return { error: GENERIC_ERROR };
}

export async function logReminder(
  appointmentId: string,
  kind: ReminderKind,
): Promise<Result> {
  const { supabase, studioId } = await requireAdminAction();
  try {
    if (!isUuid(appointmentId)) return { error: NOT_FOUND };
    if (kind !== "appointment_reminder" && kind !== "retouch_reminder") {
      return { error: "Tipo de recordatorio no válido." };
    }

    const { data: appointment, error: readError } = await supabase
      .from("appointments")
      .select("id, client_id")
      .eq("id", appointmentId)
      .eq("studio_id", studioId)
      .maybeSingle();
    if (readError) return failure("leer cita", readError.message);
    if (!appointment) return { error: NOT_FOUND };

    // Ya registrado (doble clic, o el enlace y el botón): no se repite.
    const { data: existing, error: existingError } = await supabase
      .from("messages_log")
      .select("id")
      .eq("studio_id", studioId)
      .eq("appointment_id", appointmentId)
      .eq("kind", kind)
      .limit(1);
    if (existingError) return failure("leer registro", existingError.message);
    if (existing && existing.length > 0) return { error: null };

    const { error: insertError } = await supabase.from("messages_log").insert({
      studio_id: studioId,
      client_id: appointment.client_id,
      appointment_id: appointmentId,
      kind,
      sent_at: new Date().toISOString(),
    });
    if (insertError) return failure("registrar", insertError.message);
    return { error: null };
  } catch (e) {
    return failure("inesperado", e);
  } finally {
    revalidatePath(PATH);
  }
}
