import { describe, expect, it } from "vitest";

import {
  canPickNewSlot,
  canReleaseForSlotChange,
  offersSlotChange,
  type SlotChangeFacts,
} from "./slot-change-rules";

const NOW = new Date("2026-11-12T12:00:00Z");
const HOUR = 3_600_000;

function facts(overrides: Partial<SlotChangeFacts> = {}): SlotChangeFacts {
  return {
    status: "pending_deposit",
    depositCents: 1000,
    depositStatuses: [],
    rejectedAt: null,
    createdAt: new Date(NOW.getTime() - 10 * 60_000),
    now: NOW,
    ...overrides,
  };
}

describe("canReleaseForSlotChange", () => {
  it("permite soltar el horario mientras espera el abono sin comprobante", () => {
    expect(canReleaseForSlotChange(facts())).toBe(true);
  });

  it("no permite soltarlo con un comprobante enviado o aprobado", () => {
    expect(canReleaseForSlotChange(facts({ depositStatuses: ["pending"] }))).toBe(false);
    expect(canReleaseForSlotChange(facts({ depositStatuses: ["approved"] }))).toBe(false);
  });

  it("no lo permite si la cita no pide abono (espera la confirmación de Skadi)", () => {
    expect(canReleaseForSlotChange(facts({ depositCents: 0 }))).toBe(false);
  });

  it("no lo permite en otros estados", () => {
    for (const status of ["confirmed", "released", "completed", "no_show"]) {
      expect(canReleaseForSlotChange(facts({ status }))).toBe(false);
    }
  });

  it("no lo permite si después no podría elegir otro (abono perdido de un cambio tardío)", () => {
    expect(canReleaseForSlotChange(facts({ depositStatuses: ["forfeited"] }))).toBe(false);
    expect(
      canReleaseForSlotChange(facts({ createdAt: new Date(NOW.getTime() - 30 * 24 * HOUR) })),
    ).toBe(false);
  });
});

describe("canPickNewSlot", () => {
  const released = (o: Partial<SlotChangeFacts> = {}) => facts({ status: "released", ...o });

  it("permite elegir otro horario a una cita liberada y reciente", () => {
    expect(canPickNewSlot(released())).toBe(true);
  });

  it("solo con la cita liberada", () => {
    expect(canPickNewSlot(facts())).toBe(false);
    expect(canPickNewSlot(released({ status: "confirmed" }))).toBe(false);
  });

  it("no si tiene cualquier abono registrado", () => {
    for (const s of ["pending", "approved", "rejected", "forfeited"]) {
      expect(canPickNewSlot(released({ depositStatuses: [s] }))).toBe(false);
    }
  });

  it("no si Skadi la rechazó", () => {
    expect(canPickNewSlot(released({ rejectedAt: "2026-11-12T11:00:00Z" }))).toBe(false);
  });

  it("no si la cita no pedía abono", () => {
    expect(canPickNewSlot(released({ depositCents: 0 }))).toBe(false);
  });

  it("solo durante las primeras 24 horas", () => {
    const at = (hours: number) => new Date(NOW.getTime() - hours * HOUR);
    expect(canPickNewSlot(released({ createdAt: at(23.9) }))).toBe(true);
    expect(canPickNewSlot(released({ createdAt: at(24) }))).toBe(false);
  });

  it("descarta una fecha de creación inválida", () => {
    expect(canPickNewSlot(released({ createdAt: new Date("x") }))).toBe(false);
  });
});

describe("offersSlotChange", () => {
  it("se ofrece al esperar el pago y con la cita ya liberada", () => {
    expect(offersSlotChange(facts())).toBe(true);
    expect(offersSlotChange(facts({ status: "released" }))).toBe(true);
  });

  it("no se ofrece con la cita confirmada", () => {
    expect(offersSlotChange(facts({ status: "confirmed" }))).toBe(false);
  });
});
