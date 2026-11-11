// Reglas para que la clienta reprograme su cita. Función pura: la hora "now"
// siempre es la del servidor y la decide quien llama.

export type RescheduleMode = "on_time" | "late" | "already_changed" | "not_available";

const HOUR_MS = 3_600_000;

export function rescheduleMode(input: {
  status: string; // estado de la cita
  startsAt: Date;
  now: Date;
  rescheduleCount: number;
  maxReschedules: number;
  noticeHours: number;
  depositExempt: boolean; // clienta de confianza
}): RescheduleMode {
  const { status, startsAt, now } = input;

  // Solo una cita confirmada que todavía no empieza se puede reprogramar.
  if (status !== "confirmed" || !(startsAt.getTime() > now.getTime())) {
    return "not_available";
  }

  // Cada cita se puede cambiar un número limitado de veces (una, por ahora).
  if (input.rescheduleCount >= input.maxReschedules) return "already_changed";

  // A la clienta de confianza no le aplica el plazo.
  if (input.depositExempt) return "on_time";

  // Justo en el límite (exactamente 12 horas antes) todavía es a tiempo.
  const remainingMs = startsAt.getTime() - now.getTime();
  return remainingMs >= input.noticeHours * HOUR_MS ? "on_time" : "late";
}
