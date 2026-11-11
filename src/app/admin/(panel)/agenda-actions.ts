"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/auth";

// Acciones de la Agenda. Cada cambio de estado va condicionado en el propio
// UPDATE (por ejemplo `status = 'pending'`), así un doble clic o una pantalla
// vieja no lo aplican dos veces.

type Result = { error: string | null };

const PATH = "/admin";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GENERIC_ERROR = "No se pudo guardar. Intenta de nuevo.";
const NOT_FOUND = "No encontramos esta cita.";
const ALREADY_REVIEWED = "Este abono ya fue revisado.";
const NOT_ACTIVE = "Esta cita ya no está activa.";
const NOT_STARTED = "Solo se puede marcar una cita confirmada que ya empezó.";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// El detalle queda en el registro del servidor; nunca se devuelve.
function failure(context: string, detail: unknown): Result {
  console.error(`[agenda] ${context}:`, detail instanceof Error ? detail.message : detail);
  return { error: GENERIC_ERROR };
}

const OK: Result = { error: null };

// ---------------------------------------------------------------------
// Abonos
// ---------------------------------------------------------------------

export async function approveDeposit(depositId: string): Promise<Result> {
  const { supabase, studioId } = await requireAdminAction();
  try {
    if (!isUuid(depositId)) return { error: "Abono no válido." };

    const { data: current, error: readError } = await supabase
      .from("deposits")
      .select("status, appointments ( status )")
      .eq("id", depositId)
      .eq("studio_id", studioId)
      .maybeSingle();
    if (readError) return failure("aprobar: leer", readError.message);
    if (!current) return { error: "No encontramos este abono." };
    if (current.status !== "pending") return { error: ALREADY_REVIEWED };
    const appt = Array.isArray(current.appointments)
      ? current.appointments[0]
      : current.appointments;
    const apptStatus = (appt as { status?: string } | null)?.status;
    if (apptStatus !== "pending_deposit" && apptStatus !== "confirmed") {
      return { error: NOT_ACTIVE };
    }

    const now = new Date().toISOString();
    const { data: approved, error } = await supabase
      .from("deposits")
      .update({ status: "approved", reviewed_at: now })
      .eq("id", depositId)
      .eq("studio_id", studioId)
      .eq("status", "pending")
      .select("appointment_id");
    if (error) return failure("aprobar", error.message);
    if (!approved || approved.length === 0) return { error: ALREADY_REVIEWED };
    const appointmentId: string = approved[0].appointment_id;

    // Si la cita esperaba el abono, queda confirmada y sin plazo de reserva.
    const { error: confirmError } = await supabase
      .from("appointments")
      .update({ status: "confirmed", hold_expires_at: null })
      .eq("id", appointmentId)
      .eq("studio_id", studioId)
      .eq("status", "pending_deposit");
    if (confirmError) {
      // Se deshace la aprobación para no dejar un abono aprobado sin cita confirmada.
      await supabase
        .from("deposits")
        .update({ status: "pending", reviewed_at: null })
        .eq("id", depositId)
        .eq("studio_id", studioId)
        .eq("status", "approved");
      return failure("aprobar: confirmar cita", confirmError.message);
    }
    return OK;
  } catch (e) {
    return failure("aprobar: inesperado", e);
  } finally {
    revalidatePath(PATH);
  }
}

export async function rejectDeposit(depositId: string): Promise<Result> {
  const { supabase, studioId } = await requireAdminAction();
  try {
    if (!isUuid(depositId)) return { error: "Abono no válido." };

    const { data: studio, error: studioError } = await supabase
      .from("studios")
      .select("pending_hold_hours")
      .eq("id", studioId)
      .maybeSingle();
    if (studioError || !studio) {
      return failure("rechazar: estudio", studioError?.message ?? "No se encontró.");
    }

    const now = new Date();
    const { data: rejected, error } = await supabase
      .from("deposits")
      .update({ status: "rejected", reviewed_at: now.toISOString() })
      .eq("id", depositId)
      .eq("studio_id", studioId)
      .eq("status", "pending")
      .select("appointment_id");
    if (error) return failure("rechazar", error.message);
    if (!rejected || rejected.length === 0) return { error: ALREADY_REVIEWED };

    // La clienta puede subir otro comprobante en su enlace privado. Si no lo
    // hace a tiempo, el horario se libera solo.
    const hours = Number(studio.pending_hold_hours) || 2;
    const { error: holdError } = await supabase
      .from("appointments")
      .update({
        hold_expires_at: new Date(now.getTime() + hours * 3_600_000).toISOString(),
      })
      .eq("id", rejected[0].appointment_id)
      .eq("studio_id", studioId)
      .eq("status", "pending_deposit");
    if (holdError) return failure("rechazar: nueva reserva", holdError.message);
    return OK;
  } catch (e) {
    return failure("rechazar: inesperado", e);
  } finally {
    revalidatePath(PATH);
  }
}

// ---------------------------------------------------------------------
// Citas
// ---------------------------------------------------------------------

