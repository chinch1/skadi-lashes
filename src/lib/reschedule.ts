import "server-only";
import { getAppointmentMonthAvailability } from "@/lib/availability-data";
import { EUR_TO_USDT } from "@/lib/booking-config";
import { normalizePhone } from "@/lib/phone";
import { rescheduleMode, type RescheduleMode } from "@/lib/reschedule-rules";
import { STUDIO_SLUG } from "@/lib/studio";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, zonedParts, zonedToUtc } from "@/lib/time";

// Autoservicio de la clienta: buscar su cita por número, reprogramarla
// (a tiempo o fuera del plazo) y "No podré asistir" (liberar el horario).
// Todo es público y sin sesión: pasa por la llave de servicio, se revisa cada
// entrada y nunca se devuelven identificadores internos ni datos de otras clientas.
// Toda decisión de plazo usa la hora del servidor.

// ---------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------

export type RescheduleView = {
  token: string;
  mode: RescheduleMode;
  clientFirstName: string;
  date: string; // cita actual, fecha local del estudio
  time: string;
  endTime: string;
  services: { name: string; durationMin: number; priceCents: number }[];
  durationMin: number;
  totalCents: number;
  paidDeposit: boolean; // false para clientas de confianza: la pantalla no menciona abonos
  newDepositCents: number; // lo que paga de nuevo si reprograma fuera del plazo
  canRelease: boolean; // "No podré asistir" es posible
  releaseLosesDeposit: boolean; // liberar ahora hace perder el abono (fuera del plazo)
  noticeHours: number;
  today: string; // fechas locales para el calendario
  lastBookableDate: string;
};

export type FoundAppointment = { token: string; date: string; time: string; services: string[] };
export type FindResult = { ok: true; appointments: FoundAppointment[] } | { ok: false; error: string };

export type RescheduleResult =
  | { ok: true; needsPayment: boolean }
  | {
      ok: false;
      code: "invalid" | "slot_taken" | "not_allowed" | "mode_changed" | "server";
      error: string;
    };

export type ReleaseResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const EXCLUSION_VIOLATION = "23P01";
const HOUR_MS = 3_600_000;

const PHONE_ERROR = "Escribe un número de WhatsApp válido, por ejemplo 0412-1234567.";
const FIND_ERROR = "No se pudo buscar tu cita. Intenta de nuevo.";
const NOT_FOUND_ERROR = "No encontramos esta cita.";
const SLOT_TAKEN_ERROR = "Ese horario ya no está disponible. Elige otro.";
const RESCHEDULE_ERROR = "No se pudo cambiar tu cita. Intenta de nuevo.";
const ALREADY_CHANGED_ERROR = "Esta cita ya se cambió una vez. Escríbele a Skadi Lashes.";
const NOT_AVAILABLE_ERROR = "Esta cita ya no se puede cambiar. Escríbele a Skadi Lashes.";
const RELEASE_ERROR = "No se pudo liberar tu cita. Intenta de nuevo.";
const CANNOT_RELEASE_ERROR = "Esta cita ya no se puede liberar.";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Fecha real (descarta "2026-02-30").
function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

// Postgres devuelve numeric como número o como texto según el tamaño.
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Las relaciones embebidas llegan como objeto o como lista según la relación.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function many<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

// El detalle queda en el registro del servidor; nunca se devuelve a la clienta.
function logError(context: string, detail: unknown): void {
  console.error(`[reprogramar] ${context}:`, detail instanceof Error ? detail.message : detail);
}

function rescheduleFailure(context: string, detail: unknown): RescheduleResult {
  logError(context, detail);
  return { ok: false, code: "server", error: RESCHEDULE_ERROR };
}

function releaseFailure(context: string, detail: unknown): ReleaseResult {
  logError(context, detail);
  return { ok: false, error: RELEASE_ERROR };
}

// ---------------------------------------------------------------------
// Cargar la cita por su enlace privado
// ---------------------------------------------------------------------

