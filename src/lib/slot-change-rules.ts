// Reglas para "Elegir otro horario" desde el paso de pago: soltar el horario
// apartado y volver a elegir otro con la misma cita. Funciones puras, con pruebas.

// Una cita solo se puede volver a ubicar durante sus primeras 24 horas.
export const SLOT_CHANGE_WINDOW_HOURS = 24;

const HOUR_MS = 3_600_000;

export type SlotChangeFacts = {
  status: string;
  depositCents: number;
  depositStatuses: readonly string[];
  rejectedAt: string | null;
  createdAt: Date;
  now: Date;
};

// Condiciones comunes, sin mirar el estado: la cita pide abono, nunca recibió
// un comprobante (ni siquiera uno perdido o rechazado), Skadi no la rechazó y
// es reciente.
function repickConditions(f: SlotChangeFacts): boolean {
  const age = f.now.getTime() - f.createdAt.getTime();
  return (
    f.depositCents > 0 &&
    f.depositStatuses.length === 0 &&
    f.rejectedAt === null &&
    Number.isFinite(age) &&
    age < SLOT_CHANGE_WINDOW_HOURS * HOUR_MS
  );
}

// Soltar el horario para elegir otro: la cita espera el abono y la clienta no ha
// enviado comprobante (da igual si el reloj ya terminó). Además, después de
// soltarlo tiene que poder elegir otro; si no, perdería la cita sin remedio.
export function canReleaseForSlotChange(f: SlotChangeFacts): boolean {
  return (
    f.status === "pending_deposit" &&
    !f.depositStatuses.some((s) => s === "pending" || s === "approved") &&
    repickConditions(f)
  );
}

// Elegir el horario nuevo: la cita ya está liberada.
export function canPickNewSlot(f: SlotChangeFacts): boolean {
  return f.status === "released" && repickConditions(f);
}

// La página de la cita ofrece "Elegir otro horario".
export function offersSlotChange(f: SlotChangeFacts): boolean {
  return canReleaseForSlotChange(f) || canPickNewSlot(f);
}
