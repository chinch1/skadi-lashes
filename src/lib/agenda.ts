import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, zonedParts, zonedToUtc } from "@/lib/time";

// Lo que Giselle ve en la Agenda: abonos por revisar, citas sin abono por
// confirmar, clientas por avisar, las citas del día y las próximas. Las tablas se leen con
// su propia sesión (seguridad por filas); la llave de servicio solo firma
// enlaces a los comprobantes.

export type AgendaStatus =
  | "pending_deposit"
  | "confirmed"
  | "completed"
  | "no_show"
  | "released";

export type AgendaAppointment = {
  id: string;
  token: string; // manage_token
  date: string; // "AAAA-MM-DD" local del estudio
  time: string; // "HH:MM" local
  endTime: string;
  startsAt: string; // ISO
  status: AgendaStatus;
  // pending_deposit sin pago (abono 0): espera que Giselle la confirme o la rechace.
  awaitingConfirmation: boolean;
  client: { id: string; firstName: string; lastName: string; phone: string; remindersOk: boolean };
  services: { name: string; durationMin: number; priceCents: number }[];
  totalCents: number;
  durationMin: number;
  depositCents: number;
  confirmationSentAt: string | null;
};

export type PendingDeposit = {
  depositId: string;
  createdAt: string;
  method: "pago_movil" | "binance";
  paidCurrency: "VES" | "USDT" | null;
  paidAmount: number | null;
  amountCents: number;
  receiptUrl: string | null; // enlace firmado (~15 min), null si no hay imagen o falló
  appointment: AgendaAppointment;
};

export type AgendaData = {
  timeZone: string;
  today: string;
  date: string;
  pendingDeposits: PendingDeposit[];
  // Citas sin abono que esperan que Giselle las confirme.
  pendingConfirmations: AgendaAppointment[];
  toConfirm: AgendaAppointment[];
  toNotifyRejection: AgendaAppointment[];
  dayAppointments: AgendaAppointment[];
  // Citas desde ahora en adelante (confirmadas, por aprobar o por confirmar),
  // como mucho UPCOMING_LIMIT.
  upcoming: AgendaAppointment[];
  upcomingTruncated: boolean;
  // Horas de aviso: liberar con menos tiempo hace perder el abono.
  noticeHours: number;
  // Textos de WhatsApp de Giselle; null = el de la app.
  messageTemplates: { confirmation: string | null; rejection: string | null };
};

const RECEIPT_BUCKET = "receipts";
const SIGNED_URL_SECONDS = 900;
const LOAD_ERROR = "No se pudo cargar la agenda.";

// Cuántas citas próximas se muestran como mucho.
export const UPCOMING_LIMIT = 100;
// Se leen unas de más por si alguna es un horario apartado sin pagar, que se descarta.
const UPCOMING_FETCH = UPCOMING_LIMIT + 20;

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Fecha real (descarta "2026-02-30").
function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function fail(context: string, detail: unknown): never {
  console.error(`[agenda] ${context}:`, detail instanceof Error ? detail.message : detail);
  throw new Error(LOAD_ERROR);
}

// Postgres devuelve numeric como número o como texto.
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

// ---------------------------------------------------------------------
// Lectura de citas
// ---------------------------------------------------------------------

const APPOINTMENT_SELECT = `id, manage_token, status, starts_at, ends_at, deposit_cents,
  total_cents, hold_expires_at, confirmation_sent_at, rejected_at,
  clients ( id, first_name, last_name, phone, reminders_ok ),
  appointment_services ( name, duration_min, price_cents ),
  deposits ( id, status, created_at, reviewed_at )`;

type RawDepositSummary = {
  id: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
};

type RawAppointment = {
  id: string;
  manage_token: string;
  status: AgendaStatus;
  starts_at: string;
  ends_at: string;
  deposit_cents: number;
  total_cents: number;
  hold_expires_at: string | null;
  confirmation_sent_at: string | null;
  rejected_at: string | null;
  clients:
    | { id: string; first_name: string; last_name: string; phone: string; reminders_ok: boolean }
    | { id: string; first_name: string; last_name: string; phone: string; reminders_ok: boolean }[]
    | null;
  appointment_services: { name: string; duration_min: number; price_cents: number }[] | null;
  deposits: RawDepositSummary[] | null;
};

type RawPendingDeposit = {
  id: string;
  created_at: string;
  method: "pago_movil" | "binance";
  paid_currency: "VES" | "USDT" | null;
  paid_amount: number | string | null;
  amount_cents: number;
  receipt_path: string | null;
  appointments: RawAppointment | RawAppointment[] | null;
};

// Cita leída más lo que hace falta para clasificarla.
type Loaded = {
  view: AgendaAppointment;
  // pending_deposit que pide abono y todavía no tiene comprobante (vigente o
  // vencido): es solo un horario apartado mientras la clienta paga. No es
  // asunto de Giselle hasta que suba el comprobante.
  unpaidHold: boolean;
};

