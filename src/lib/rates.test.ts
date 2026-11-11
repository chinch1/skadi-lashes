import { describe, expect, it } from "vitest";
import { parseRates } from "./rates";

const now = new Date("2026-11-11T22:00:00Z");
const body = (overrides: Record<string, object> = {}) => ({
  rates: [
    { id: "ve-bcv", mid: 900, updated_at: "2026-11-11T04:00:00Z", available: true, ...overrides["ve-bcv"] },
    { id: "ve-euro", mid: 1008, updated_at: "2026-11-11T04:00:00Z", available: true, ...overrides["ve-euro"] },
    { id: "ve-paralelo", mid: 1070, updated_at: "2026-11-11T20:00:00Z", available: true },
  ],
});

describe("parseRates", () => {
  it("calcula euro a bolívares y euro a USDT", () => {
    expect(parseRates(body(), now)).toEqual({
      ok: true,
      rates: { eurToVes: 1008, eurToUsdt: 1.12, sourceUpdatedAt: "2026-11-11T04:00:00.000Z" },
    });
  });

  it("rechaza datos con más de 10 días", () => {
    const old = { updated_at: "2026-10-30T04:00:00Z" };
    expect(parseRates(body({ "ve-euro": old }), now).ok).toBe(false);
  });

  it("acepta datos de 7 días", () => {
    const week = { updated_at: "2026-11-04T22:00:00Z" };
    expect(parseRates(body({ "ve-euro": week, "ve-bcv": week }), now).ok).toBe(true);
  });

  it("rechaza tasas inválidas o no disponibles", () => {
    expect(parseRates(body({ "ve-euro": { mid: 0 } }), now).ok).toBe(false);
    expect(parseRates(body({ "ve-bcv": { mid: "900" } }), now).ok).toBe(false);
    expect(parseRates(body({ "ve-bcv": { available: false } }), now).ok).toBe(false);
    expect(parseRates({}, now).ok).toBe(false);
    expect(parseRates(null, now).ok).toBe(false);
  });

  it("rechaza una relación euro/dólar absurda", () => {
    expect(parseRates(body({ "ve-bcv": { mid: 9 } }), now).ok).toBe(false);
  });
});
