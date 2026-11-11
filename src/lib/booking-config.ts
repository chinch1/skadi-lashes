// Reglas de agenda que todavía no están en Ajustes ni en la base de datos.
// Son propuestas por confirmar con Giselle (ver "Pendiente por decidir" en CLAUDE.md).

// Cada cuánto se ofrece una hora de inicio.
export const SLOT_INTERVAL_MIN = 30;

// Descanso obligatorio entre una clienta y la siguiente.
export const BUFFER_MIN = 0;

// Anticipación mínima para agendar: no se ofrecen horas que empiecen antes.
export const MIN_NOTICE_MIN = 60;
