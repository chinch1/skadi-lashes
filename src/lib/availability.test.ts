import { describe, expect, it } from "vitest";

import { computeAvailability, type AvailabilityInput } from "./availability";

// Caracas: UTC−4 todo el año. 09:00 local = 13:00Z.
// 2026-11-16 es lunes (weekday 1).
const LUNES = "2026-11-16";

function base(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timeZone: "America/Caracas",
    workingHours: [{ weekday: 1, opens_at: "09:00:00", closes_at: "12:00:00" }],
    blocks: [],
    appointments: [],
    durationMin: 60,
    slotIntervalMin: 30,
    bufferMin: 0,
    minNoticeMin: 0,
    now: new Date("2026-11-01T00:00:00Z"),
    from: LUNES,
    to: LUNES,
    lastBookableDate: "2026-12-31",
    ...overrides,
  };
}

describe("computeAvailability", () => {
  it("genera las horas de un día normal", () => {
    expect(computeAvailability(base())).toEqual({
      [LUNES]: ["09:00", "09:30", "10:00", "10:30", "11:00"],
    });
  });

  it("solo ofrece las horas donde cabe la duración completa", () => {
    const result = computeAvailability(base({ durationMin: 150 }));
    expect(result[LUNES]).toEqual(["09:00", "09:30"]);
  });

  it("no cruza la pausa y alinea el segundo rango con su propia apertura", () => {
    const result = computeAvailability(
      base({
        workingHours: [
          { weekday: 1, opens_at: "09:00", closes_at: "12:00" },
          { weekday: 1, opens_at: "13:15", closes_at: "16:00" },
        ],
        durationMin: 90,
      }),
    );
    expect(result[LUNES]).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "13:15",
      "13:45",
      "14:15",
    ]);
  });

  it("no repite horas cuando los rangos se solapan", () => {
    const result = computeAvailability(
      base({
        workingHours: [
          { weekday: 1, opens_at: "09:00", closes_at: "11:00" },
          { weekday: 1, opens_at: "09:00", closes_at: "11:00" },
          { weekday: 1, opens_at: "10:00", closes_at: "12:00" },
        ],
      }),
    );
    expect(result[LUNES]).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("un bloqueo quita las horas que se cruzan con él", () => {
    const result = computeAvailability(
      base({
        // 10:00–10:30 local
        blocks: [{ starts_at: "2026-11-16T14:00:00Z", ends_at: "2026-11-16T14:30:00Z" }],
      }),
    );
    expect(result[LUNES]).toEqual(["09:00", "10:30", "11:00"]);
  });

  it("una cita existente quita las horas que se cruzan con ella", () => {
    const result = computeAvailability(
      base({
        // 10:00–11:00 local
        appointments: [{ starts_at: "2026-11-16T14:00:00Z", ends_at: "2026-11-16T15:00:00Z" }],
      }),
    );
    expect(result[LUNES]).toEqual(["09:00", "11:00"]);
  });

  it("permite tocar una cita sin descanso y lo rechaza con 15 minutos de descanso", () => {
    // Cita 10:00–11:00 local.
    const appointments = [
      { starts_at: "2026-11-16T14:00:00Z", ends_at: "2026-11-16T15:00:00Z" },
    ];
    const sinDescanso = computeAvailability(base({ appointments, bufferMin: 0 }));
    expect(sinDescanso[LUNES]).toEqual(["09:00", "11:00"]);

    const conDescanso = computeAvailability(base({ appointments, bufferMin: 15 }));
    expect(conDescanso[LUNES]).toEqual([]);
  });

  it("el descanso no aplica a los bloqueos", () => {
    const result = computeAvailability(
      base({
        blocks: [{ starts_at: "2026-11-16T14:00:00Z", ends_at: "2026-11-16T15:00:00Z" }],
        bufferMin: 15,
      }),
    );
    expect(result[LUNES]).toEqual(["09:00", "11:00"]);
  });

  it("respeta la anticipación mínima en el día de hoy", () => {
    const result = computeAvailability(
      base({
        // Ahora: 09:10 local; con 60 min de aviso, la primera hora es 10:10 → 10:30.
        now: new Date("2026-11-16T13:10:00Z"),
        minNoticeMin: 60,
      }),
    );
    expect(result[LUNES]).toEqual(["10:30", "11:00"]);
  });

  it("acepta una hora que empieza justo en now + anticipación", () => {
    const result = computeAvailability(
      base({ now: new Date("2026-11-16T13:00:00Z"), minNoticeMin: 60 }),
    );
    expect(result[LUNES]).toEqual(["10:00", "10:30", "11:00"]);
  });

  it("un día sin horario de trabajo queda vacío", () => {
    // 2026-11-15 es domingo.
    const result = computeAvailability(base({ from: "2026-11-15", to: "2026-11-15" }));
    expect(result).toEqual({ "2026-11-15": [] });
  });

  it("las fechas después de lastBookableDate quedan vacías", () => {
    const result = computeAvailability(
      base({
        workingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          opens_at: "09:00",
          closes_at: "10:00",
        })),
        from: "2026-11-16",
        to: "2026-11-18",
        lastBookableDate: "2026-11-17",
      }),
    );
    expect(result).toEqual({
      "2026-11-16": ["09:00"],
      "2026-11-17": ["09:00"],
      "2026-11-18": [],
    });
  });

  it("recorre varias fechas y cruza el cambio de mes", () => {
    const result = computeAvailability(
      base({
        workingHours: [
          { weekday: 1, opens_at: "09:00", closes_at: "10:00" }, // lunes
          { weekday: 2, opens_at: "14:00", closes_at: "15:30" }, // martes
        ],
        from: "2026-11-29", // domingo
        to: "2026-12-01", // martes
      }),
    );
    expect(Object.keys(result)).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"]);
    expect(result).toEqual({
      "2026-11-29": [],
      "2026-11-30": ["09:00"],
      "2026-12-01": ["14:00", "14:30"],
    });
  });

  it("ubica en el día local un bloqueo que cae en el día universal siguiente", () => {
    // Local lunes 20:00–22:00 = martes 00:00–02:00Z.
    const workingHours = [
      { weekday: 1, opens_at: "19:00", closes_at: "23:00" },
      { weekday: 2, opens_at: "19:00", closes_at: "23:00" },
    ];
    const blocks = [{ starts_at: "2026-11-17T00:00:00Z", ends_at: "2026-11-17T02:00:00Z" }];
    const result = computeAvailability(
      base({ workingHours, blocks, from: "2026-11-16", to: "2026-11-17" }),
    );
    expect(result["2026-11-16"]).toEqual(["19:00", "22:00"]);
    expect(result["2026-11-17"]).toEqual(["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"]);
  });

  it("ubica en el día local una cita que cae en el día universal siguiente", () => {
    const workingHours = [{ weekday: 1, opens_at: "19:00", closes_at: "23:00" }];
    const appointments = [
      { starts_at: "2026-11-17T00:00:00Z", ends_at: "2026-11-17T02:00:00Z" },
    ];
    const result = computeAvailability(base({ workingHours, appointments }));
    expect(result[LUNES]).toEqual(["19:00", "22:00"]);
  });

  it("con duración o intervalo inválidos todas las fechas quedan vacías", () => {
    const rango = { from: "2026-11-16", to: "2026-11-17" };
    const vacio = { "2026-11-16": [], "2026-11-17": [] };
    expect(computeAvailability(base({ ...rango, durationMin: 0 }))).toEqual(vacio);
    expect(computeAvailability(base({ ...rango, durationMin: -30 }))).toEqual(vacio);
    expect(computeAvailability(base({ ...rango, slotIntervalMin: 0 }))).toEqual(vacio);
  });
});
