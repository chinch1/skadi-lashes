// Nombres de los días según `working_hours.weekday` (0 = domingo … 6 = sábado).
export const WEEKDAY_NAMES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
] as const;

// Orden en pantalla: de lunes a domingo.
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export type ScheduleRange = { opens_at: string; closes_at: string };
