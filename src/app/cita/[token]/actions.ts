"use server";

import { revalidatePath } from "next/cache";
import { saveReceipt } from "@/lib/booking";
import { releaseForSlotChange } from "@/lib/slot-change";

export type ReceiptState = { error: string | null };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Acción pública: recibe el comprobante del abono desde el enlace privado de la cita.
export async function submitReceipt(
  _prev: ReceiptState,
  formData: FormData,
): Promise<ReceiptState> {
  if (!(formData instanceof FormData)) {
    return { error: "No se pudo enviar el comprobante. Intenta de nuevo." };
  }
  const token = formData.get("token");
  const method = formData.get("method");
  const receipt = formData.get("receipt");

  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return { error: "No encontramos esta cita." };
  }
  if (method !== "pago_movil" && method !== "binance") {
    return { error: "Elige cómo pagaste el abono." };
  }
  if (!(receipt instanceof File) || receipt.size === 0) {
    return { error: "Sube la imagen del comprobante." };
  }

  try {
    const result = await saveReceipt(token, method, receipt);
    if (!result.ok) return { error: result.error };
  } catch (e) {
    console.error("[comprobante] acción:", e instanceof Error ? e.message : e);
    return { error: "No se pudo enviar el comprobante. Intenta de nuevo." };
  }

  revalidatePath(`/cita/${token}`);
  return { error: null };
}

export type ChangeSlotState = { ok: true } | { ok: false; error: string };

// Acción pública: suelta el horario apartado para elegir otro con la misma cita.
export async function changeSlot(token: string): Promise<ChangeSlotState> {
  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return { ok: false, error: "No encontramos esta cita." };
  }
  let result: ChangeSlotState;
  try {
    result = await releaseForSlotChange(token);
  } catch (e) {
    console.error("[otro horario] acción soltar:", e instanceof Error ? e.message : e);
    return { ok: false, error: "No se pudo soltar tu horario. Intenta de nuevo." };
  }
  if (result.ok) revalidatePath(`/cita/${token}`);
  return result;
}
