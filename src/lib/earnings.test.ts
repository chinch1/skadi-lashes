import { describe, expect, it } from "vitest";

import {
  computeEarningsHistory,
  computeMonthEarnings,
  shiftMonth,
  type EarningsAppointment,
} from "./earnings";
import { formatDollars } from "./money";

const TZ = "America/Caracas"; // UTC-4, sin horario de verano
const NOW = new Date("2026-11-12T16:00:00Z"); // 12:00 pm del 12 nov en Caracas

function appt(overrides: Partial<EarningsAppointment> = {}): EarningsAppointment {
  const startsAt = overrides.startsAt ?? new Date("2026-11-05T14:00:00Z");
  return {
    startsAt,
    endsAt: overrides.endsAt ?? new Date(startsAt.getTime() + 2 * 3_600_000),
    status: "completed",
    totalCents: 4500,
    services: [{ name: "Clásicas", priceCents: 4500 }],
    deposits: [{ amountCents: 1000, status: "approved" }],
    ...overrides,
  };
}

function month(appointments: EarningsAppointment[], m = "2026-11") {
  return computeMonthEarnings({ appointments, now: NOW, timeZone: TZ, month: m });
}

describe("formatDollars", () => {
  it("lee los céntimos como dólares, sin conversión", () => {
    expect(formatDollars(0)).toBe("$0");
    expect(formatDollars(4500)).toBe("$45");
    expect(formatDollars(4550)).toBe("$45,50");
    expect(formatDollars(125000)).toBe("$1.250");
    expect(formatDollars(1234567)).toBe("$12.345,67");
  });
});

describe("shiftMonth", () => {
  it("cruza el cambio de año en las dos direcciones", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", -24)).toBe("2024-11");
  });
});

