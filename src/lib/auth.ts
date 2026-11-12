import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { STUDIO_SLUG } from "./studio";
import { createClient, createReadOnlyClient } from "./supabase/server";

// Fila de `studios` tal como viene de la base. Llega junto con la comprobación
// de administradora, para que las pantallas no tengan que pedirla otra vez.
export type StudioRow = {
  id: string;
  timezone: string;
  reschedule_notice_hours: number | null;
  confirmation_message: string | null;
  rejection_message: string | null;
  reminder_message: string | null;
  retouch_message: string | null;
} & Record<string, unknown>;

export type Admin = { userId: string; studioId: string; studio: StudioRow };

// Devuelve la administradora del estudio, o null si no hay sesión o no es administradora.
export async function findAdmin(supabase: SupabaseClient): Promise<Admin | null> {
  // `getClaims` comprueba la firma de la sesión aquí mismo, sin viajar a Supabase
  // (el proyecto firma con llaves asimétricas). Una sesión cerrada desde otro
  // dispositivo sigue valiendo hasta que vence, como mucho una hora.
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return null;

  // La seguridad por filas solo deja leer la fila propia de `admins`.
  const { data } = await supabase
    .from("admins")
    .select("studio_id, studios!inner(*)")
    .eq("user_id", userId)
    .eq("studios.slug", STUDIO_SLUG)
    .maybeSingle();
  if (!data) return null;

  const studio = (Array.isArray(data.studios) ? data.studios[0] : data.studios) as StudioRow;
  return { userId, studioId: data.studio_id, studio };
}

// Para páginas y diseños de /admin. Con `cache`, el diseño y la página
// comparten una sola comprobación por petición.
export const requireAdminPage = cache(
  async (): Promise<Admin & { supabase: SupabaseClient }> => {
    const { supabase, refreshBlocked } = await createReadOnlyClient();
    const admin = await findAdmin(supabase);
    if (!admin) redirect(refreshBlocked() ? "/admin/sesion" : "/admin/login");
    return { ...admin, supabase };
  },
);

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
