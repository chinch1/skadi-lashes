import "server-only";
import { createAdminClient } from "./supabase/admin";

const RECEIPTS_BUCKET = "receipts";
// Tope por ejecución: la tarea corre a diario, así que lo que sobre sale al día siguiente.
const BATCH = 200;

export type CleanupResult =
  | { status: "ok"; receiptsDeleted: number; holdsReleased: number }
  | { status: "error" };

// Borra la imagen de los comprobantes 30 días después de la fecha de la cita
// (o lo que diga `receipt_retention_days`). El registro del abono se conserva.
async function deleteOldReceipts(): Promise<number> {
  const supabase = createAdminClient();

  // La vista ya aplica la regla de los días por estudio.
  const { data: due, error } = await supabase
    .from("receipts_to_delete")
    .select("deposit_id, receipt_path")
    .limit(BATCH);
  if (error) throw new Error(`comprobantes: ${error.message}`);
  if (!due || due.length === 0) return 0;

  const paths = due.map((row) => row.receipt_path as string);
  const { error: removeError } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .remove(paths);
  // Si el almacén falla, no se marca nada: se reintenta mañana.
  if (removeError) throw new Error(`almacén: ${removeError.message}`);

  // Un archivo que ya no existía cuenta como borrado.
  const { error: updateError } = await supabase
    .from("deposits")
    .update({ receipt_deleted_at: new Date().toISOString() })
    .in(
      "id",
      due.map((row) => row.deposit_id as string),
    );
  if (updateError) throw new Error(`abonos: ${updateError.message}`);

  return due.length;
}

// Libera los horarios apartados cuyo plazo para subir el comprobante venció.
// El cálculo de cupos ya los ignora; esto solo deja los datos en orden.
async function releaseExpiredHolds(): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "released" })
    .eq("status", "pending_deposit")
    .not("hold_expires_at", "is", null)
    .lt("hold_expires_at", new Date().toISOString())
    .select("id");
  if (error) throw new Error(`reservas: ${error.message}`);
  return data?.length ?? 0;
}

// Tarea diaria de limpieza. Se puede llamar de más sin daño: solo toca lo vencido.
export async function runCleanup(): Promise<CleanupResult> {
  try {
    const receiptsDeleted = await deleteOldReceipts();
    const holdsReleased = await releaseExpiredHolds();
    return { status: "ok", receiptsDeleted, holdsReleased };
  } catch (e) {
    console.error(`[limpieza] ${e instanceof Error ? e.message : String(e)}`);
    return { status: "error" };
  }
}
