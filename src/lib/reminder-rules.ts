// Reglas de los recordatorios de retoque. Funciones puras: "hoy" y "ahora"
// los decide quien llama (siempre la hora del servidor, en la zona del estudio).
// Fechas como "AAAA-MM-DD", fecha local del estudio.

import { addDays } from "./time";

// Un retoque que venció hace más de estos días ya no se muestra.
export const RETOUCH_WINDOW_DAYS = 30;

// Días entre dos fechas: positivo si `to` es posterior a `from`.
export function daysBetween(from: string, to: string): number {
  const toUtc = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

// Fecha del retoque: la de la cita más los días MÁS CORTOS entre sus
// servicios con retoque. null si ningún servicio pide retoque.
export function retouchDueDate(
  appointmentDate: string,
  retouchDays: (number | null)[],
): string | null {
  const valid = retouchDays.filter(
    (d): d is number => typeof d === "number" && Number.isInteger(d) && d > 0,
  );
  if (valid.length === 0) return null;
  return addDays(appointmentDate, Math.min(...valid));
}

// El retoque ya tocó (hoy o antes), pero no hace más de 30 días.
export function isInRetouchWindow(dueDate: string, today: string): boolean {
  const late = daysBetween(dueDate, today);
  return late >= 0 && late <= RETOUCH_WINDOW_DAYS;
}

export type ReminderStatus =
  | "pending_deposit"
  | "confirmed"
  | "completed"
  | "no_show"
  | "released";

export type RetouchCandidate = {
  id: string;
  clientId: string;
  date: string; // fecha local de la cita
  startsAt: Date;
  endsAt: Date;
  status: ReminderStatus;
  // Reserva sin comprobante y con el plazo vencido: no cuenta como cita.
  holdExpired: boolean;
  remindersOk: boolean;
  // Ya hay un recordatorio de retoque registrado para esta cita.
  reminded: boolean;
  services: { name: string; retouchDays: number | null }[];
};

export type RetouchDue<T extends RetouchCandidate> = T & {
  dueDate: string;
  // Servicios que piden retoque.
  triggers: string[];
  // Días desde la cita.
  daysAgo: number;
};

// Asistió: marcada como atendida, o confirmada y ya terminada (Giselle a
// veces no la marca). Nunca "no asistió" ni liberada.
export function isAttended(
  a: Pick<RetouchCandidate, "status" | "endsAt">,
  now: Date,
): boolean {
  if (a.status === "completed") return true;
  return a.status === "confirmed" && a.endsAt.getTime() < now.getTime();
}

// Cita que demuestra que la clienta ya volvió o ya agendó otra vez.
function countsAsVisit(a: RetouchCandidate): boolean {
  if (a.status === "completed" || a.status === "confirmed") return true;
  return a.status === "pending_deposit" && !a.holdExpired;
}

// Retoques por recordar: como mucho uno por clienta (su cita más reciente),
// ordenados por fecha de retoque, del más antiguo al más nuevo.
// `rows` debe incluir también las citas posteriores de cada clienta.
export function selectRetouchReminders<T extends RetouchCandidate>(
  rows: T[],
  today: string,
  now: Date,
): RetouchDue<T>[] {
  const byClient = new Map<string, RetouchDue<T>>();

  for (const a of rows) {
    if (!a.remindersOk || a.reminded || !isAttended(a, now)) continue;

    const dueDate = retouchDueDate(
      a.date,
      a.services.map((s) => s.retouchDays),
    );
    if (!dueDate || !isInRetouchWindow(dueDate, today)) continue;

    const cameBack = rows.some(
      (o) =>
        o.clientId === a.clientId &&
        o.id !== a.id &&
        o.startsAt.getTime() > a.startsAt.getTime() &&
        countsAsVisit(o),
    );
    if (cameBack) continue;

    const current = byClient.get(a.clientId);
    if (current && current.startsAt.getTime() >= a.startsAt.getTime()) continue;
    byClient.set(a.clientId, {
      ...a,
      dueDate,
      triggers: a.services
        .filter((s) => s.retouchDays !== null && s.retouchDays > 0)
        .map((s) => s.name),
      daysAgo: daysBetween(a.date, today),
    });
  }

  return [...byClient.values()].sort(
    (x, y) =>
      x.dueDate.localeCompare(y.dueDate) ||
      x.startsAt.getTime() - y.startsAt.getTime(),
  );
}