type AppointmentRecord = {
  id: string;
  studioId: string;
  token: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  rescheduleCount: number;
  depositCents: number;
  totalCents: number;
  holdExpiresAt: string | null;
  // Valores originales, para deshacer un cambio a medias.
  original: {
    quote_eur_to_ves: unknown;
    quote_eur_to_usdt: unknown;
    confirmation_sent_at: string | null;
  };
  clientFirstName: string;
  depositExempt: boolean;
  services: { name: string; durationMin: number; priceCents: number }[];
  depositStatuses: string[];
  studio: {
    timezone: string;
    depositCents: number;
    noticeHours: number;
    maxReschedules: number;
    pendingHoldMinutes: number;
    bookingWindowWeeks: number;
    eurToVesRate: number | null;
  };
};

type RawAppointment = {
  id: string;
  studio_id: string;
  manage_token: string;
  status: string;
  starts_at: string;
  ends_at: string;
  reschedule_count: number;
  deposit_cents: number;
  total_cents: number;
  hold_expires_at: string | null;
  quote_eur_to_ves: number | string | null;
  quote_eur_to_usdt: number | string | null;
  confirmation_sent_at: string | null;
  clients:
    | { first_name: string; deposit_exempt: boolean }
    | { first_name: string; deposit_exempt: boolean }[]
    | null;
  appointment_services:
    | { name: string; duration_min: number; price_cents: number }[]
    | null;
  deposits: { status: string }[] | null;
  studios:
    | {
        slug: string;
        timezone: string;
        deposit_cents: number;
        reschedule_notice_hours: number;
        max_reschedules: number;
        pending_hold_minutes: number;
        booking_window_weeks: number;
        eur_to_ves_rate: number | string | null;
      }
    | null;
};

