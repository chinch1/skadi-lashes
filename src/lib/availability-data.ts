import "server-only";
import { computeAvailability, type TimeRange } from "@/lib/availability";
import {
  BUFFER_MIN,
  MIN_NOTICE_MIN,
  SLOT_INTERVAL_MIN,
} from "@/lib/booking-config";
import { STUDIO_SLUG } from "@/lib/studio";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, monthDates, zonedParts, zonedToUtc } from "@/lib/time";

export type MonthAvailability = {
  month: string;
  durationMin: number;
  days: Record<string, string[]>;
};
export type AvailabilityError = "bad_request" | "unknown_services" | "server_error";

type Result =
  | { ok: true; data: MonthAvailability }
  | { ok: false; error: AvailabilityError };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SERVICES = 20;

// Mes sin horas: todas las fechas presentes, sin cupo.
function emptyDays(dates: string[]): Record<string, string[]> {
  return Object.fromEntries(dates.map((d) => [d, [] as string[]]));
}

function fail(context: string, message: string): Result {
  // El detalle queda en el registro del servidor; nunca se devuelve a la clienta.
  console.error(`[disponibilidad] ${context}: ${message}`);
  return { ok: false, error: "server_error" };
}

type AdminClient = ReturnType<typeof createAdminClient>;
type Studio = { id: string; timeZone: string; windowWeeks: number };

// Lo que cambia entre consultar por servicios y por cita: cuánto dura lo que se
// quiere agendar y qué cita (si alguna) no cuenta como ocupada.
type Subject =
  | { ok: true; durationMin: number; excludeId?: string }
  | { ok: false; result: Result };

// Calcula las horas libres de un mes para un conjunto de servicios.
// Solo devuelve horas de inicio: nada de clientas ni de citas.
export async function getMonthAvailability(
  month: string,
  serviceIds: string[],
  options?: { excludeAppointmentId?: string },
): Promise<Result> {
  if (typeof month !== "string" || !MONTH_RE.test(month)) {
    return { ok: false, error: "bad_request" };
  }
  if (
    !Array.isArray(serviceIds) ||
    serviceIds.length < 1 ||
    serviceIds.length > MAX_SERVICES ||
    !serviceIds.every((id) => typeof id === "string" && UUID_RE.test(id))
  ) {
    return { ok: false, error: "bad_request" };
  }
  const ids = serviceIds.map((id) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "bad_request" };
  }
  const excludeId = options?.excludeAppointmentId;
  if (excludeId !== undefined && !UUID_RE.test(excludeId)) {
    return { ok: false, error: "bad_request" };
  }

  return monthAvailability(month, async (supabase, studio) => {
    const { data: services, error } = await supabase
      .from("services")
      .select("id, duration_min")
      .eq("studio_id", studio.id)
      .eq("visible", true)
      .in("id", ids);
    if (error) return { ok: false, result: fail("servicios", error.message) };
    if ((services ?? []).length !== ids.length) {
      return { ok: false, result: { ok: false, error: "unknown_services" } };
    }
    const durationMin = services.reduce((sum, s) => sum + s.duration_min, 0);
    return { ok: true, durationMin, excludeId };
  });
}

// Igual que getMonthAvailability, pero para mover una cita que ya existe
// (buscada por su enlace privado): misma duración, y su propio horario no
// cuenta como ocupado, para que pueda correrla un poco.
export async function getAppointmentMonthAvailability(
  month: string,
  token: string,
): Promise<Result> {
  if (typeof month !== "string" || !MONTH_RE.test(month)) {
    return { ok: false, error: "bad_request" };
  }
  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return { ok: false, error: "bad_request" };
  }

  return monthAvailability(month, async (supabase, studio) => {
    const { data: appointment, error } = await supabase
      .from("appointments")
      .select("id, starts_at, ends_at")
      .eq("studio_id", studio.id)
      .eq("manage_token", token.toLowerCase())
      .maybeSingle();
    if (error) return { ok: false, result: fail("cita", error.message) };
    if (!appointment) return { ok: false, result: { ok: false, error: "bad_request" } };
    const durationMin = Math.round(
      (new Date(appointment.ends_at).getTime() - new Date(appointment.starts_at).getTime()) /
        60_000,
    );
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      return { ok: false, result: fail("cita", "Duración no válida.") };
    }
    return { ok: true, durationMin, excludeId: String(appointment.id) };
  });
}

