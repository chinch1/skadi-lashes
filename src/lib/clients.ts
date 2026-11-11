import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedParts } from "@/lib/time";

// Clientas para la pestaña "Clientas" de /admin. Se leen con la sesión de
// Giselle (seguridad por filas) y siempre se filtran también por estudio.

export type ClientStatus =
  | "pending_deposit"
  | "confirmed"
  | "completed"
  | "no_show"
  | "released";

export type ClientListItem = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  depositExempt: boolean;
  attended: number; // citas con estado completed
  noShows: number; // citas con estado no_show
};

export type ClientList = {
  clients: ClientListItem[];
  truncated: boolean;
  error: boolean;
};

export type ClientAppointment = {
  id: string;
  date: string; // "AAAA-MM-DD" local del estudio
  time: string; // "HH:MM" local
  endTime: string;
  startsAt: string; // ISO
  status: ClientStatus;
  rescheduled: boolean;
  totalCents: number;
  services: string[];
};

export type ClientDetail = {
  timeZone: string;
  today: string; // "AAAA-MM-DD" local del estudio
  client: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    remindersOk: boolean;
    depositExempt: boolean;
    sinceMonth: string; // "AAAA-MM" local del estudio
  };
  appointments: ClientAppointment[]; // de la más nueva a la más vieja
  attended: number;
  noShows: number;
  upcoming: number;
};

export const LIST_LIMIT = 200;
export const QUERY_MAX_LENGTH = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Quita lo que rompe el filtro `or` de PostgREST o actúa como comodín.
export function cleanQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[,()%\\*"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, QUERY_MAX_LENGTH)
    .trim();
}

// "0412 123" -> "412123": así coincide con "+58412123…".
function phoneDigits(query: string): string {
  return query.replace(/\D/g, "").replace(/^0/, "");
}

export function fullName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

const COUNT_PAGE = 1000;
const IDS_PER_REQUEST = 100;

// Cuenta citas atendidas y faltas por clienta. Pide solo esos dos estados y
// los agrupa aquí; recorre páginas para no quedarse corta con el límite de filas.
async function countByClient(
  supabase: SupabaseClient,
  studioId: string,
  clientIds: string[],
): Promise<Map<string, { attended: number; noShows: number }> | null> {
  const counts = new Map<string, { attended: number; noShows: number }>();
  for (const id of clientIds) counts.set(id, { attended: 0, noShows: 0 });

  for (let start = 0; start < clientIds.length; start += IDS_PER_REQUEST) {
    const ids = clientIds.slice(start, start + IDS_PER_REQUEST);
    for (let from = 0; ; from += COUNT_PAGE) {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, client_id, status")
        .eq("studio_id", studioId)
        .in("client_id", ids)
        .in("status", ["completed", "no_show"])
        .order("id")
        .range(from, from + COUNT_PAGE - 1);
      if (error) {
        console.error("[clientas] conteo de citas:", error.message);
        return null;
      }
      for (const row of data ?? []) {
        const entry = counts.get(row.client_id);
        if (!entry) continue;
        if (row.status === "completed") entry.attended += 1;
        else if (row.status === "no_show") entry.noShows += 1;
      }
      if (!data || data.length < COUNT_PAGE) break;
    }
  }
  return counts;
}