// Lanza si la base de datos falla; devuelve null si la cita no existe
// o no es de este estudio.
async function loadAppointment(token: string): Promise<AppointmentRecord | null> {
  if (!isUuid(token)) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(
      `id, studio_id, manage_token, status, starts_at, ends_at, reschedule_count,
       deposit_cents, total_cents, hold_expires_at, quote_eur_to_ves, quote_eur_to_usdt,
       confirmation_sent_at,
       clients ( first_name, deposit_exempt ),
       appointment_services ( name, duration_min, price_cents ),
       deposits ( status ),
       studios ( slug, timezone, deposit_cents, reschedule_notice_hours, max_reschedules,
                 pending_hold_minutes, booking_window_weeks, eur_to_ves_rate )`,
    )
    .eq("manage_token", token.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as RawAppointment;
  const studio = one(row.studios);
  if (!studio) throw new Error("La cita no tiene estudio.");
  if (studio.slug !== STUDIO_SLUG) return null;
  const client = one(row.clients);

  return {
    id: row.id,
    studioId: row.studio_id,
    token: String(row.manage_token),
    status: row.status,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    rescheduleCount: Number(row.reschedule_count) || 0,
    depositCents: Number(row.deposit_cents) || 0,
    totalCents: Number(row.total_cents) || 0,
    holdExpiresAt: row.hold_expires_at,
    original: {
      quote_eur_to_ves: row.quote_eur_to_ves,
      quote_eur_to_usdt: row.quote_eur_to_usdt,
      confirmation_sent_at: row.confirmation_sent_at,
    },
    clientFirstName: client?.first_name ?? "",
    depositExempt: client?.deposit_exempt === true,
    services: many(row.appointment_services).map((s) => ({
      name: s.name,
      durationMin: Number(s.duration_min),
      priceCents: Number(s.price_cents),
    })),
    depositStatuses: many(row.deposits).map((d) => d.status),
    studio: {
      timezone: studio.timezone,
      depositCents: Number(studio.deposit_cents) || 0,
      noticeHours: Number(studio.reschedule_notice_hours) || 0,
      maxReschedules: Number(studio.max_reschedules) || 0,
      // Minutos del reloj para pagar; 5 si el estudio no trae un valor válido.
      pendingHoldMinutes: Number(studio.pending_hold_minutes) || 5,
      bookingWindowWeeks: Number(studio.booking_window_weeks) || 0,
      eurToVesRate: toNumber(studio.eur_to_ves_rate),
    },
  };
}

function modeOf(record: AppointmentRecord, now: Date): RescheduleMode {
  return rescheduleMode({
    status: record.status,
    startsAt: record.startsAt,
    now,
    rescheduleCount: record.rescheduleCount,
    maxReschedules: record.studio.maxReschedules,
    noticeHours: record.studio.noticeHours,
    depositExempt: record.depositExempt,
  });
}

function canReleaseAt(record: AppointmentRecord, now: Date): boolean {
  return (
    (record.status === "confirmed" || record.status === "pending_deposit") &&
    record.startsAt.getTime() > now.getTime()
  );
}

// Liberar con menos horas de aviso que las del estudio hace perder el abono.
// A la clienta de confianza no le aplica el plazo.
function releaseIsLate(record: AppointmentRecord, now: Date): boolean {
  if (record.depositExempt) return false;
  return record.startsAt.getTime() - now.getTime() < record.studio.noticeHours * HOUR_MS;
}

// ---------------------------------------------------------------------
// Pantalla de reprogramar
// ---------------------------------------------------------------------

export async function getRescheduleView(token: string): Promise<RescheduleView | null> {
  if (!isUuid(token)) return null;
  let record: AppointmentRecord | null;
  try {
    record = await loadAppointment(token);
  } catch (e) {
    logError("cargar", e);
    throw new Error("No se pudo cargar la cita.");
  }
  if (!record) return null;

  const now = new Date();
  const tz = record.studio.timezone;
  const start = zonedParts(record.startsAt, tz);
  const end = zonedParts(record.endsAt, tz);
  const today = zonedParts(now, tz).date;
  const hasDeposit = record.depositStatuses.some((s) => s === "pending" || s === "approved");
  const canRelease = canReleaseAt(record, now);

  return {
    token: record.token,
    mode: modeOf(record, now),
    clientFirstName: record.clientFirstName,
    date: start.date,
    time: start.time,
    endTime: end.time,
    services: record.services,
    durationMin: Math.round((record.endsAt.getTime() - record.startsAt.getTime()) / 60_000),
    totalCents: record.totalCents,
    paidDeposit: !record.depositExempt && record.depositCents > 0,
    newDepositCents: record.studio.depositCents,
    canRelease,
    releaseLosesDeposit: canRelease && hasDeposit && releaseIsLate(record, now),
    noticeHours: record.studio.noticeHours,
    today,
    lastBookableDate: addDays(today, record.studio.bookingWindowWeeks * 7),
  };
}

// ---------------------------------------------------------------------
// Buscar citas por número de WhatsApp
// ---------------------------------------------------------------------

export async function findAppointmentsByPhone(phone: string): Promise<FindResult> {
  const normalized = typeof phone === "string" ? normalizePhone(phone) : null;
  if (!normalized) return { ok: false, error: PHONE_ERROR };

  try {
    const supabase = createAdminClient();

    const { data: studio, error: studioError } = await supabase
      .from("studios")
      .select("id, timezone")
      .eq("slug", STUDIO_SLUG)
      .maybeSingle();
    if (studioError) throw new Error(studioError.message);
    if (!studio) throw new Error("No se encontró el estudio.");

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("studio_id", studio.id)
      .eq("phone", normalized)
      .maybeSingle();
    if (clientError) throw new Error(clientError.message);
    // Número desconocido: lista vacía, sin revelar si el número existe.
    if (!client) return { ok: true, appointments: [] };

    const now = new Date();
    const { data, error } = await supabase
      .from("appointments")
      .select(
        `manage_token, status, starts_at, hold_expires_at,
         appointment_services ( name )`,
      )
      .eq("studio_id", studio.id)
      .eq("client_id", client.id)
      .in("status", ["confirmed", "pending_deposit"])
      .gt("starts_at", now.toISOString())
      .order("starts_at", { ascending: true });
    if (error) throw new Error(error.message);

    type Row = {
      manage_token: string;
      status: string;
      starts_at: string;
      hold_expires_at: string | null;
      appointment_services: { name: string }[] | { name: string } | null;
    };

    const appointments = ((data ?? []) as unknown as Row[])
      // Una cita por aprobar cuya reserva ya venció no cuenta.
      .filter(
        (a) =>
          a.status === "confirmed" ||
          a.hold_expires_at === null ||
          new Date(a.hold_expires_at).getTime() > now.getTime(),
      )
      .map((a) => {
        const start = zonedParts(new Date(a.starts_at), studio.timezone);
        return {
          token: String(a.manage_token),
          date: start.date,
          time: start.time,
          services: many(a.appointment_services).map((s) => s.name),
        };
      });

    return { ok: true, appointments };
  } catch (e) {
    logError("buscar por número", e);
    return { ok: false, error: FIND_ERROR };
  }
}

// ---------------------------------------------------------------------
// Reprogramar
// ---------------------------------------------------------------------

export async function rescheduleAppointment(
  token: string,
  date: string,
  time: string,
  expectedMode: "on_time" | "late",
): Promise<RescheduleResult> {
  if (!isUuid(token)) return { ok: false, code: "invalid", error: NOT_FOUND_ERROR };
  if (expectedMode !== "on_time" && expectedMode !== "late") {
    return { ok: false, code: "invalid", error: RESCHEDULE_ERROR };
  }
  if (!isValidDate(date) || typeof time !== "string" || !TIME_RE.test(time)) {
    return { ok: false, code: "invalid", error: "Elige un día y una hora." };
  }

  try {
    const record = await loadAppointment(token);
    if (!record) return { ok: false, code: "invalid", error: NOT_FOUND_ERROR };

    // El plazo se revisa otra vez ahora, al confirmar.
    const mode = modeOf(record, new Date());
    if (mode === "already_changed") {
      return { ok: false, code: "not_allowed", error: ALREADY_CHANGED_ERROR };
    }
    if (mode === "not_available") {
      return { ok: false, code: "not_allowed", error: NOT_AVAILABLE_ERROR };
    }
    if (mode !== expectedMode) {
      return {
        ok: false,
        code: "mode_changed",
        error:
          mode === "late"
            ? `Ya faltan menos de ${record.studio.noticeHours} horas para tu cita. Revisa las condiciones antes de continuar.`
            : "Las condiciones de tu cita cambiaron. Revisa antes de continuar.",
      };
    }

    // Comprobación autoritativa del horario: el mismo cálculo que ve la clienta.
    const availability = await getAppointmentMonthAvailability(date.slice(0, 7), record.token);
    if (!availability.ok) return rescheduleFailure("disponibilidad", availability.error);
    if (!(availability.data.days[date] ?? []).includes(time)) {
      return { ok: false, code: "slot_taken", error: SLOT_TAKEN_ERROR };
    }

    const durationMs = record.endsAt.getTime() - record.startsAt.getTime();
    const startsAt = zonedToUtc(date, time, record.studio.timezone);
    const endsAt = new Date(startsAt.getTime() + durationMs);
    if (startsAt.getTime() === record.startsAt.getTime()) {
      return { ok: false, code: "slot_taken", error: SLOT_TAKEN_ERROR };
    }

    const supabase = createAdminClient();
    const now = new Date();

    // Las reservas vencidas que se cruzan con el nuevo horario se liberan primero,
    // para que la regla de "sin citas cruzadas" no bloquee un horario libre.
    const { error: releaseError } = await supabase
      .from("appointments")
      .update({ status: "released" })
      .eq("studio_id", record.studioId)
      .eq("status", "pending_deposit")
      .not("hold_expires_at", "is", null)
      .lt("hold_expires_at", now.toISOString())
      .lt("starts_at", endsAt.toISOString())
      .gt("ends_at", startsAt.toISOString());
    if (releaseError) return rescheduleFailure("liberar reservas vencidas", releaseError.message);

    const newDeposit = record.studio.depositCents;
    const needsPayment = mode === "late" && newDeposit > 0;

    const base = {
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reschedule_count: record.rescheduleCount + 1,
    };
    const changes =
      mode === "on_time"
        ? base
        : needsPayment
          ? {
              ...base,
              status: "pending_deposit",
              deposit_cents: newDeposit,
              hold_expires_at: new Date(
                now.getTime() + record.studio.pendingHoldMinutes * 60_000,
              ).toISOString(),
              // La tasa se congela aquí, al llegar al paso de pago.
              quote_eur_to_ves: record.studio.eurToVesRate,
              quote_eur_to_usdt: EUR_TO_USDT,
              confirmation_sent_at: null,
            }
          : // Fuera del plazo, pero el estudio no pide abono: sigue confirmada.
            { ...base, deposit_cents: 0, hold_expires_at: null };

    // Condicional: un doble envío no puede reprogramar dos veces.
    const { data: updated, error: updateError } = await supabase
      .from("appointments")
      .update(changes)
      .eq("id", record.id)
      .eq("status", "confirmed")
      .eq("reschedule_count", record.rescheduleCount)
      .select("id");
    if (updateError) {
      if (updateError.code === EXCLUSION_VIOLATION) {
        return { ok: false, code: "slot_taken", error: SLOT_TAKEN_ERROR };
      }
      return rescheduleFailure("actualizar cita", updateError.message);
    }
    if (!updated || updated.length === 0) {
      return { ok: false, code: "not_allowed", error: ALREADY_CHANGED_ERROR };
    }

    if (mode === "late") {
      // Fuera del plazo el abono pagado se pierde. Solo después de mover la cita.
      const { error: forfeitError } = await supabase
        .from("deposits")
        .update({ status: "forfeited" })
        .eq("appointment_id", record.id)
        .eq("status", "approved");
      if (forfeitError) {
        logError("perder abono", forfeitError.message);
        // Sin esto la cita quedaría esperando un abono que no se puede enviar:
        // se intenta dejarla como estaba.
        const { error: undoError } = await supabase
          .from("appointments")
          .update({
            starts_at: record.startsAt.toISOString(),
            ends_at: record.endsAt.toISOString(),
            reschedule_count: record.rescheduleCount,
            status: "confirmed",
            deposit_cents: record.depositCents,
            hold_expires_at: record.holdExpiresAt,
            ...record.original,
          })
          .eq("id", record.id)
          .eq("reschedule_count", record.rescheduleCount + 1);
        if (undoError) logError("deshacer cambio", undoError.message);
        return { ok: false, code: "server", error: RESCHEDULE_ERROR };
      }
    }

    return { ok: true, needsPayment };
  } catch (e) {
    return rescheduleFailure("inesperado", e);
  }
}

// ---------------------------------------------------------------------
// No podré asistir
// ---------------------------------------------------------------------

export async function releaseByClient(token: string): Promise<ReleaseResult> {
  if (!isUuid(token)) return { ok: false, error: NOT_FOUND_ERROR };

  try {
    const record = await loadAppointment(token);
    if (!record) return { ok: false, error: NOT_FOUND_ERROR };

    const now = new Date();
    if (!canReleaseAt(record, now)) return { ok: false, error: CANNOT_RELEASE_ERROR };
    const late = releaseIsLate(record, now);

    const supabase = createAdminClient();

    // Condicional: solo si la cita sigue como se leyó y no ha empezado.
    const { data: released, error: releaseError } = await supabase
      .from("appointments")
      .update({ status: "released" })
      .eq("id", record.id)
      .eq("status", record.status)
      .eq("reschedule_count", record.rescheduleCount)
      .gt("starts_at", now.toISOString())
      .select("id");
    if (releaseError) return releaseFailure("liberar", releaseError.message);
    if (!released || released.length === 0) return { ok: false, error: CANNOT_RELEASE_ERROR };

    // Con menos horas de aviso que las del estudio, el abono se pierde (no se
    // devuelve). A tiempo, los abonos quedan como estaban.
    if (late) {
      const { error: forfeitError } = await supabase
        .from("deposits")
        .update({ status: "forfeited" })
        .eq("appointment_id", record.id)
        .in("status", ["approved", "pending"]);
      // La cita ya está liberada: el error se registra, pero no se le muestra.
      if (forfeitError) logError("perder abono al liberar", forfeitError.message);
    }

    return { ok: true };
  } catch (e) {
    return releaseFailure("inesperado", e);
  }
}
