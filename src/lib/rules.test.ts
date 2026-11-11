import { describe, expect, it } from "vitest";

import { DEFAULT_RULE_SETTINGS, RULES, buildRules, ruleText } from "./rules";

// Textos exactos de CLAUDE.md ("Normas que ve la clienta").
const EXACT = [
  { title: "Abono", text: "El abono que pagas para agendar no es reembolsable." },
  {
    title: "Reprogramación",
    text: "¿No puedes venir? Cambia tu cita hasta 12 horas antes y no pierdes tu abono. Solo se puede cambiar una vez.",
  },
  {
    title: "Puntualidad",
    text: "Si llegas con más de 10 minutos de retraso, Skadi evaluará si puede atenderte, con un cargo adicional de 8 €.",
  },
  { title: "Acompañantes", text: "No se admiten acompañantes, sin excepción." },
];

describe("buildRules", () => {
  it("con los valores de la app da los cuatro textos exactos", () => {
    expect(buildRules(DEFAULT_RULE_SETTINGS)).toEqual(EXACT);
    expect(RULES).toEqual(EXACT);
  });

  it("antes del € va un espacio fijo; a la vista es el mismo texto", () => {
    expect(ruleText(RULES, "Puntualidad").replace(" ", " ")).toBe(
      "Si llegas con más de 10 minutos de retraso, Skadi evaluará si puede atenderte, con un cargo adicional de 8 €.",
    );
  });

  it("con otros ajustes solo cambian los números", () => {
    const rules = buildRules({ lateFeeCents: 1250, lateToleranceMin: 15, noticeHours: 24 });
    expect(rules.map((r) => r.title)).toEqual(EXACT.map((r) => r.title));
    expect(ruleText(rules, "Abono")).toBe(EXACT[0].text);
    expect(ruleText(rules, "Reprogramación")).toBe(
      "¿No puedes venir? Cambia tu cita hasta 24 horas antes y no pierdes tu abono. Solo se puede cambiar una vez.",
    );
    expect(ruleText(rules, "Puntualidad")).toBe(
      "Si llegas con más de 15 minutos de retraso, Skadi evaluará si puede atenderte, con un cargo adicional de 12,50 €.",
    );
    expect(ruleText(rules, "Acompañantes")).toBe(EXACT[3].text);
  });
});

describe("ruleText", () => {
  it("falla si la norma no existe", () => {
    expect(() => ruleText(RULES, "Otra")).toThrow();
  });
});