export async function releaseAppointment(appointmentId: string): Promise<Result> {
  const { supabase, studioId } = await requireAdminAction();
  try {
    if (!isUuid(appointmentId)) return { error: NOT_FOUND };

    const { data: released, error } = await supabase
      .from("appointments")
      .update({ status: "released" })
      .eq("id", appointmentId)
      .eq("studio_id", studioId)
      .in("status", ["pending_deposit", "confirmed"])
      .select("id");
    if (error) return failure("liberar", error.message);
    if (!released || released.length === 0) return { error: NOT_ACTIVE };

    // Abonos sin revisar: rechazados. Abonos aprobados: perdidos (no se devuelven).
    const now = new Date().toISOString();
    const [pendingRes, approvedRes] = await Promise.all([
      supabase
        .from("deposits")
        .update({ status: "rejected", reviewed_at: now })
        .eq("appointment_id", appointmentId)
        .eq("studio_id", studioId)
        .eq("status", "pending"),
      supabase
        .from("deposits")
        .update({ status: "forfeited" })
        .eq("appointment_id", appointmentId)
        .eq("studio_id", studioId)
        .eq("status", "approved"),
    ]);
    if (pendingRes.error) return failure("liberar: abonos pendientes", pendingRes.error.message);
    if (approvedRes.error) return failure("liberar: abonos aprobados", approvedRes.error.message);
    return OK;
  } catch (e) {
    return failure("liberar: inesperado", e);
  } finally {
    revalidatePath(PATH);
  }
}

export async function markCompleted(appointmentId: string): Promise<Result> {
  const { supabase, studioId } = await requireAdminAction();
  try {
    if (!isUuid(appointmentId)) return { error: NOT_FOUND };

    const { data, error } = await supabase
      .from("appointments")
      .update({ status: "completed" })
      .eq("id", appointmentId)
      .eq("studio_id", studioId)
      .eq("status", "confirmed")
      .lte("starts_at", new Date().toISOString())
      .select("id");
    if (error) return failure("atendida", error.message);
    if (!data || data.length === 0) return { error: NOT_STARTED };
    return OK;
  } catch (e) {
    return failure("atendida: inesperado", e);
  } finally {
    revalidatePath(PATH);
  }
}

export async function markNoShow(appointmentId: string): Promise<Result> {
  const { supabase, studioId } = await requireAdminAction();
  try {
    if (!isUuid(appointmentId)) return { error: NOT_FOUND };

    const { data, error } = await supabase
      .from("appointments")
      .update({ status: "no_show" })
      .eq("id", appointmentId)
      .eq("studio_id", studioId)
      .eq("status", "confirmed")
      .lte("starts_at", new Date().toISOString())
      .select("id");
    if (error) return failure("no asistió", error.message);
    if (!data || data.length === 0) return { error: NOT_STARTED };

    // El abono no se devuelve.
    const { error: depositError } = await supabase
      .from("deposits")
      .update({ status: "forfeited" })
      .eq("appointment_id", appointmentId)
      .eq("studio_id", studioId)
      .eq("status", "approved");
    if (depositError) return failure("no asistió: abono", depositError.message);
    return OK;
  } catch (e) {
    return failure("no asistió: inesperado", e);
  } finally {
    revalidatePath(PATH);
  }
}

// ---------------------------------------------------------------------
// Registro de mensajes de WhatsApp
// ---------------------------------------------------------------------

export async function logMessage(
  appointmentId: string,
  kind: "confirmation" | "rejection",
): Promise<Result> {
  const { supabase, studioId } = await requireAdminAction();
  try {
    if (!isUuid(appointmentId)) return { error: NOT_FOUND };
    if (kind !== "confirmation" && kind !== "rejection") {
      return { error: "Tipo de mensaje no válido." };
    }

    const { data: appointment, error: readError } = await supabase
      .from("appointments")
      .select("id, client_id")
      .eq("id", appointmentId)
      .eq("studio_id", studioId)
      .maybeSingle();
    if (readError) return failure("mensaje: leer cita", readError.message);
    if (!appointment) return { error: NOT_FOUND };

    // La confirmación se marca primero y de forma condicionada: un doble clic
    // no la registra dos veces.
    const now = new Date().toISOString();
    if (kind === "confirmation") {
      const { data: marked, error } = await supabase
        .from("appointments")
        .update({ confirmation_sent_at: now })
        .eq("id", appointmentId)
        .eq("studio_id", studioId)
        .is("confirmation_sent_at", null)
        .select("id");
      if (error) return failure("mensaje: marcar confirmación", error.message);
      if (!marked || marked.length === 0) {
        return { error: "La confirmación de esta cita ya se registró." };
      }
    }

    const { error: insertError } = await supabase.from("messages_log").insert({
      studio_id: studioId,
      client_id: appointment.client_id,
      appointment_id: appointmentId,
      kind,
      sent_at: now,
    });
    if (insertError) {
      if (kind === "confirmation") {
        await supabase
          .from("appointments")
          .update({ confirmation_sent_at: null })
          .eq("id", appointmentId)
          .eq("studio_id", studioId)
          .eq("confirmation_sent_at", now);
      }
      return failure("mensaje: registrar", insertError.message);
    }
    return OK;
  } catch (e) {
    return failure("mensaje: inesperado", e);
  } finally {
    revalidatePath(PATH);
  }
}
