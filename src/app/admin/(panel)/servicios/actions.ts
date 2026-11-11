"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/auth";
import { parseEuros } from "@/lib/money";
import { PHOTO_BUCKET } from "@/lib/services";
import { createAdminClient } from "@/lib/supabase/admin";

export type FormState = { error: string | null };

const PATH = "/admin/servicios";
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const FOREIGN_KEY_VIOLATION = "23503";

// Guarda el orden recibido como posiciones 1, 2, 3…
// Solo acepta la lista si contiene exactamente las filas que ya existen.
async function applyOrder(
  supabase: SupabaseClient,
  table: "sections" | "services",
  existing: { id: string; position: number }[],
  orderedIds: string[],
) {
  const known = new Map(existing.map((row) => [row.id, row.position]));
  const sameSet =
    orderedIds.length === known.size &&
    new Set(orderedIds).size === known.size &&
    orderedIds.every((id) => known.has(id));
  if (!sameSet) return;

  await Promise.all(
    orderedIds.map((id, index) =>
      known.get(id) === index + 1
        ? null
        : supabase.from(table).update({ position: index + 1 }).eq("id", id),
    ),
  );
}

async function nextPosition(
  supabase: SupabaseClient,
  table: "sections" | "services",
  filter: Record<string, string>,
) {
  const { data } = await supabase
    .from(table)
    .select("position")
    .match(filter)
    .order("position", { ascending: false })
    .limit(1);
  return (data?.[0]?.position ?? 0) + 1;
}

// ---------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------

export async function saveSection(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, studioId } = await requireAdminAction();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Escribe el nombre de la sección." };
  if (name.length > 60) return { error: "El nombre es demasiado largo." };

  const { error } = id
    ? await supabase
        .from("sections")
        .update({ name })
        .eq("id", id)
        .eq("studio_id", studioId)
    : await supabase.from("sections").insert({
        studio_id: studioId,
        name,
        position: await nextPosition(supabase, "sections", {
          studio_id: studioId,
        }),
      });
  if (error) return { error: "No se pudo guardar la sección." };

  revalidatePath(PATH);
  return { error: null };
}

export async function reorderSections(orderedIds: string[]) {
  const { supabase, studioId } = await requireAdminAction();
  const { data } = await supabase
    .from("sections")
    .select("id, position")
    .eq("studio_id", studioId);
  await applyOrder(supabase, "sections", data ?? [], orderedIds);
  revalidatePath(PATH);
}

// Una sección con servicios no se puede borrar: lo impide la base de datos.
export async function deleteSection(id: string) {
  const { supabase, studioId } = await requireAdminAction();
  await supabase.from("sections").delete().eq("id", id).eq("studio_id", studioId);
  revalidatePath(PATH);
}

// ---------------------------------------------------------------------
// Servicios
// ---------------------------------------------------------------------

function wholeNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  return /^\d{1,4}$/.test(text) ? Number(text) : null;
}

