import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeEarningsHistory,
  shiftMonth,
  type AppointmentStatus,
  type DepositStatus,
  type EarningsAppointment,
  type MonthEarnings,
} from "@/lib/earnings";
import { zonedToUtc } from "@/lib/time";

// Lo que Giselle ve en Ganancias. Se lee con su propia sesión (seguridad por
// filas), una sola consulta para toda la ventana de meses, y se calcula aquí.

// Filas por consulta: el servidor de datos no devuelve más de 1000 a la vez.
const PAGE_SIZE = 1000;

export type EarningsData = {
  selected: MonthEarnings;
  // Los últimos meses que terminan en el elegido, del más nuevo al más viejo.
  history: MonthEarnings[];
};

type RawAppointment = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  total_cents: number;
  appointment_services:
    | { name: string; price_cents: number }[]
    | { name: string; price_cents: number }
    | null;
  deposits:
    | { amount_cents: number; status: DepositStatus }[]
    | { amount_cents: number; status: DepositStatus }
    | null;
};

// Las relaciones embebidas llegan como objeto o como lista según la relación.
function many<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function toEarningsAppointment(row: RawAppointment): EarningsAppointment {
  return {
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    status: row.status,
    totalCents: Number(row.total_cents) || 0,
    services: many(row.appointment_services).map((s) => ({
      name: s.name,
      priceCents: Number(s.price_cents) || 0,
    })),
    deposits: many(row.deposits).map((d) => ({
      amountCents: Number(d.amount_cents) || 0,
      status: d.status,
    })),
  };
}

// Ganancias del mes elegido y de los `months` meses que terminan en él.
// Lanza un error si no se pudo leer la base.
export async function getEarnings(
  supabase: SupabaseClient,
  studioId: string,
  options: { month: string; timeZone: string; now: Date; months?: number },
): Promise<EarningsData> {
  const { month, timeZone, now } = options;
  const months = options.months ?? 6;
  const fromIso = zonedToUtc(
    `${shiftMonth(month, -(months - 1))}-01`,
    "00:00",
    timeZone,
  ).toISOString();
  const toIso = zonedToUtc(`${shiftMonth(month, 1)}-01`, "00:00", timeZone).toISOString();

  const appointments: EarningsAppointment[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("appointments")
      .select(
        `id, starts_at, ends_at, status, total_cents,
         appointment_services ( name, price_cents ),
         deposits ( amount_cents, status )`,
      )
      .eq("studio_id", studioId)
      .gte("starts_at", fromIso)
      .lt("starts_at", toIso)
      // Orden estable para que las páginas no se pisen.
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error("[ganancias] leer citas:", error.message);
      throw new Error("No se pudieron cargar las ganancias.");
    }
    const rows = (data ?? []) as unknown as RawAppointment[];
    for (const row of rows) appointments.push(toEarningsAppointment(row));
    if (rows.length < PAGE_SIZE) break;
  }

  const history = computeEarningsHistory({
    appointments,
    now,
    timeZone,
    month,
    count: months,
  });
  return { selected: history[0], history };
}