export async function listClients(
  supabase: SupabaseClient,
  studioId: string,
  query: string,
): Promise<ClientList> {
  let request = supabase
    .from("clients")
    .select("id, first_name, last_name, phone, deposit_exempt")
    .eq("studio_id", studioId);

  if (query) {
    const digits = phoneDigits(query);
    const words = query.split(" ").filter((word) => /\p{L}/u.test(word));
    if (words.length === 0 && digits.length >= 3) {
      // Solo números: se busca en el teléfono.
      request = request.like("phone", `%${digits}%`);
    } else if (words.length === 0) {
      request = request.or(
        `first_name.ilike.%${query}%,last_name.ilike.%${query}%`,
      );
    } else {
      // Cada palabra debe estar en el nombre o en el apellido:
      // "maria perez" encuentra a María Pérez aunque estén en campos distintos.
      const phone = digits.length >= 3 ? `,phone.like.%${digits}%` : "";
      for (const word of words.slice(0, 4)) {
        request = request.or(
          `first_name.ilike.%${word}%,last_name.ilike.%${word}%${phone}`,
        );
      }
    }
  }

  const { data, error } = await request
    .order("first_name")
    .order("last_name")
    .order("id")
    .limit(LIST_LIMIT + 1);
  if (error) {
    console.error("[clientas] lista:", error.message);
    return { clients: [], truncated: false, error: true };
  }

  const rows = (data ?? []).slice(0, LIST_LIMIT);
  const counts = await countByClient(
    supabase,
    studioId,
    rows.map((row) => row.id),
  );
  // Sin conteos no se muestra la lista: diría "0 faltas" sin ser cierto.
  if (!counts) return { clients: [], truncated: false, error: true };

  return {
    clients: rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      depositExempt: row.deposit_exempt,
      attended: counts.get(row.id)?.attended ?? 0,
      noShows: counts.get(row.id)?.noShows ?? 0,
    })),
    truncated: (data ?? []).length > LIST_LIMIT,
    error: false,
  };
}

type RawAppointment = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: ClientStatus;
  reschedule_count: number;
  total_cents: number;
  appointment_services: { name: string }[] | null;
};

// null = la clienta no existe en este estudio. Lanza un error si falla la lectura.
export async function getClientDetail(
  supabase: SupabaseClient,
  studioId: string,
  clientId: string,
): Promise<ClientDetail | null> {
  if (!isUuid(clientId)) return null;

  const [studioResult, clientResult, appointmentsResult] = await Promise.all([
    supabase.from("studios").select("timezone").eq("id", studioId).maybeSingle(),
    supabase
      .from("clients")
      .select("id, first_name, last_name, phone, reminders_ok, deposit_exempt, created_at")
      .eq("id", clientId)
      .eq("studio_id", studioId)
      .maybeSingle(),
    supabase
      .from("appointments")
      .select(
        "id, starts_at, ends_at, status, reschedule_count, total_cents, appointment_services ( name )",
      )
      .eq("client_id", clientId)
      .eq("studio_id", studioId)
      .order("starts_at", { ascending: false }),
  ]);

  const failed = studioResult.error || clientResult.error || appointmentsResult.error;
  if (failed) {
    console.error("[clientas] detalle:", failed.message);
    throw new Error("No se pudo cargar la clienta.");
  }
  const row = clientResult.data;
  if (!row) return null;

  const timeZone: string = studioResult.data?.timezone ?? "America/Caracas";
  const now = new Date();
  let attended = 0;
  let noShows = 0;
  let upcoming = 0;

  const appointments = ((appointmentsResult.data ?? []) as RawAppointment[]).map(
    (a) => {
      const start = zonedParts(new Date(a.starts_at), timeZone);
      const end = zonedParts(new Date(a.ends_at), timeZone);
      if (a.status === "completed") attended += 1;
      if (a.status === "no_show") noShows += 1;
      if (
        (a.status === "confirmed" || a.status === "pending_deposit") &&
        new Date(a.starts_at) > now
      ) {
        upcoming += 1;
      }
      return {
        id: a.id,
        date: start.date,
        time: start.time,
        endTime: end.time,
        startsAt: a.starts_at,
        status: a.status,
        rescheduled: a.reschedule_count > 0,
        totalCents: a.total_cents,
        services: (a.appointment_services ?? []).map((s) => s.name),
      };
    },
  );

  return {
    timeZone,
    today: zonedParts(now, timeZone).date,
    client: {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      remindersOk: row.reminders_ok,
      depositExempt: row.deposit_exempt,
      sinceMonth: zonedParts(new Date(row.created_at), timeZone).date.slice(0, 7),
    },
    appointments,
    attended,
    noShows,
    upcoming,
  };
}
