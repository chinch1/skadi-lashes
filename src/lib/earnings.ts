// Ganancias por mes. Funciones puras: "ahora" y la zona horaria los decide
// quien llama (la hora del servidor, en la zona del estudio).
// Montos en céntimos, tal como están guardados; en pantalla se leen como dólares.
// Mes "AAAA-MM", del calendario local del estudio. Cada cita cuenta en el mes
// de su fecha de inicio, en la hora local del estudio.

import { isAttended, type ReminderStatus } from "./reminder-rules";
import { zonedParts } from "./time";

export type AppointmentStatus = ReminderStatus;

export type DepositStatus = "pending" | "approved" | "rejected" | "forfeited";

export type EarningsAppointment = {
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  totalCents: number;
  services: { name: string; priceCents: number }[];
  deposits: { amountCents: number; status: DepositStatus }[];
};

export type ServiceEarnings = {
  name: string;
  count: number; // veces vendido
  cents: number;
};

export type MonthEarnings = {
  month: string;
  attended: { count: number; cents: number };
  forfeited: { count: number; cents: number }; // abonos perdidos
  totalCents: number; // atendidas + abonos perdidos
  upcoming: { count: number; cents: number }; // confirmadas que aún no terminan
  noShows: number;
  byService: ServiceEarnings[];
};

// "2026-11" + 1 -> "2026-12"
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
    .toISOString()
    .slice(0, 7);
}

// Mes local del estudio en que empieza la cita.
export function monthOf(instant: Date, timeZone: string): string {
  return zonedParts(instant, timeZone).date.slice(0, 7);
}

export function computeMonthEarnings(input: {
  appointments: EarningsAppointment[];
  now: Date;
  timeZone: string;
  month: string;
}): MonthEarnings {
  const { now, timeZone, month } = input;
  const result: MonthEarnings = {
    month,
    attended: { count: 0, cents: 0 },
    forfeited: { count: 0, cents: 0 },
    totalCents: 0,
    upcoming: { count: 0, cents: 0 },
    noShows: 0,
    byService: [],
  };
  const services = new Map<string, ServiceEarnings>();

  for (const a of input.appointments) {
    if (monthOf(a.startsAt, timeZone) !== month) continue;

    // Abonos que no se devolvieron: dinero que entró sin servicio.
    for (const d of a.deposits) {
      if (d.status !== "forfeited") continue;
      result.forfeited.count += 1;
      result.forfeited.cents += d.amountCents;
    }

    if (a.status === "no_show") result.noShows += 1;

    if (isAttended(a, now)) {
      result.attended.count += 1;
      result.attended.cents += a.totalCents;
      for (const s of a.services) {
        const current = services.get(s.name) ?? { name: s.name, count: 0, cents: 0 };
        current.count += 1;
        current.cents += s.priceCents;
        services.set(s.name, current);
      }
    } else if (a.status === "confirmed") {
      // Confirmada y todavía no termina: aún no se ganó.
      result.upcoming.count += 1;
      result.upcoming.cents += a.totalCents;
    }
  }

  result.totalCents = result.attended.cents + result.forfeited.cents;
  result.byService = [...services.values()].sort(
    (x, y) => y.cents - x.cents || y.count - x.count || x.name.localeCompare(y.name, "es"),
  );
  return result;
}

// Totales de los `count` meses que terminan en `month`, del más nuevo al más viejo.
export function computeEarningsHistory(input: {
  appointments: EarningsAppointment[];
  now: Date;
  timeZone: string;
  month: string;
  count?: number;
}): MonthEarnings[] {
  const count = input.count ?? 6;
  return Array.from({ length: count }, (_, i) =>
    computeMonthEarnings({ ...input, month: shiftMonth(input.month, -i) }),
  );
}
