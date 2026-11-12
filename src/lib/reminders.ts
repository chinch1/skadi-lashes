import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RETOUCH_WINDOW_DAYS,
  selectRetouchReminders,
  type ReminderStatus,
  type RetouchCandidate,
} from "@/lib/reminder-rules";
import { addDays, zonedParts, zonedToUtc } from "@/lib/time";

// Lo que Giselle ve en Recordatorios: las citas de mañana y los retoques
// pendientes. Se lee con su propia sesión (seguridad por filas).

export type ReminderClient = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
};

export type TomorrowAppointment = {
  id: string;
  token: string; // manage_token
  date: string; // "AAAA-MM-DD" local del estudio
  time: string; // "HH:MM" local
  client: ReminderClient;
  services: string[];
};

export type RetouchReminder = {
  id: string;
  date: string; // fecha local de la cita a la que asistió
  time: string;
  dueDate: string;
  daysAgo: number;
  client: ReminderClient;
  services: string[]; // los que piden retoque
};

export type RemindersData = {
  today: string;
  tomorrow: string;
  toRemind: TomorrowAppointment[]; // aceptan recordatorios y aún no se les envió
  noReminders: TomorrowAppointment[]; // no quieren recordatorios
  reminded: TomorrowAppointment[]; // ya recordadas
  retouches: RetouchReminder[];
  // Textos de WhatsApp de Giselle; null = el de la app.
  messageTemplates: { reminder: string | null; retouch: string | null };
};

const LOAD_ERROR = "No se pudieron cargar los recordatorios.";

function fail(context: string, detail: unknown): never {
  console.error(
    `[recordatorios] ${context}:`,
    detail instanceof Error ? detail.message : detail,
  );
  throw new Error(LOAD_ERROR);
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

type RawClient = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  reminders_ok: boolean;
};

function toClient(raw: RawClient | null): ReminderClient {
  return {
    id: raw?.id ?? "",
    firstName: raw?.first_name ?? "",
    lastName: raw?.last_name ?? "",
    phone: raw?.phone ?? "",
  };
}

type RawTomorrow = {
  id: string;
  manage_token: string;
  starts_at: string;
  clients: RawClient | RawClient[] | null;
  appointment_services: { name: string }[] | { name: string } | null;
};

type RawRetouch = {
  id: string;
  client_id: string;
  starts_at: string;
  ends_at: string;
  status: ReminderStatus;
  hold_expires_at: string | null;
  clients: RawClient | RawClient[] | null;
  appointment_services:
    | {
        name: string;
        services:
          | { retouch_reminder_days: number | null }
          | { retouch_reminder_days: number | null }[]
          | null;
      }[]
    | null;
  deposits: { status: string }[] | { status: string } | null;
};