describe("computeMonthEarnings", () => {
  it("un mes vacío da todo en cero", () => {
    expect(month([])).toEqual({
      month: "2026-11",
      attended: { count: 0, cents: 0 },
      forfeited: { count: 0, cents: 0 },
      totalCents: 0,
      upcoming: { count: 0, cents: 0 },
      noShows: 0,
      byService: [],
    });
  });

  it("cuenta las citas marcadas como atendidas por su total", () => {
    const result = month([appt(), appt({ totalCents: 6000 })]);
    expect(result.attended).toEqual({ count: 2, cents: 10500 });
    expect(result.totalCents).toBe(10500);
  });

  it("una confirmada que ya terminó cuenta como atendida", () => {
    const result = month([appt({ status: "confirmed" })]);
    expect(result.attended).toEqual({ count: 1, cents: 4500 });
    expect(result.upcoming).toEqual({ count: 0, cents: 0 });
  });

  it("una confirmada que aún no termina va a 'por venir' y no suma al total", () => {
    const result = month([
      appt({ status: "confirmed", startsAt: new Date("2026-11-20T14:00:00Z") }),
    ]);
    expect(result.attended.count).toBe(0);
    expect(result.upcoming).toEqual({ count: 1, cents: 4500 });
    expect(result.totalCents).toBe(0);
  });

  it("una confirmada en curso (empezó pero no terminó) todavía es 'por venir'", () => {
    const result = month([
      appt({
        status: "confirmed",
        startsAt: new Date("2026-11-12T15:00:00Z"),
        endsAt: new Date("2026-11-12T17:00:00Z"),
      }),
    ]);
    expect(result.upcoming.count).toBe(1);
    expect(result.attended.count).toBe(0);
  });

  it("una falta suma solo su abono perdido, no el total de la cita", () => {
    const result = month([
      appt({
        status: "no_show",
        deposits: [{ amountCents: 1000, status: "forfeited" }],
      }),
    ]);
    expect(result.noShows).toBe(1);
    expect(result.attended).toEqual({ count: 0, cents: 0 });
    expect(result.forfeited).toEqual({ count: 1, cents: 1000 });
    expect(result.totalCents).toBe(1000);
  });

  it("un horario liberado tarde suma su abono perdido", () => {
    const result = month([
      appt({
        status: "released",
        deposits: [{ amountCents: 1000, status: "forfeited" }],
      }),
    ]);
    expect(result.forfeited).toEqual({ count: 1, cents: 1000 });
    expect(result.noShows).toBe(0);
    expect(result.totalCents).toBe(1000);
  });

  it("no cuenta abonos aprobados, pendientes ni rechazados de citas no atendidas", () => {
    const result = month([
      appt({ status: "released", deposits: [{ amountCents: 1000, status: "rejected" }] }),
      appt({
        status: "pending_deposit",
        deposits: [{ amountCents: 1000, status: "pending" }],
      }),
      appt({ status: "released", deposits: [{ amountCents: 1000, status: "approved" }] }),
    ]);
    expect(result.totalCents).toBe(0);
    expect(result.forfeited.count).toBe(0);
  });

  it("cambio tardío atendido: suma el total y también el abono anterior perdido", () => {
    const result = month([
      appt({
        deposits: [
          { amountCents: 1000, status: "forfeited" },
          { amountCents: 1000, status: "approved" },
        ],
      }),
    ]);
    expect(result.attended.cents).toBe(4500);
    expect(result.forfeited).toEqual({ count: 1, cents: 1000 });
    expect(result.totalCents).toBe(5500);
  });

  it("una falta no aparece en 'por venir' aunque su hora no haya pasado", () => {
    const result = month([
      appt({ status: "no_show", startsAt: new Date("2026-11-20T14:00:00Z") }),
    ]);
    expect(result.upcoming.count).toBe(0);
    expect(result.noShows).toBe(1);
  });

  it("una cita a las 11:30 pm del último día cuenta en ese mes, aunque en UTC ya sea el siguiente", () => {
    // 30 nov 23:30 en Caracas = 1 dic 03:30 UTC.
    const late = appt({ startsAt: new Date("2026-12-01T03:30:00Z") });
    expect(month([late], "2026-11").attended.count).toBe(1);
    expect(month([late], "2026-12").attended.count).toBe(0);
  });

  it("una cita a las 12:30 am del primer día no cuenta en el mes anterior", () => {
    // 1 nov 00:30 en Caracas = 1 nov 04:30 UTC; 31 oct 23:30 = 1 nov 03:30 UTC.
    const first = appt({ startsAt: new Date("2026-11-01T04:30:00Z") });
    const lastOct = appt({ startsAt: new Date("2026-11-01T03:30:00Z") });
    expect(month([first, lastOct], "2026-11").attended.count).toBe(1);
    expect(month([first, lastOct], "2026-10").attended.count).toBe(1);
  });

  it("agrupa por nombre de servicio y ordena del monto mayor al menor", () => {
    const result = month([
      appt({
        totalCents: 6500,
        services: [
          { name: "Clásicas", priceCents: 4500 },
          { name: "Lifting", priceCents: 2000 },
        ],
      }),
      appt({ services: [{ name: "Clásicas", priceCents: 4500 }] }),
      appt({
        totalCents: 7000,
        services: [{ name: "Volumen", priceCents: 7000 }],
      }),
      // No atendida: no entra en la lista por servicio.
      appt({
        status: "no_show",
        services: [{ name: "Lifting", priceCents: 2000 }],
      }),
    ]);
    expect(result.byService).toEqual([
      { name: "Clásicas", count: 2, cents: 9000 },
      { name: "Volumen", count: 1, cents: 7000 },
      { name: "Lifting", count: 1, cents: 2000 },
    ]);
  });
});

describe("computeEarningsHistory", () => {
  it("da los últimos 6 meses del más nuevo al más viejo, incluso vacíos", () => {
    const history = computeEarningsHistory({
      appointments: [
        appt(),
        appt({ startsAt: new Date("2026-08-10T14:00:00Z"), totalCents: 3000 }),
        // Fuera de la ventana.
        appt({ startsAt: new Date("2026-04-10T14:00:00Z") }),
      ],
      now: NOW,
      timeZone: TZ,
      month: "2026-11",
    });
    expect(history.map((h) => h.month)).toEqual([
      "2026-11",
      "2026-10",
      "2026-09",
      "2026-08",
      "2026-07",
      "2026-06",
    ]);
    expect(history.map((h) => h.totalCents)).toEqual([4500, 0, 0, 3000, 0, 0]);
  });
});
