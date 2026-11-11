"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/auth";
import {
  DEFAULT_CONFIRMATION_TEMPLATE,
  DEFAULT_REJECTION_TEMPLATE,
  MESSAGE_MAX_LENGTH,
} from "@/lib/whatsapp";

export type MessageState = { error: string | null; saved: boolean };

const SETTINGS = {
  confirmation: { column: "confirmation_message", fallback: DEFAULT_CONFIRMATION_TEMPLATE },
  rejection: { column: "rejection_message", fallback: DEFAULT_REJECTION_TEMPLATE },
} as const;

// Guarda el texto de un mensaje de WhatsApp. Vacío o igual al de la app se
// guarda como null: así, si la app cambia su texto, Giselle recibe el nuevo.
export async function saveMessageTemplate(
  _prev: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const { supabase, studioId } = await requireAdminAction();

  const kind = formData.get("kind");
  if (kind !== "confirmation" && kind !== "rejection") {
    return { error: "No se pudo guardar. Recarga la página.", saved: false };
  }
  const { column, fallback } = SETTINGS[kind];

  // El navegador envía los saltos de línea como "\r\n".
  const text = String(formData.get("text") ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (text.length > MESSAGE_MAX_LENGTH) {
    return {
      error: `El mensaje es muy largo. Máximo ${MESSAGE_MAX_LENGTH} caracteres.`,
      saved: false,
    };
  }
  const value = text === "" || text === fallback.trim() ? null : text;

  const { data, error } = await supabase
    .from("studios")
    .update({ [column]: value })
    .eq("id", studioId)
    .select("id");
  if (error || !data || data.length === 0) {
    console.error("[mensajes] guardar:", error?.message ?? "Sin filas actualizadas.");
    return { error: "No se pudo guardar. Intenta de nuevo.", saved: false };
  }

  revalidatePath("/admin/ajustes/mensajes");
  revalidatePath("/admin");
  return { error: null, saved: true };
}
