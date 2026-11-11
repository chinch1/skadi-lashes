// Cálculo de cupos: qué horas de inicio se pueden ofrecer cada día.
// Es una función pura: no consulta la base de datos ni el reloj (`now` llega como dato).

import {
  addDays,
  minutesToTime,
  timeToMinutes,
  weekdayOf,
  zonedToUtc,
} from "./time";

export type WorkingHours = { weekday: number; opens_at: string; closes_at: string }; // weekday 0 = domingo … 6 = sábado; horas "HH:MM:SS" o "HH:MM", hora local del estudio
export type TimeRange = { starts_at: string; ends_at: string }; // instantes ISO (hora universal)

export type AvailabilityInput = {
  timeZone: string; // p. ej. "America/Caracas"
  workingHours: WorkingHours[]; // varias filas de un mismo día = rangos separados (con pausa)
  blocks: TimeRange[]; // time_blocks: Giselle no está disponible
  appointments: TimeRange[]; // solo citas activas (quien llama ya filtró)
  durationMin: number; // duración total de la cita que se quiere agendar
  slotIntervalMin: number; // p. ej. 30
  bufferMin: number; // descanso entre clientas (aplica a citas, no a bloqueos)
  minNoticeMin: number; // la hora debe empezar en o después de now + minNoticeMin
  now: Date;
  from: string; // primera fecha local, "AAAA-MM-DD", incluida
  to: string; // última fecha local, incluida
  lastBookableDate: string; // fecha local; después de ella no hay cupos
};

const MINUTE_MS = 60_000;
// Tope de seguridad para no recorrer rangos absurdos por error.
const MAX_DAYS = 400;

type Interval = { start: number; end: number }; // milisegundos universales, [start, end)

function toIntervals(ranges: TimeRange[], padMs = 0): Interval[] {
  return ranges
    .map((range) => ({
      start: new Date(range.starts_at).getTime() - padMs,
      end: new Date(range.ends_at).getTime() + padMs,
    }))
    .filter((interval) => !Number.isNaN(interval.start) && !Number.isNaN(interval.end));
}

function overlaps(start: number, end: number, intervals: Interval[]): boolean {
  return intervals.some((interval) => start < interval.end && end > interval.start);
}

// Devuelve cada fecha de `from` a `to` como clave, con su lista ordenada de
// horas locales de inicio "HH:MM" (lista vacía = día sin cupo).
export function computeAvailability(input: AvailabilityInput): Record<string, string[]> {
  const {
    timeZone,
    workingHours,
    durationMin,
    slotIntervalMin,
    bufferMin,
    minNoticeMin,
    now,
    from,
    to,
    lastBookableDate,
  } = input;

  const result: Record<string, string[]> = {};
  const valid =
    Number.isFinite(durationMin) &&
    durationMin > 0 &&
    Number.isFinite(slotIntervalMin) &&
    slotIntervalMin > 0;

  const blocks = toIntervals(input.blocks);
  // Las citas se ensanchan con el descanso por ambos lados.
  const appointments = toIntervals(input.appointments, Math.max(0, bufferMin) * MINUTE_MS);
  const earliest = now.getTime() + minNoticeMin * MINUTE_MS;
  const durationMs = durationMin * MINUTE_MS;

  // Las fechas "AAAA-MM-DD" se comparan bien como texto.
  for (let date = from, count = 0; date <= to && count < MAX_DAYS; date = addDays(date, 1), count++) {
    if (!valid || date > lastBookableDate) {
      result[date] = [];
      continue;
    }

    const weekday = weekdayOf(date);
    const starts = new Set<number>(); // minutos locales desde la medianoche

    for (const range of workingHours) {
      if (range.weekday !== weekday) continue;
      const opens = timeToMinutes(range.opens_at);
      const closes = timeToMinutes(range.closes_at);

      // Las horas se alinean con la apertura de este rango, y la cita
      // completa debe caber dentro del mismo rango (nunca cruza la pausa).
      for (let minute = opens; minute + durationMin <= closes; minute += slotIntervalMin) {
        if (starts.has(minute)) continue;
        const start = zonedToUtc(date, minutesToTime(minute), timeZone).getTime();
        const end = start + durationMs;
        if (start < earliest) continue;
        if (overlaps(start, end, blocks)) continue;
        if (overlaps(start, end, appointments)) continue;
        starts.add(minute);
      }
    }

    result[date] = [...starts].sort((a, b) => a - b).map(minutesToTime);
  }

  return result;
}
