"use server";

import { revalidatePath } from "next/cache";
import { saveReceipt } from "@/lib/booking";

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
