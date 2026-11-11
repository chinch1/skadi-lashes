import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { STUDIO_SLUG } from "./studio";
import { createClient, createReadOnlyClient } from "./supabase/server";

export type Admin = { userId: string; studioId: string };

// Devuelve la administradora del estudio, o null si no hay sesión o no es administradora.
export async function findAdmin(supabase: SupabaseClient): Promise<Admin | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  // La seguridad por filas solo deja leer la fila propia de `admins`.
  const { data } = await supabase
    .from("admins")
    .select("studio_id, studios!inner(slug)")
    .eq("user_id", auth.user.id)
    .eq("studios.slug", STUDIO_SLUG)
    .maybeSingle();
  if (!data) return null;

  return { userId: auth.user.id, studioId: data.studio_id };
}

// Para páginas y diseños de /admin.
export async function requireAdminPage(): Promise<Admin> {
  const { supabase, refreshBlocked } = await createReadOnlyClient();
  const admin = await findAdmin(supabase);
  if (admin) return admin;
  redirect(refreshBlocked() ? "/admin/sesion" : "/admin/login");
}

// Para acciones del servidor de /admin. Cada acción debe llamarla:
// el diseño protegido no cubre las acciones.
export async function requireAdminAction(): Promise<
  Admin & { supabase: SupabaseClient }
> {
  const supabase = await createClient();
  const admin = await findAdmin(supabase);
  if (!admin) redirect("/admin/login");
  return { ...admin, supabase };
}