// Parte común: estudio, ventana de reservas, horario, bloqueos y citas.
// `resolveSubject` corre en paralelo con las demás consultas.
async function monthAvailability(
  month: string,
  resolveSubject: (supabase: AdminClient, studio: Studio) => Promise<Subject>,
): Promise<Result> {
  try {
    const supabase = createAdminClient();

    const { data: studioRow, error: studioError } = await supabase
      .from("studios")
      .select("id, timezone, booking_window_weeks")
      .eq("slug", STUDIO_SLUG)
      .maybeSingle();
    if (studioError) return fail("estudio", studioError.message);
    if (!studioRow) return fail("estudio", "No se encontró el estudio.");

    const studio: Studio = {
      id: studioRow.id,
      timeZone: studioRow.timezone,
      windowWeeks: studioRow.booking_window_weeks,
    };
    const studioId = studio.id;
    const timeZone = studio.timeZone;

    const now = new Date();
    const today = zonedParts(now, timeZone).date;
    const lastBookableDate = addDays(today, studio.windowWeeks * 7);
    const dates = monthDates(month);
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];

    const rangeStartUtc = zonedToUtc(firstDate, "00:00", timeZone).toISOString();
    const rangeEndUtc = zonedToUtc(addDays(lastDate, 1), "00:00", timeZone).toISOString();

    const subjectPromise = resolveSubject(supabase, studio);

    // Mes completo fuera de la ventana de reservas: basta con validar lo que se agenda.
    const outOfWindow = lastDate < today || firstDate > lastBookableDate;
    if (outOfWindow) {
      const subject = await subjectPromise;
      if (!subject.ok) return subject.result;
      return {
        ok: true,
        data: { month, durationMin: subject.durationMin, days: emptyDays(dates) },
      };
    }

    const [subject, hoursRes, blocksRes, appointmentsRes] = await Promise.all([
      subjectPromise,
      supabase
        .from("working_hours")
        .select("weekday, opens_at, closes_at")
        .eq("studio_id", studioId),
      supabase
        .from("time_blocks")
        .select("starts_at, ends_at")
        .eq("studio_id", studioId)
        .gt("ends_at", rangeStartUtc)
        .lt("starts_at", rangeEndUtc),
      supabase
        .from("appointments")
        .select("id, starts_at, ends_at, status, hold_expires_at")
        .eq("studio_id", studioId)
        .in("status", ["confirmed", "pending_deposit"])
        .gt("ends_at", rangeStartUtc)
        .lt("starts_at", rangeEndUtc),
    ]);

    if (!subject.ok) return subject.result;
    if (hoursRes.error) return fail("horario", hoursRes.error.message);
    if (blocksRes.error) return fail("bloqueos", blocksRes.error.message);
    if (appointmentsRes.error) return fail("citas", appointmentsRes.error.message);

    const { durationMin } = subject;
    const excludeId = subject.excludeId?.toLowerCase();

    // Una cita por aprobar cuya reserva ya venció no ocupa el horario.
    const nowMs = now.getTime();
    const appointments: TimeRange[] = (appointmentsRes.data ?? [])
      .filter((a) => !excludeId || String(a.id).toLowerCase() !== excludeId)
      .filter(
        (a) =>
          a.status === "confirmed" ||
          a.hold_expires_at === null ||
          new Date(a.hold_expires_at).getTime() > nowMs,
      )
      .map((a) => ({ starts_at: a.starts_at, ends_at: a.ends_at }));

    const days = computeAvailability({
      timeZone,
      workingHours: hoursRes.data ?? [],
      blocks: blocksRes.data ?? [],
      appointments,
      durationMin,
      slotIntervalMin: SLOT_INTERVAL_MIN,
      bufferMin: BUFFER_MIN,
      minNoticeMin: MIN_NOTICE_MIN,
      now,
      from: firstDate,
      to: lastDate,
      lastBookableDate,
    });

    return { ok: true, data: { month, durationMin, days } };
  } catch (e) {
    return fail("inesperado", e instanceof Error ? e.message : String(e));
  }
}
