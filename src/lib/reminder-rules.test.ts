import { describe, expect, it } from "vitest";

import {
  RETOUCH_WINDOW_DAYS,
  daysBetween,
  isAttended,
  isInRetouchWindow,
  retouchDueDate,
  selectRetouchReminders,
  type RetouchCandidate,
} from "./reminder-rules";

const TODAY = "2026-11-11";
const NOW = new Date("2026-11-11T16:00:00Z"); // 12:00 pm en Caracas

function candidate(overrides: Partial<RetouchCandidate> = {}): RetouchCandidate {
  const date = overrides.date ?? "2026-10-21";
  return {
    id: "a1",
    clientId: "c1",
    date,
    startsAt: new Date(`${date}T14:00:00Z`),
    endsAt: new Date(`${date}T16:00:00Z`),
    status: "completed",
    holdExpired: false,
    remindersOk: true,
    reminded: false,
    services: [{ name: "Pestañas clásicas", retouchDays: 21 }],
    ...overrides,
  };
}

describe("daysBetween", () => {
  it("cuenta días de calendario, también entre meses", () => {
    expect(daysBetween("2026-10-21", "2026-11-11")).toBe(21);
    expect(daysBetween("2026-11-11", "2026-11-11")).toBe(0);
    expect(daysBetween("2026-11-12", "2026-11-11")).toBe(-1);
  });
});

describe("retouchDueDate", () => {
  it("suma los días de retoque a la fecha de la cita", () => {
    expect(retouchDueDate("2026-10-21", [21])).toBe("2026-11-11");
  });

  it("con varios servicios usa los días más cortos", () => {
    expect(retouchDueDate("2026-10-21", [30, 15, null, 21])).toBe("2026-11-05");
  });

  it("sin servicios con retoque no hay fecha", () => {
    expect(retouchDueDate("2026-10-21", [null, null])).toBeNull();
    expect(retouchDueDate("2026-10-21", [])).toBeNull();
  });

  it("cruza el fin de año", () => {
    expect(retouchDueDate("2026-12-20", [15])).toBe("2027-01-04");
  });
});

describe("isInRetouchWindow", () => {
  it("vence hoy: se muestra", () => {
    expect(isInRetouchWindow(TODAY, TODAY)).toBe(true);
  });

  it("vence mañana: todavía no", () => {
    expect(isInRetouchWindow("2026-11-12", TODAY)).toBe(false);
  });

  it("venció hace exactamente 30 días: se muestra", () => {
    expect(RETOUCH_WINDOW_DAYS).toBe(30);
    expect(isInRetouchWindow("2026-10-12", TODAY)).toBe(true);
  });

  it("venció hace 31 días: ya no se muestra", () => {
    expect(isInRetouchWindow("2026-10-11", TODAY)).toBe(false);
  });
});

describe("isAttended", () => {
  it("una cita marcada como atendida cuenta", () => {
    expect(isAttended(candidate({ status: "completed" }), NOW)).toBe(true);
  });

  it("una confirmada que ya terminó cuenta, aunque no se marcó", () => {
    expect(isAttended(candidate({ status: "confirmed" }), NOW)).toBe(true);
  });

  it("una confirmada que todavía no termina no cuenta", () => {
    expect(
      isAttended(candidate({ status: "confirmed", endsAt: new Date("2026-11-11T17:00:00Z") }), NOW),
    ).toBe(false);
  });

  it("no asistió o liberada nunca cuentan", () => {
    expect(isAttended(candidate({ status: "no_show" }), NOW)).toBe(false);
    expect(isAttended(candidate({ status: "released" }), NOW)).toBe(false);
  });
});

describe("selectRetouchReminders", () => {
  it("incluye una cita atendida cuyo retoque ya tocó, con servicios y días", () => {
    const [due] = selectRetouchReminders(
      [
        candidate({
          services: [
            { name: "Pestañas clásicas", retouchDays: 21 },
            { name: "Retiro", retouchDays: null },
            { name: "Volumen", retouchDays: 15 },
          ],
        }),
      ],
      TODAY,
      NOW,
    );
    expect(due.dueDate).toBe("2026-11-05");
    expect(due.triggers).toEqual(["Pestañas clásicas", "Volumen"]);
    expect(due.daysAgo).toBe(21);
  });

  it("deja fuera a quien no quiere recordatorios o ya fue recordada", () => {
    expect(selectRetouchReminders([candidate({ remindersOk: false })], TODAY, NOW)).toEqual([]);
    expect(selectRetouchReminders([candidate({ reminded: true })], TODAY, NOW)).toEqual([]);
  });

  it("deja fuera las citas sin asistencia", () => {
    expect(selectRetouchReminders([candidate({ status: "no_show" })], TODAY, NOW)).toEqual([]);
    expect(selectRetouchReminders([candidate({ status: "released" })], TODAY, NOW)).toEqual([]);
  });

  it("deja fuera los retoques que aún no tocan o que vencieron hace más de 30 días", () => {
    expect(selectRetouchReminders([candidate({ date: "2026-10-22" })], TODAY, NOW)).toEqual([]);
    expect(selectRetouchReminders([candidate({ date: "2026-09-20" })], TODAY, NOW)).toEqual([]);
    expect(selectRetouchReminders([candidate({ date: "2026-09-21" })], TODAY, NOW)).toHaveLength(1);
  });

  it("si la clienta ya volvió o ya agendó, no se recuerda", () => {
    const later = (status: RetouchCandidate["status"], holdExpired = false) =>
      candidate({
        id: "a2",
        date: "2026-11-20",
        status,
        holdExpired,
        services: [{ name: "Retiro", retouchDays: null }],
      });
    const base = candidate();
    expect(selectRetouchReminders([base, later("confirmed")], TODAY, NOW)).toEqual([]);
    expect(selectRetouchReminders([base, later("pending_deposit")], TODAY, NOW)).toEqual([]);
    expect(selectRetouchReminders([base, later("completed")], TODAY, NOW)).toEqual([]);
    // Una cita liberada, una falta o una reserva vencida no cuentan.
    expect(selectRetouchReminders([base, later("released")], TODAY, NOW)).toHaveLength(1);
    expect(selectRetouchReminders([base, later("no_show")], TODAY, NOW)).toHaveLength(1);
    expect(
      selectRetouchReminders([base, later("pending_deposit", true)], TODAY, NOW),
    ).toHaveLength(1);
  });

  it("muestra solo la cita más reciente de cada clienta", () => {
    const older = candidate({ id: "a1", date: "2026-10-16" });
    const newer = candidate({ id: "a2", date: "2026-10-18", status: "no_show" });
    const latest = candidate({ id: "a3", date: "2026-10-20" });
    // a1 tiene una cita posterior atendida (a3): queda fuera.
    const result = selectRetouchReminders([older, newer, latest], TODAY, NOW);
    expect(result.map((r) => r.id)).toEqual(["a3"]);
  });

  it("ordena por fecha de retoque, la más antigua primero", () => {
    const result = selectRetouchReminders(
      [
        candidate({ id: "a1", clientId: "c1", date: "2026-10-20" }),
        candidate({ id: "a2", clientId: "c2", date: "2026-10-01" }),
        candidate({
          id: "a3",
          clientId: "c3",
          date: "2026-10-25",
          services: [{ name: "Cejas", retouchDays: 7 }],
        }),
      ],
      TODAY,
      NOW,
    );
    expect(result.map((r) => r.id)).toEqual(["a2", "a3", "a1"]);
  });
});
