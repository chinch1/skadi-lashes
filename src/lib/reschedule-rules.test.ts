import { describe, expect, it } from "vitest";

import { rescheduleMode } from "./reschedule-rules";

const NOW = new Date("2026-11-11T12:00:00Z");
const HOUR = 3_600_000;

function input(overrides: Partial<Parameters<typeof rescheduleMode>[0]> = {}) {
  return {
    status: "confirmed",
    startsAt: new Date(NOW.getTime() + 48 * HOUR),
    now: NOW,
    rescheduleCount: 0,
    maxReschedules: 1,
    noticeHours: 12,
    depositExempt: false,
    ...overrides,
  };
}

describe("rescheduleMode", () => {
  it("permite cambiar a tiempo con más de 12 horas de anticipación", () => {
    expect(rescheduleMode(input())).toBe("on_time");
  });

  it("exactamente 12 horas antes todavía cuenta como a tiempo", () => {
    expect(
      rescheduleMode(input({ startsAt: new Date(NOW.getTime() + 12 * HOUR) })),
    ).toBe("on_time");
  });

  it("un minuto menos de 12 horas ya es fuera del plazo", () => {
    expect(
      rescheduleMode(input({ startsAt: new Date(NOW.getTime() + 12 * HOUR - 60_000) })),
    ).toBe("late");
  });

  it("usa las horas de aviso del estudio", () => {
    const startsAt = new Date(NOW.getTime() + 20 * HOUR);
    expect(rescheduleMode(input({ startsAt, noticeHours: 24 }))).toBe("late");
    expect(rescheduleMode(input({ startsAt, noticeHours: 12 }))).toBe("on_time");
  });

  it("a la clienta de confianza no le aplica el plazo", () => {
    expect(
      rescheduleMode(
        input({ depositExempt: true, startsAt: new Date(NOW.getTime() + HOUR) }),
      ),
    ).toBe("on_time");
  });

  it("una cita ya cambiada no se puede cambiar otra vez", () => {
    expect(rescheduleMode(input({ rescheduleCount: 1 }))).toBe("already_changed");
    expect(
      rescheduleMode(input({ rescheduleCount: 1, depositExempt: true })),
    ).toBe("already_changed");
  });

  it("respeta el máximo de cambios del estudio", () => {
    expect(rescheduleMode(input({ rescheduleCount: 1, maxReschedules: 2 }))).toBe("on_time");
    expect(rescheduleMode(input({ maxReschedules: 0 }))).toBe("already_changed");
  });

  it("no está disponible si la cita no está confirmada", () => {
    for (const status of ["pending_deposit", "completed", "no_show", "released"]) {
      expect(rescheduleMode(input({ status })), status).toBe("not_available");
    }
  });

  it("no está disponible si la cita ya empezó o ya pasó", () => {
    expect(rescheduleMode(input({ startsAt: NOW }))).toBe("not_available");
    expect(
      rescheduleMode(input({ startsAt: new Date(NOW.getTime() - HOUR) })),
    ).toBe("not_available");
    expect(
      rescheduleMode(input({ startsAt: NOW, depositExempt: true })),
    ).toBe("not_available");
  });

  it("revisa primero el estado y después el número de cambios", () => {
    expect(
      rescheduleMode(input({ status: "released", rescheduleCount: 1 })),
    ).toBe("not_available");
  });
});