function toLoaded(row: RawAppointment, timeZone: string): Loaded {
  const start = zonedParts(new Date(row.starts_at), timeZone);
  const end = zonedParts(new Date(row.ends_at), timeZone);
  const deposits = many(row.deposits);
  const client = one(row.clients);
  const services = many(row.appointment_services).map((s) => ({
    name: s.name,
    durationMin: Number(s.duration_min),
    priceCents: Number(s.price_cents),
  }));

  // Igual que el estado que ve la clienta (src/lib/booking.ts).
  const isPending = row.status === "pending_deposit";
  // Sin abono no hay pago ni reloj: la cita espera a Giselle, no un comprobante.
  const awaitingConfirmation = isPending && (Number(row.deposit_cents) || 0) === 0;
  const receiptSent = deposits.some((d) => d.status === "pending" || d.status === "approved");

  return {
    unpaidHold: isPending && !awaitingConfirmation && !receiptSent,
    view: {
      id: row.id,
      token: String(row.manage_token),
      date: start.date,
      time: start.time,
      endTime: end.time,
      startsAt: row.starts_at,
      status: row.status,
      awaitingConfirmation,
      client: {
        id: client?.id ?? "",
        firstName: client?.first_name ?? "",
        lastName: client?.last_name ?? "",
        phone: client?.phone ?? "",
        remindersOk: client?.reminders_ok === true,
      },
      services,
      totalCents: Number(row.total_cents) || 0,
      durationMin: services.reduce((sum, s) => sum + s.durationMin, 0),
      depositCents: Number(row.deposit_cents) || 0,
      confirmationSentAt: row.confirmation_sent_at,
    },
  };
}

