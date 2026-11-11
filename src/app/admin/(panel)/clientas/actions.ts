"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/auth";
import { isUuid } from "@/lib/clients";

export type FormState = { error: string | null };

const PATH = "/admin/clientas";
const NAME_MAX_LENGTH = 60;

function revalidate(clientId: string) {
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${clientId}`);
}

// "Pide abono": required = true significa que paga el abono (deposit_exempt falso).
// Solo afecta a las citas que agende de aquí en adelante.
export async function setDepositRequired(
  clientId: string,
  required: boolean,
): Promise<FormState> {
  const { supabase, studioId } = await requireAdminAction();
  if (!isUuid(clientId) || typeof required !== "boolean") {
    return { error: "No se pudo guardar el cambio." };
  }

  const { data, error } = await supabase
    .from("clients")
    .update({ deposit_exempt: !required })
    .eq("id", clientId)
    .eq("studio_id", studioId)
    .select("id");
  if (error) {
    console.error("[clientas] abono:", error.message);
    return { error: "No se pudo guardar el cambio. Inténtalo otra vez." };
  }
  if (!data || data.length === 0) return { error: "Esta clienta ya no existe." };

  revalidate(clientId);
  return { error: null };
}

function cleanName(value: FormDataEntryValue | null): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export async function updateClientName(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, studioId } = await requireAdminAction();
  const clientId = formData.get("id");
  const firstName = cleanName(formData.get("first_name"));
  const lastName = cleanName(formData.get("last_name"));

  if (!isUuid(clientId)) return { error: "No se pudo guardar el nombre." };
  if (!firstName) return { error: "Escribe el nombre." };
  if (!lastName) return { error: "Escribe el apellido." };
  if (firstName.length > NAME_MAX_LENGTH || lastName.length > NAME_MAX_LENGTH) {
    return { error: "El nombre o el apellido es demasiado largo." };
  }

  const { data, error } = await supabase
    .from("clients")
    .update({ first_name: firstName, last_name: lastName })
    .eq("id", clientId)
    .eq("studio_id", studioId)
    .select("id");
  if (error) {
    console.error("[clientas] nombre:", error.message);
    return { error: "No se pudo guardar el nombre. Inténtalo otra vez." };
  }
  if (!data || data.length === 0) return { error: "Esta clienta ya no existe." };

  revalidate(clientId);
  return { error: null };
}
