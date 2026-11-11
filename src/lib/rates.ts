// Tasas de cambio desde la fuente (datos del Banco Central de Venezuela).
// Euro a bolívares = euro BCV. Euro a USDT = euro BCV / dólar BCV.
// La app nunca llama a la fuente al cargar una página: solo la tarea diaria.

export const RATES_URL = "https://api.cotizave.com/v2/fx/VE/rates";
const MAX_AGE_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Rates = {
  eurToVes: number; // bolívares por 1 €
  eurToUsdt: number; // USDT por 1 €
  sourceUpdatedAt: string; // fecha que reporta la fuente (la más antigua de las dos)
};

export type RatesResult = { ok: true; rates: Rates } | { ok: false; error: string };

type SourceRate = { id?: unknown; mid?: unknown; updated_at?: unknown; available?: unknown };

function pick(rates: SourceRate[], id: string) {
  const rate = rates.find((item) => item?.id === id);
  if (!rate || rate.available === false) return null;
  const mid = typeof rate.mid === "number" ? rate.mid : NaN;
  const updatedAt = typeof rate.updated_at === "string" ? Date.parse(rate.updated_at) : NaN;
  if (!Number.isFinite(mid) || mid <= 0 || Number.isNaN(updatedAt)) return null;
  return { mid, updatedAt };
}

// Valida la respuesta de la fuente. Rechaza datos inválidos o con más de 10 días.
export function parseRates(body: unknown, now: Date): RatesResult {
  const list = (body as { rates?: unknown } | null)?.rates;
  if (!Array.isArray(list)) return { ok: false, error: "Respuesta sin tasas." };

  const euro = pick(list, "ve-euro");
  const dollar = pick(list, "ve-bcv");
  if (!euro || !dollar) return { ok: false, error: "Falta el euro o el dólar del BCV." };

  const oldest = Math.min(euro.updatedAt, dollar.updatedAt);
  if (now.getTime() - oldest > MAX_AGE_DAYS * DAY_MS) {
    return { ok: false, error: `La tasa tiene más de ${MAX_AGE_DAYS} días.` };
  }

  const eurToUsdt = euro.mid / dollar.mid;
  // Un euro siempre ronda el dólar; fuera de este rango, el dato está mal.
  if (eurToUsdt < 0.5 || eurToUsdt > 2) {
    return { ok: false, error: "La relación entre euro y dólar no es creíble." };
  }

  return {
    ok: true,
    rates: {
      eurToVes: Math.round(euro.mid * 1e4) / 1e4,
      eurToUsdt: Math.round(eurToUsdt * 1e6) / 1e6,
      sourceUpdatedAt: new Date(oldest).toISOString(),
    },
  };
}

export async function fetchRates(apiKey: string, now = new Date()): Promise<RatesResult> {
  try {
    const response = await fetch(RATES_URL, { headers: { "X-API-Key": apiKey } });
    if (!response.ok) return { ok: false, error: `La fuente respondió ${response.status}.` };
    return parseRates(await response.json(), now);
  } catch {
    return { ok: false, error: "No se pudo consultar la fuente." };
  }
}
