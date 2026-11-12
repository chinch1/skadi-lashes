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
const APPOINTMENT_REVIEWED = "Esta cita ya fue revisada.";
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

    const now = new Date().toISOString();
    const { data: rejected, error } = await supabase
      .from("deposits")
      .update({ status: "rejected", reviewed_at: now })
      .eq("id", depositId)
      .eq("studio_id", studioId)
      .eq("status", "pending")
      .select("appointment_id");
    if (error) return failure("rechazar", error.message);
    if (!rejected || rejected.length === 0) return { error: ALREADY_REVIEWED };

    // El horario se libera de inmediato. Si la clienta quiere, agenda de nuevo.
    const { error: releaseError } = await supabase
      .from("appointments")
      .update({ status: "released", hold_expires_at: null, rejected_at: now })
      .eq("id", rejected[0].appointment_id)
      .eq("studio_id", studioId)
      .eq("status", "pending_deposit");
    if (releaseError) {
      // Se deshace el rechazo para no dejar un horario ocupado sin abono por revisar.
      await supabase
        .from("deposits")
        .update({ status: "pending", reviewed_at: null })
        .eq("id", depositId)
        .eq("studio_id", studioId)
        .eq("status", "rejected");
      return failure("rechazar: liberar cita", releaseError.message);
    }
    return OK;
  } catch (e) {
    return failure("rechazar: inesperado", e);
  } finally {
    revalidatePath(PATH);
  }
}

// ---------------------------------------------------------------------
// Citas sin abono por confirmar
// ---------------------------------------------------------------------

// Una cita sin abono (clienta de confianza o abono 0) llega como
// pending_deposit con deposit_cents = 0 y espera a Giselle.
export async function confirmAppointment(appointmentId: string): Promise<Result> {
  const { supabase, studioId } = await requireAdminAction();
  try {
    if (!isUuid(appointmentId)) return { error: NOT_FOUND };

    const { data, error } = await supabase
      .from("appointments")
      .update({ status: "confirmed", hold_expires_at: null })
      .eq("id", appointmentId)
      .eq("studio_id", studioId)
      .eq("status", "pending_deposit")
      .eq("deposit_cents", 0)
      .select("id");
    if (error) return failure("confirmar cita", error.message);
    if (!data || data.length === 0) return { error: APPOINTMENT_REVIEWED };
    return OK;
  } catch (e) {
    return failure("confirmar cita: inesperado", e);
  } finally {
    revalidatePath(PATH);
  }
}

export async function rejectAppointment(appointmentId: string): Promise<Result> {
  const { supabase, studioId } = await requireAdminAction();
  try {
    if (!isUuid(appointmentId)) return { error: NOT_FOUND };

    // El horario se libera de inmediato.
    const { data, error } = await supabase
      .from("appointments")
      .update({
        status: "released",
        hold_expires_at: null,
        rejected_at: new Date().toISOString(),
      })
      .eq("id", appointmentId)
      .eq("studio_id", studioId)
      .eq("status", "pending_deposit")
      .eq("deposit_cents", 0)
      .select("id");
    if (error) return failure("rechazar cita", error.message);
    if (!data || data.length === 0) return { error: APPOINTMENT_REVIEWED };
    return OK;
  } catch (e) {
    return failure("rechazar cita: inesperado", e);
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

    const { data: studio, error: studioError } = await supabase
      .from("studios")
      .select("reschedule_notice_hours")
      .eq("id", studioId)
      .maybeSingle();
    if (studioError || !studio) {
      return failure("liberar: estudio", studioError?.message ?? "No se encontró.");
    }

    // Liberar una cita que aún no estaba confirmada es rechazarla: se anota
    // rejected_at para avisar a la clienta. Una confirmada queda sin rechazo.
    const nowIso = new Date().toISOString();
    const pendingRes = await supabase
      .from("appointments")
      .update({ status: "released", hold_expires_at: null, rejected_at: nowIso })
      .eq("id", appointmentId)
      .eq("studio_id", studioId)
      .eq("status", "pending_deposit")
      .select("id, starts_at");
    if (pendingRes.error) return failure("liberar", pendingRes.error.message);
    let released = pendingRes.data;
    if (!released || released.length === 0) {
      const confirmedRes = await supabase
        .from("appointments")
        .update({ status: "released" })
        .eq("id", appointmentId)
        .eq("studio_id", studioId)
        .eq("status", "confirmed")
        .select("id, starts_at");
      if (confirmedRes.error) return failure("liberar", confirmedRes.error.message);
      released = confirmedRes.data;
    }
    if (!released || released.length === 0) return { error: NOT_ACTIVE };

    // Con menos horas de aviso que las del estudio (o ya empezada), el abono
    // aprobado se pierde. Con tiempo, queda aprobado.
    const now = new Date();
    const noticeHours = Number(studio.reschedule_notice_hours ?? 12) || 0;
    const startsAt = new Date(released[0].starts_at).getTime();
    const late = startsAt - now.getTime() < noticeHours * 3_600_000;

    // Abonos sin revisar: rechazados.
    const { error: pendingError } = await supabase
      .from("deposits")
      .update({ status: "rejected", reviewed_at: now.toISOString() })
      .eq("appointment_id", appointmentId)
      .eq("studio_id", studioId)
      .eq("status", "pending");
    if (pendingError) return failure("liberar: abonos pendientes", pendingError.message);

    if (late) {
      const { error: approvedError } = await supabase
        .from("deposits")
        .update({ status: "forfeited" })
        .eq("appointment_id", appointmentId)
        .eq("studio_id", studioId)
        .eq("status", "approved");
      if (approvedError) return failure("liberar: abonos aprobados", approvedError.message);
    }
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
