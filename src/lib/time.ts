// Fechas y horas del estudio.
// En la base de datos todo es hora universal (timestamptz). Aquí se convierte
// entre esa hora y la hora local del estudio (por ahora, America/Caracas).
// Formatos: fecha "AAAA-MM-DD", hora "HH:MM" (se acepta "HH:MM:SS"), mes "AAAA-MM".

function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

// Hora local del estudio -> instante universal.
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  // Dos pasadas, por si la zona cambia de desfase cerca de esa hora.
  const first = guess - offsetMs(new Date(guess), timeZone);
  return new Date(guess - offsetMs(new Date(first), timeZone));
}

// Instante universal -> fecha, hora y día de la semana locales (0 = domingo).
export function zonedParts(
  instant: Date,
  timeZone: string,
): { date: string; time: string; weekday: number } {
  const local = new Date(instant.getTime() + offsetMs(instant, timeZone));
  const iso = local.toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    weekday: local.getUTCDay(),
  };
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

// 0 = domingo … 6 = sábado, igual que `working_hours.weekday`.
export function weekdayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// Todas las fechas de un mes "AAAA-MM".
export function monthDates(month: string): string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from(
    { length: count },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
  );
}

// "09:00" o "09:00:00" -> minutos desde la medianoche.
export function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(minutes: number): string {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}