export async function getReminders(
  supabase: SupabaseClient,
  studioId: string,
  // Fila del estudio ya cargada (viene con la comprobación de administradora).
  preloadedStudio?: {
    timezone: string;
    reminder_message?: string | null;
    retouch_message?: string | null;
  },
): Promise<RemindersData> {
  let studio = preloadedStudio;
  if (!studio) {
    const { data, error: studioError } = await supabase
      .from("studios")
      .select("timezone, reminder_message, retouch_message")
      .eq("id", studioId)
      .maybeSingle();
    if (studioError) fail("estudio", studioError.message);
    if (!data) fail("estudio", "No se encontró el estudio.");
    studio = data;
  }

  const timeZone: string = studio.timezone;
  const now = new Date();
  const today = zonedParts(now, timeZone).date;
  const tomorrow = addDays(today, 1);
  const tomorrowStart = zonedToUtc(tomorrow, "00:00", timeZone).toISOString();
  const tomorrowEnd = zonedToUtc(addDays(tomorrow, 1), "00:00", timeZone).toISOString();

  const [tomorrowRes, maxDaysRes] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        `id, manage_token, starts_at,
         clients ( id, first_name, last_name, phone, reminders_ok ),
         appointment_services ( name )`,
      )
      .eq("studio_id", studioId)
      .eq("status", "confirmed")
      .gte("starts_at", tomorrowStart)
      .lt("starts_at", tomorrowEnd)
      .order("starts_at", { ascending: true }),
    // Los días de retoque más largos marcan hasta dónde mirar hacia atrás.
    supabase
      .from("services")
      .select("retouch_reminder_days")
      .eq("studio_id", studioId)
      .not("retouch_reminder_days", "is", null)
      .order("retouch_reminder_days", { ascending: false })
      .limit(1),
  ]);
  if (tomorrowRes.error) fail("citas de mañana", tomorrowRes.error.message);
  if (maxDaysRes.error) fail("días de retoque", maxDaysRes.error.message);

  // ---------------------------------------------------------------
  // Citas de mañana
  // ---------------------------------------------------------------
  const tomorrowRows = (tomorrowRes.data ?? []) as unknown as RawTomorrow[];
  const remindedIds = new Set<string>();
  if (tomorrowRows.length > 0) {
    const { data: logs, error } = await supabase
      .from("messages_log")
      .select("appointment_id")
      .eq("studio_id", studioId)
      .eq("kind", "appointment_reminder")
      .in(
        "appointment_id",
        tomorrowRows.map((row) => row.id),
      );
    if (error) fail("recordatorios enviados", error.message);
    for (const log of logs ?? []) remindedIds.add(log.appointment_id);
  }

  const toRemind: TomorrowAppointment[] = [];
  const noReminders: TomorrowAppointment[] = [];
  const reminded: TomorrowAppointment[] = [];
  for (const row of tomorrowRows) {
    const rawClient = one(row.clients);
    const start = zonedParts(new Date(row.starts_at), timeZone);
    const item: TomorrowAppointment = {
      id: row.id,
      token: String(row.manage_token),
      date: start.date,
      time: start.time,
      client: toClient(rawClient),
      services: many(row.appointment_services).map((s) => s.name),
    };
    if (remindedIds.has(row.id)) reminded.push(item);
    else if (rawClient?.reminders_ok) toRemind.push(item);
    else noReminders.push(item);
  }

  // ---------------------------------------------------------------
  // Retoques pendientes
  // ---------------------------------------------------------------
  const maxDays = Number(maxDaysRes.data?.[0]?.retouch_reminder_days) || 0;
  let retouches: RetouchReminder[] = [];
  if (maxDays > 0) {
    // La cita más antigua que todavía puede tener un retoque en la ventana.
    const fromDate = addDays(today, -(RETOUCH_WINDOW_DAYS + maxDays));
    const fromIso = zonedToUtc(fromDate, "00:00", timeZone).toISOString();

    // Incluye las citas futuras: sirven para saber si la clienta ya agendó.
    const [rowsRes, logsRes] = await Promise.all([
      supabase
        .from("appointments")
        .select(
          `id, client_id, starts_at, ends_at, status, hold_expires_at,
           clients ( id, first_name, last_name, phone, reminders_ok ),
           appointment_services ( name, services ( retouch_reminder_days ) ),
           deposits ( status )`,
        )
        .eq("studio_id", studioId)
        .in("status", ["confirmed", "pending_deposit", "completed"])
        .gte("starts_at", fromIso)
        .order("starts_at", { ascending: true }),
      // Un recordatorio de retoque se registra siempre después de la cita.
      supabase
        .from("messages_log")
        .select("appointment_id")
        .eq("studio_id", studioId)
        .eq("kind", "retouch_reminder")
        .gte("sent_at", fromIso),
    ]);
    if (rowsRes.error) fail("citas para retoque", rowsRes.error.message);
    if (logsRes.error) fail("retoques enviados", logsRes.error.message);

    const retouchLogged = new Set(
      (logsRes.data ?? [])
        .map((log) => log.appointment_id as string | null)
        .filter((id): id is string => !!id),
    );

    const candidates = ((rowsRes.data ?? []) as unknown as RawRetouch[]).map(
      (row) => {
        const rawClient = one(row.clients);
        const start = new Date(row.starts_at);
        const local = zonedParts(start, timeZone);
        // Igual que la Agenda: reserva vencida sin comprobante enviado.
        const receiptSent = many(row.deposits).some(
          (d) => d.status === "pending" || d.status === "approved",
        );
        const holdExpired =
          row.status === "pending_deposit" &&
          !receiptSent &&
          row.hold_expires_at !== null &&
          new Date(row.hold_expires_at).getTime() < now.getTime();
        const candidate: RetouchCandidate & {
          time: string;
          client: ReminderClient;
        } = {
          id: row.id,
          clientId: row.client_id,
          date: local.date,
          time: local.time,
          startsAt: start,
          endsAt: new Date(row.ends_at),
          status: row.status,
          holdExpired,
          remindersOk: rawClient?.reminders_ok === true,
          reminded: retouchLogged.has(row.id),
          services: many(row.appointment_services).map((s) => {
            const days = one(s.services)?.retouch_reminder_days;
            return {
              name: s.name,
              retouchDays: days === null || days === undefined ? null : Number(days),
            };
          }),
          client: toClient(rawClient),
        };
        return candidate;
      },
    );

    retouches = selectRetouchReminders(candidates, today, now).map((due) => ({
      id: due.id,
      date: due.date,
      time: due.time,
      dueDate: due.dueDate,
      daysAgo: due.daysAgo,
      client: due.client,
      services: due.triggers,
    }));
  }

  return {
    today,
    tomorrow,
    toRemind,
    noReminders,
    reminded,
    retouches,
    messageTemplates: {
      reminder: studio.reminder_message ?? null,
      retouch: studio.retouch_message ?? null,
    },
  };
}
