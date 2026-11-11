// Textos de fecha, hora y dinero tal como los lee la clienta.

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// "13:30" -> "1:30 pm"
export function formatTime12(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour < 12 ? "am" : "pm";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

// "2026-11-12" -> "jueves 12 de noviembre"
export function formatLongDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${day} de ${MONTHS[month - 1]}`;
}

// "2026-11" -> "noviembre 2026"
export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${MONTHS[monthNumber - 1]} ${year}`;
}

// 10079.63 -> "Bs. 10.079,63"
export function formatBolivars(amount: number): string {
  const [whole, cents] = amount.toFixed(2).split(".");
  return `Bs. ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}

// 11.18 -> "11,18 USDT"
export function formatUsdt(amount: number): string {
  return `${amount.toFixed(2).replace(".", ",")} USDT`;
}