// Enlaces firmados al bucket privado, solo para rutas del propio estudio.
async function signReceipts(
  studioId: string,
  paths: string[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const own = [...new Set(paths.filter((p) => p.startsWith(`${studioId}/`)))];
  if (own.length === 0) return urls;
  try {
    const { data, error } = await createAdminClient()
      .storage.from(RECEIPT_BUCKET)
      .createSignedUrls(own, SIGNED_URL_SECONDS);
    if (error) {
      console.error("[agenda] firmar comprobantes:", error.message);
      return urls;
    }
    for (const item of data ?? []) {
      if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
    }
  } catch (e) {
    console.error("[agenda] firmar comprobantes:", e instanceof Error ? e.message : e);
  }
  return urls;
}

// ---------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------

type StudioFields = {
  timezone: string;
  reschedule_notice_hours?: number | null;
  confirmation_message?: string | null;
  rejection_message?: string | null;
};

export async function getAgenda(
  supabase: SupabaseClient,
  studioId: string,
  date?: string,
  // Fila del estudio ya cargada (viene con la comprobación de administradora).
  preloadedStudio?: StudioFields,
): Promise<AgendaData> {
  let studio = preloadedStudio;
  if (!studio) {
    const { data, error: studioError } = await supabase
      .from("studios")
      .select("timezone, reschedule_notice_hours, confirmation_message, rejection_message")
      .eq("id", studioId)
      .maybeSingle();
    if (studioError) fail("estudio", studioError.message);
    if (!data) fail("estudio", "No se encontró el estudio.");
    studio = data as StudioFields;
  }

  const timeZone: string = studio.timezone;
  const now = new Date();
  const nowIso = now.toISOString();
  const today = zonedParts(now, timeZone).date;
  const day = isValidDate(date) ? date : today;
  const dayStart = zonedToUtc(day, "00:00", timeZone).toISOString();
  const dayEnd = zonedToUtc(addDays(day, 1), "00:00", timeZone).toISOString();

  const [pendingRes, unpaidRes, confirmRes, rejectedRes, dayRes, upcomingRes] = await Promise.all([
    // Todos los abonos por revisar, del más antiguo al más nuevo.
    supabase
      .from("deposits")
      .select(
        `id, created_at, method, paid_currency, paid_amount, amount_cents, receipt_path,
         appointments ( ${APPOINTMENT_SELECT} )`,
      )
      .eq("studio_id", studioId)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    // Citas sin abono que esperan que Giselle las confirme.
    supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT)
      .eq("studio_id", studioId)
      .eq("status", "pending_deposit")
      .eq("deposit_cents", 0)
      .order("starts_at", { ascending: true }),
    // Citas confirmadas que aún no recibieron el mensaje de confirmación.
    supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT)
      .eq("studio_id", studioId)
      .eq("status", "confirmed")
      .is("confirmation_sent_at", null)
      .gt("starts_at", nowIso)
      .order("starts_at", { ascending: true }),
    // Citas que Giselle rechazó y que aún no pasan (candidatas a aviso de rechazo).
    // Las que liberó la clienta no tienen rejected_at.
    supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT)
      .eq("studio_id", studioId)
      .eq("status", "released")
      .not("rejected_at", "is", null)
      .gt("starts_at", nowIso)
      .order("starts_at", { ascending: true }),
    // Citas del día mostrado.
    supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT)
      .eq("studio_id", studioId)
      .neq("status", "released")
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd)
      .order("starts_at", { ascending: true }),
    // Próximas citas, desde ahora.
    supabase
      .from("appointments")
      .select(APPOINTMENT_SELECT)
      .eq("studio_id", studioId)
      .in("status", ["confirmed", "pending_deposit"])
      .gt("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(UPCOMING_FETCH),
  ]);
  if (pendingRes.error) fail("abonos por revisar", pendingRes.error.message);
  if (unpaidRes.error) fail("citas por confirmar", unpaidRes.error.message);
  if (confirmRes.error) fail("por avisar", confirmRes.error.message);
  if (rejectedRes.error) fail("rechazados", rejectedRes.error.message);
  if (dayRes.error) fail("citas del día", dayRes.error.message);
  if (upcomingRes.error) fail("próximas citas", upcomingRes.error.message);

  const load = (rows: unknown[] | null) =>
    (rows ?? []).map((row) => toLoaded(row as RawAppointment, timeZone));

  // Abonos por revisar.
  const pendingRows = (pendingRes.data ?? []) as unknown as RawPendingDeposit[];
  const signed = await signReceipts(
    studioId,
    pendingRows.map((d) => d.receipt_path).filter((p): p is string => !!p),
  );
  const pendingDeposits: PendingDeposit[] = [];
  for (const d of pendingRows) {
    const appointment = one(d.appointments);
    // Solo los de citas que siguen esperando el abono (no las liberadas).
    if (!appointment || appointment.status !== "pending_deposit") continue;
    pendingDeposits.push({
      depositId: d.id,
      createdAt: d.created_at,
      method: d.method,
      paidCurrency: d.paid_currency,
      paidAmount: toNumber(d.paid_amount),
      amountCents: Number(d.amount_cents) || 0,
      receiptUrl: d.receipt_path ? (signed.get(d.receipt_path) ?? null) : null,
      appointment: toLoaded(appointment, timeZone).view,
    });
  }

  // Citas sin abono por confirmar.
  const pendingConfirmations = load(unpaidRes.data).map((a) => a.view);

  // Por avisar de la confirmación: toda cita confirmada sin mensaje enviado,
  // con abono aprobado o sin abono.
  const toConfirm = load(confirmRes.data).map((a) => a.view);

  // Por avisar del rechazo: cita rechazada por Giselle sin un mensaje de
  // rechazo enviado después de rechazarla.
  const rejected = load(rejectedRes.data);
  const rejectedAt = new Map<string, number>();
  for (const row of (rejectedRes.data ?? []) as unknown as RawAppointment[]) {
    if (row.rejected_at) rejectedAt.set(row.id, new Date(row.rejected_at).getTime());
  }
  let toNotifyRejection: AgendaAppointment[] = [];
  if (rejected.length > 0) {
    const { data: logs, error: logsError } = await supabase
      .from("messages_log")
      .select("appointment_id, sent_at")
      .eq("studio_id", studioId)
      .eq("kind", "rejection")
      .in(
        "appointment_id",
        rejected.map((a) => a.view.id),
      );
    if (logsError) fail("mensajes de rechazo", logsError.message);
    const lastSent = new Map<string, number>();
    for (const log of logs ?? []) {
      const t = new Date(log.sent_at).getTime();
      if (t > (lastSent.get(log.appointment_id) ?? -Infinity)) lastSent.set(log.appointment_id, t);
    }
    toNotifyRejection = rejected
      .filter((a) => {
        const at = rejectedAt.get(a.view.id);
        if (at === undefined) return false;
        const sent = lastSent.get(a.view.id);
        return sent === undefined || sent < at;
      })
      .map((a) => a.view);
  }

  // Citas del día, sin los horarios apartados que aún no tienen comprobante.
  const dayAppointments = load(dayRes.data)
    .filter((a) => !a.unpaidHold)
    .map((a) => a.view);

  // Próximas citas, con el mismo criterio.
  const upcomingRows = upcomingRes.data ?? [];
  const upcomingAll = load(upcomingRows)
    .filter((a) => !a.unpaidHold)
    .map((a) => a.view);
  const upcoming = upcomingAll.slice(0, UPCOMING_LIMIT);
  const upcomingTruncated =
    upcomingAll.length > UPCOMING_LIMIT || upcomingRows.length >= UPCOMING_FETCH;

  return {
    timeZone,
    today,
    date: day,
    pendingDeposits,
    pendingConfirmations,
    toConfirm,
    toNotifyRejection,
    dayAppointments,
    upcoming,
    upcomingTruncated,
    noticeHours: Number(studio.reschedule_notice_hours ?? 12) || 0,
    messageTemplates: {
      confirmation: studio.confirmation_message ?? null,
      rejection: studio.rejection_message ?? null,
    },
  };
}
