import { formatEuros } from "./money";

// Normas que ve la clienta. El texto es exacto: no cambiarlo sin confirmar con Giselle.
// Solo los números (horas, minutos y cargo) salen de los ajustes del estudio.

export type RuleSettings = {
  lateFeeCents: number;
  lateToleranceMin: number;
  noticeHours: number;
};

// Valores de la app, iguales a los de la base de datos al crear el estudio.
export const DEFAULT_RULE_SETTINGS: RuleSettings = {
  lateFeeCents: 800,
  lateToleranceMin: 10,
  noticeHours: 12,
};

export type Rule = { title: string; text: string };

export function buildRules(settings: RuleSettings): readonly Rule[] {
  const { lateFeeCents, lateToleranceMin, noticeHours } = settings;
  return [
    {
      title: "Abono",
      text: "El abono que pagas para agendar no es reembolsable.",
    },
    {
      title: "Reprogramación",
      text: `¿No puedes venir? Cambia tu cita hasta ${noticeHours} horas antes y no pierdes tu abono. Solo se puede cambiar una vez.`,
    },
    {
      title: "Puntualidad",
      // formatEuros usa un espacio fijo: "8 €" nunca se parte en dos líneas.
      text: `Si llegas con más de ${lateToleranceMin} minutos de retraso, Skadi evaluará si puede atenderte, con un cargo adicional de ${formatEuros(lateFeeCents)}.`,
    },
    {
      title: "Acompañantes",
      text: "No se admiten acompañantes, sin excepción.",
    },
  ];
}

// Normas con los valores de la app. Sirve donde no hay números (Abono,
// Acompañantes); las pantallas con números usan buildRules(await getRuleSettings()).
export const RULES = buildRules(DEFAULT_RULE_SETTINGS);

// Texto de una norma por su título.
export function ruleText(rules: readonly Rule[], title: string): string {
  const rule = rules.find((r) => r.title === title);
  if (!rule) throw new Error(`Falta la norma "${title}".`);
  return rule.text;
}
