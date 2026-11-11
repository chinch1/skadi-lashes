// Cálculo de cupos: qué horas de inicio se pueden ofrecer cada día.
// Es una función pura: no consulta la base de datos ni el reloj (`now` llega como dato).
//
// Skadi marca a mano, día por día, las horas exactas en que puede empezar una
// cita (`day_slots`). Solo esas horas se pueden ofrecer. No hay hora de cierre:
// una cita puede terminar a cualquier hora.

import { addDays, minutesToTime, timeToMinutes, zonedToUtc } from "./time";

export type DaySlot = { day: string; start_time: string }; // day "AAAA-MM-DD" y start_time "HH:MM" o "HH:MM:SS", hora local del estudio
export type TimeRange = { starts_at: string; ends_at: string }; // instantes ISO (hora universal)

export type AvailabilityInput = {
  timeZone: string; // p. ej. "America/Caracas"
  slots: DaySlot[]; // horas de inicio que ofrece Skadi; solo estas se pueden devolver
  appointments: TimeRange[]; // solo citas activas (quien llama ya filtró)
  durationMin: number; // duración total de la cita que se quiere agendar
  bufferMin: number; // descanso entre clientas
  minNoticeMin: number; // la hora debe empezar en o después de now + minNoticeMin
  now: Date;
  from: string; // primera fecha local, "AAAA-MM-DD", incluida
  to: string; // última fecha local, incluida
  lastBookableDate: string; // fecha local; después de ella no hay cupos
};

const MINUTE_MS = 60_000;
// Tope de seguridad para no recorrer rangos absurdos por error.
const MAX_DAYS = 400;

const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

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

// Agrupa las horas ofrecidas por fecha, en minutos locales desde la medianoche.
// Las filas con fecha u hora mal formadas se ignoran; las repetidas cuentan una vez.
function groupSlots(slots: DaySlot[]): Map<string, Set<number>> {
  const byDay = new Map<string, Set<number>>();
  for (const slot of slots ?? []) {
    if (!slot || typeof slot.day !== "string" || typeof slot.start_time !== "string") continue;
    if (!DAY_RE.test(slot.day) || !TIME_RE.test(slot.start_time)) continue;
    const minutes = timeToMinutes(slot.start_time);
    let set = byDay.get(slot.day);
    if (!set) {
      set = new Set<number>();
      byDay.set(slot.day, set);
    }
    set.add(minutes);
  }
  return byDay;
}

// Devuelve cada fecha de `from` a `to` como clave, con su lista ordenada de
// horas locales de inicio "HH:MM" (lista vacía = día sin cupo).
// Solo las citas reales ocupan horario: una hora ofrecida no bloquea a otra.
export function computeAvailability(input: AvailabilityInput): Record<string, string[]> {
  const { timeZone, durationMin, bufferMin, minNoticeMin, now, from, to, lastBookableDate } =
    input;

  const result: Record<string, string[]> = {};
  const valid = Number.isFinite(durationMin) && durationMin > 0;

  const slotsByDay = groupSlots(input.slots);
  // Las citas se ensanchan con el descanso por ambos lados.
  const appointments = toIntervals(input.appointments, Math.max(0, bufferMin) * MINUTE_MS);
  const earliest = now.getTime() + minNoticeMin * MINUTE_MS;
  const durationMs = durationMin * MINUTE_MS;

  // Las fechas "AAAA-MM-DD" se comparan bien como texto.
  for (let date = from, count = 0; date <= to && count < MAX_DAYS; date = addDays(date, 1), count++) {
    const candidates = slotsByDay.get(date);
    if (!valid || date > lastBookableDate || !candidates) {
      result[date] = [];
      continue;
    }

    result[date] = [...candidates]
      .sort((a, b) => a - b)
      .filter((minute) => {
        const start = zonedToUtc(date, minutesToTime(minute), timeZone).getTime();
        if (start < earliest) return false;
        return !overlaps(start, start + durationMs, appointments);
      })
      .map(minutesToTime);
  }

  return result;
}
