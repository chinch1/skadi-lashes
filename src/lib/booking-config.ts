// Reglas de agenda que todavía no están en Ajustes ni en la base de datos.
// Son propuestas por confirmar con Giselle (ver "Pendiente por decidir" en CLAUDE.md).

// Paso de la rejilla de horas que Skadi puede marcar en "Mi horario".
export const SLOT_INTERVAL_MIN = 30;

// Descanso obligatorio entre una clienta y la siguiente.
export const BUFFER_MIN = 0;

// Pagos en USDT: el precio en euros se cobra íntegro en dólares, sin conversión
// (10 € = 10 USDT). La tasa del euro solo se usa para cobrar en bolívares.
export const EUR_TO_USDT = 1;

// Anticipación mínima para agendar: no se ofrecen horas que empiecen antes.
export const MIN_NOTICE_MIN = 60;
