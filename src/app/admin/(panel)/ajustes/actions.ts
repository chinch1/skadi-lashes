"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/auth";
import { parseEuros } from "@/lib/money";

export type AmountField = "deposit" | "late_fee" | "hold_minutes";

export type AmountsState = {
  error: string | null; // error general
  fieldErrors: Partial<Record<AmountField, string>>;
  saved: boolean;
};

// Tope razonable para evitar un cero de más.
const MAX_CENTS = 500_00;
const RANGE_ERROR = "Escribe un monto entre 0 y 500 €, por ejemplo 10 o 10,50.";

const MIN_HOLD_MINUTES = 1;
const MAX_HOLD_MINUTES = 120;
const MINUTES_ERROR = `Escribe un número entero de minutos entre ${MIN_HOLD_MINUTES} y ${MAX_HOLD_MINUTES}.`;

// Minutos enteros, sin decimales ni signos.
function readMinutes(formData: FormData, name: string): number | null {
  const text = String(formData.get(name) ?? "").trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const minutes = Number(text);
  return minutes >= MIN_HOLD_MINUTES && minutes <= MAX_HOLD_MINUTES ? minutes : null;
}

function readAmount(formData: FormData, name: string): number | null {
  const cents = parseEuros(String(formData.get(name) ?? ""));
  return cents !== null && cents <= MAX_CENTS ? cents : null;
}

// Guarda el abono, el cargo por retraso y los minutos para pagar. Las citas
// ya agendadas conservan el abono con el que se agendaron.
export async function saveAmounts(
  _prev: AmountsState,
  formData: FormData,
): Promise<AmountsState> {
  const { supabase, studioId } = await requireAdminAction();

  const deposit = readAmount(formData, "deposit");
  const lateFee = readAmount(formData, "late_fee");
  const holdMinutes = readMinutes(formData, "hold_minutes");
  const fieldErrors: AmountsState["fieldErrors"] = {};
  if (deposit === null) fieldErrors.deposit = RANGE_ERROR;
  if (lateFee === null) fieldErrors.late_fee = RANGE_ERROR;
  if (holdMinutes === null) fieldErrors.hold_minutes = MINUTES_ERROR;
  if (deposit === null || lateFee === null || holdMinutes === null) {
    return { error: null, fieldErrors, saved: false };
  }

  const { data, error } = await supabase
    .from("studios")
    .update({
      deposit_cents: deposit,
      late_fee_cents: lateFee,
      pending_hold_minutes: holdMinutes,
    })
    .eq("id", studioId)
    .select("id");
  if (error || !data || data.length === 0) {
    console.error("[ajustes] guardar montos:", error?.message ?? "Sin filas actualizadas.");
    return { error: "No se pudo guardar. Intenta de nuevo.", fieldErrors: {}, saved: false };
  }

  revalidatePath("/admin/ajustes");
  revalidatePath("/admin");
  revalidatePath("/admin/recordatorios");
  revalidatePath("/admin/ajustes/mensajes");
  // Páginas de la clienta con las normas o el abono.
  revalidatePath("/");
  revalidatePath("/agendar");
  revalidatePath("/reprogramar");
  revalidatePath("/cita/[token]", "layout"); // también /cita/[token]/reprogramar
  return { error: null, fieldErrors: {}, saved: true };
}