export async function saveService(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, studioId } = await requireAdminAction();

  const id = String(formData.get("id") ?? "");
  const sectionId = String(formData.get("section_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const duration = wholeNumber(formData.get("duration_min"));
  const price = parseEuros(String(formData.get("price") ?? ""));
  const visible = formData.get("visible") === "on";
  const wantsRetouch = formData.get("retouch") === "on";
  const retouchDays = wholeNumber(formData.get("retouch_days"));
  const photo = formData.get("photo");

  if (!name) return { error: "Escribe el nombre del servicio." };
  if (name.length > 80) return { error: "El nombre es demasiado largo." };
  if (duration === null || duration < 5 || duration > 600) {
    return { error: "La duración debe estar entre 5 y 600 minutos." };
  }
  if (price === null) {
    return { error: "Escribe el precio en euros, por ejemplo 45 o 45,50." };
  }
  if (wantsRetouch && (retouchDays === null || retouchDays < 1 || retouchDays > 365)) {
    return { error: "Los días para el retoque deben estar entre 1 y 365." };
  }
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (hasPhoto && !photo.type.startsWith("image/")) {
    return { error: "La foto debe ser una imagen." };
  }
  if (hasPhoto && photo.size > MAX_PHOTO_BYTES) {
    return { error: "La foto pesa demasiado. Prueba con otra." };
  }

  const { data: section } = await supabase
    .from("sections")
    .select("id")
    .eq("id", sectionId)
    .eq("studio_id", studioId)
    .maybeSingle();
  if (!section) return { error: "Elige una sección." };

  const fields = {
    section_id: sectionId,
    name,
    duration_min: duration,
    price_cents: price,
    visible,
    retouch_reminder_days: wantsRetouch ? retouchDays : null,
  };

  let serviceId = id;
  let oldPhotoPath: string | null = null;

  if (id) {
    const { data: current } = await supabase
      .from("services")
      .select("section_id, photo_path")
      .eq("id", id)
      .eq("studio_id", studioId)
      .maybeSingle();
    if (!current) return { error: "Este servicio ya no existe." };
    oldPhotoPath = current.photo_path;

    // Al cambiar de sección, el servicio va al final de la nueva.
    const position =
      current.section_id === sectionId
        ? undefined
        : await nextPosition(supabase, "services", { section_id: sectionId });

    const { error } = await supabase
      .from("services")
      .update(position === undefined ? fields : { ...fields, position })
      .eq("id", id)
      .eq("studio_id", studioId);
    if (error) return { error: "No se pudo guardar el servicio." };
  } else {
    const { data: created, error } = await supabase
      .from("services")
      .insert({
        ...fields,
        studio_id: studioId,
        position: await nextPosition(supabase, "services", {
          section_id: sectionId,
        }),
      })
      .select("id")
      .single();
    if (error || !created) return { error: "No se pudo guardar el servicio." };
    serviceId = created.id;
  }

  if (hasPhoto) {
    // El almacenamiento se escribe con la llave de servicio, ya comprobada la sesión.
    const storage = createAdminClient().storage.from(PHOTO_BUCKET);
    const extension = photo.type === "image/png" ? "png" : "jpg";
    const path = `${studioId}/${serviceId}/${Date.now()}.${extension}`;

    const { error: uploadError } = await storage.upload(
      path,
      await photo.arrayBuffer(),
      { contentType: photo.type, cacheControl: "31536000" },
    );
    const { error: linkError } = uploadError
      ? { error: uploadError }
      : await supabase
          .from("services")
          .update({ photo_path: path })
          .eq("id", serviceId)
          .eq("studio_id", studioId);

    if (linkError) {
      revalidatePath(PATH);
      // El servicio ya quedó guardado; solo falló la foto.
      redirect(`${PATH}/${serviceId}?foto=error`);
    }
    if (oldPhotoPath) await storage.remove([oldPhotoPath]);
  }

  revalidatePath(PATH);
  redirect(PATH);
}

export async function reorderServices(sectionId: string, orderedIds: string[]) {
  const { supabase, studioId } = await requireAdminAction();
  const { data } = await supabase
    .from("services")
    .select("id, position")
    .eq("studio_id", studioId)
    .eq("section_id", sectionId);
  await applyOrder(supabase, "services", data ?? [], orderedIds);
  revalidatePath(PATH);
}

export async function setServiceVisible(id: string, visible: boolean) {
  const { supabase, studioId } = await requireAdminAction();
  await supabase
    .from("services")
    .update({ visible })
    .eq("id", id)
    .eq("studio_id", studioId);
  revalidatePath(PATH);
}

// Un servicio con citas no se puede borrar: lo impide la base de datos.
export async function deleteService(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, studioId } = await requireAdminAction();
  const id = String(formData.get("id") ?? "");

  const { data: service } = await supabase
    .from("services")
    .select("photo_path")
    .eq("id", id)
    .eq("studio_id", studioId)
    .maybeSingle();
  if (!service) redirect(PATH);

  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", id)
    .eq("studio_id", studioId);
  if (error) {
    return {
      error:
        error.code === FOREIGN_KEY_VIOLATION
          ? "Este servicio tiene citas y no se puede eliminar. Puedes ocultarlo."
          : "No se pudo eliminar el servicio.",
    };
  }

  if (service.photo_path) {
    await createAdminClient().storage.from(PHOTO_BUCKET).remove([service.photo_path]);
  }
  revalidatePath(PATH);
  redirect(PATH);
}
