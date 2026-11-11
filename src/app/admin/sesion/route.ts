import { redirect } from "next/navigation";
import { findAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Renueva una sesión vencida. Aquí sí se pueden guardar las cookies nuevas.
export async function GET() {
  const supabase = await createClient();
  const admin = await findAdmin(supabase);
  redirect(admin ? "/admin" : "/admin/login");
}
