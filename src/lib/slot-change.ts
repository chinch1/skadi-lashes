import "server-only";
import { getAppointmentMonthAvailability } from "@/lib/availability-data";
import { EUR_TO_USDT } from "@/lib/booking-config";
import {
  canPickNewSlot,
  canReleaseForSlotChange,
  type SlotChangeFacts,
} from "@/lib/slot-change-rules";
import { STUDIO_SLUG } from "@/lib/studio";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, zonedParts, zonedToUtc } from "@/lib/time";

// "Elegir otro horario" desde el paso de pago: la clienta suelta el horario que
// tenía apartado y elige otro con la misma cita (mismos servicios, misma clienta).
// No es una reprogramación: no cuenta para el límite de cambios.
// Público y sin sesión: pasa por la llave de servicio, se revisa cada entrada y
// nunca se devuelven identificadores internos.

// ---------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------

export type SlotChangeView = {
  token: string;
  clientFirstName: string;
  services: { name: string; durationMin: number; priceCents: number }[];
  durationMin: number;
  totalCents: number;
  today: string; // fechas locales para el calendario
  lastBookableDate: string;
};

export type ReleaseForSlotChangeResult = { ok: true } | { ok: false; error: string };

export type PickSlotResult =
  | { ok: true }
  | { ok: false; code: "invalid" | "slot_taken" | "not_allowed" | "server"; error: string };

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const EXCLUSION_VIOLATION = "23P01";
const DEFAULT_HOLD_MINUTES = 5;

