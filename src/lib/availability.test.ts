import { describe, expect, it } from "vitest";

import { computeAvailability, type AvailabilityInput, type DaySlot } from "./availability";

// Caracas: UTC−4 todo el año. 09:00 local = 13:00Z.
const DIA = "2026-11-16";

function slots(day: string, ...times: string[]): DaySlot[] {
  return times.map((start_time) => ({ day, start_time }));
}

function base(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timeZone: "America/Caracas",
    slots: slots(DIA, "09:00", "11:00", "14:00"),
    appointments: [],
    durationMin: 60,
    bufferMin: 0,
    minNoticeMin: 0,
    now: new Date("2026-11-01T00:00:00Z"),
    from: DIA,
    to: DIA,
    lastBookableDate: "2026-12-31",
    ...overrides,
  };
}

// Cita en hora local de Caracas (UTC−4), como instantes ISO.
function cita(day: string, start: string, end: string) {
  return {
    starts_at: new Date(`${day}T${start}:00-04:00`).toISOString(),
    ends_at: new Date(`${day}T${end}:00-04:00`).toISOString(),
  };
}

describe("computeAvailability", () => {
  it("ofrece exactamente las horas marcadas de un día", () => {
    expect(computeAvailability(base())).toEqual({ [DIA]: ["09:00", "11:00", "14:00"] });
  });

  it("deja vacías las fechas sin horas marcadas, pero las incluye", () => {
    const result = computeAvailability(base({ from: "2026-11-15", to: "2026-11-17" }));
    expect(result).toEqual({
      "2026-11-15": [],
      [DIA]: ["09:00", "11:00", "14:00"],
      "2026-11-17": [],
    });
  });

  it("quita las horas repetidas y las ordena", () => {
    const result = computeAvailability(
      base({ slots: slots(DIA, "14:00", "09:00", "11:00", "09:00", "09:00:00") }),
    );
    expect(result[DIA]).toEqual(["09:00", "11:00", "14:00"]);
  });

  it("acepta horas con segundos", () => {
    const result = computeAvailability(base({ slots: slots(DIA, "09:30:00", "16:45:00") }));
    expect(result[DIA]).toEqual(["09:30", "16:45"]);
  });

  it("no tiene hora de cierre: una cita puede terminar tarde", () => {
    const result = computeAvailability(
      base({ slots: slots(DIA, "20:00"), durationMin: 180 }),
    );
    expect(result[DIA]).toEqual(["20:00"]);
  });

  it("no ofrece horas que se cruzan con una cita", () => {
    const result = computeAvailability(
      base({ appointments: [cita(DIA, "10:30", "11:30")] }),
    );
    // 09:00–10:00 libre; 11:00–12:00 se cruza; 14:00 libre.
    expect(result[DIA]).toEqual(["09:00", "14:00"]);
  });

  it("permite tocar una cita sin descanso, pero no con descanso de 15 minutos", () => {
    const appointments = [cita(DIA, "10:00", "11:00")];
    // 09:00–10:00 termina justo cuando empieza la cita; 11:00 empieza justo cuando termina.
    expect(computeAvailability(base({ appointments, bufferMin: 0 }))[DIA]).toEqual([
      "09:00",
      "11:00",
      "14:00",
    ]);
    expect(computeAvailability(base({ appointments, bufferMin: 15 }))[DIA]).toEqual([
      "14:00",
    ]);
  });

  it("antes de reservar, una hora ofrecida no bloquea a otra", () => {
    const result = computeAvailability(
      base({ slots: slots(DIA, "09:00", "11:00"), durationMin: 180 }),
    );
    expect(result[DIA]).toEqual(["09:00", "11:00"]);
  });

  it("una cita larga consume las horas siguientes que se cruzan", () => {
    const result = computeAvailability(
      base({
        slots: slots(DIA, "09:00", "11:00"),
        durationMin: 180,
        appointments: [cita(DIA, "09:00", "12:00")],
      }),
    );
    expect(result[DIA]).toEqual([]);

    // También para un servicio corto: 11:00 cae dentro de la cita de 09:00 a 12:00.
    const corto = computeAvailability(
      base({
        slots: slots(DIA, "09:00", "11:00", "12:00"),
        durationMin: 60,
        appointments: [cita(DIA, "09:00", "12:00")],
      }),
    );
    expect(corto[DIA]).toEqual(["12:00"]);
  });

  it("respeta el aviso mínimo el mismo día", () => {
    // Ahora: 10:15 local (14:15Z). Aviso mínimo: 60 minutos -> desde las 11:15.
    const result = computeAvailability(
      base({
        slots: slots(DIA, "09:00", "11:00", "11:15", "14:00"),
        now: new Date("2026-11-16T14:15:00Z"),
        minNoticeMin: 60,
      }),
    );
    expect(result[DIA]).toEqual(["11:15", "14:00"]);
  });

  it("no ofrece horas después de la última fecha reservable", () => {
    const result = computeAvailability(
      base({
        slots: [...slots(DIA, "09:00"), ...slots("2026-11-17", "09:00")],
        to: "2026-11-17",
        lastBookableDate: DIA,
      }),
    );
    expect(result).toEqual({ [DIA]: ["09:00"], "2026-11-17": [] });
  });

  it("recorre un rango que cruza de un mes a otro", () => {
    const result = computeAvailability(
      base({
        slots: [...slots("2026-11-30", "10:00"), ...slots("2026-12-01", "15:00")],
        from: "2026-11-29",
        to: "2026-12-02",
      }),
    );
    expect(result).toEqual({
      "2026-11-29": [],
      "2026-11-30": ["10:00"],
      "2026-12-01": ["15:00"],
      "2026-12-02": [],
    });
  });

  it("usa la zona del estudio: una cita guardada el día universal siguiente bloquea la hora local correcta", () => {
    // 21:00 del 16 en Caracas = 01:00Z del 17.
    const result = computeAvailability(
      base({
        slots: [...slots(DIA, "21:00"), ...slots("2026-11-17", "01:00", "21:00")],
        appointments: [
          { starts_at: "2026-11-17T01:00:00Z", ends_at: "2026-11-17T02:00:00Z" },
        ],
        to: "2026-11-17",
      }),
    );
    expect(result).toEqual({ [DIA]: [], "2026-11-17": ["01:00", "21:00"] });
  });

  it("con una duración no válida no ofrece nada", () => {
    for (const durationMin of [0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(computeAvailability(base({ durationMin }))).toEqual({ [DIA]: [] });
    }
  });

  it("ignora las horas mal formadas", () => {
    const result = computeAvailability(
      base({
        slots: [
          { day: DIA, start_time: "10:00" },
          { day: DIA, start_time: "25:00" },
          { day: DIA, start_time: "9:00" },
          { day: DIA, start_time: "abc" },
          { day: "2026-13-01", start_time: "10:00" },
          { day: "16/11/2026", start_time: "11:00" },
          { day: DIA, start_time: null as unknown as string },
          null as unknown as DaySlot,
        ],
      }),
    );
    expect(result[DIA]).toEqual(["10:00"]);
  });

  it("tiene un tope de días por seguridad", () => {
    const result = computeAvailability(base({ from: "2026-01-01", to: "2030-12-31" }));
    expect(Object.keys(result)).toHaveLength(400);
  });
});