const NOT_FOUND_ERROR = "No encontramos esta cita.";
const NOT_ALLOWED_ERROR = "Esta cita ya no se puede cambiar. Puedes agendar de nuevo.";
const SLOT_TAKEN_ERROR = "Ese horario ya no está disponible. Elige otro.";
const RELEASE_ERROR = "No se pudo soltar tu horario. Intenta de nuevo.";
const PICK_ERROR = "No se pudo apartar el horario. Intenta de nuevo.";

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
  console.error(`[otro horario] ${context}:`, detail instanceof Error ? detail.message : detail);
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
  depositCents: number;
  totalCents: number;
  holdExpiresAt: string | null;
  rejectedAt: string | null;
  createdAt: Date;
  clientFirstName: string;
  services: { name: string; durationMin: number; priceCents: number }[];
  depositStatuses: string[];
  studio: {
    timezone: string;
    depositCents: number;
    holdMinutes: number;
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
  deposit_cents: number;
  total_cents: number;
  hold_expires_at: string | null;
  rejected_at: string | null;
  created_at: string;
  clients: { first_name: string } | { first_name: string }[] | null;
  appointment_services:
    | { name: string; duration_min: number; price_cents: number }[]
    | null;
  deposits: { status: string }[] | null;
  studios:
    | {
        slug: string;
        timezone: string;
        deposit_cents: number;
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
      `id, studio_id, manage_token, status, starts_at, ends_at, deposit_cents,
       total_cents, hold_expires_at, rejected_at, created_at,
       clients ( first_name ),
       appointment_services ( name, duration_min, price_cents ),
       deposits ( status ),
       studios ( slug, timezone, deposit_cents, pending_hold_minutes,
                 booking_window_weeks, eur_to_ves_rate )`,
    )
    .eq("manage_token", token.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as RawAppointment;
  const studio = one(row.studios);
  if (!studio) throw new Error("La cita no tiene estudio.");
  if (studio.slug !== STUDIO_SLUG) return null;

  return {
    id: row.id,
    studioId: row.studio_id,
    token: String(row.manage_token),
    status: row.status,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    depositCents: Number(row.deposit_cents) || 0,
    totalCents: Number(row.total_cents) || 0,
    holdExpiresAt: row.hold_expires_at,
    rejectedAt: row.rejected_at,
    createdAt: new Date(row.created_at),
    clientFirstName: one(row.clients)?.first_name ?? "",
    services: many(row.appointment_services).map((s) => ({
      name: s.name,
      durationMin: Number(s.duration_min),
      priceCents: Number(s.price_cents),
    })),
    depositStatuses: many(row.deposits).map((d) => d.status),
    studio: {
      timezone: studio.timezone,
      depositCents: Number(studio.deposit_cents) || 0,
      holdMinutes: Number(studio.pending_hold_minutes) || DEFAULT_HOLD_MINUTES,
      bookingWindowWeeks: Number(studio.booking_window_weeks) || 0,
      eurToVesRate: toNumber(studio.eur_to_ves_rate),
    },
  };
}

function factsOf(record: AppointmentRecord, now: Date): SlotChangeFacts {
  return {
    status: record.status,
    depositCents: record.depositCents,
    depositStatuses: record.depositStatuses,
    rejectedAt: record.rejectedAt,
    createdAt: record.createdAt,
    now,
  };
}

// ---------------------------------------------------------------------
// Soltar el horario apartado
// ---------------------------------------------------------------------

export async function releaseForSlotChange(token: string): Promise<ReleaseForSlotChangeResult> {
  if (!isUuid(token)) return { ok: false, error: NOT_FOUND_ERROR };

  try {
    const record = await loadAppointment(token);
    if (!record) return { ok: false, error: NOT_FOUND_ERROR };

    const facts = factsOf(record, new Date());
    // Ya liberada (por ejemplo, un segundo toque): puede seguir eligiendo.
    if (canPickNewSlot(facts)) return { ok: true };
    // Con abono y sin comprobante, la reserva siempre tiene reloj. Al llegar un
    // comprobante el reloj pasa a nulo: por eso la liberación exige el mismo
    // reloj que se leyó, y un comprobante que se adelante la deja sin efecto.
    if (!canReleaseForSlotChange(facts) || !record.holdExpiresAt) {
      return { ok: false, error: NOT_ALLOWED_ERROR };
    }

    const supabase = createAdminClient();
    const { data: released, error } = await supabase
      .from("appointments")
      .update({ status: "released", hold_expires_at: null })
      .eq("id", record.id)
      .eq("status", "pending_deposit")
      .eq("hold_expires_at", record.holdExpiresAt)
      .gt("deposit_cents", 0)
      .is("rejected_at", null)
      .select("id");
    if (error) {
      logError("soltar horario", error.message);
      return { ok: false, error: RELEASE_ERROR };
    }
    if (!released || released.length === 0) {
      // Otro toque se adelantó: vale si la cita quedó liberada y elegible.
      const again = await loadAppointment(token);
      if (again && canPickNewSlot(factsOf(again, new Date()))) return { ok: true };
      return { ok: false, error: NOT_ALLOWED_ERROR };
    }

    return { ok: true };
  } catch (e) {
    logError("inesperado al soltar", e);
    return { ok: false, error: RELEASE_ERROR };
  }
}

// ---------------------------------------------------------------------
// Pantalla "Elige otro horario"
// ---------------------------------------------------------------------

export async function getSlotChangeView(token: string): Promise<SlotChangeView | null> {
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
  if (!canPickNewSlot(factsOf(record, now))) return null;

  const today = zonedParts(now, record.studio.timezone).date;
  return {
    token: record.token,
    clientFirstName: record.clientFirstName,
    services: record.services,
    durationMin: Math.round((record.endsAt.getTime() - record.startsAt.getTime()) / 60_000),
    totalCents: record.totalCents,
    today,
    lastBookableDate: addDays(today, record.studio.bookingWindowWeeks * 7),
  };
}

// ---------------------------------------------------------------------
// Apartar el horario nuevo
// ---------------------------------------------------------------------

export async function pickNewSlot(
  token: string,
  date: string,
  time: string,
): Promise<PickSlotResult> {
  if (!isUuid(token)) return { ok: false, code: "invalid", error: NOT_FOUND_ERROR };
  if (!isValidDate(date) || typeof time !== "string" || !TIME_RE.test(time)) {
    return { ok: false, code: "invalid", error: "Elige un día y una hora." };
  }

  try {
    const record = await loadAppointment(token);
    if (!record) return { ok: false, code: "invalid", error: NOT_FOUND_ERROR };
    if (!canPickNewSlot(factsOf(record, new Date()))) {
      return { ok: false, code: "not_allowed", error: NOT_ALLOWED_ERROR };
    }

    // Comprobación autoritativa del horario: el mismo cálculo que ve la clienta.
    const availability = await getAppointmentMonthAvailability(date.slice(0, 7), record.token);
    if (!availability.ok) {
      logError("disponibilidad", availability.error);
      return { ok: false, code: "server", error: PICK_ERROR };
    }
    if (!(availability.data.days[date] ?? []).includes(time)) {
      return { ok: false, code: "slot_taken", error: SLOT_TAKEN_ERROR };
    }

    const durationMs = record.endsAt.getTime() - record.startsAt.getTime();
    const startsAt = zonedToUtc(date, time, record.studio.timezone);
    const endsAt = new Date(startsAt.getTime() + durationMs);

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
    if (releaseError) {
      logError("liberar reservas vencidas", releaseError.message);
      return { ok: false, code: "server", error: PICK_ERROR };
    }

    // El abono es el del estudio hoy. Si ya no pide abono, la cita queda
    // apartada sin reloj hasta que Skadi la confirme.
    const deposit = record.studio.depositCents;
    const payment =
      deposit > 0
        ? {
            deposit_cents: deposit,
            hold_expires_at: new Date(
              now.getTime() + record.studio.holdMinutes * 60_000,
            ).toISOString(),
            // La tasa se congela otra vez, al volver al paso de pago.
            quote_eur_to_ves: record.studio.eurToVesRate,
            quote_eur_to_usdt: EUR_TO_USDT,
          }
        : {
            deposit_cents: 0,
            hold_expires_at: null,
            quote_eur_to_ves: null,
            quote_eur_to_usdt: null,
          };

    // Condicional: un doble envío no puede apartar dos horarios.
    const { data: updated, error: updateError } = await supabase
      .from("appointments")
      .update({
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "pending_deposit",
        ...payment,
      })
      .eq("id", record.id)
      .eq("status", "released")
      .is("rejected_at", null)
      .select("id");
    if (updateError) {
      if (updateError.code === EXCLUSION_VIOLATION) {
        return { ok: false, code: "slot_taken", error: SLOT_TAKEN_ERROR };
      }
      logError("actualizar cita", updateError.message);
      return { ok: false, code: "server", error: PICK_ERROR };
    }
    if (!updated || updated.length === 0) {
      return { ok: false, code: "not_allowed", error: NOT_ALLOWED_ERROR };
    }

    return { ok: true };
  } catch (e) {
    logError("inesperado al elegir", e);
    return { ok: false, code: "server", error: PICK_ERROR };
  }
}
